import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  AttendanceMigrationBlockedError,
  runAttendanceMigration,
  verifyAttendanceMigration,
} from '../src/domains/attendance/migration.js';
import type {
  AttendanceLegacySource,
  AttendanceMigrationMapping,
  LegacyAttendanceSourceRecord,
} from '../src/domains/attendance/migrationTypes.js';
import { PostgresDatabase } from '../src/postgres/database.js';
import { getMigrationStatus, migrate } from '../src/postgres/migrations.js';

class MemoryAttendanceSource implements AttendanceLegacySource {
  public constructor(private readonly rows: LegacyAttendanceSourceRecord[]) {}
  public async load(): Promise<LegacyAttendanceSourceRecord[]> {
    return this.rows.map((row) => ({ ...row }));
  }
}

const legacyId = (): string => randomBytes(12).toString('hex');

test('V2-06C Attendance migration transforms, reconciles, and blocks ambiguity safely', async (context) => {
  const adminUrl = process.env.POSTGRES_TEST_URL;
  assert.ok(adminUrl, 'POSTGRES_TEST_URL is required');
  const parsed = new URL(adminUrl);
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(parsed.hostname));
  assert.equal(parsed.pathname, '/postgres');

  const cleanName = `ekavio_v206c_migration_${randomUUID().replaceAll('-', '')}`;
  const upgradeName = `ekavio_v206c_upgrade_${randomUUID().replaceAll('-', '')}`;
  const admin = new PostgresDatabase(adminUrl);
  await admin.query(`CREATE DATABASE "${cleanName}"`);
  await admin.query(`CREATE DATABASE "${upgradeName}"`);
  const cleanUrl = new URL(adminUrl);
  cleanUrl.pathname = `/${cleanName}`;
  const upgradeUrl = new URL(adminUrl);
  upgradeUrl.pathname = `/${upgradeName}`;
  const database = new PostgresDatabase(cleanUrl.toString());
  const upgrade = new PostgresDatabase(upgradeUrl.toString());
  const temporaryMigrations = await mkdtemp(path.join(tmpdir(), 'ekavio-v206c-migrations-'));
  context.after(async () => {
    await database.close();
    await upgrade.close();
    for (const name of [cleanName, upgradeName]) {
      await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [name]);
      await admin.query(`DROP DATABASE "${name}"`);
    }
    await admin.close();
    await rm(temporaryMigrations, { recursive: true, force: true });
  });

  await migrate(database);
  assert.equal((await getMigrationStatus(database)).length, 16);
  const migrationDirectory = path.resolve(process.cwd(), 'postgres', 'migrations');
  const accepted = (await readdir(migrationDirectory)).filter((name) => /^00[1-8]_.*\.sql$/.test(name));
  for (const name of accepted) {
    await copyFile(path.join(migrationDirectory, name), path.join(temporaryMigrations, name));
  }
  await migrate(upgrade, temporaryMigrations);
  assert.equal((await getMigrationStatus(upgrade, temporaryMigrations)).length, 8);
  await migrate(upgrade);
  assert.equal((await getMigrationStatus(upgrade)).length, 16);

  const now = new Date('2026-09-28T00:00:00.000Z');
  const organizationId = randomUUID();
  const legacyOrganizationId = legacyId();
  const branchId = randomUUID();
  const secondBranchId = randomUUID();
  await database.query(`
    INSERT INTO organizations
      (id, legacy_mongo_id, name, type, theme_mode, theme_primary_color, created_at, updated_at)
    VALUES ($1, $2, 'Attendance Migration Org', 'clinic', 'light', '#4F46E5', $3, $3)
  `, [organizationId, legacyOrganizationId, now]);
  await database.query(`
    INSERT INTO branches
      (id, organization_id, name, code, status, timezone, created_at, updated_at)
    VALUES
      ($1, $3, 'Main', 'main', 'active', 'Asia/Kolkata', $4, $4),
      ($2, $3, 'Second', 'second', 'active', 'UTC', $4, $4)
  `, [branchId, secondBranchId, organizationId, now]);

  const createMappedMembership = async (branches: string[]) => {
    const userId = randomUUID();
    const membershipId = randomUUID();
    const legacyUserId = legacyId();
    await database.query(`
      INSERT INTO users
        (id, legacy_mongo_id, name, phone, password_hash, created_at, updated_at)
      VALUES ($1, $2, 'Migrated Attendance User', '+919000009999', NULL, $3, $3)
    `, [userId, legacyUserId, now]);
    await database.query(`
      INSERT INTO memberships
        (id, user_id, organization_id, role, status, created_at, updated_at)
      VALUES ($1, $2, $3, 'staff', 'active', $4, $4)
    `, [membershipId, userId, organizationId, now]);
    for (const targetBranchId of branches) {
      await database.query(`
        INSERT INTO membership_branch_assignments (membership_id, branch_id, organization_id)
        VALUES ($1, $2, $3)
      `, [membershipId, targetBranchId, organizationId]);
    }
    return { legacyUserId, membershipId };
  };
  const oneBranch = await createMappedMembership([branchId]);
  const manyBranches = await createMappedMembership([branchId, secondBranchId]);
  const mapping = (branchResolutions: Record<string, string> = {}): AttendanceMigrationMapping => ({
    version: 1,
    organizations: [{
      legacyOrganizationId,
      organizationId,
      branchResolutions,
    }],
  });
  const sourceRecord = (overrides: Partial<LegacyAttendanceSourceRecord> = {}): LegacyAttendanceSourceRecord => ({
    id: legacyId(),
    legacyOrganizationId,
    legacyUserId: oneBranch.legacyUserId,
    date: new Date('2026-09-15T00:00:00.000Z'),
    status: 'half-day',
    createdAt: new Date('2026-09-15T10:00:00.000Z'),
    updatedAt: new Date('2026-09-15T10:00:00.000Z'),
    ...overrides,
  });

  await context.test('clean no-source migration is a non-mutating clean dry-run', async () => {
    const report = await runAttendanceMigration({
      source: new MemoryAttendanceSource([]), mapping: { version: 1, organizations: [] }, database,
    });
    assert.equal(report.mode, 'dry-run');
    assert.equal(report.sourceCount, 0);
    assert.equal(report.blockerCount, 0);
    assert.equal((await database.query('SELECT 1 FROM attendance_records')).rowCount, 0);
  });

  await context.test('one-branch transform preserves date/status/provenance without fake times and is repeat-safe', async () => {
    const source = sourceRecord();
    const legacy = new MemoryAttendanceSource([source]);
    const dry = await runAttendanceMigration({ source: legacy, mapping: mapping(), database });
    assert.equal(dry.mode, 'dry-run');
    assert.equal(dry.appliedCount, 0);
    assert.equal(dry.statusCounts.half_day, 1);
    assert.equal((await database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM attendance_records')).rows[0]?.count, '0');

    const applied = await runAttendanceMigration({ source: legacy, mapping: mapping(), database, apply: true });
    assert.equal(applied.appliedCount, 1);
    await runAttendanceMigration({ source: legacy, mapping: mapping(), database, apply: true });
    const row = await database.query<{
      organization_id: string; branch_id: string; membership_id: string;
      attendance_date: string; status: string; source: string; version: number;
      check_in_at: Date | null; check_out_at: Date | null; legacy_mongo_id: string;
    }>(`
      SELECT organization_id, branch_id, membership_id, attendance_date::text,
        status, source, version, check_in_at, check_out_at, legacy_mongo_id
      FROM attendance_records WHERE legacy_mongo_id = $1
    `, [source.id]);
    assert.deepEqual(row.rows[0], {
      organization_id: organizationId,
      branch_id: branchId,
      membership_id: oneBranch.membershipId,
      attendance_date: '2026-09-15',
      status: 'half_day',
      source: 'import',
      version: 1,
      check_in_at: null,
      check_out_at: null,
      legacy_mongo_id: source.id,
    });
    const verification = await verifyAttendanceMigration({ source: legacy, mapping: mapping(), database });
    assert.equal(verification.clean, true);
    assert.equal(verification.sourceCount, 1);
    assert.equal(verification.targetImportCount, 1);
    assert.deepEqual(verification.dateCoverage, { earliest: '2026-09-15', latest: '2026-09-15' });
  });

  await context.test('multiple branches block until a reviewed per-document resolution is supplied', async () => {
    const source = sourceRecord({
      id: legacyId(), legacyUserId: manyBranches.legacyUserId,
      date: new Date('2026-09-16T00:00:00.000Z'), status: 'present',
    });
    const legacy = new MemoryAttendanceSource([source]);
    const blocked = await runAttendanceMigration({ source: legacy, mapping: mapping(), database });
    assert.ok(blocked.issues.some(({ code }) => code === 'ambiguous_branch_assignment'));
    await assert.rejects(
      runAttendanceMigration({ source: legacy, mapping: mapping(), database, apply: true }),
      AttendanceMigrationBlockedError,
    );
    const resolvedMapping = mapping({ [source.id]: secondBranchId });
    const resolved = await runAttendanceMigration({
      source: legacy, mapping: resolvedMapping, database, apply: true,
    });
    assert.equal(resolved.blockerCount, 0);
    const row = await database.query<{ branch_id: string }>(
      'SELECT branch_id FROM attendance_records WHERE legacy_mongo_id = $1',
      [source.id],
    );
    assert.equal(row.rows[0]?.branch_id, secondBranchId);
  });

  await context.test('missing identity mapping and invalid branch resolution are blockers', async () => {
    const missing = sourceRecord({ id: legacyId(), legacyUserId: legacyId() });
    const missingReport = await runAttendanceMigration({
      source: new MemoryAttendanceSource([missing]), mapping: mapping(), database,
    });
    assert.ok(missingReport.issues.some(({ code }) => code === 'missing_membership'));

    const invalidBranch = sourceRecord({
      id: legacyId(), legacyUserId: manyBranches.legacyUserId,
      date: new Date('2026-09-17T00:00:00.000Z'),
    });
    const invalidReport = await runAttendanceMigration({
      source: new MemoryAttendanceSource([invalidBranch]),
      mapping: mapping({ [invalidBranch.id]: randomUUID() }),
      database,
    });
    assert.ok(invalidReport.issues.some(({ code }) => code === 'invalid_branch_resolution'));
  });

  await context.test('duplicate target keys, invalid dates, and invalid statuses block without writes', async () => {
    const duplicateA = sourceRecord({ id: legacyId(), date: new Date('2026-09-20T00:00:00.000Z'), status: 'present' });
    const duplicateB = sourceRecord({ id: legacyId(), date: new Date('2026-09-20T00:00:00.000Z'), status: 'absent' });
    const invalidDate = sourceRecord({ id: legacyId(), date: new Date('invalid') });
    const invalidStatus = sourceRecord({ id: legacyId(), date: new Date('2026-09-21T00:00:00.000Z'), status: 'late' });
    const source = new MemoryAttendanceSource([duplicateA, duplicateB, invalidDate, invalidStatus]);
    const report = await runAttendanceMigration({ source, mapping: mapping(), database });
    assert.ok(report.issues.some(({ code }) => code === 'duplicate_attendance_key'));
    assert.ok(report.issues.some(({ code }) => code === 'invalid_date'));
    assert.ok(report.issues.some(({ code }) => code === 'invalid_status'));
    await assert.rejects(
      runAttendanceMigration({ source, mapping: mapping(), database, apply: true }),
      AttendanceMigrationBlockedError,
    );
    const count = await database.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM attendance_records
      WHERE attendance_date IN ('2026-09-20', '2026-09-21')
    `);
    assert.equal(count.rows[0]?.count, '0');
  });
});
