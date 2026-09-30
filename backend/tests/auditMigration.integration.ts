import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  runAuditMigration,
  verifyAuditMigration,
} from '../src/domains/runtimeRetirement/migration.js';
import type {
  AuditLegacySource,
  LegacyActivityLogRecord,
} from '../src/domains/runtimeRetirement/migrationTypes.js';
import { PostgresDatabase } from '../src/postgres/database.js';
import { migrate } from '../src/postgres/migrations.js';

class MemoryAuditSource implements AuditLegacySource {
  public constructor(private readonly rows: LegacyActivityLogRecord[]) {}
  public async loadActivityLogs() { return this.rows.map((row) => ({ ...row })); }
}
const legacyId = (): string => randomBytes(12).toString('hex');

test('V2-06F ActivityLog migration selectively transforms safe events and hashes unsafe disposition', async (context) => {
  const adminUrl = process.env.POSTGRES_TEST_URL;
  assert.ok(adminUrl, 'POSTGRES_TEST_URL is required');
  const parsed = new URL(adminUrl);
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(parsed.hostname)
    || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(parsed.hostname));
  assert.equal(parsed.pathname, '/postgres');
  const databaseName = `ekavio_v206f_audit_migration_${randomUUID().replaceAll('-', '')}`;
  const admin = new PostgresDatabase(adminUrl);
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const url = new URL(adminUrl); url.pathname = `/${databaseName}`;
  const database = new PostgresDatabase(url.toString());
  context.after(async () => {
    await database.close();
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]);
    await admin.query(`DROP DATABASE "${databaseName}"`);
    await admin.close();
  });
  await migrate(database);
  const now = new Date('2026-09-30T02:00:00.000Z');
  const organizationLegacyId = legacyId();
  const actorLegacyId = legacyId();
  const organizationId = randomUUID();
  const actorId = randomUUID();
  await database.query(`
    INSERT INTO users (id, legacy_mongo_id, name, phone, created_at, updated_at)
    VALUES ($1, $2, 'Legacy Actor', '+910000000005', $3, $3)
  `, [actorId, actorLegacyId, now]);
  await database.query(`
    INSERT INTO organizations
      (id, legacy_mongo_id, name, type, theme_mode, theme_primary_color, created_at, updated_at)
    VALUES ($1, $2, 'Legacy Audit Org', 'clinic', 'light', '#4F46E5', $3, $3)
  `, [organizationId, organizationLegacyId, now]);
  const base = (overrides: Partial<LegacyActivityLogRecord> = {}): LegacyActivityLogRecord => ({
    id: legacyId(),
    legacyOrganizationId: organizationLegacyId,
    legacyActorUserId: actorLegacyId,
    action: 'membership.created',
    details: { membershipId: randomUUID(), role: 'staff' },
    ipAddress: '127.0.0.1',
    createdAt: now,
    ...overrides,
  });
  const safe = base();
  const unsafeMarker = 'RAW-AUDIT-PAYLOAD-MUST-NOT-COPY';
  const nested = base({ details: { nested: { marker: unsafeMarker } } });
  const unknown = base({ action: 'unreviewed.action' });
  const missingActor = base({ legacyActorUserId: legacyId() });
  const missingOrganization = base({ legacyOrganizationId: legacyId() });
  const source = new MemoryAuditSource([safe, nested, unknown, missingActor, missingOrganization]);

  const dryRun = await runAuditMigration({ source, database });
  assert.equal(dryRun.mode, 'dry-run');
  assert.equal(dryRun.safeCount, 1);
  assert.equal(dryRun.unsafeCount, 4);
  assert.equal(dryRun.blockerCount, 0);
  assert.deepEqual(dryRun.unsafeReasonCounts, {
    unsafe_details: 1,
    unknown_action: 1,
    missing_actor_mapping: 1,
    missing_organization_mapping: 1,
  });
  assert.equal((await database.query('SELECT id FROM audit_events')).rowCount, 0);
  const applied = await runAuditMigration({ source, database, apply: true });
  assert.equal(applied.migratedCount, 1);
  assert.equal(applied.dispositionCount, 4);
  await runAuditMigration({ source, database, apply: true });
  const verified = await verifyAuditMigration({ source, database });
  assert.equal(verified.clean, true);
  assert.equal(verified.targetSafeCount, 1);
  assert.equal(verified.targetDispositionCount, 4);
  assert.equal(verified.targetDuplicateCount, 0);
  assert.deepEqual(verified.mismatches, []);
  const event = await database.query<{
    organization_id: string; actor_user_id: string; action: string;
    legacy_mongo_id: string; occurred_at: Date; created_at: Date;
  }>('SELECT organization_id, actor_user_id, action, legacy_mongo_id, occurred_at, created_at FROM audit_events');
  assert.equal(event.rows[0]?.organization_id, organizationId);
  assert.equal(event.rows[0]?.actor_user_id, actorId);
  assert.equal(event.rows[0]?.action, 'membership.created');
  assert.equal(event.rows[0]?.legacy_mongo_id, safe.id);
  assert.equal(event.rows[0]?.occurred_at.toISOString(), now.toISOString());
  assert.equal(event.rows[0]?.created_at.toISOString(), now.toISOString());
  const dispositionRows = await database.query(
    'SELECT source_ref_hash, source_fingerprint, reason_code FROM legacy_audit_migration_dispositions',
  );
  const serialized = JSON.stringify(dispositionRows.rows);
  assert.equal(serialized.includes(unsafeMarker), false);
  assert.ok(dispositionRows.rows.every((row) =>
    typeof row.source_ref_hash === 'string' && row.source_ref_hash.length === 64
      && typeof row.source_fingerprint === 'string' && row.source_fingerprint.length === 64));
});
