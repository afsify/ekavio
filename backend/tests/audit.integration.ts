import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PostgresAuditRepository, type SecurityAuditRepository } from '../src/postgres/auditRepository.js';
import { PostgresDatabase } from '../src/postgres/database.js';
import { migrate } from '../src/postgres/migrations.js';
import { createSecurityAuditRecorder } from '../src/services/securityAuditService.js';
import type { AuthorizationContext } from '../src/services/requestContextService.js';

test('V2-06F security audit writes safe canonical append-only PostgreSQL events', async (context) => {
  const adminUrl = process.env.POSTGRES_TEST_URL;
  assert.ok(adminUrl, 'POSTGRES_TEST_URL is required');
  const parsed = new URL(adminUrl);
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(parsed.hostname)
    || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(parsed.hostname));
  assert.equal(parsed.pathname, '/postgres');
  const databaseName = `ekavio_v206f_audit_${randomUUID().replaceAll('-', '')}`;
  const admin = new PostgresDatabase(adminUrl);
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  const database = new PostgresDatabase(url.toString());
  context.after(async () => {
    await database.close();
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]);
    await admin.query(`DROP DATABASE "${databaseName}"`);
    await admin.close();
  });
  await migrate(database);
  const userId = randomUUID();
  const organizationId = randomUUID();
  const now = new Date('2026-09-30T00:00:00.000Z');
  await database.query(`
    INSERT INTO users (id, name, phone, created_at, updated_at)
    VALUES ($1, 'Auditor', '+910000000003', $2, $2)
  `, [userId, now]);
  await database.query(`
    INSERT INTO organizations
      (id, name, type, theme_mode, theme_primary_color, created_at, updated_at)
    VALUES ($1, 'Audit Org', 'clinic', 'light', '#4F46E5', $2, $2)
  `, [organizationId, now]);
  const auditContext: AuthorizationContext = {
    userId,
    organizationId,
    membershipId: randomUUID(),
    branchId: randomUUID(),
    sessionId: randomUUID(),
    role: 'owner',
    permissions: [],
    platformOperator: false,
  };
  let signals = 0;
  const recorder = createSecurityAuditRecorder({
    repository: new PostgresAuditRepository(database),
    signal: () => { signals += 1; },
  });
  await recorder(
    auditContext,
    'customer.created',
    { customerId: randomUUID(), version: 1, active: true, note: null },
    ` ${'a'.repeat(200)} `,
  );
  const events = await database.query<{
    organization_id: string; actor_user_id: string; action: string;
    details: Record<string, unknown>; ip_address: string;
  }>('SELECT organization_id, actor_user_id, action, details, ip_address FROM audit_events');
  assert.equal(events.rowCount, 1);
  assert.equal(events.rows[0]?.organization_id, organizationId);
  assert.equal(events.rows[0]?.actor_user_id, userId);
  assert.equal(events.rows[0]?.action, 'customer.created');
  assert.equal(events.rows[0]?.ip_address.length, 128);
  assert.equal(events.rows[0]?.details.version, 1);
  assert.equal(signals, 0);

  await recorder(auditContext, 'customer.created', {
    password: 'must-not-persist',
  } as never);
  await recorder(auditContext, 'customer.created', {
    nested: { authorization: 'must-not-persist' },
  } as never);
  assert.equal(signals, 2);
  assert.equal((await database.query('SELECT id FROM audit_events')).rowCount, 1);

  const failingRepository: SecurityAuditRepository = {
    create: async () => { throw new Error('database detail must not escape'); },
  };
  const safeFailureRecorder = createSecurityAuditRecorder({
    repository: failingRepository,
    signal: () => { signals += 1; },
  });
  await assert.doesNotReject(safeFailureRecorder(
    auditContext, 'customer.updated', { customerId: randomUUID() }, '127.0.0.1',
  ));
  assert.equal(signals, 3);

  await assert.rejects(database.query("UPDATE audit_events SET action = 'customer.updated'"), /append-only/);
  await assert.rejects(database.query('DELETE FROM audit_events'), /append-only/);
  const serialized = JSON.stringify((await database.query('SELECT details FROM audit_events')).rows);
  for (const forbidden of ['must-not-persist', 'authorization', 'password']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});
