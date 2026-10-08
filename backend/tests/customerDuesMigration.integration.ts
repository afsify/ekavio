import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  CustomerDuesMigrationBlockedError,
  runCustomerDuesMigration,
  verifyCustomerDuesMigration,
} from '../src/domains/customerDues/migration.js';
import type {
  CustomerDuesLegacySource,
  CustomerDuesMigrationMapping,
  LegacyCustomerDueSourceRecord,
} from '../src/domains/customerDues/migrationTypes.js';
import { PostgresDatabase } from '../src/postgres/database.js';
import { getMigrationStatus, migrate } from '../src/postgres/migrations.js';

class MemoryCustomerDuesSource implements CustomerDuesLegacySource {
  public constructor(private readonly rows: LegacyCustomerDueSourceRecord[]) {}
  public async load(): Promise<LegacyCustomerDueSourceRecord[]> {
    return this.rows.map((row) => ({ ...row }));
  }
}

const legacyId = (): string => randomBytes(12).toString('hex');

test('V2-06D Customer Dues migration transforms, reconciles, and blocks unsafe guesses', async (context) => {
  const adminUrl = process.env.POSTGRES_TEST_URL;
  assert.ok(adminUrl, 'POSTGRES_TEST_URL is required');
  const parsed = new URL(adminUrl);
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(parsed.hostname)
    || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(parsed.hostname));
  assert.equal(parsed.pathname, '/postgres');

  const cleanName = `ekavio_v206d_migration_${randomUUID().replaceAll('-', '')}`;
  const upgradeName = `ekavio_v206d_upgrade_${randomUUID().replaceAll('-', '')}`;
  const admin = new PostgresDatabase(adminUrl);
  await admin.query(`CREATE DATABASE "${cleanName}"`);
  await admin.query(`CREATE DATABASE "${upgradeName}"`);
  const cleanUrl = new URL(adminUrl);
  cleanUrl.pathname = `/${cleanName}`;
  const upgradeUrl = new URL(adminUrl);
  upgradeUrl.pathname = `/${upgradeName}`;
  const database = new PostgresDatabase(cleanUrl.toString());
  const upgrade = new PostgresDatabase(upgradeUrl.toString());
  const temporaryMigrations = await mkdtemp(path.join(tmpdir(), 'ekavio-v206d-migrations-'));
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
  assert.equal((await getMigrationStatus(database)).length, 19);
  const migrationDirectory = path.resolve(process.cwd(), 'postgres', 'migrations');
  const accepted = (await readdir(migrationDirectory)).filter((name) => /^00[1-9]_.*\.sql$/.test(name));
  for (const name of accepted) {
    await copyFile(path.join(migrationDirectory, name), path.join(temporaryMigrations, name));
  }
  await migrate(upgrade, temporaryMigrations);
  assert.equal((await getMigrationStatus(upgrade, temporaryMigrations)).length, 9);
  await migrate(upgrade);
  assert.equal((await getMigrationStatus(upgrade)).length, 19);

  const now = new Date('2026-10-02T00:00:00.000Z');
  const organizationId = randomUUID();
  const legacyOrganizationId = legacyId();
  const branchId = randomUUID();
  const secondBranchId = randomUUID();
  const customerId = randomUUID();
  const otherCustomerId = randomUUID();
  await database.query(`
    INSERT INTO organizations
      (id, legacy_mongo_id, name, type, theme_mode, theme_primary_color, created_at, updated_at)
    VALUES ($1, $2, 'Dues Migration Org', 'clinic', 'light', '#4F46E5', $3, $3)
  `, [organizationId, legacyOrganizationId, now]);
  await database.query(`
    INSERT INTO branches
      (id, organization_id, name, code, status, timezone, created_at, updated_at)
    VALUES
      ($1, $3, 'Main', 'main', 'active', 'Asia/Kolkata', $4, $4),
      ($2, $3, 'Second', 'second', 'active', 'UTC', $4, $4)
  `, [branchId, secondBranchId, organizationId, now]);
  await database.query(`
    INSERT INTO customers (id, organization_id, name, home_branch_id, status, created_at, updated_at)
    VALUES
      ($1, $3, 'Migrated Customer', $4, 'active', $5, $5),
      ($2, $3, 'Other Customer', $4, 'active', $5, $5)
  `, [customerId, otherCustomerId, organizationId, branchId, now]);

  const sourceRecord = (overrides: Partial<LegacyCustomerDueSourceRecord> = {}): LegacyCustomerDueSourceRecord => ({
    id: legacyId(),
    legacyOrganizationId,
    customerName: 'Legacy display only',
    phone: '+919000000000',
    amount: 1500,
    type: 'credit',
    description: 'Preserved legacy description',
    createdAt: new Date('2026-08-15T10:00:00.000Z'),
    updatedAt: new Date('2026-08-15T10:01:00.000Z'),
    ...overrides,
  });
  const mapping = (
    records: LegacyCustomerDueSourceRecord[],
    customerResolutions: Record<string, string> = {},
    branchOverrides: Record<string, string | undefined> = {},
  ): CustomerDuesMigrationMapping => ({
    version: 1,
    organizations: [{
      legacyOrganizationId,
      organizationId,
      customerResolutions,
      branchResolutions: Object.fromEntries(records.flatMap((record) => {
        const value = Object.hasOwn(branchOverrides, record.id) ? branchOverrides[record.id] : branchId;
        return value ? [[record.id, value]] : [];
      })),
    }],
  });
  const linkCustomer = async (record: LegacyCustomerDueSourceRecord, targetCustomerId = customerId) => {
    await database.query(`
      INSERT INTO customer_source_links
        (source_kind, legacy_document_id, organization_id, customer_id, source_fingerprint)
      VALUES ('ledger', $1, $2, $3, $4)
    `, [record.id, organizationId, targetCustomerId, 'a'.repeat(64)]);
  };

  await context.test('empty source is a clean non-mutating dry-run', async () => {
    const report = await runCustomerDuesMigration({
      source: new MemoryCustomerDuesSource([]),
      mapping: { version: 1, organizations: [] },
      database,
    });
    assert.equal(report.mode, 'dry-run');
    assert.equal(report.sourceCount, 0);
    assert.equal(report.blockerCount, 0);
    assert.equal((await database.query('SELECT 1 FROM customer_due_entries')).rowCount, 0);
  });

  await context.test('valid charge/payment preserve exact money, facts, provenance, and repeat safely', async () => {
    const charge = sourceRecord();
    const payment = sourceRecord({
      amount: 1500.5,
      type: 'payment',
      description: 'Payment received',
      createdAt: new Date('2026-08-16T11:30:00.000Z'),
      updatedAt: new Date('2026-08-16T11:31:00.000Z'),
    });
    await linkCustomer(charge);
    await linkCustomer(payment);
    const source = new MemoryCustomerDuesSource([charge, payment]);
    const reviewed = mapping([charge, payment]);

    const dry = await runCustomerDuesMigration({ source, mapping: reviewed, database });
    assert.equal(dry.mode, 'dry-run');
    assert.equal(dry.appliedCount, 0);
    assert.equal(dry.blockerCount, 0);
    assert.deepEqual(dry.typeCounts, { charge: 1, payment: 1 });
    assert.equal(dry.totalChargeMinor, '150000');
    assert.equal(dry.totalPaymentMinor, '150050');
    assert.equal(dry.customerMappingCoverage, 1);
    assert.equal(dry.branchMappingCoverage, 1);
    assert.deepEqual(dry.dateCoverage, {
      earliest: '2026-08-15T10:00:00.000Z', latest: '2026-08-16T11:30:00.000Z',
    });
    assert.equal((await database.query('SELECT 1 FROM customer_due_entries')).rowCount, 0);

    const applied = await runCustomerDuesMigration({ source, mapping: reviewed, database, apply: true });
    assert.equal(applied.appliedCount, 2);
    await runCustomerDuesMigration({ source, mapping: reviewed, database, apply: true });
    const rows = await database.query<{
      legacy_mongo_id: string; customer_id: string; branch_id: string; entry_type: string;
      amount_minor: string; description: string; source_type: string; source_id: string;
      occurred_at: Date; created_by_membership_id: string | null;
    }>(`
      SELECT legacy_mongo_id, customer_id, branch_id, entry_type, amount_minor::text,
        description, source_type, source_id, occurred_at, created_by_membership_id
      FROM customer_due_entries ORDER BY occurred_at
    `);
    assert.equal(rows.rowCount, 2);
    assert.deepEqual(rows.rows.map(({ entry_type, amount_minor }) => ({ entry_type, amount_minor })), [
      { entry_type: 'charge', amount_minor: '150000' },
      { entry_type: 'payment', amount_minor: '150050' },
    ]);
    assert.equal(rows.rows[0]?.legacy_mongo_id, charge.id);
    assert.equal(rows.rows[0]?.customer_id, customerId);
    assert.equal(rows.rows[0]?.branch_id, branchId);
    assert.equal(rows.rows[0]?.description, charge.description);
    assert.equal(rows.rows[0]?.source_type, 'legacy_mongo');
    assert.equal(rows.rows[0]?.source_id, charge.id);
    assert.equal(rows.rows[0]?.occurred_at.toISOString(), charge.createdAt.toISOString());
    assert.equal(rows.rows[0]?.created_by_membership_id, null);
    const verified = await verifyCustomerDuesMigration({ source, mapping: reviewed, database });
    assert.equal(verified.clean, true);
    assert.equal(verified.targetImportCount, 2);
    assert.equal(verified.mismatches.length, 0);
  });

  await context.test('money precision, customer ambiguity/missing, branch ambiguity, and invalid type are blockers', async () => {
    const precision = sourceRecord({ amount: 1.005 });
    const conflicting = sourceRecord();
    const missingCustomer = sourceRecord();
    const missingBranch = sourceRecord();
    const invalidBranch = sourceRecord();
    const invalidType = sourceRecord({ type: 'debit' });
    await linkCustomer(precision);
    await linkCustomer(conflicting);
    await linkCustomer(missingBranch);
    await linkCustomer(invalidBranch);
    await linkCustomer(invalidType);
    const rows = [precision, conflicting, missingCustomer, missingBranch, invalidBranch, invalidType];
    const reviewed = mapping(
      rows,
      { [conflicting.id]: otherCustomerId },
      { [missingBranch.id]: undefined, [invalidBranch.id]: randomUUID() },
    );
    const source = new MemoryCustomerDuesSource(rows);
    const report = await runCustomerDuesMigration({ source, mapping: reviewed, database });
    const codes = new Set(report.issues.map(({ code }) => code));
    for (const code of [
      'invalid_money_precision', 'conflicting_customer_mapping', 'missing_customer_mapping',
      'missing_branch_mapping', 'invalid_branch_mapping', 'invalid_legacy_type',
    ]) assert.ok(codes.has(code), code);
    assert.equal(report.sourceCount, 6);
    assert.equal(report.appliedCount, 0);
    await assert.rejects(
      runCustomerDuesMigration({ source, mapping: reviewed, database, apply: true }),
      CustomerDuesMigrationBlockedError,
    );
  });
});
