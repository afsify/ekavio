import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import mongoose from 'mongoose';
import {
  OperationalMigrationBlockedError,
  runOperationalCutoverPreflight,
  runOperationalMigration,
  verifyOperationalMigration,
} from '../src/domains/queue/migration.js';
import { MongoOperationalLegacySource } from '../src/domains/queue/mongoMigrationSource.js';
import type {
  OperationalLegacySource,
  OperationalLegacySnapshot,
  OperationalMigrationMapping,
} from '../src/domains/queue/migrationTypes.js';
import { Ledger } from '../src/models/Ledger.js';
import { Queue } from '../src/models/Queue.js';
import { PostgresDatabase } from '../src/postgres/database.js';
import { migrate } from '../src/postgres/migrations.js';

class MemorySource implements OperationalLegacySource {
  public constructor(private readonly snapshot: OperationalLegacySnapshot) {}
  public async load(): Promise<OperationalLegacySnapshot> { return this.snapshot; }
}

const legacyOrganizationId = '100000000000000000000001';
const queueIdA = '200000000000000000000001';
const queueIdB = '200000000000000000000002';
const ledgerId = '300000000000000000000001';
const organizationId = '10000000-0000-4000-8000-000000000001';
const branchId = '20000000-0000-4000-8000-000000000001';

const reviewedMapping = (): OperationalMigrationMapping => ({
  version: 1,
  organizations: [{
    legacyOrganizationId,
    organizationId,
    branchId,
    timezone: 'Asia/Kolkata',
    defaultCallingCode: '+91',
    defaultServiceDurationMinutes: 30,
    customerGroups: {},
    serviceResolutions: { 'Hair Cut': 'Hair Cut', 'hair   cut': 'Hair Cut' },
    sessionPolicy: { mode: 'created-at-local-date', laneKey: 'default', status: 'closed' },
    queueSessionOverrides: {
      [queueIdB]: { localBusinessDate: '2026-09-17', laneKey: 'overflow', status: 'closed' },
    },
  }],
});

test('operational Mongo-to-PostgreSQL migration is dry-run-first, idempotent, and reconcilable', async (context) => {
  const postgresAdminUrl = process.env.POSTGRES_TEST_URL;
  const mongoAdminUrl = process.env.MONGO_TEST_URL;
  assert.ok(postgresAdminUrl, 'POSTGRES_TEST_URL is required');
  assert.ok(mongoAdminUrl, 'MONGO_TEST_URL is required');
  const parsedPostgres = new URL(postgresAdminUrl);
  const parsedMongo = new URL(mongoAdminUrl);
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(parsedPostgres.hostname));
  assert.ok(['localhost', '127.0.0.1', 'mongo'].includes(parsedMongo.hostname));

  const suffix = randomUUID().replaceAll('-', '');
  const databaseName = `ekavio_v206b1_migration_${suffix}`;
  const mongoDatabaseName = `ekavio_v206b1_migration_${suffix}`;
  const admin = new PostgresDatabase(postgresAdminUrl);
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const databaseUrl = new URL(postgresAdminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const database = new PostgresDatabase(databaseUrl.toString());
  const mongoUrl = new URL(mongoAdminUrl);
  mongoUrl.pathname = `/${mongoDatabaseName}`;
  await mongoose.connect(mongoUrl.toString(), { serverSelectionTimeoutMS: 10_000 });
  context.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await database.close();
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]);
    await admin.query(`DROP DATABASE "${databaseName}"`);
    await admin.close();
  });

  await migrate(database);
  const atA = new Date('2026-09-17T04:30:00.000Z');
  const atB = new Date('2026-09-17T05:30:00.000Z');
  await database.query(`
    INSERT INTO organizations (
      id, legacy_mongo_id, name, type, theme_mode, theme_primary_color, created_at, updated_at
    ) VALUES ($1, $2, 'Alpha', 'salon', 'light', '#111111', $3, $3)
  `, [organizationId, legacyOrganizationId, atA]);
  await database.query(`
    INSERT INTO branches (
      id, organization_id, name, code, status, created_at, updated_at
    ) VALUES ($1, $2, 'Alpha Main', 'main', 'active', $3, $3)
  `, [branchId, organizationId, atA]);
  await Queue.create([
    {
      _id: new mongoose.Types.ObjectId(queueIdA), tenantId: new mongoose.Types.ObjectId(legacyOrganizationId),
      tokenNumber: '#1', customerName: 'Alice', phone: '9876543210', serviceType: 'Hair Cut',
      status: 'waiting', createdAt: atA, updatedAt: atA,
    },
    {
      _id: new mongoose.Types.ObjectId(queueIdB), tenantId: new mongoose.Types.ObjectId(legacyOrganizationId),
      tokenNumber: '#1', customerName: 'Alice', phone: '9876543210', serviceType: 'hair   cut',
      status: 'completed', createdAt: atB, updatedAt: atB,
    },
  ]);
  await Ledger.create({
    _id: new mongoose.Types.ObjectId(ledgerId), tenantId: new mongoose.Types.ObjectId(legacyOrganizationId),
    customerName: 'Alice', phone: '9876543210', amount: 100, type: 'credit',
    createdAt: atA, updatedAt: atA,
  });
  const source = new MongoOperationalLegacySource();
  const mapping = reviewedMapping();

  const dryRun = await runOperationalMigration({ source, mapping });
  assert.equal(dryRun.mode, 'dry-run');
  assert.equal(dryRun.applied, false);
  assert.equal(dryRun.issues.length, 0);
  assert.equal(dryRun.acceptedQueueRows, 2);
  assert.equal(dryRun.rejectedQueueRows, 0);
  assert.equal(dryRun.quarantinedQueueRows, 0);
  const beforeApply = await database.query<{ count: string }>(`
    SELECT (
      (SELECT COUNT(*) FROM customers)
      + (SELECT COUNT(*) FROM services)
      + (SELECT COUNT(*) FROM queue_tokens)
    )::text AS count
  `);
  assert.equal(beforeApply.rows[0]!.count, '0', 'dry-run must make zero target writes');
  const timezoneBefore = await database.query<{ timezone: string | null }>(
    'SELECT timezone FROM branches WHERE id = $1', [branchId],
  );
  assert.equal(timezoneBefore.rows[0]!.timezone, null);

  const apply = await runOperationalMigration({ source, mapping, database, apply: true });
  assert.equal(apply.applied, true);
  await runOperationalMigration({ source, mapping, database, apply: true });
  const counts = await database.query<{ customers: string; services: string; tokens: string; events: string }>(`
    SELECT
      (SELECT COUNT(*)::text FROM customers) AS customers,
      (SELECT COUNT(*)::text FROM services) AS services,
      (SELECT COUNT(*)::text FROM queue_tokens) AS tokens,
      (SELECT COUNT(*)::text FROM queue_status_events) AS events
  `);
  assert.deepEqual(counts.rows[0], { customers: '1', services: '1', tokens: '2', events: '2' });
  const migrated = await database.query<{
    legacy_mongo_id: string; status: string; token_number: string; created_at: Date;
  }>(`
    SELECT legacy_mongo_id, status, token_number::text, created_at
    FROM queue_tokens ORDER BY legacy_mongo_id
  `);
  assert.deepEqual(migrated.rows.map(({ legacy_mongo_id, status, token_number }) => ({
    legacy_mongo_id, status, token_number,
  })), [
    { legacy_mongo_id: queueIdA, status: 'waiting', token_number: '1' },
    { legacy_mongo_id: queueIdB, status: 'completed', token_number: '1' },
  ]);
  assert.equal(migrated.rows[0]!.created_at.getTime(), atA.getTime());

  const verification = await verifyOperationalMigration({ source, mapping, database });
  assert.equal(verification.clean, true, verification.mismatches.join('\n'));
  assert.deepEqual(verification.sourceDisposition, { accepted: 2, rejected: 0, quarantined: 0 });
  const preflight = await runOperationalCutoverPreflight({
    source, mapping, database, operationalAuthority: 'mongodb',
  });
  assert.equal(preflight.ready, true, preflight.failures.join('\n'));
  assert.equal(preflight.checks.mongoStillRuntimeAuthority, true);

  await database.query("UPDATE queue_tokens SET status = 'cancelled' WHERE legacy_mongo_id = $1", [queueIdA]);
  await database.query(`
    UPDATE customer_source_links SET source_fingerprint = $1
    WHERE source_kind = 'queue' AND legacy_document_id = $2
  `, ['0'.repeat(64), queueIdA]);
  await database.query(`
    UPDATE service_source_links SET source_label = 'tampered'
    WHERE legacy_queue_document_id = $1
  `, [queueIdA]);
  await database.query(`
    UPDATE queue_sessions SET status = 'open', closed_at = NULL
    WHERE lane_key = 'default'
  `);
  const mismatch = await verifyOperationalMigration({ source, mapping, database });
  assert.equal(mismatch.clean, false);
  assert.ok(mismatch.mismatches.some((value) => value.includes(queueIdA)));
  assert.ok(mismatch.mismatches.some((value) => value.startsWith('Customer source mapping mismatch')));
  assert.ok(mismatch.mismatches.some((value) => value.startsWith('Service source mapping mismatch')));
  assert.ok(mismatch.mismatches.some((value) => value.startsWith('Queue session mismatch')));

  const loaded = await source.load();
  const missingMapping = await runOperationalMigration({
    source: new MemorySource(loaded), mapping: { version: 1, organizations: [] },
  });
  assert.ok(missingMapping.issues.some(({ code }) => code === 'unmapped_organization'));
  assert.equal(missingMapping.rejectedQueueRows, 2);
  await assert.rejects(
    runOperationalMigration({
      source: new MemorySource(loaded), mapping: { version: 1, organizations: [] }, database, apply: true,
    }),
    OperationalMigrationBlockedError,
  );

  const ambiguous: OperationalLegacySnapshot = {
    ...loaded,
    queue: [
      loaded.queue[0]!,
      { ...loaded.queue[1]!, customerName: 'A different person' },
    ],
    ledgerCustomers: [],
  };
  const unresolvedMapping = reviewedMapping();
  unresolvedMapping.organizations[0]!.serviceResolutions = {};
  unresolvedMapping.organizations[0]!.queueSessionOverrides = {};
  const blocked = await runOperationalMigration({
    source: new MemorySource(ambiguous), mapping: unresolvedMapping,
  });
  assert.ok(blocked.issues.some(({ code }) => code === 'ambiguous_customer'));
  assert.ok(blocked.issues.some(({ code }) => code === 'service_collision'));
  assert.ok(blocked.issues.some(({ code }) => code === 'duplicate_session_token'));

  const invalidTimezoneMapping = reviewedMapping();
  invalidTimezoneMapping.organizations[0]!.timezone = 'Not/A_Timezone';
  const invalidTimezone = await runOperationalMigration({
    source: new MemorySource(loaded), mapping: invalidTimezoneMapping,
  });
  assert.ok(invalidTimezone.issues.some(({ code }) => code === 'invalid_timezone'));
});
