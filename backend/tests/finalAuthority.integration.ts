import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { io as socketClient } from '../../frontend/node_modules/socket.io-client/build/esm/index.js';
import { setupSocket, closeSocket, emitToBranch } from '../src/config/socket.js';
import { PostgresDatabase } from '../src/postgres/database.js';
import { migrate } from '../src/postgres/migrations.js';
import { PostgresAccountRepository } from '../src/postgres/accountRepository.js';
import { PostgresCommercialRepository } from '../src/postgres/commercialRepository.js';
import { PostgresSessionRepository } from '../src/postgres/sessionRepository.js';
import { initializeRuntimeConfig } from '../src/config/env.js';
import { runtimePostgresDatabase } from '../src/persistence/runtimePersistence.js';
import { createApp } from '../src/app.js';
import { permissionsForRole } from '../src/services/authorizationPolicy.js';

const modules = [
  ['queue', '/queue', 'queue.read'], ['attendance', '/attendance?date=2026-10-08', 'attendance.read'],
  ['ledger', '/customer-dues/entries', 'ledger.read'], ['inventory', '/inventory', 'inventory.read'],
  ['crm', '/crm/leads', 'crm.read'], ['purchasing', '/purchasing/orders', 'purchasing.read'],
  ['hr_plus', '/hr/leave?from=2026-10-08&to=2026-10-08', 'hr_plus.read'],
] as const;

test('final live HTTP authority matrix for seven commercial modules', async t => {
  const url = new URL(process.env.POSTGRES_TEST_URL ?? '');
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(url.hostname) && url.pathname === '/postgres');
  const admin = new PostgresDatabase(url.href), name = `ekavio_v210_authority_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE DATABASE ${name}`); url.pathname = `/${name}`;
  const db = new PostgresDatabase(url.href);
  const config = initializeRuntimeConfig({ NODE_ENV: 'test', DATABASE_URL: url.href,
    JWT_SECRET: randomUUID(), REFRESH_TOKEN_SECRET: randomUUID(),
    HTTP_ALLOWED_ORIGINS: 'http://localhost', SOCKET_ALLOWED_ORIGINS: 'http://localhost' });
  let app = createApp({ config });
  const server = createServer((request, response) => app(request, response));
  try {
    await migrate(db);
    const accounts = new PostgresAccountRepository(db), commercial = new PostgresCommercialRepository(db);
    await commercial.reconcileCatalogue();
    const password = randomUUID();
    const a = await accounts.registerAdmin({ orgName: 'STAGING V210 A', orgType: 'shop',
      userName: 'Synthetic A', phone: '+919876510001', passwordHash: await bcrypt.hash(password,4) });
    const b = await accounts.registerAdmin({ orgName: 'STAGING V210 B', orgType: 'shop',
      userName: 'Synthetic B', phone: '+919876510002', passwordHash: 'no-login-fixture' });
    const user = String(a.user.id), org = String(a.user.tenantId), branch = String((a.branch as {id:string}).id);
    const membership = (await db.query('SELECT id FROM memberships WHERE user_id=$1', [user])).rows[0]!.id;
    await db.query("UPDATE branches SET timezone='Asia/Kolkata' WHERE organization_id=$1", [org]);
    const role = (await db.query("INSERT INTO organization_roles(organization_id,name) VALUES($1,'STAGING V210 read role') RETURNING id", [org])).rows[0]!.id;
    const session = { sessionId: randomUUID().replaceAll('-', ''), userId: user,
      refreshTokenHash: 'a'.repeat(64), expiresAt: new Date(Date.now()+3_600_000), lastUsedAt: new Date(), revokedAt: null };
    await new PostgresSessionRepository(db).create(session);
    const token = jwt.sign({ id: user, tenantId: org, sessionId: session.sessionId }, config.jwtSecret);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as {port:number}).port}/api`;
    const request = (path:string, extra:Record<string,string>={}) => fetch(origin+path, {
      headers: { authorization: 'Bearer '+token, 'x-tenant-id': org, 'x-branch-id': branch, ...extra },
      signal: AbortSignal.timeout(15_000),
    });
    const grant = (key:string, effect:'grant'|'revoke') => commercial.upsertEntitlement(org,user,key,
      { effect, status:'active', source:'pilot', reason:'STAGING V210 disposable acceptance' });
    for (const [key,path,permission] of modules) {
      await t.test(`${key}: missing grant, missing permission, allowed, revoked, archived role`, async () => {
        assert.equal((await request(path)).status,403);
        await grant(key,'grant');
        await db.query("UPDATE memberships SET role='staff',custom_role_id=$1 WHERE id=$2",[role,membership]);
        assert.equal((await request(path)).status,403);
        await db.query('INSERT INTO organization_role_permissions(role_id,permission) VALUES($1,$2)',[role,permission]);
        if (key === 'purchasing') await db.query("INSERT INTO organization_role_permissions(role_id,permission) VALUES($1,'inventory.read')", [role]);
        assert.equal((await request(path)).status,200);
        await grant(key,'revoke'); assert.equal((await request(path)).status,403);
        await grant(key,'grant'); await db.query("UPDATE organization_roles SET status='archived' WHERE id=$1",[role]);
        assert.equal((await request(path)).status,403);
        await db.query("UPDATE memberships SET role='admin',custom_role_id=NULL WHERE id=$1",[membership]);
        await db.query("UPDATE organization_roles SET status='active' WHERE id=$1",[role]);
        await db.query('DELETE FROM organization_role_permissions WHERE role_id=$1',[role]);
      });
    }
    await t.test('suspended subscription cannot be bypassed by explicit active pilot grants', async () => {
      for (const offset of [-60_000, 86_400_000]) {
        await commercial.updateSubscription(org,user,{planKey:null,addOns:[],status:'suspended',source:'manual',
          startsAt:new Date(Date.now()+offset).toISOString(),billingCycle:'monthly'});
        for (const [,path] of modules) assert.equal((await request(path)).status,403);
      }
      await commercial.updateSubscription(org,user,{planKey:null,addOns:[],status:'active',source:'manual',
        startsAt:new Date(Date.now()-60_000).toISOString(),billingCycle:'monthly'});
      for (const [,path] of modules) assert.equal((await request(path)).status,200);
    });
    // Independent synthetic client phase; normal deployed rate limits unchanged.
    app = createApp({ config });
    for (const builtIn of ['owner','admin','manager','hr','staff'] as const) {
      await t.test(`${builtIn}: actual HTTP reads agree with server built-in permissions`, async () => {
        await db.query('UPDATE memberships SET role=$1,custom_role_id=NULL WHERE id=$2',[builtIn,membership]);
        for (const [,path,permission] of modules) assert.equal((await request(path)).status,
          permissionsForRole(builtIn).includes(permission)?200:403);
      });
    }
    await db.query("UPDATE memberships SET role='admin' WHERE id=$1",[membership]);
    await t.test('queue creation, transition and appointment check-in persist safe record IDs in audit', async () => {
      const mutate = async (path: string, body: Record<string, unknown>, status: number, method = 'POST') => {
        const response = await fetch(origin + path, { method,
          headers: { authorization: 'Bearer ' + token, 'x-tenant-id': org, 'x-branch-id': branch, 'Content-Type': 'application/json' },
          body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
        assert.equal(response.status, status);
        return (await response.json()).data;
      };
      const customer = await mutate('/customers', { name: 'Synthetic audit customer' }, 201);
      const service = await mutate('/services', { name: 'Synthetic audit service', durationMinutes: 30 }, 201);
      const queueBody = { customerId: customer.id, serviceId: service.id, idempotencyKey: randomUUID() };
      const queue = await mutate('/queue', queueBody, 201);
      assert.equal((await mutate('/queue', queueBody, 200)).id, queue.id);
      await mutate(`/queue/${queue.id}/status`, { status: 'serving', expectedVersion: queue.version }, 200, 'PATCH');
      const appointment = await mutate('/appointments', { customerId: customer.id, serviceId: service.id,
        localStart: '2026-10-12T10:30', idempotencyKey: randomUUID() }, 201);
      const checkInBody = { idempotencyKey: randomUUID() };
      const checkedIn = await mutate(`/appointments/${appointment.id}/check-in`, checkInBody, 200);
      assert.equal((await mutate(`/appointments/${appointment.id}/check-in`, checkInBody, 200)).created, false);
      const events = (await db.query<{ action: string; details: Record<string, unknown> }>(
        "SELECT action, details FROM audit_events WHERE organization_id=$1 AND action IN ('queue.token.created','queue.token.status_changed','appointment.checked_in')", [org])).rows;
      assert.equal(events.length, 3, 'each committed action audits once; idempotent replay adds no event');
      for (const event of events) {
        assert.equal(event.details.queueRecordId, event.action === 'appointment.checked_in' ? checkedIn.tokenId : queue.id);
        assert.equal(event.details.tokenId, undefined, 'record metadata must not collide with credential-redaction keys');
      }
    });
    await t.test('valid positive reads reject foreign organization and branch context for every module', async () => {
      for (const [,path] of modules) {
        assert.equal((await request(path)).status,200);
        assert.equal((await request(path,{'x-tenant-id':String(b.user.tenantId)})).status,403);
        assert.equal((await request(path,{'x-branch-id':String((b.branch as {id:string}).id)})).status,403);
      }
    });
    await t.test('inactive and revoked membership deny every entitled module', async () => {
      for (const status of ['inactive','revoked']) {
        await db.query('UPDATE memberships SET status=$1 WHERE id=$2',[status,membership]);
        for (const [,path] of modules) assert.equal((await request(path)).status,403);
      }
      await db.query("UPDATE memberships SET status='active' WHERE id=$1",[membership]);
    });
    await t.test('platform operator is separate from tenant role; revoked session denies core', async () => {
      assert.equal((await request('/platform/organizations')).status,403);
      await db.query("UPDATE users SET platform_role='operator' WHERE id=$1",[user]);
      assert.equal((await request('/platform/organizations')).status,200);
      await db.query('UPDATE auth_sessions SET revoked_at=now() WHERE session_id=$1',[session.sessionId]);
      assert.equal((await request('/customers')).status,401);
    });
    app = createApp({ config });
    setupSocket(server, config);
    await commercial.upsertEntitlement(String(b.user.tenantId),String(b.user.id),'queue',
      {effect:'grant',status:'active',source:'pilot',reason:'STAGING V210 foreign realtime positive control'});
    const foreignSession={...session,sessionId:randomUUID().replaceAll('-',''),userId:String(b.user.id)};
    await new PostgresSessionRepository(db).create(foreignSession);
    const foreignToken=jwt.sign({id:String(b.user.id),tenantId:String(b.user.tenantId),sessionId:foreignSession.sessionId},config.jwtSecret);
    const foreignBranch=String((b.branch as {id:string}).id);
    for (const transport of ['polling','websocket'] as const) {
      await t.test(`${transport}: authenticated event isolation, forged rooms, origin, reconnect and live revocation`, async () => {
        const clients:ReturnType<typeof socketClient>[]=[];
        const event=(socket:ReturnType<typeof socketClient>,name:string)=>new Promise<unknown>((resolve,reject)=>{
          const timer=setTimeout(()=>{socket.off(name,receive);reject(new Error('Bounded synthetic realtime event timeout'));},5000);
          const receive=(data:unknown)=>{clearTimeout(timer);resolve(data);};socket.once(name,receive);
        });
        const make=(accessToken:string,organizationId=org,branchId=branch,originHeader='http://localhost')=>{
          const socket=socketClient(origin.replace(/\/api$/,''),{transports:[transport],autoConnect:false,reconnection:false,
            auth:{token:accessToken,organizationId,branchId},extraHeaders:{Origin:originHeader}});clients.push(socket);return socket;
        };
        const connect=async(socket:ReturnType<typeof socketClient>)=>{const ready=event(socket,'connect');socket.connect();await ready;};
        const login=async()=>{
          const response=await fetch(origin+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost'},
            body:JSON.stringify({phone:'+919876510001',password}),signal:AbortSignal.timeout(15000)});
          assert.equal(response.status,200);return {body:await response.json(),cookie:response.headers.get('set-cookie')!.split(';')[0]!};
        };
        try {
          const auth=await login(),aSocket=make(auth.body.accessToken),bSocket=make(foreignToken,String(b.user.tenantId),foreignBranch);
          await connect(aSocket);await connect(bSocket);
          let foreignEvents=0;aSocket.on('qa:foreign',()=>{foreignEvents++;});
          const own=event(aSocket,'qa:own');emitToBranch(branch,'qa:own',{synthetic:true});assert.deepEqual(await own,{synthetic:true});
          aSocket.emit('join-room',`branch:${foreignBranch}`);aSocket.emit('join',`organization:${String(b.user.tenantId)}`);
          const foreignPositive=event(bSocket,'qa:foreign');emitToBranch(foreignBranch,'qa:foreign',{synthetic:true});await foreignPositive;
          await new Promise(resolve=>setTimeout(resolve,100));assert.equal(foreignEvents,0);
          aSocket.disconnect();await connect(aSocket);
          const reconnected=event(aSocket,'qa:again');emitToBranch(branch,'qa:again',{synthetic:true});await reconnected;
          for(const socket of [make(auth.body.accessToken,String(b.user.tenantId),foreignBranch),make(auth.body.accessToken,org,branch,'https://disallowed.invalid')]) {
            const rejected=event(socket,'connect_error');socket.connect();await rejected;assert.equal(socket.connected,false);socket.disconnect();
          }
          const logoutDisconnect=event(aSocket,'disconnect');
          assert.equal((await fetch(origin+'/auth/logout',{method:'POST',headers:{Cookie:auth.cookie,Origin:'http://localhost'},signal:AbortSignal.timeout(15000)})).status,200);
          await logoutDisconnect;
          const next=await login(),membershipSocket=make(next.body.accessToken);await connect(membershipSocket);
          await db.query("UPDATE memberships SET status='revoked' WHERE id=$1",[membership]);
          const membershipDisconnect=event(membershipSocket,'disconnect');emitToBranch(branch,'qa:revoked',{synthetic:true});await membershipDisconnect;
          await db.query("UPDATE memberships SET status='active' WHERE id=$1",[membership]);
          const last=await login(),sessionSocket=make(last.body.accessToken);await connect(sessionSocket);
          const claims=jwt.decode(last.body.accessToken) as {sessionId:string};
          await db.query('UPDATE auth_sessions SET revoked_at=now() WHERE session_id=$1',[claims.sessionId]);
          const sessionDisconnect=event(sessionSocket,'disconnect');emitToBranch(branch,'qa:revoked',{synthetic:true});await sessionDisconnect;
        } finally {
          for(const socket of clients)socket.disconnect();
          await db.query("UPDATE memberships SET status='active' WHERE id=$1",[membership]);
        }
      });
    }
  } finally {
    await closeSocket();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await runtimePostgresDatabase.close(); await db.close();
    await admin.query(`DROP DATABASE ${name}`); await admin.close();
  }
});
