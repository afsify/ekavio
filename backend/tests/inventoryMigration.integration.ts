import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  InventoryMigrationBlockedError,
  runInventoryMigration,
  verifyInventoryMigration,
} from '../src/domains/inventory/migration.js';
import type {
  InventoryLegacySource,
  InventoryMigrationMapping,
  LegacyInventorySourceRecord,
} from '../src/domains/inventory/migrationTypes.js';
import { PostgresDatabase } from '../src/postgres/database.js';
import { getMigrationStatus, migrate } from '../src/postgres/migrations.js';

class MemoryInventorySource implements InventoryLegacySource {
  public constructor(private readonly rows: LegacyInventorySourceRecord[]) {}
  public async load(): Promise<LegacyInventorySourceRecord[]> {
    return this.rows.map((row) => ({ ...row }));
  }
}

const legacyId = (): string => randomBytes(12).toString('hex');

test('V2-06E Inventory migration transforms, reconciles, and blocks unsafe guesses', async (context) => {
  const adminUrl = process.env.POSTGRES_TEST_URL;
  assert.ok(adminUrl, 'POSTGRES_TEST_URL is required');
  const parsed = new URL(adminUrl);
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(parsed.hostname)
    || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(parsed.hostname));
  assert.equal(parsed.pathname, '/postgres');

  const cleanName = `ekavio_v206e_migration_${randomUUID().replaceAll('-', '')}`;
  const upgradeName = `ekavio_v206e_upgrade_${randomUUID().replaceAll('-', '')}`;
  const admin = new PostgresDatabase(adminUrl);
  await admin.query(`CREATE DATABASE "${cleanName}"`);
  await admin.query(`CREATE DATABASE "${upgradeName}"`);
  const cleanUrl = new URL(adminUrl);
  cleanUrl.pathname = `/${cleanName}`;
  const upgradeUrl = new URL(adminUrl);
  upgradeUrl.pathname = `/${upgradeName}`;
  const database = new PostgresDatabase(cleanUrl.toString());
  const upgrade = new PostgresDatabase(upgradeUrl.toString());
  const temporaryMigrations = await mkdtemp(path.join(tmpdir(), 'ekavio-v206e-migrations-'));
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
  assert.equal((await getMigrationStatus(database)).length, 20);
  const migrationDirectory = path.resolve(process.cwd(), 'postgres', 'migrations');
  const accepted = (await readdir(migrationDirectory)).filter((name) =>
    /^0(?:0[1-9]|10)_.*\.sql$/.test(name));
  for (const name of accepted) {
    await copyFile(path.join(migrationDirectory, name), path.join(temporaryMigrations, name));
  }
  await migrate(upgrade, temporaryMigrations);
  assert.equal((await getMigrationStatus(upgrade, temporaryMigrations)).length, 10);
  await migrate(upgrade);
  assert.equal((await getMigrationStatus(upgrade)).length, 20);

  const now = new Date('2026-10-03T00:00:00.000Z');
  const organizationId = randomUUID();
  const legacyOrganizationId = legacyId();
  const branchId = randomUUID();
  const secondBranchId = randomUUID();
  await database.query(`
    INSERT INTO organizations
      (id, legacy_mongo_id, name, type, theme_mode, theme_primary_color, created_at, updated_at)
    VALUES ($1, $2, 'Inventory Migration Org', 'shop', 'light', '#4F46E5', $3, $3)
  `, [organizationId, legacyOrganizationId, now]);
  await database.query(`
    INSERT INTO branches
      (id, organization_id, name, code, status, timezone, created_at, updated_at)
    VALUES
      ($1, $3, 'Main', 'main', 'active', 'Asia/Kolkata', $4, $4),
      ($2, $3, 'Second', 'second', 'active', 'UTC', $4, $4)
  `, [branchId, secondBranchId, organizationId, now]);

  const sourceRecord = (
    overrides: Partial<LegacyInventorySourceRecord> = {},
  ): LegacyInventorySourceRecord => ({
    id: legacyId(),
    legacyOrganizationId,
    itemName: 'Legacy item',
    currentStock: 10,
    lowStockThreshold: 2.5,
    price: 99.99,
    createdAt: new Date('2026-08-15T10:00:00.000Z'),
    updatedAt: new Date('2026-08-16T10:00:00.000Z'),
    ...overrides,
  });
  const mapping = (
    records: LegacyInventorySourceRecord[],
    branchOverrides: Record<string, string | undefined> = {},
    unitOverrides: Record<string, 'piece' | 'kg' | undefined> = {},
  ): InventoryMigrationMapping => ({
    version: 1,
    organizations: [{
      legacyOrganizationId,
      organizationId,
      branchResolutions: Object.fromEntries(records.flatMap((record) => {
        const value = Object.hasOwn(branchOverrides, record.id) ? branchOverrides[record.id] : branchId;
        return value ? [[record.id, value]] : [];
      })),
      unitResolutions: Object.fromEntries(records.flatMap((record) => {
        const value = Object.hasOwn(unitOverrides, record.id) ? unitOverrides[record.id] : 'piece';
        return value ? [[record.id, value]] : [];
      })),
    }],
  });

  await context.test('empty source is a clean non-mutating dry-run', async () => {
    const report = await runInventoryMigration({
      source: new MemoryInventorySource([]),
      mapping: { version: 1, organizations: [] },
      database,
    });
    assert.equal(report.mode, 'dry-run');
    assert.equal(report.sourceCount, 0);
    assert.equal(report.blockerCount, 0);
    assert.equal((await database.query('SELECT 1 FROM inventory_items')).rowCount, 0);
  });

  await context.test('reviewed records preserve separate catalogue identity, exact facts, zero policy, and provenance', async () => {
    const stocked = sourceRecord({ itemName: 'Duplicate historical name' });
    const zero = sourceRecord({
      itemName: 'Duplicate historical name',
      currentStock: 0,
      lowStockThreshold: 0,
      price: 0,
      createdAt: new Date('2026-08-17T10:00:00.000Z'),
      updatedAt: new Date('2026-08-17T10:00:00.000Z'),
    });
    const source = new MemoryInventorySource([stocked, zero]);
    const reviewed = mapping([stocked, zero], { [zero.id]: secondBranchId }, { [zero.id]: 'kg' });

    const dry = await runInventoryMigration({ source, mapping: reviewed, database });
    assert.equal(dry.mode, 'dry-run');
    assert.equal(dry.appliedCount, 0);
    assert.equal(dry.blockerCount, 0);
    assert.equal(dry.openingMovementCount, 1);
    assert.equal(dry.zeroOpeningBalanceCount, 1);
    assert.equal(dry.priceConversionCoverage, 2);
    assert.equal(dry.quantityConversionCoverage, 2);
    assert.equal(dry.thresholdCoverage, 2);
    assert.equal(dry.branchCoverage, 2);
    assert.equal(dry.unitCoverage, 2);
    assert.equal((await database.query('SELECT 1 FROM inventory_items')).rowCount, 0);

    const applied = await runInventoryMigration({ source, mapping: reviewed, database, apply: true });
    assert.equal(applied.appliedCount, 2);
    await runInventoryMigration({ source, mapping: reviewed, database, apply: true });
    const items = await database.query<{
      id: string; legacy_mongo_id: string; name: string; unit_code: string; price_minor: string;
    }>(`
      SELECT id, legacy_mongo_id, name, unit_code, price_minor::text
      FROM inventory_items WHERE legacy_mongo_id IS NOT NULL ORDER BY legacy_mongo_id
    `);
    assert.equal(items.rowCount, 2);
    assert.equal(new Set(items.rows.map(({ id }) => id)).size, 2);
    assert.ok(items.rows.every(({ name }) => name === 'Duplicate historical name'));
    const balances = await database.query<{
      legacy_mongo_id: string; branch_id: string; quantity: string; reorder_threshold: string;
    }>(`
      SELECT i.legacy_mongo_id, b.branch_id, b.quantity::text, b.reorder_threshold::text
      FROM inventory_items i JOIN stock_balances b ON b.item_id = i.id
      WHERE i.legacy_mongo_id IS NOT NULL ORDER BY i.legacy_mongo_id
    `);
    assert.deepEqual(new Set(balances.rows.map(({ quantity }) => quantity)), new Set(['10.000', '0.000']));
    const movements = await database.query<{
      source_id: string; quantity_delta: string; created_by_membership_id: string | null;
    }>(`
      SELECT source_id, quantity_delta::text, created_by_membership_id
      FROM stock_movements WHERE source_type = 'legacy_mongo_inventory'
    `);
    assert.equal(movements.rowCount, 1);
    assert.equal(movements.rows[0]?.source_id, stocked.id);
    assert.equal(movements.rows[0]?.quantity_delta, '10.000');
    assert.equal(movements.rows[0]?.created_by_membership_id, null);
    const verified = await verifyInventoryMigration({ source, mapping: reviewed, database });
    assert.equal(verified.clean, true);
    assert.equal(verified.targetImportCount, 2);
    assert.equal(verified.balanceReconciliationCount, 0);
    assert.deepEqual(verified.mismatches, []);
  });

  await context.test('branch, unit, organization, quantity, threshold, and price ambiguity block apply', async () => {
    const missingBranch = sourceRecord();
    const invalidBranch = sourceRecord();
    const missingUnit = sourceRecord();
    const quantityPrecision = sourceRecord({ currentStock: 1.0005 });
    const thresholdPrecision = sourceRecord({ lowStockThreshold: 1.0005 });
    const pricePrecision = sourceRecord({ price: 1.005 });
    const negativeQuantity = sourceRecord({ currentStock: -1 });
    const rows = [
      missingBranch, invalidBranch, missingUnit, quantityPrecision,
      thresholdPrecision, pricePrecision, negativeQuantity,
    ];
    const reviewed = mapping(
      rows,
      { [missingBranch.id]: undefined, [invalidBranch.id]: randomUUID() },
      { [missingUnit.id]: undefined },
    );
    const report = await runInventoryMigration({
      source: new MemoryInventorySource(rows), mapping: reviewed, database,
    });
    const codes = new Set(report.issues.map(({ code }) => code));
    for (const code of [
      'missing_branch_mapping', 'invalid_branch_mapping', 'missing_unit_mapping',
      'invalid_quantity_precision', 'invalid_threshold_precision', 'invalid_price_precision',
    ]) assert.ok(codes.has(code), code);
    await assert.rejects(
      runInventoryMigration({
        source: new MemoryInventorySource(rows), mapping: reviewed, database, apply: true,
      }),
      InventoryMigrationBlockedError,
    );

    const invalidOrganization = sourceRecord({ legacyOrganizationId: legacyId() });
    const invalidOrganizationReport = await runInventoryMigration({
      source: new MemoryInventorySource([invalidOrganization]),
      mapping: {
        version: 1,
        organizations: [{
          legacyOrganizationId: invalidOrganization.legacyOrganizationId,
          organizationId: randomUUID(),
          branchResolutions: { [invalidOrganization.id]: branchId },
          unitResolutions: { [invalidOrganization.id]: 'piece' },
        }],
      },
      database,
    });
    assert.equal(invalidOrganizationReport.issues[0]?.code, 'invalid_organization_mapping');
  });
});
