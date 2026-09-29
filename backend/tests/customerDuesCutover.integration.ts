import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  activateCustomerDuesAuthority,
  isCustomerDuesAuthorityActivated,
} from '../src/domains/customerDues/authority.js';
import {
  runCustomerDuesCutoverPreflight,
  runCustomerDuesMigration,
  verifyCustomerDuesMigration,
} from '../src/domains/customerDues/migration.js';
import type { CustomerDuesLegacySource } from '../src/domains/customerDues/migrationTypes.js';
import { PostgresCommercialRepository } from '../src/postgres/commercialRepository.js';
import { PostgresDatabase } from '../src/postgres/database.js';
import { migrate } from '../src/postgres/migrations.js';

const emptySource: CustomerDuesLegacySource = { load: async () => [] };
const blockedSource: CustomerDuesLegacySource = {
  load: async () => [{
    id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    legacyOrganizationId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
    customerName: 'Not logged',
    phone: '+919999999999',
    amount: 100,
    type: 'credit',
    description: null,
    createdAt: new Date('2026-09-29T00:00:00.000Z'),
    updatedAt: new Date('2026-09-29T00:00:00.000Z'),
  }],
};
const emptyMapping = { version: 1 as const, organizations: [] };

test('V2-06D Customer Dues preflight, explicit authority activation, and Mongo boundary', async (context) => {
  const adminUrl = process.env.POSTGRES_TEST_URL;
  assert.ok(adminUrl, 'POSTGRES_TEST_URL is required');
  const parsed = new URL(adminUrl);
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(parsed.hostname)
    || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(parsed.hostname));
  assert.equal(parsed.pathname, '/postgres');

  const databaseName = `ekavio_v206d_cutover_${randomUUID().replaceAll('-', '')}`;
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
    const verification = await verifyCustomerDuesMigration({
      source: emptySource, mapping: emptyMapping, database,
    });
    assert.equal(verification.clean, true);
    assert.equal(verification.sourceCount, 0);
    assert.equal(verification.targetImportCount, 0);
    assert.equal(await isCustomerDuesAuthorityActivated(database), false);
  });

  await context.test('preflight fails closed until explicit activation is permitted', async () => {
    const blocked = await runCustomerDuesCutoverPreflight({
      source: emptySource,
      mapping: emptyMapping,
      database,
      customerDuesAuthority: 'postgresql',
    });
    assert.equal(blocked.ready, false);
    assert.deepEqual(blocked.failures, ['authorityLatchMatches']);

    const activationReady = await runCustomerDuesCutoverPreflight({
      source: emptySource,
      mapping: emptyMapping,
      database,
      customerDuesAuthority: 'postgresql',
      allowPendingActivation: true,
    });
    assert.equal(activationReady.ready, true);
    assert.ok(Object.values(activationReady.checks).every(Boolean));
    assert.equal(await isCustomerDuesAuthorityActivated(database), false);
  });

  await context.test('any legacy blocker prevents preflight and activation readiness', async () => {
    const blocked = await runCustomerDuesCutoverPreflight({
      source: blockedSource,
      mapping: emptyMapping,
      database,
      customerDuesAuthority: 'postgresql',
      allowPendingActivation: true,
    });
    assert.equal(blocked.ready, false);
    assert.equal(blocked.verification.blockerCount, 1);
    assert.ok(blocked.verification.mismatches.some((value) => value.startsWith('unmapped_organization:')));
    assert.ok(blocked.failures.includes('sourceReconciliationClean'));
    assert.ok(blocked.failures.includes('zeroUnresolvedBlockers'));
    assert.equal(await isCustomerDuesAuthorityActivated(database), false);
  });

  await context.test('activation is durable and ordinary migration apply is refused afterward', async () => {
    await activateCustomerDuesAuthority(database);
    assert.equal(await isCustomerDuesAuthorityActivated(database), true);
    const ready = await runCustomerDuesCutoverPreflight({
      source: emptySource,
      mapping: emptyMapping,
      database,
      customerDuesAuthority: 'postgresql',
    });
    assert.equal(ready.ready, true);
    const latch = await database.query<{ authority: string; activated_by: string }>(`
      SELECT authority, activated_by
      FROM operational_runtime_authority WHERE vertical = 'customer_dues'
    `);
    assert.deepEqual(latch.rows[0], { authority: 'postgresql', activated_by: 'v2-06d-cutover' });
    await assert.rejects(
      runCustomerDuesMigration({
        source: emptySource, mapping: emptyMapping, database, apply: true,
      }),
      /refused after PostgreSQL runtime authority activation/,
    );
  });

  await context.test('ordinary runtime has no Mongo Ledger read, write, fallback, or dual-write', async () => {
    const [composition, controller, service, repository, routes, legacyController, legacyRoutes] = await Promise.all([
      readFile(new URL('../src/persistence/runtimePersistence.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/controllers/customerDuesController.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/services/customerDuesService.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/domains/customerDues/repository.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/routes/customerDuesRoutes.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/controllers/ledgerController.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/routes/ledgerRoutes.ts', import.meta.url), 'utf8'),
    ]);
    assert.match(composition, /customerDuesAuthority: 'postgresql'/);
    assert.match(composition, /PostgresCustomerDuesRepository/);
    assert.match(routes, /requireEntitlement\(MODULES\.LEDGER\)/);
    assert.equal(legacyRoutes.includes('router.post'), false);
    assert.match(legacyController, /read-only compatibility adapter/);
    for (const source of [composition, controller, service, repository, legacyController]) {
      for (const forbidden of [
        "models/Ledger", 'Ledger.find', 'Ledger.create', 'Ledger.countDocuments',
        'legacyOrganizationScope', 'mongooseCustomerDues', 'dualWrite', 'fallbackToMongo',
      ]) assert.equal(source.includes(forbidden), false, forbidden);
    }
  });
});
