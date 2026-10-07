import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import type { AddressInfo } from 'node:net';
import { PostgresDatabase } from '../src/postgres/database.js';
import { migrate, getMigrationStatus } from '../src/postgres/migrations.js';
import { PostgresAccountRepository } from '../src/postgres/accountRepository.js';
import { PostgresIdentityRepository } from '../src/postgres/identityRepository.js';
import { IdentityAccountService, hashActionSecret } from '../src/services/identityAccountService.js';
import { createAuthService } from '../src/services/authService.js';
import { createRefreshSessionManager } from '../src/services/sessionService.js';
import { PostgresSessionRepository } from '../src/postgres/sessionRepository.js';
import { initializeRuntimeConfig } from '../src/config/env.js';
import { runtimePostgresDatabase } from '../src/persistence/runtimePersistence.js';
import { createApp } from '../src/app.js';
import { EmailCapture } from './helpers/emailCapture.js';
import { emptyEffectiveLimits } from '../src/commercial/catalogue.js';
import type { AuthorizationContext } from '../src/services/requestContextService.js';

test('identity email, recovery, invitations and preferences against disposable PostgreSQL', async (t) => {
  const adminUrl = process.env.POSTGRES_TEST_URL;
  assert.ok(adminUrl, 'POSTGRES_TEST_URL required');
  const parsed = new URL(adminUrl);
  assert.ok(['localhost','127.0.0.1','postgres'].includes(parsed.hostname) && parsed.pathname === '/postgres', 'Local maintenance database only');
  const admin = new PostgresDatabase(adminUrl);
  const databaseName = `ekavio_v208b_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  parsed.pathname = `/${databaseName}`;
  const database = new PostgresDatabase(parsed.toString());
  const capture = new EmailCapture();
  const disconnected: string[] = [];
  const service = new IdentityAccountService(database, capture, (id) => disconnected.push(id));
  t.after(async () => {
    await service.awaitPendingDeliveries();
    await runtimePostgresDatabase.close(); await database.close();
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [databaseName]);
    await admin.query(`DROP DATABASE "${databaseName}"`); await admin.close();
  });
  await t.test('zero to latest and idempotent rerun', async () => { await migrate(database); await migrate(database); assert.equal((await getMigrationStatus(database)).length, 18); });
  await t.test('prior 001–012 upgrades without rewriting ambiguous legacy phones', async () => {
    const olderName = `ekavio_v208b_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE "${olderName}"`);
    const url = new URL(adminUrl); url.pathname = `/${olderName}`;
    const older = new PostgresDatabase(url.toString());
    const directory = await mkdtemp(path.join(tmpdir(), 'ekavio-v208b-migrations-'));
    try {
      for (const name of (await readdir('postgres/migrations')).filter((name) => name.endsWith('.sql') && Number(name.slice(0,3)) <= 12)) await copyFile(path.join('postgres/migrations', name), path.join(directory, name));
      await migrate(older, directory);
      await older.query("INSERT INTO users(name,phone,created_at,updated_at) VALUES ('Legacy','1001',now(),now()),('Duplicate','1001',now(),now())");
      await migrate(older); assert.equal((await older.query("SELECT count(*) FROM users WHERE phone='1001'")).rows[0].count, '2');
    } finally { await older.close(); await admin.query(`DROP DATABASE "${olderName}"`); await rm(directory, { recursive: true }); }
  });
  const password = randomUUID();
  const accounts = new PostgresAccountRepository(database);
  const a = await accounts.registerAdmin({ orgName: 'Disposable A', orgType: 'shop', userName: 'Test owner', phone: '+919876543210', passwordHash: await bcrypt.hash(password, 4) });
  const b = await accounts.registerAdmin({ orgName: 'Disposable B', orgType: 'shop', userName: 'Other owner', phone: '+442079460018', passwordHash: await bcrypt.hash(password, 4) });
  const userId = String(a.user.id), organizationId = String(a.user.tenantId);
  const branchId = (a.branch as { id: string }).id, foreignBranch = (b.branch as { id: string }).id;
  const context: AuthorizationContext = { userId, organizationId, branchId, sessionId: 'fixture', membershipId: randomUUID(), role: 'admin', platformOperator: false, permissions: ['staff.manage'] };
  const identities = new PostgresIdentityRepository(database, { getEffective: async (id) => ({ organizationId: id, subscription: null, modules: [], limits: emptyEffectiveLimits() }) });
  // Stable hashing key is necessary for refresh proof.
  const key = randomUUID();
  const sessionManager = createRefreshSessionManager({ repository: new PostgresSessionRepository(database), getHashSecret: () => key });
  const auth = createAuthService({ identities, sessions: sessionManager, verifyPassword: bcrypt.compare, signAccessToken: () => 'memory-only-fixture' });
  const email = `${randomUUID()}@example.invalid`;
  const cool = async () => database.query("UPDATE identity_challenges SET created_at=LEAST(now()-interval '2 minutes',expires_at-interval '2 minutes') WHERE user_id=$1", [userId]);
  await t.test('phone and legacy phone body login share the password/session path', async () => {
    assert.equal((await auth.login({ identifier: '9876543210', password })).response.userId, userId);
    assert.equal((await auth.login({ phone: ' +91 98765 43210 ', password })).response.userId, userId);
    await database.query("INSERT INTO users(name,phone,created_at,updated_at) VALUES ('Legacy','1001',now(),now())");
    assert.equal((await identities.findByPhone('1001')).length, 1);
  });
  await t.test('canonical-format collision fails closed without destructive backfill', async () => {
    for (const phone of ['9876543210', '09876543210', '+91 09876543210', '00919876543210']) {
      await database.query("INSERT INTO users(name,phone,created_at,updated_at) VALUES ('Collision',$1,now(),now())", [phone]);
      await assert.rejects(auth.login({ identifier: '+919876543210', password }), /Multiple accounts/);
      await assert.rejects(accounts.registerAdmin({ orgName:'Conflict',orgType:'shop',userName:'Conflict',phone:'+919876543210',passwordHash:'unused' }), /Identity already exists/);
      await database.query("DELETE FROM users WHERE name='Collision'");
    }
  });
  await t.test('proposal is not login authority; cooldown is database-backed and email uniqueness global', async () => {
    await service.proposeEmail(userId, email.toUpperCase());
    assert.equal((await identities.findByEmail(email)).length, 0);
    await assert.rejects(auth.login({ identifier: email, password }), /Invalid credentials/);
    await assert.rejects(service.resendEmail(userId), /Wait a minute/);
    await assert.rejects(service.proposeEmail(String(b.user.id), email), /cannot be used/);
    assert.equal((await service.emailState(userId)).pending, email.toUpperCase());
  });
  let oldVerification = capture.token('email_verification');
  await t.test('resend revokes older token, tokens are hash-only and purpose scoped', async () => {
    await cool(); await service.resendEmail(userId);
    await assert.rejects(service.verifyEmail(oldVerification));
    const raw = capture.token('email_verification');
    const rows = await database.query('SELECT secret_hash FROM identity_challenges WHERE secret_hash=$1', [hashActionSecret(raw)]);
    assert.equal(rows.rowCount, 1); assert.notEqual(rows.rows[0].secret_hash, raw);
    await assert.rejects(service.resetPassword(raw, password));
    oldVerification = raw;
  });
  await t.test('verification promotes only once and email login is trimmed/case-insensitive', async () => {
    await service.verifyEmail(oldVerification); await assert.rejects(service.verifyEmail(oldVerification));
    assert.equal((await auth.login({ identifier: ` ${email.toUpperCase()} `, password })).response.userId, userId);
    await assert.rejects(auth.login({ identifier: email, password:'wrong' }), /Invalid credentials/);
  });
  const replacement = `${randomUUID()}@example.invalid`;
  await t.test('old verified address survives pending changes; promotion atomically retires it', async () => {
    await cool(); await service.proposeEmail(userId, replacement);
    assert.equal((await identities.findByEmail(email)).length, 1);
    assert.equal((await identities.findByEmail(replacement)).length, 0);
    await service.verifyEmail(capture.token('email_verification'));
    assert.equal((await identities.findByEmail(email)).length, 0);
    assert.equal((await identities.findByEmail(replacement)).length, 1);
  });
  await t.test('forgot responses are identical for unknown, unverified and no-email accounts', async () => {
    const unknown = await service.forgotPassword('unknown@example.invalid');
    assert.deepEqual(await service.forgotPassword('+442079460018'), unknown);
    assert.deepEqual(await service.forgotPassword(email), unknown);
    assert.deepEqual(await service.forgotPassword(replacement), unknown);
    assert.equal(capture.messages.at(-1)?.to, replacement);
    assert.equal(JSON.stringify(unknown).includes(replacement), false);
  });
  const resetToken = capture.token('password_reset');
  const first = await sessionManager.create(userId), second = await sessionManager.create(userId);
  const newPassword = randomUUID();
  await t.test('concurrent reset has one winner, revokes every refresh session and disconnects sockets', async () => {
    const previousHash = await accounts.findPasswordHash(userId);
    const outcomes = await Promise.allSettled([service.resetPassword(resetToken, newPassword), service.resetPassword(resetToken, newPassword)]);
    assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
    await assert.rejects(sessionManager.rotate(first.refreshCredential)); await assert.rejects(sessionManager.rotate(second.refreshCredential));
    assert.equal(disconnected.includes(userId), true); await assert.rejects(service.resetPassword(resetToken, newPassword));
    await assert.rejects(auth.login({ identifier: replacement, password }), /Invalid credentials/);
    assert.equal((await auth.login({ identifier: replacement, password:newPassword })).response.userId, userId);
    await assert.rejects(sessionManager.create(userId, {}, previousHash!), /Invalid credentials/);
    assert.equal(await accounts.replacePasswordHashAndRevokeSessions(userId, 'must-not-write', previousHash!), false);
  });
  await t.test('phone recovery targets only verified email; expiry and revocation fail closed', async () => {
    await cool(); await service.forgotPassword('+919876543210');
    assert.equal(capture.messages.at(-1)?.to, replacement);
    const raw = capture.token('password_reset');
    await database.query("UPDATE identity_challenges SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE secret_hash=$1", [hashActionSecret(raw)]);
    await assert.rejects(service.resetPassword(raw,newPassword));
    await service.forgotPassword(replacement);
    const next = capture.token('password_reset');
    await database.query('UPDATE identity_challenges SET revoked_at=now() WHERE secret_hash=$1', [hashActionSecret(next)]);
    await assert.rejects(service.resetPassword(next,newPassword));
  });
  await t.test('delivery outage is private and disabled email yields the same unavailable result for every identifier', async () => {
    await cool(); capture.fail=true;
    assert.deepEqual(await service.forgotPassword(replacement), await service.forgotPassword('unknown')); await service.awaitPendingDeliveries();
    await assert.rejects(service.resetPassword(capture.token('password_reset'),newPassword));
    capture.fail=false; capture.enabled=false;
    for (const identifier of [replacement,'unknown']) await assert.rejects(service.forgotPassword(identifier), /currently unavailable/);
    capture.enabled=true;
  });
  await t.test('durable preferences hydrate across separate logins and reject invalid/FK values', async () => {
    for (const mode of ['light','dark','system'] as const) {
      await service.savePreferences(userId,{ mode,primaryColor:'#087443' });
      assert.deepEqual((await auth.login({identifier:replacement,password:newPassword})).response.preferences,{ mode,primaryColor:'#087443' });
    }
    await assert.rejects(service.savePreferences(userId, { mode:'dark',primaryColor:'#ffffff' }));
    await assert.rejects(service.savePreferences(randomUUID(), {mode:'light',primaryColor:'#4F46E5'}));
  });
  let manual: { id: string; handoffUrl?: string };
  await t.test('manual invitation creates no user/membership before acceptance; foreign branches reject atomically', async () => {
    await assert.rejects(service.createInvitation(context,{name:'Test staff',phone:'+919876543211',role:'staff',branchIds:[foreignBranch]}), /this organization/);
    manual=await service.createInvitation(context,{name:'Test staff',phone:'+919876543211',role:'staff',branchIds:[branchId]});
    assert.ok(manual.handoffUrl); assert.equal((await identities.findByPhone('+919876543211')).length,0);
    assert.equal((await service.listInvitations({...context,organizationId:String(b.user.tenantId)})).length,0);
    await assert.rejects(service.revokeInvitation({...context,organizationId:String(b.user.tenantId)},manual.id), /Access denied/);
  });
  await t.test('manual invitation accept is single-use, chooses own password and cannot grant operator', async () => {
    const raw = new URLSearchParams(new URL(manual.handoffUrl!).hash.slice(1)).get('token')!;
    await service.acceptInvitation(raw,password); await assert.rejects(service.acceptInvitation(raw,password));
    const staff = await auth.login({identifier:'+919876543211',password});
    assert.equal(staff.response.platformOperator,false); assert.equal(staff.response.role,'staff');
    assert.equal((await service.emailState(staff.response.userId)).verified,null);
  });
  await t.test('email invitation proves mailbox control, never returns a handoff secret, and no default password exists', async () => {
    const inviteEmail=`${randomUUID()}@example.invalid`;
    const issued=await service.createInvitation(context,{name:'Email staff',phone:'+919876543212',email:inviteEmail,role:'hr',branchIds:[branchId]});
    assert.equal(issued.delivery,'email'); assert.equal('handoffUrl' in issued,false);
    await service.acceptInvitation(capture.token('staff_invitation'),password);
    assert.equal((await auth.login({identifier:inviteEmail.toUpperCase(),password})).response.role,'hr');
    await assert.rejects(service.createInvitation(context,{name:'Existing',phone:'+919876543212',role:'staff',branchIds:[branchId]}), /Membership already exists/);
    await assert.rejects(service.createInvitation(context,{name:'Existing',phone:'+919876543219',email:inviteEmail,role:'staff',branchIds:[branchId]}), /Phone and email/);
  });
  await t.test('invitation replacement, revoke and expiry invalidate old links', async () => {
    const input={name:'Replacement staff',phone:'+919876543213',role:'staff' as const,branchIds:[branchId]};
    const initial=await service.createInvitation(context,input);
    const raw=(value: {handoffUrl?: string}) => new URLSearchParams(new URL(value.handoffUrl!).hash.slice(1)).get('token')!;
    await assert.rejects(service.createInvitation(context,input), /Wait a minute/);
    await database.query("UPDATE staff_invitations SET created_at=now()-interval '2 minutes' WHERE id=$1", [initial.id]);
    const replacement=await service.createInvitation(context,input); await assert.rejects(service.acceptInvitation(raw(initial),password));
    await service.revokeInvitation(context,replacement.id); await assert.rejects(service.acceptInvitation(raw(replacement),password));
    const expired=await service.createInvitation(context,{...input,phone:'+919876543214'});
    await database.query("UPDATE staff_invitations SET created_at=now()-interval '3 days',expires_at=now()-interval '1 day' WHERE id=$1", [expired.id]);
    await assert.rejects(service.acceptInvitation(raw(expired),password));
  });
  await t.test('normalized constraints and closed append-only audit cannot store secrets or grant owner/operator', async () => {
    const extraEmail=`${randomUUID()}@example.invalid`;
    await assert.rejects(database.query("INSERT INTO user_email_identities(user_id,display_email,normalized_email,state,verified_at) VALUES ($1,$2,$2,'verified',now())", [userId,extraEmail]));
    await assert.rejects(database.query("INSERT INTO user_preferences(user_id,theme_mode,accent) VALUES ($1,'invalid','#4F46E5')", [String(b.user.id)]));
    await assert.rejects(database.query("UPDATE account_security_events SET outcome='unavailable'"));
    await assert.rejects(database.query("INSERT INTO account_security_events(action) VALUES ('raw.secret')"));
    const history=await database.query('SELECT action,actor_user_id,invitation_id,outcome FROM account_security_events');
    assert.ok(history.rows.some((row) => row.action==='reset.completed')); assert.equal(JSON.stringify(history.rows).includes(email),false);
    assert.equal(JSON.stringify(history.rows).includes(resetToken),false);
  });
  await t.test('expired verification preserves the current verified login and unverified recovery stays generic', async () => {
    await cool(); const pending=`${randomUUID()}@example.invalid`;
    await service.proposeEmail(userId,pending); const raw=capture.token('email_verification');
    await database.query("UPDATE identity_challenges SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE secret_hash=$1", [hashActionSecret(raw)]);
    await assert.rejects(service.verifyEmail(raw));
    assert.equal((await identities.findByEmail(replacement)).length,1);
    assert.equal((await identities.findByEmail(pending)).length,0);
    const count=capture.messages.length;
    assert.deepEqual(await service.forgotPassword(pending),await service.forgotPassword('unknown@example.invalid'));
    assert.equal(capture.messages.length,count);
  });
  await t.test('concurrent invitation redemption creates exactly one non-operator membership', async () => {
    const issued=await service.createInvitation(context,{name:'Concurrent invite',phone:'+919876543217',role:'manager',branchIds:[branchId]});
    const raw=new URLSearchParams(new URL(issued.handoffUrl!).hash.slice(1)).get('token')!;
    const results=await Promise.allSettled([service.acceptInvitation(raw,password),service.acceptInvitation(raw,password)]);
    assert.equal(results.filter((result) => result.status==='fulfilled').length,1);
    const found=await identities.findByPhone('+919876543217'); assert.equal(found.length,1); assert.equal(found[0]?.platformOperator,false);
    assert.equal((await database.query('SELECT count(*) FROM memberships WHERE user_id=$1',[found[0]!.id])).rows[0].count,'1');
  });
  await t.test('real HTTP auth, tenant, permission, new route schemas and immediate access-token invalidation', async () => {
    const config=initializeRuntimeConfig({NODE_ENV:'test',DATABASE_URL:parsed.toString(),JWT_SECRET:randomUUID(),REFRESH_TOKEN_SECRET:randomUUID(),HTTP_ALLOWED_ORIGINS:'http://127.0.0.1:4175',SOCKET_ALLOWED_ORIGINS:'http://127.0.0.1:4175',TRUST_PROXY_HOPS:'0'});
    const app=createApp({config,identityAccountService:service}); const server=app.listen(0,'127.0.0.1'); await new Promise<void>((resolve) => server.once('listening',resolve));
    try {
      const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
      const login=await fetch(`${base}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:replacement,password:newPassword})});
      assert.equal(login.status,200); const session=await login.json() as {accessToken:string};
      const headers={Authorization:`Bearer ${session.accessToken}`,'Content-Type':'application/json'};
      assert.equal((await fetch(`${base}/auth/email`,{headers})).status,200);
      assert.equal((await fetch(`${base}/auth/email`,{headers:{...headers,'x-tenant-id':String(b.user.tenantId)}})).status,403);
      assert.equal((await fetch(`${base}/staff/invitations`,{method:'POST',headers,body:JSON.stringify({name:'Unsafe',phone:'+919876543218',role:'owner',branchIds:[branchId]})})).status,400);
      assert.equal((await fetch(`${base}/staff`,{method:'POST',headers,body:'{}'})).status,410);
      const staffLogin=await fetch(`${base}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:'+919876543211',password})});
      const staffSession=await staffLogin.json() as {accessToken:string};
      assert.equal((await fetch(`${base}/staff/invitations`,{headers:{Authorization:`Bearer ${staffSession.accessToken}`}})).status,403);
      await cool(); await service.forgotPassword(replacement); await service.resetPassword(capture.token('password_reset'),randomUUID());
      assert.equal((await fetch(`${base}/auth/email`,{headers})).status,401);
    } finally { await new Promise<void>((resolve,reject) => server.close((error) => error ? reject(error) : resolve())); }
  });
});
