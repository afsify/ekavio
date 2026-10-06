import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp,readdir,copyFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { PostgresDatabase } from '../src/postgres/database.js';
import { migrate,getMigrationStatus } from '../src/postgres/migrations.js';
import { PostgresAccountRepository } from '../src/postgres/accountRepository.js';
import { OrganizationAdministrationService } from '../src/services/organizationAdministrationService.js';
import { IdentityAccountService } from '../src/services/identityAccountService.js';
import { membershipAuthority } from '../src/postgres/organizationAuthorization.js';
import { PostgresIdentityRepository } from '../src/postgres/identityRepository.js';
import { PostgresSessionRepository } from '../src/postgres/sessionRepository.js';
import { PostgresAuthorizationContextRepository } from '../src/postgres/authorizationContextRepository.js';
import { createAuthorizationContextResolver, type AuthorizationContext } from '../src/services/requestContextService.js';
import { permissionsForRole,permissionCatalogue } from '../src/services/authorizationPolicy.js';
import { initializeRuntimeConfig } from '../src/config/env.js';
import { runtimePostgresDatabase } from '../src/persistence/runtimePersistence.js';
import { createApp } from '../src/app.js';
import { emptyEffectiveLimits } from '../src/commercial/catalogue.js';
import { EmailCapture } from './helpers/emailCapture.js';

test('organization administration and RBAC against disposable PostgreSQL',async t=>{
  const adminUrl=new URL(process.env.POSTGRES_TEST_URL??'');
  assert.ok(['localhost','127.0.0.1','postgres'].includes(adminUrl.hostname)&&adminUrl.pathname==='/postgres');
  const admin=new PostgresDatabase(adminUrl.toString());const name='ekavio_v208c_'+randomUUID().replaceAll('-','');
  await admin.query(`CREATE DATABASE "${name}"`);adminUrl.pathname='/'+name;const db=new PostgresDatabase(adminUrl.toString());
  t.after(async()=>{await runtimePostgresDatabase.close();await db.close();await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1',[name]);await admin.query(`DROP DATABASE "${name}"`);await admin.close();});
  await t.test('001–013 upgrade to 014 and unchanged checksums, idempotent latest',async()=>{
    const directory=await mkdtemp(path.join(tmpdir(),'ekavio-v208c-'));
    try{for(const file of (await readdir('postgres/migrations')).filter(f=>f.endsWith('.sql')&&Number(f.slice(0,3))<=13))await copyFile(path.join('postgres/migrations',file),path.join(directory,file));
      await migrate(db,directory);const before=(await db.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;
      await migrate(db);await migrate(db);assert.equal((await getMigrationStatus(db)).length,14);
      assert.deepEqual((await db.query("SELECT name,checksum FROM schema_migrations WHERE name<'014' ORDER BY name")).rows,before);
    }finally{await rm(directory,{recursive:true});}
  });
  const accounts=new PostgresAccountRepository(db);const a=await accounts.registerAdmin({orgName:'QA A',orgType:'shop',userName:'QA owner A',phone:'+919876540001',passwordHash:'fixture-hash'});
  const b=await accounts.registerAdmin({orgName:'QA B',orgType:'shop',userName:'QA owner B',phone:'+919876540002',passwordHash:'other-hash'});
  const org=String(a.user.tenantId),otherOrg=String(b.user.tenantId),user=String(a.user.id),otherUser=String(b.user.id),branch=String((a.branch as {id:string}).id),foreign=String((b.branch as {id:string}).id);
  await db.query("UPDATE memberships SET role='owner' WHERE user_id=$1",[user]);
  await db.query("UPDATE branches SET timezone='Asia/Kolkata' WHERE organization_id=ANY($1::uuid[])",[[org,otherOrg]]);
  const ownerId=(await db.query('SELECT id FROM memberships WHERE user_id=$1',[user])).rows[0]!.id;
  const c:AuthorizationContext={userId:user,organizationId:org,membershipId:ownerId,branchId:branch,sessionId:'fixture',role:'owner',permissions:permissionsForRole('owner'),platformOperator:false};
  const service=new OrganizationAdministrationService(db);const identity=new IdentityAccountService(db,new EmailCapture());
  const identities=new PostgresIdentityRepository(db,{getEffective:async id=>({organizationId:id,subscription:null,modules:[],limits:emptyEffectiveLimits()})});
  let roleId:string;let second:string;let member:string;
  const roleInput={name:'Customer reader',description:'Read customers only',permissions:['customers.read'] as ['customers.read']};
  const branchInput={name:'Second',code:'second',timezone:'Asia/Kolkata',status:'active' as const};
  await t.test('profile updates reuse organization canonical fields, never change billing agreement',async()=>{
    const input={name:'QA A updated',type:'shop',businessCategory:'Retail',description:'Fixture',contactEmail:'FIXTURE@example.invalid',contactPhone:'9876540001',address:'Fixture address',website:'https://example.invalid'};
    await assert.rejects(service.saveProfile(c,{...input,contactPhone:'not-a-phone'}),/valid international/);
    await service.saveProfile(c,input);
    assert.equal((await service.overview(c))!.name,'QA A updated');assert.equal((await service.overview(c))!.business_category,'Retail');
    assert.equal((await service.overview(c))!.contact_email,'fixture@example.invalid');assert.equal((await service.overview(c))!.contact_phone,'+919876540001');
  });
  await t.test('branch create and org-scoped search/details',async()=>{const r=await service.saveBranch(c,branchInput);second=String(r.id);assert.equal((await service.branches(c,'Second')).length,1);});
  await t.test('branch foreign ID, duplicate code, bad timezone fail',async()=>{
    await assert.rejects(service.saveBranch(c,{...branchInput,version:1},foreign),/not found/);
    await assert.rejects(service.saveBranch(c,branchInput),/already exists/);
    await assert.rejects(service.saveBranch(c,{...branchInput,code:'bad',timezone:'Not/AZone'}),/timezone/);
  });
  await t.test('last usable assigned branch cannot strand staff',async()=>{await assert.rejects(service.saveBranch(c,{name:'Main',code:'main',timezone:'Asia/Kolkata',status:'inactive',version:1},branch),/Reassign staff/);});
  await t.test('unassigned branch deactivation retains history; stale version rejects',async()=>{
    await service.saveBranch(c,{...branchInput,status:'inactive',version:1},second);assert.equal((await service.branches(c)).length,2);
    await assert.rejects(service.saveBranch(c,{...branchInput,version:1},second),/changed/);
    await service.saveBranch(c,{...branchInput,version:2},second);
  });
  await t.test('server catalogue has labels/descriptions and no platform/provider/secret permission',async()=>{assert.ok(permissionCatalogue.every(p=>p.label&&p.description&&p.category));assert.equal(new Set(permissionCatalogue.map(p=>p.key)).size,permissionCatalogue.length);assert.ok(!permissionCatalogue.some(p=>/platform|provider|secret/.test(p.key)));});
  await t.test('owner creates normalized least-privilege custom role',async()=>{roleId=String((await service.saveRole(c,roleInput)).id);assert.equal((await service.roles(c)).custom.length,1);});
  await t.test('foreign custom role ref and owner custom role rejected by DB',async()=>{
    await assert.rejects(db.query('UPDATE memberships SET custom_role_id=$1 WHERE user_id=$2',[roleId,otherUser]));
    await assert.rejects(db.query('UPDATE memberships SET custom_role_id=$1 WHERE user_id=$2',[roleId,user]));
  });
  await t.test('unknown/platform permission rejected by DB',async()=>{await assert.rejects(db.query("INSERT INTO organization_role_permissions(role_id,permission) VALUES($1,'platform.operator')",[roleId]));});
  await t.test('authenticated existing identity links atomically without overwrite or duplicate user',async()=>{
    const before=(await db.query('SELECT name,phone,password_hash,platform_role FROM users WHERE id=$1',[otherUser])).rows[0];
    const invite=await identity.createInvitation(c,{name:'Must not overwrite identity',phone:'+919876540002',role:'staff',customRoleId:roleId,branchIds:[branch]});
    const raw=new URLSearchParams(new URL(invite.handoffUrl!).hash.slice(1)).get('token')!;
    assert.equal((await identity.inspectAction(raw,'staff_invitation') as {existingAccount:boolean}).existingAccount,true);
    await assert.rejects(identity.acceptInvitation(raw,undefined,user),/different account/);
    await assert.rejects(identity.acceptInvitation(raw,randomUUID()),/Sign in/);
    await identity.acceptInvitation(raw,undefined,otherUser);await assert.rejects(identity.acceptInvitation(raw,undefined,otherUser));
    assert.deepEqual((await db.query('SELECT name,phone,password_hash,platform_role FROM users WHERE id=$1',[otherUser])).rows[0],before);
    member=(await db.query('SELECT id FROM memberships WHERE user_id=$1 AND organization_id=$2',[otherUser,org])).rows[0]!.id;
    assert.equal((await db.query('SELECT count(*) FROM users WHERE id=$1',[otherUser])).rows[0]!.count,'1');
  });
  await t.test('custom permissions REPLACE broad built-in staff authority',async()=>{assert.deepEqual((await membershipAuthority(db,otherUser,org)).effective,['customers.read']);});
  await t.test('login/refresh context hydrates custom restriction',async()=>{
    const u=await identities.findById(otherUser);assert.ok(u);const context=await identities.buildContext(u,{organizationId:org});assert.deepEqual(context.permissions,['customers.read']);
  });
  await t.test('role edits change next resolver result; optimistic stale version rejects',async()=>{
    await service.saveRole(c,{...roleInput,permissions:['customers.read','services.read'],version:1},roleId);
    assert.deepEqual((await membershipAuthority(db,otherUser,org)).effective,['customers.read','services.read']);
    await assert.rejects(service.saveRole(c,{...roleInput,version:1},roleId),/changed/);
  });
  await t.test('assigned role archive rejected; direct archived role never falls back',async()=>{
    await assert.rejects(service.saveRole(c,{...roleInput,status:'archived',version:2},roleId),/Reassign/);
    await db.query("UPDATE organization_roles SET status='archived' WHERE id=$1",[roleId]);assert.deepEqual((await membershipAuthority(db,otherUser,org)).effective,[]);
    await db.query("UPDATE organization_roles SET status='active' WHERE id=$1",[roleId]);
  });
  await t.test('staff role/status and foreign branch assignment invariant',async()=>{
    await assert.rejects(service.saveMember(c,member,{role:'staff',customRoleId:roleId,status:'active',branchIds:[foreign],version:1}),/this organization/);
    await assert.rejects(service.saveMember(c,ownerId,{role:'staff',customRoleId:null,status:'active',branchIds:[branch],version:1}),/Owner and self/);
  });
  await t.test('suspend/reactivate/revoke preserve global identity and other memberships/sessions',async()=>{
    const sessions=new PostgresSessionRepository(db);const record={sessionId:randomUUID().replaceAll('-',''),userId:otherUser,refreshTokenHash:'a'.repeat(64),expiresAt:new Date(Date.now()+60000),lastUsedAt:new Date(),revokedAt:null};await sessions.create(record);
    await service.saveMember(c,member,{role:'staff',customRoleId:roleId,status:'inactive',branchIds:[branch],version:1});await assert.rejects(membershipAuthority(db,otherUser,org));
    assert.ok((await membershipAuthority(db,otherUser,otherOrg)).effective.length);
    await service.saveMember(c,member,{role:'staff',customRoleId:roleId,status:'active',branchIds:[branch,second],version:2});
    await service.saveMember(c,member,{role:'staff',customRoleId:roleId,status:'revoked',branchIds:[branch],version:3});
    assert.equal(await new PostgresAuthorizationContextRepository(db).isSessionActive(record.sessionId,otherUser,new Date()),true);
    await assert.rejects(membershipAuthority(db,otherUser,org));assert.ok((await membershipAuthority(db,otherUser,otherOrg)).effective.length);
  });
  await t.test('reassign historical membership then archive unused role',async()=>{
    await service.saveMember(c,member,{role:'staff',customRoleId:null,status:'active',branchIds:[branch],version:4});
    await service.saveRole(c,{...roleInput,status:'archived',version:2},roleId);
    assert.ok((await membershipAuthority(db,otherUser,org)).effective.includes('queue.manage'));
  });
  await t.test('least-privilege delegated admin cannot grant broad roles or edit own role',async()=>{
    const delegated=await service.saveRole(c,{name:'Delegated',description:'Fixture',permissions:['roles.manage','staff.manage','customers.read']});
    await service.saveMember(c,member,{role:'staff',customRoleId:String(delegated.id),status:'active',branchIds:[branch],version:5});
    const low={...c,userId:otherUser,membershipId:member,role:'staff' as const,permissions:permissionsForRole('owner')}; // deliberately stale/forged context
    await assert.rejects(service.saveRole(low,{name:'Escalation',description:'',permissions:['organization.manage']}),/Cannot grant/);
    await assert.rejects(identity.createInvitation(low,{name:'Escalation',phone:'+919876540099',role:'admin',branchIds:[branch]}),/Cannot grant/);
    await assert.rejects(service.saveRole(low,{name:'Delegated',description:'',permissions:['customers.read'],version:1},String(delegated.id)),/own effective/);
  });
  await t.test('append-only audit projection has names, no raw payloads or foreign events',async()=>{
    const events=await service.audit(c,{page:1});assert.ok(events.length);assert.ok(events.every(e=>e.actor==='QA owner A'||e.actor==='QA owner B'));
    assert.ok(events.every(e=>Object.keys(e).sort().join(',')==='action,actor,id,occurred_at'));
    assert.equal((await service.audit({...c,organizationId:otherOrg},{page:1})).length,0);
    await assert.rejects(db.query('UPDATE organization_admin_events SET actor_user_id=$1',[otherUser]));
    assert.ok((await service.audit(c,{category:'role',page:1})).every(e=>e.action.startsWith('role.')));
  });
  const config=initializeRuntimeConfig({NODE_ENV:'test',DATABASE_URL:adminUrl.toString(),JWT_SECRET:randomUUID(),REFRESH_TOKEN_SECRET:randomUUID(),HTTP_ALLOWED_ORIGINS:'http://localhost',SOCKET_ALLOWED_ORIGINS:'http://localhost'});
  const server=createServer(createApp({config,identityAccountService:identity}));await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));});
  const port=(server.address() as {port:number}).port;
  const session={sessionId:randomUUID().replaceAll('-',''),userId:user,refreshTokenHash:'b'.repeat(64),expiresAt:new Date(Date.now()+60000),lastUsedAt:new Date(),revokedAt:null};await new PostgresSessionRepository(db).create(session);
  const token=jwt.sign({id:user,tenantId:org,sessionId:session.sessionId},config.jwtSecret);
  const request=(route:string,init:RequestInit={},headers:Record<string,string>={})=>fetch(`http://127.0.0.1:${port}/api${route}`,{...init,headers:{Authorization:'Bearer '+token,'x-tenant-id':org,'x-branch-id':branch,'Content-Type':'application/json',...headers}});
  await t.test('HTTP Customers/Services CORE work without Queue entitlement; Queue/Appointment still deny',async()=>{
    for(const route of ['/customers','/services'])assert.equal((await request(route)).status,200);
    for(const route of ['/queue','/appointments']){const r=await request(route);assert.equal(r.status,403);assert.equal((await r.json()).error.code,'ENTITLEMENT_REQUIRED');}
  });
  await t.test('HTTP core read/manage permissions independent, immediate permission removal',async()=>{
    const r=await service.saveRole(c,{name:'Core only',description:'',permissions:['customers.read','services.read']});
    // Owners cannot be weakened through product workflows; explicit fixture change exercises live middleware.
    await db.query("UPDATE memberships SET role='admin',custom_role_id=$1 WHERE id=$2",[r.id,ownerId]);
    assert.equal((await request('/customers')).status,200);assert.equal((await request('/customers',{method:'POST',body:JSON.stringify({name:'Denied'})})).status,403);
    assert.equal((await request('/organization')).status,403);assert.equal((await request('/roles')).status,403);
    await db.query('DELETE FROM organization_role_permissions WHERE role_id=$1',[r.id]);assert.equal((await request('/customers')).status,403);
    await db.query("UPDATE memberships SET role='owner',custom_role_id=NULL WHERE id=$1",[ownerId]);
  });
  await t.test('HTTP foreign tenant/branch/member, operator-only directory deny',async()=>{
    assert.equal((await request('/organization',{}, {'x-tenant-id':otherOrg})).status,403);
    assert.equal((await request('/branches',{}, {'x-branch-id':foreign})).status,403);
    assert.equal((await request('/platform/organizations')).status,403);
    const r=await request('/members/'+randomUUID(),{method:'PATCH',body:JSON.stringify({role:'staff',customRoleId:null,status:'active',branchIds:[branch],version:1})});assert.equal(r.status,404);
    await db.query("UPDATE users SET platform_role='operator' WHERE id=$1",[user]);assert.equal((await request('/platform/organizations')).status,200);
  });
  await t.test('all built-in role permission boundaries resolve live without historical rewrite',async()=>{
    for(const role of ['owner','admin','manager','hr','staff'] as const){await db.query('UPDATE memberships SET role=$1,custom_role_id=NULL WHERE id=$2',[role,ownerId]);const actual=await createAuthorizationContextResolver(new PostgresAuthorizationContextRepository(db))({userId:user,sessionId:session.sessionId,defaultOrganizationId:org});assert.deepEqual(actual.permissions,permissionsForRole(role));}
  });
});
