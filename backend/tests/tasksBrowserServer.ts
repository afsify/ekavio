// Test-only loopback server. Real application middleware; unique synthetic DB.
// Never imported by runtime source or compiled into the production build.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import { PostgresDatabase } from '../src/postgres/database.js';
import { migrate } from '../src/postgres/migrations.js';
import { PostgresAccountRepository } from '../src/postgres/accountRepository.js';
import { PostgresCommercialRepository } from '../src/postgres/commercialRepository.js';
import { initializeRuntimeConfig } from '../src/config/env.js';
import { runtimePostgresDatabase } from '../src/persistence/runtimePersistence.js';
import { IdentityAccountService } from '../src/services/identityAccountService.js';
import { createApp } from '../src/app.js';
import { EmailCapture } from './helpers/emailCapture.js';
import { setupSocket, closeSocket } from '../src/config/socket.js';

const url = new URL(process.env.POSTGRES_TEST_URL ?? '');
if (!['127.0.0.1', 'localhost', 'postgres'].includes(url.hostname) || url.pathname !== '/postgres') throw new Error('Explicit disposable local PostgreSQL maintenance URL required');
const admin = new PostgresDatabase(url.href), name = `ekavio_v212c_browser_${randomUUID().replaceAll('-', '')}`;
await admin.query(`CREATE DATABASE "${name}"`); url.pathname = `/${name}`;
const database = new PostgresDatabase(url.href); await migrate(database);
const config = initializeRuntimeConfig({ NODE_ENV: 'test', DATABASE_URL: url.href, JWT_SECRET: randomUUID(), REFRESH_TOKEN_SECRET: randomUUID(), HTTP_ALLOWED_ORIGINS: 'http://127.0.0.1:4177', SOCKET_ALLOWED_ORIGINS: 'http://127.0.0.1:4177', TRUST_PROXY_HOPS: '0' });
const identity = new IdentityAccountService(database, new EmailCapture());
let application = createApp({ config, identityAccountService: identity });
const freshApplication = () => new Promise<ReturnType<typeof createApp>>(resolve => setImmediate(() => resolve(createApp({ config, identityAccountService: identity }))));
const root = express(); root.use(express.json());
root.get('/__test/health', (_request, response) => response.json({ ready: true }));
root.post('/__test/client-phase', async (_request, response) => { application = await freshApplication(); response.json({ ready: true }); });
const fixtureOrganizations = new Set<string>();
root.post('/__test/fixture', async (request, response, next) => {
  try {
    const phone = `+919${Math.floor(100000000 + Math.random() * 899999999)}`, password = randomUUID();
    const created = await new PostgresAccountRepository(database).registerAdmin({ orgName: 'Disposable Tasks QA workspace', orgType: 'shop', userName: 'QA task owner', phone, passwordHash: await bcrypt.hash(password, 4) });
    const organizationId = String(created.user.tenantId), userId = String(created.user.id), branchId = String((created.branch as { id: string }).id);
    fixtureOrganizations.add(organizationId);
    await database.query("UPDATE branches SET timezone='Asia/Kolkata' WHERE organization_id=$1", [organizationId]);
    const membershipId = String((await database.query('SELECT id FROM memberships WHERE user_id=$1 AND organization_id=$2', [userId, organizationId])).rows[0]!.id);
    const people: Record<string, object> = {};
    for (const [key, role] of [['staff', 'staff'], ['manager', 'manager'], ['reader', 'staff']] as const) {
      const memberPhone = `+919${Math.floor(100000000 + Math.random() * 899999999)}`, memberPassword = randomUUID();
      const memberUser = String((await database.query('INSERT INTO users(name,phone,password_hash,created_at,updated_at) VALUES($1,$2,$3,now(),now()) RETURNING id', [`QA task ${key}`, memberPhone, await bcrypt.hash(memberPassword, 4)])).rows[0]!.id);
      const memberId = String((await database.query('INSERT INTO memberships(user_id,organization_id,role,status,created_at,updated_at) VALUES($1,$2,$3,\'active\',now(),now()) RETURNING id', [memberUser, organizationId, role])).rows[0]!.id);
      await database.query('INSERT INTO membership_branch_assignments(membership_id,organization_id,branch_id) VALUES($1,$2,$3)', [memberId, organizationId, branchId]);
      if (key === 'reader') {
        const custom = (await database.query("INSERT INTO organization_roles(organization_id,name) VALUES($1,'QA Task read only') RETURNING id", [organizationId])).rows[0]!.id;
        await database.query("INSERT INTO organization_role_permissions(role_id,permission) VALUES($1,'tasks.read')", [custom]);
        await database.query('UPDATE memberships SET custom_role_id=$1 WHERE id=$2', [custom, memberId]);
      }
      people[key] = { phone: memberPhone, password: memberPassword, membershipId: memberId, userId: memberUser, organizationId, branchId };
    }
    const otherBranch = String((await database.query("INSERT INTO branches(organization_id,name,code,timezone,status,created_at,updated_at) VALUES($1,'QA Other','qa-other','Asia/Kolkata','active',now(),now()) RETURNING id", [organizationId])).rows[0]!.id);
    await database.query('INSERT INTO membership_branch_assignments(membership_id,organization_id,branch_id) VALUES($1,$2,$3)', [membershipId, organizationId, otherBranch]);
    if (request.body?.entitled !== false) {
      const commercial = new PostgresCommercialRepository(database); await commercial.reconcileCatalogue();
      await commercial.upsertEntitlement(organizationId, userId, 'tasks', { effect: 'grant', status: 'active', source: 'pilot', reason: 'Disposable local Tasks UI QA only' });
    }
    application = await freshApplication();
    response.setHeader('Cache-Control', 'no-store'); response.json({ phone, password, organizationId, branchId, membershipId, userId, otherBranch, people });
  } catch (error) { next(error); }
});
// Bounded synthetic revocation/deactivation only, never available in runtime.
root.post('/__test/revoke', async (request, response, next) => {
  try {
    const { organizationId, membershipId, kind } = request.body as { organizationId: string; membershipId: string; kind: string };
    if (!fixtureOrganizations.has(organizationId) || !['membership', 'branch'].includes(kind)) throw new Error('Owned fixture required');
    if (kind === 'membership') await database.query("UPDATE memberships SET status='inactive' WHERE organization_id=$1 AND id=$2", [organizationId, membershipId]);
    else await database.query('DELETE FROM membership_branch_assignments WHERE organization_id=$1 AND membership_id=$2', [organizationId, membershipId]);
    response.json({ ready: true });
  } catch (error) { next(error); }
});
root.use((request, response, next) => application(request, response, next));
const server = createServer(root); setupSocket(server, config);
server.listen(5013, '127.0.0.1', () => console.log('Disposable Tasks browser QA ready'));
let stopping = false;
async function shutdown() {
  if (stopping) return; stopping = true;
  await identity.awaitPendingDeliveries(); await closeSocket(); server.closeAllConnections();
  await runtimePostgresDatabase.close(); await database.close();
  await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [name]);
  await admin.query(`DROP DATABASE "${name}"`); await admin.close();
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void shutdown().then(() => process.exit(0)); });
