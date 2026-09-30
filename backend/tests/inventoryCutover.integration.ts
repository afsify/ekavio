import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  activateInventoryAuthority,
  isInventoryAuthorityActivated,
} from '../src/domains/inventory/authority.js';
import {
  runInventoryCutoverPreflight,
  runInventoryMigration,
  verifyInventoryMigration,
} from '../src/domains/inventory/migration.js';
import type { InventoryLegacySource } from '../src/domains/inventory/migrationTypes.js';
import { PostgresCommercialRepository } from '../src/postgres/commercialRepository.js';
import { PostgresDatabase } from '../src/postgres/database.js';
import { migrate } from '../src/postgres/migrations.js';

const emptySource: InventoryLegacySource = { load: async () => [] };
const blockedSource: InventoryLegacySource = {
  load: async () => [{
    id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    legacyOrganizationId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
    itemName: 'Unmapped stock',
    currentStock: 10,
    lowStockThreshold: 2,
    price: 5,
    createdAt: new Date('2026-09-29T00:00:00.000Z'),
    updatedAt: new Date('2026-09-29T00:00:00.000Z'),
  }],
};
const emptyMapping = { version: 1 as const, organizations: [] };

test('V2-06E Inventory preflight, explicit authority activation, and Mongo boundary', async (context) => {
  const adminUrl = process.env.POSTGRES_TEST_URL;
  assert.ok(adminUrl, 'POSTGRES_TEST_URL is required');
  const parsed = new URL(adminUrl);
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(parsed.hostname)
    || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(parsed.hostname));
  assert.equal(parsed.pathname, '/postgres');

  const databaseName = `ekavio_v206e_cutover_${randomUUID().replaceAll('-', '')}`;
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

  await context.test('empty source verifies cleanly without asserting activation', async () => {
    const verification = await verifyInventoryMigration({
      source: emptySource, mapping: emptyMapping, database,
    });
    assert.equal(verification.clean, true);
    assert.equal(verification.sourceCount, 0);
    assert.equal(verification.targetImportCount, 0);
    assert.equal(verification.balanceReconciliationCount, 0);
    assert.equal(await isInventoryAuthorityActivated(database), false);
  });

  await context.test('preflight fails closed until explicit activation is permitted', async () => {
    const blocked = await runInventoryCutoverPreflight({
      source: emptySource,
      mapping: emptyMapping,
      database,
      inventoryAuthority: 'postgresql',
    });
    assert.equal(blocked.ready, false);
    assert.deepEqual(blocked.failures, ['authorityLatchMatches']);

    const activationReady = await runInventoryCutoverPreflight({
      source: emptySource,
      mapping: emptyMapping,
      database,
      inventoryAuthority: 'postgresql',
      allowPendingActivation: true,
    });
    assert.equal(activationReady.ready, true);
    assert.ok(Object.values(activationReady.checks).every(Boolean));
    assert.equal(await isInventoryAuthorityActivated(database), false);
  });

  await context.test('any source blocker prevents preflight and activation readiness', async () => {
    const blocked = await runInventoryCutoverPreflight({
      source: blockedSource,
      mapping: emptyMapping,
      database,
      inventoryAuthority: 'postgresql',
      allowPendingActivation: true,
    });
    assert.equal(blocked.ready, false);
    assert.equal(blocked.verification.blockerCount, 1);
    assert.ok(blocked.verification.mismatches.some((value) => value.startsWith('unmapped_organization:')));
    assert.ok(blocked.failures.includes('sourceReconciliationClean'));
    assert.ok(blocked.failures.includes('zeroUnresolvedBlockers'));
    assert.equal(await isInventoryAuthorityActivated(database), false);
  });

  await context.test('activation is durable and ordinary migration apply is refused afterward', async () => {
    await activateInventoryAuthority(database);
    assert.equal(await isInventoryAuthorityActivated(database), true);
    const ready = await runInventoryCutoverPreflight({
      source: emptySource,
      mapping: emptyMapping,
      database,
      inventoryAuthority: 'postgresql',
    });
    assert.equal(ready.ready, true);
    const latch = await database.query<{ authority: string; activated_by: string }>(`
      SELECT authority, activated_by
      FROM operational_runtime_authority WHERE vertical = 'inventory'
    `);
    assert.deepEqual(latch.rows[0], { authority: 'postgresql', activated_by: 'v2-06e-cutover' });
    await assert.rejects(
      runInventoryMigration({
        source: emptySource, mapping: emptyMapping, database, apply: true,
      }),
      /refused after PostgreSQL runtime authority activation/,
    );
  });

  await context.test('ordinary runtime is PostgreSQL-only and the legacy model is isolated to migration compatibility', async () => {
    const [composition, controller, service, repository, routes, analytics, mongoSource] = await Promise.all([
      readFile(new URL('../src/persistence/runtimePersistence.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/controllers/inventoryController.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/services/inventoryService.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/domains/inventory/repository.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/routes/inventoryRoutes.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/controllers/analyticsController.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/domains/inventory/mongoMigrationSource.ts', import.meta.url), 'utf8'),
    ]);
    assert.match(composition, /inventoryAuthority: 'postgresql'/);
    assert.match(composition, /PostgresInventoryRepository/);
    assert.match(routes, /requireEntitlement\(MODULES\.INVENTORY\)/);
    assert.match(routes, /INVENTORY_READ/);
    assert.match(routes, /INVENTORY_MANAGE/);
    assert.match(mongoSource, /models\/Inventory/);
    for (const source of [composition, controller, service, repository, routes, analytics]) {
      for (const forbidden of [
        'models/Inventory', 'new Inventory(', 'Inventory.find', 'Inventory.countDocuments',
        'legacyOrganizationScope', 'legacyMongoId', 'dualWrite', 'fallbackToMongo',
      ]) assert.equal(source.includes(forbidden), false, forbidden);
    }
  });

  await context.test('frontend contract uses canonical UUIDs, exact strings, real commands, and pagination', async () => {
    const [page, hook] = await Promise.all([
      readFile(new URL('../../frontend/src/pages/Inventory/InventoryPage.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../../frontend/src/hooks/useInventory.ts', import.meta.url), 'utf8'),
    ]);
    for (const forbidden of ['_id', 'currentStock', 'alerts/low-stock', 'valueAsNumber']) {
      assert.equal(page.includes(forbidden), false, forbidden);
      assert.equal(hook.includes(forbidden), false, forbidden);
    }
    for (const required of [
      'quantity: string', 'priceMinor: string | null', 'reorderThreshold: string',
      "command: 'receive' | 'consume' | 'adjust'", '/inventory/${itemId}/${command}',
      '/reversal', '/movements',
      'page', 'totalPages', 'isLowStock',
    ]) assert.ok(page.includes(required) || hook.includes(required), required);
  });
});
