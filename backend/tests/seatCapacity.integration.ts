import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { PostgresDatabase } from '../src/postgres/database.js';
import { migrate } from '../src/postgres/migrations.js';
import { PostgresCommercialRepository } from '../src/postgres/commercialRepository.js';
import { PostgresAccountRepository } from '../src/postgres/accountRepository.js';
import { IdentityAccountService } from '../src/services/identityAccountService.js';
import { lockOrganizationSeats, lockSeatCatalogue, readSeatCapacity, assertSeatCapacity } from '../src/postgres/seatCapacity.js';
import { permissionsForRole } from '../src/services/authorizationPolicy.js';
import type { AuthorizationContext } from '../src/services/requestContextService.js';
import { EmailCapture } from './helpers/emailCapture.js';
import { PostgresStaffRepository } from '../src/postgres/staffRepository.js';
import { OrganizationAdministrationService } from '../src/services/organizationAdministrationService.js';

test('seat enforcement against disposable local PostgreSQL', async t => {
  const url = new URL(process.env.POSTGRES_TEST_URL ?? '');
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname) && url.pathname === '/postgres', 'Disposable local maintenance database required');
  const admin = new PostgresDatabase(url.toString());
  const name = `seat_qa_${randomUUID().replaceAll('-','')}`;
  await admin.query(`CREATE DATABASE "${name}"`);
  url.pathname = `/${name}`;
  const db = new PostgresDatabase(url.toString());
  t.after(async () => { await db.close(); await admin.query(`DROP DATABASE "${name}"`); await admin.close(); });
  await migrate(db);
  const commercial = new PostgresCommercialRepository(db);
  await commercial.reconcileCatalogue();
  let sequence = 0;
  const phone = () => `+91987654${String(++sequence).padStart(4,'0')}`;
  async function fixture() {
    // Synthetic setup supplies explicit capacity BEFORE the first membership.
    return db.transaction(async client => {
      const organizationId = (await client.query("INSERT INTO organizations(name,type,theme_mode,theme_primary_color,created_at,updated_at) VALUES ('Seat QA','shop','light','#4F46E5',now(),now()) RETURNING id")).rows[0].id as string;
      const userId = (await client.query("INSERT INTO users(name,phone,created_at,updated_at) VALUES ('QA owner',$1,now(),now()) RETURNING id", [phone()])).rows[0].id as string;
      await client.query("INSERT INTO subscriptions(organization_id,plan_id,status,source,starts_at,current_period_ends_at,created_at,updated_at) SELECT $1,id,'active','pilot',now()-interval '1 day',now()+interval '30 days',now(),now() FROM plans WHERE key='pilot-core'",[organizationId]);
      await lockOrganizationSeats(client, organizationId);
      await assertSeatCapacity(db, client, organizationId, 1);
      const branchId = (await client.query("INSERT INTO branches(organization_id,name,code,status,created_at,updated_at) VALUES ($1,'Main','main','active',now(),now()) RETURNING id",[organizationId])).rows[0].id as string;
      const membershipId = (await client.query("INSERT INTO memberships(user_id,organization_id,role,status,created_at,updated_at) VALUES ($1,$2,'owner','active',now(),now()) RETURNING id",[userId,organizationId])).rows[0].id as string;
      await client.query('INSERT INTO membership_branch_assignments(membership_id,organization_id,branch_id) VALUES ($1,$2,$3)',[membershipId,organizationId,branchId]);
      const context: AuthorizationContext = { userId,organizationId,branchId,membershipId,role:'owner',permissions:permissionsForRole('owner'),platformOperator:false,sessionId:'synthetic' };
      const capture = new EmailCapture();
      const service = new IdentityAccountService(db,capture);
      return { context,capture,service };
    });
  }
  async function usage(id: string) { return db.transaction(async client => { await lockOrganizationSeats(client,id); return readSeatCapacity(db,client,id); }); }
  function input(c: AuthorizationContext) { return { name:'QA invited',phone:phone(),role:'staff' as const,branchIds:[c.branchId!] }; }
  await t.test('strict registration rolls back organization and identity',async()=>{
    const before = (await db.query('SELECT count(*) FROM organizations')).rows[0].count;
    await assert.rejects(new PostgresAccountRepository(db).registerAdmin({orgName:'Rejected',orgType:'shop',userName:'QA',phone:phone(),passwordHash:'synthetic-not-a-password'}),/capacity is not available/);
    assert.equal((await db.query('SELECT count(*) FROM organizations')).rows[0].count,before);
  });
  await t.test('owner uses one seat; four reservations succeed; sixth rejected',async()=>{
    const {context,service}=await fixture();
    assert.equal((await usage(context.organizationId)).occupied,1);
    for(let i=0;i<4;i++)await service.createInvitation(context,input(context));
    await assert.rejects(service.createInvitation(context,input(context)),/capacity exceeded/);
    assert.equal((await usage(context.organizationId)).reserved,4);
  });
  await t.test('concurrent invitations cannot take the same last seat',async()=>{
    const {context,service}=await fixture();
    for(let i=0;i<3;i++)await service.createInvitation(context,input(context));
    const results=await Promise.allSettled([service.createInvitation(context,input(context)),service.createInvitation(context,input(context))]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.filter(r=>r.status==='rejected').length,1);
    for(const result of results)if(result.status==='rejected')assert.match(String(result.reason),/capacity exceeded/);
    assert.equal((await usage(context.organizationId)).reserved,4);
  });
  await t.test('revocation and expiry release reservations without double release',async()=>{
    const {context,service}=await fixture();
    const invite=await service.createInvitation(context,input(context));
    await service.revokeInvitation(context,invite.id);
    await assert.rejects(service.revokeInvitation(context,invite.id));
    const other=await service.createInvitation(context,input(context));
    await db.query("UPDATE staff_invitations SET created_at=now()-interval '2 days', expires_at=now()-interval '1 second' WHERE id=$1",[other.id]);
    assert.equal((await usage(context.organizationId)).reserved,0);
  });
  await t.test('replacement reserves once',async()=>{
    const {context,service}=await fixture();const draft=input(context);
    const old=await service.createInvitation(context,draft);
    await db.query("UPDATE staff_invitations SET created_at=now()-interval '2 minutes' WHERE id=$1",[old.id]);
    await service.createInvitation(context,draft);
    assert.equal((await usage(context.organizationId)).reserved,1);
  });
  await t.test('failed email delivery releases reservation',async()=>{
    const {context,service,capture}=await fixture();capture.fail=true;
    await assert.rejects(service.createInvitation(context,{...input(context),email:'synthetic@example.invalid'}),/delivery unavailable/);
    assert.equal((await usage(context.organizationId)).reserved,0);
    const revoked=(await db.query('SELECT id,revoked_at FROM staff_invitations WHERE organization_id=$1',[context.organizationId])).rows[0];
    assert.ok(revoked.revoked_at);
    const challenges=(await db.query('SELECT revoked_at,consumed_at FROM identity_challenges WHERE invitation_id=$1',[revoked.id])).rows;
    assert.equal(challenges.length,1);assert.ok(challenges[0].revoked_at);assert.equal(challenges[0].consumed_at,null);
    const actions=(await db.query('SELECT action FROM account_security_events WHERE invitation_id=$1',[revoked.id])).rows.map(row=>row.action);
    assert.ok(actions.includes('invitation.revoked'));assert.ok(actions.includes('email.delivery_failed'));
  });
  await t.test('acceptance converts reservation and replay is rejected',async()=>{
    const {context,service}=await fixture();const invite=await service.createInvitation(context,input(context));
    assert.equal(invite.delivery,'manual');
    const token=new URLSearchParams(new URL(invite.handoffUrl!).hash.slice(1)).get('token')!;
    await service.acceptInvitation(token,randomUUID());
    const state=await usage(context.organizationId);assert.equal(state.occupied,2);assert.equal(state.reserved,0);
    await assert.rejects(service.acceptInvitation(token,randomUUID()));
  });
  await t.test('expiry blocks acceptance and growth without deleting members',async()=>{
    const {context,service}=await fixture();const invite=await service.createInvitation(context,input(context));
    await db.query("UPDATE subscriptions SET current_period_ends_at=now()-interval '1 second' WHERE organization_id=$1",[context.organizationId]);
    const token=new URLSearchParams(new URL(invite.handoffUrl!).hash.slice(1)).get('token')!;
    await assert.rejects(service.acceptInvitation(token,randomUUID()),/not available/);
    await assert.rejects(service.createInvitation(context,input(context)),/not available/);
    assert.equal((await usage(context.organizationId)).occupied,1);
  });
  await t.test('cross-organization counts and invitation revocation remain isolated',async()=>{
    const a=await fixture(),b=await fixture();const invite=await a.service.createInvitation(a.context,input(a.context));
    await assert.rejects(b.service.revokeInvitation(b.context,invite.id));
    assert.equal((await usage(a.context.organizationId)).reserved,1);
    assert.equal((await usage(b.context.organizationId)).reserved,0);
  });
  await t.test('inactive seats remain occupied; revoked reactivation needs capacity',async()=>{
    const {context,service}=await fixture();
    const staff=new PostgresStaffRepository(db);
    const member=await staff.create({organizationId:context.organizationId,branchId:context.branchId!,name:'QA member',phone:phone(),passwordHash:'synthetic',role:'staff'});
    assert.notEqual(member,'phone-conflict');
    const row=(await db.query("SELECT * FROM memberships WHERE organization_id=$1 AND role='staff'",[context.organizationId])).rows[0];
    const administration=new OrganizationAdministrationService(db);
    const change=(status:'active'|'inactive'|'revoked',version:number)=>administration.saveMember(context,row.id,{role:'staff',customRoleId:null,status,version,branchIds:[context.branchId!]},false);
    await change('inactive',row.version);
    assert.equal((await usage(context.organizationId)).occupied,2);
    await change('active',row.version+1);
    assert.equal((await usage(context.organizationId)).occupied,2);
    await change('revoked',row.version+2);
    assert.equal((await usage(context.organizationId)).occupied,1);
    for(let i=0;i<4;i++)await service.createInvitation(context,input(context));
    await assert.rejects(change('active',row.version+3),/capacity exceeded/);
  });
  await t.test('legacy internal staff creation cannot bypass null or full capacity',async()=>{
    const {context,service}=await fixture();const staff=new PostgresStaffRepository(db);
    for(let i=0;i<4;i++)await service.createInvitation(context,input(context));
    await assert.rejects(staff.create({organizationId:context.organizationId,branchId:context.branchId!,name:'QA blocked',phone:phone(),passwordHash:'synthetic',role:'staff'}),/capacity exceeded/);
    await db.query("UPDATE subscriptions SET status='suspended' WHERE organization_id=$1",[context.organizationId]);
    await assert.rejects(staff.create({organizationId:context.organizationId,branchId:context.branchId!,name:'QA blocked',phone:phone(),passwordHash:'synthetic',role:'staff'}),/not available/);
  });
  await t.test('existing global identity joins a second organization without double counting',async()=>{
    const a=await fixture(),b=await fixture();
    const existingPhone=(await db.query('SELECT phone FROM users WHERE id=$1',[a.context.userId])).rows[0].phone;
    const invite=await b.service.createInvitation(b.context,{...input(b.context),phone:existingPhone});
    const token=new URLSearchParams(new URL(invite.handoffUrl!).hash.slice(1)).get('token')!;
    await assert.rejects(b.service.acceptInvitation(token,undefined,b.context.userId),/different account/);
    await b.service.acceptInvitation(token,undefined,a.context.userId);
    assert.equal((await usage(a.context.organizationId)).occupied,1);
    const state=await usage(b.context.organizationId);assert.equal(state.occupied,2);assert.equal(state.reserved,0);
  });
  await t.test('suspension/cancellation preserve members and deny growth; reactivation restores capacity',async()=>{
    const {context,service}=await fixture();
    const operator=(await db.query("INSERT INTO users(name,phone,platform_role,created_at,updated_at) VALUES ('QA operator',$1,'operator',now(),now()) RETURNING id",[phone()])).rows[0].id;
    const terms={planKey:'pilot-core',addOns:[],source:'manual' as const,startsAt:new Date(Date.now()-86400000).toISOString(),currentPeriodEndsAt:new Date(Date.now()+86400000).toISOString()};
    for(const status of ['suspended','cancelled'] as const){
      await commercial.updateSubscription(context.organizationId,operator,{...terms,status});
      assert.equal((await usage(context.organizationId)).occupied,1);
      await assert.rejects(service.createInvitation(context,input(context)),/not available/);
    }
    await commercial.updateSubscription(context.organizationId,operator,{...terms,status:'active'});
    assert.equal((await usage(context.organizationId)).available,4);
    await assert.rejects(commercial.updateSubscription(context.organizationId,operator,{...terms,planKey:undefined,status:'active'}),/not available/);
    assert.equal((await usage(context.organizationId)).allowed,5);
  });
  await t.test('numeric downgrade below reservations is atomic and rejected',async()=>{
    const {context,service}=await fixture();
    for(let i=0;i<2;i++)await service.createInvitation(context,input(context));
    const plan=(await db.query("INSERT INTO plans(key,name,description,status,available,version,created_at,updated_at) VALUES ('qa-small','Small','Synthetic','active',true,1,now(),now()) RETURNING id")).rows[0].id;
    await db.query("INSERT INTO plan_limits(plan_id,limit_key,value) VALUES ($1,'staff',2)",[plan]);
    await assert.rejects(commercial.updateSubscription(context.organizationId,context.userId,{planKey:'qa-small',addOns:[],status:'active',source:'manual',startsAt:new Date(Date.now()-86400000).toISOString(),currentPeriodEndsAt:new Date(Date.now()+86400000).toISOString()}),/capacity exceeded/);
    assert.equal((await usage(context.organizationId)).allowed,5);
  });
  await t.test('acceptance racing with a new invitation cannot steal its reserved seat',async()=>{
    const {context,service}=await fixture();
    const invite=await service.createInvitation(context,input(context));
    for(let i=0;i<3;i++)await service.createInvitation(context,input(context));
    const token=new URLSearchParams(new URL(invite.handoffUrl!).hash.slice(1)).get('token')!;
    const results=await Promise.allSettled([service.acceptInvitation(token,randomUUID()),service.createInvitation(context,input(context))]);
    assert.equal(results[0]!.status,'fulfilled');
    assert.equal(results[1]!.status,'rejected');
    if(results[1]!.status==='rejected')assert.match(String(results[1]!.reason),/capacity exceeded/);
    const state=await usage(context.organizationId);
    assert.equal(state.occupied,2);assert.equal(state.reserved,3);assert.equal(state.available,0);
  });
  await t.test('subscription reduction racing with invitation never oversubscribes',async()=>{
    const {context,service}=await fixture();
    await service.createInvitation(context,input(context));
    const results=await Promise.allSettled([
      commercial.updateSubscription(context.organizationId,context.userId,{planKey:'qa-small',addOns:[],status:'active',source:'manual',startsAt:new Date(Date.now()-86400000).toISOString(),currentPeriodEndsAt:new Date(Date.now()+86400000).toISOString()}),
      service.createInvitation(context,input(context)),
    ]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.filter(r=>r.status==='rejected').length,1);
    for(const result of results)if(result.status==='rejected')assert.match(String(result.reason),/capacity exceeded/);
    assert.equal((await usage(context.organizationId)).overCapacity,false);
  });
  await t.test('shared catalogue downgrade and reactivation cannot strand excess seats',async()=>{
    await db.query("UPDATE plan_limits SET value=6 WHERE plan_id=(SELECT id FROM plans WHERE key='pilot-core') AND limit_key='staff'");
    const {context,service}=await fixture();
    const invites=[];
    for(let i=0;i<5;i++)invites.push(await service.createInvitation(context,input(context)));
    await assert.rejects(commercial.reconcileCatalogue(),/capacity exceeded/);
    assert.equal((await usage(context.organizationId)).allowed,6);
    await db.query("UPDATE plans SET status='inactive' WHERE key='pilot-core'");
    await assert.rejects(commercial.reconcileCatalogue(),/capacity exceeded/);
    assert.equal((await usage(context.organizationId)).allowed,null);
    await service.revokeInvitation(context,invites[0]!.id);
    await commercial.reconcileCatalogue();
    assert.equal((await usage(context.organizationId)).allowed,5);
    assert.equal((await usage(context.organizationId)).available,0);
  });
  await t.test('exclusive catalogue lock blocks allocation until changed terms commit',async()=>{
    const {context,service}=await fixture();
    let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
    await db.transaction(async client=>{
      await lockSeatCatalogue(client,true);
      // Observe a real PostgreSQL lock waiter before releasing the barrier.
      pending=Promise.allSettled([service.createInvitation(context,input(context))]);
      const deadline=Date.now()+5000;
      let waiting=false;
      while(Date.now()<deadline){
        waiting=(await client.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())) AS waiting")).rows[0].waiting;
        if(waiting)break;
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      assert.equal(waiting,true,'allocation must wait for catalogue coordination');
      await client.query("UPDATE plans SET status='inactive' WHERE key='pilot-core'");
    });
    const results=await pending!;
    assert.equal(results[0]!.status,'rejected');
    assert.equal((await usage(context.organizationId)).reserved,0);
    await commercial.reconcileCatalogue();
  });
  await t.test('suspension racing with acceptance leaves no unlicensed new membership',async()=>{
    const {context,service}=await fixture();
    const invite=await service.createInvitation(context,input(context));
    const token=new URLSearchParams(new URL(invite.handoffUrl!).hash.slice(1)).get('token')!;
    let acceptance: Promise<PromiseSettledResult<unknown>[]> | undefined;
    await db.transaction(async client=>{
      await lockOrganizationSeats(client,context.organizationId);
      acceptance=Promise.allSettled([service.acceptInvitation(token,randomUUID())]);
      await client.query("UPDATE subscriptions SET status='suspended' WHERE organization_id=$1",[context.organizationId]);
    });
    assert.equal((await acceptance!)[0]!.status,'rejected');
    assert.equal((await usage(context.organizationId)).occupied,1);
    assert.equal((await usage(context.organizationId)).reserved,1);
  });
});
