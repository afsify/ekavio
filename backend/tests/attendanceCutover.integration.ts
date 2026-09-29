import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { activateAttendanceAuthority, isAttendanceAuthorityActivated } from '../src/domains/attendance/authority.js';
import {
  runAttendanceCutoverPreflight,
  runAttendanceMigration,
  verifyAttendanceMigration,
} from '../src/domains/attendance/migration.js';
import type { AttendanceLegacySource } from '../src/domains/attendance/migrationTypes.js';
import { PostgresCommercialRepository } from '../src/postgres/commercialRepository.js';
import { PostgresDatabase } from '../src/postgres/database.js';
import { migrate } from '../src/postgres/migrations.js';

const emptySource: AttendanceLegacySource = { load: async () => [] };
const blockedSource: AttendanceLegacySource = {
  load: async () => [{
    id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    legacyOrganizationId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
    legacyUserId: 'cccccccccccccccccccccccc',
    date: new Date('2026-09-28T00:00:00.000Z'),
    status: 'present',
    createdAt: new Date('2026-09-28T01:00:00.000Z'),
    updatedAt: new Date('2026-09-28T01:00:00.000Z'),
  }],
};
const emptyMapping = { version: 1 as const, organizations: [] };

test('V2-06C Attendance preflight, explicit authority activation, and source boundary', async (context) => {
  const adminUrl = process.env.POSTGRES_TEST_URL;
  assert.ok(adminUrl, 'POSTGRES_TEST_URL is required');
  const parsed = new URL(adminUrl);
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(parsed.hostname));
  assert.equal(parsed.pathname, '/postgres');

  const databaseName = `ekavio_v206c_cutover_${randomUUID().replaceAll('-', '')}`;
  const admin = new PostgresDatabase(adminUrl);
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const database = new PostgresDatabase(databaseUrl.toString());
  context.after(async () => {
    await database.close();
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]);
    await admin.query(`DROP DATABASE "${databaseName}"`);
    await admin.close();
  });
  await migrate(database);
  await new PostgresCommercialRepository(database).reconcileCatalogue();

  await context.test('verification is clean for an empty legacy source', async () => {
    const verification = await verifyAttendanceMigration({
      source: emptySource, mapping: emptyMapping, database,
    });
    assert.equal(verification.clean, true);
    assert.equal(verification.sourceCount, 0);
    assert.equal(verification.targetImportCount, 0);
  });

  await context.test('preflight fails closed until explicit activation is permitted', async () => {
    const blocked = await runAttendanceCutoverPreflight({
      source: emptySource,
      mapping: emptyMapping,
      database,
      attendanceAuthority: 'postgresql',
    });
    assert.equal(blocked.ready, false);
    assert.deepEqual(blocked.failures, ['authorityLatchMatches']);

    const activationReady = await runAttendanceCutoverPreflight({
      source: emptySource,
      mapping: emptyMapping,
      database,
      attendanceAuthority: 'postgresql',
      allowPendingActivation: true,
    });
    assert.equal(activationReady.ready, true);
    assert.equal(await isAttendanceAuthorityActivated(database), false);
  });

  await context.test('an unresolved legacy mapping blocker prevents cutover readiness', async () => {
    const blocked = await runAttendanceCutoverPreflight({
      source: blockedSource,
      mapping: emptyMapping,
      database,
      attendanceAuthority: 'postgresql',
      allowPendingActivation: true,
    });
    assert.equal(blocked.ready, false);
    assert.equal(blocked.verification.blockerCount, 1);
    assert.ok(blocked.verification.mismatches.some((value) => value.startsWith('unmapped_organization:')));
    assert.ok(blocked.failures.includes('sourceReconciliationClean'));
    assert.ok(blocked.failures.includes('zeroUnresolvedBlockers'));
    assert.equal(await isAttendanceAuthorityActivated(database), false);
  });

  await context.test('explicit activation is durable and blocks normal migration apply', async () => {
    await activateAttendanceAuthority(database);
    assert.equal(await isAttendanceAuthorityActivated(database), true);
    const ready = await runAttendanceCutoverPreflight({
      source: emptySource,
      mapping: emptyMapping,
      database,
      attendanceAuthority: 'postgresql',
    });
    assert.equal(ready.ready, true);
    const latch = await database.query<{ authority: string; activated_by: string }>(`
      SELECT authority, activated_by FROM operational_runtime_authority WHERE vertical = 'attendance'
    `);
    assert.deepEqual(latch.rows[0], { authority: 'postgresql', activated_by: 'v2-06c-cutover' });
    await assert.rejects(
      runAttendanceMigration({
        source: emptySource, mapping: emptyMapping, database, apply: true,
      }),
      /refused after PostgreSQL runtime authority activation/,
    );
  });

  await context.test('ordinary runtime has no Mongo Attendance read, write, fallback, or dual-write', async () => {
    const [composition, controller, service, repository, analytics] = await Promise.all([
      readFile(new URL('../src/persistence/runtimePersistence.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/controllers/attendanceController.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/services/attendanceService.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/domains/attendance/repository.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/controllers/analyticsController.ts', import.meta.url), 'utf8'),
    ]);
    assert.match(composition, /attendanceAuthority: 'postgresql'/);
    assert.match(composition, /PostgresAttendanceRepository/);
    for (const forbidden of [
      'mongooseAttendanceStorageRepository',
      'PostgresAttendanceIdentityResolver',
      'attendanceStorage',
      'attendanceIdentities',
    ]) assert.equal(composition.includes(forbidden), false, forbidden);
    for (const source of [controller, service, repository]) {
      for (const forbidden of [
        "models/Attendance",
        'mongooseAttendanceStorageRepository',
        'legacyMongoOrganizationId',
        'legacyMongoUserId',
        'operationalIdentity',
      ]) assert.equal(source.includes(forbidden), false, forbidden);
    }
    assert.equal(analytics.includes("models/Attendance"), false);
    assert.equal(analytics.includes('Attendance.countDocuments'), false);
  });
});
