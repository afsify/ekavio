import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PostgresCommercialRepository } from '../src/postgres/commercialRepository.js';
import { PostgresDatabase } from '../src/postgres/database.js';
import { getMigrationStatus, migrate } from '../src/postgres/migrations.js';
import { PostgresPublicCommercialRepository } from '../src/postgres/publicCommercialRepository.js';
import { createPublicCommercialService } from '../src/services/publicCommercialService.js';

const at = new Date('2026-09-25T08:00:00.000Z');

test('V2-06B5A PostgreSQL pricing and public commercial intake', async (context) => {
  const adminUrl = process.env.POSTGRES_TEST_URL;
  assert.ok(adminUrl, 'POSTGRES_TEST_URL is required');
  const parsed = new URL(adminUrl);
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(parsed.hostname));
  assert.equal(parsed.pathname, '/postgres');

  const databaseName = `ekavio_v206b5a_${randomUUID().replaceAll('-', '')}`;
  const admin = new PostgresDatabase(adminUrl);
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const database = new PostgresDatabase(databaseUrl.toString());
  const temporaryMigrations = await mkdtemp(path.join(tmpdir(), 'ekavio-v206b5a-'));
  context.after(async () => {
    await database.close();
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]);
    await admin.query(`DROP DATABASE "${databaseName}"`);
    await admin.close();
    await rm(temporaryMigrations, { recursive: true, force: true });
  });

  const migrationDirectory = path.resolve(process.cwd(), 'postgres', 'migrations');
  const accepted = (await readdir(migrationDirectory))
    .filter((name) => /^00[1-5]_.*\.sql$/.test(name));
  for (const name of accepted) {
    await copyFile(path.join(migrationDirectory, name), path.join(temporaryMigrations, name));
  }
  await migrate(database, temporaryMigrations);
  assert.equal((await database.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM schema_migrations',
  )).rows[0]?.count, '5');
  await migrate(database);
  assert.deepEqual(
    (await getMigrationStatus(database)).map(({ state }) => state),
    ['applied', 'applied', 'applied', 'applied', 'applied', 'applied'],
  );

  await new PostgresCommercialRepository(database).reconcileCatalogue();
  const operatorId = randomUUID();
  const tenantId = randomUUID();
  await database.query(`
    INSERT INTO users (id, name, phone, platform_role, created_at, updated_at)
    VALUES ($1, 'Platform Operator', 'operator-v206b5a', 'operator', $3, $3),
           ($2, 'Tenant Owner', 'tenant-v206b5a', NULL, $3, $3)
  `, [operatorId, tenantId, at]);
  const repository = new PostgresPublicCommercialRepository(database);
  const service = createPublicCommercialService(repository, { now: () => at });

  await context.test('only a platform operator can configure and publish integer pricing', async () => {
    await assert.rejects(
      repository.upsertPricing('plan', 'pilot-core', tenantId, {
        currency: 'INR', monthlyPriceMinor: '10000', yearlyPriceMinor: '100000',
        published: true, displayOrder: 1, marketingLabel: 'Core',
      }),
      /Platform operator access required/,
    );
    await repository.upsertPricing('plan', 'pilot-core', operatorId, {
      currency: 'INR', monthlyPriceMinor: '10000', yearlyPriceMinor: '100000',
      published: true, displayOrder: 1, marketingLabel: 'Core',
    });
    await repository.upsertPricing('add_on', 'module-inventory', operatorId, {
      currency: 'INR', monthlyPriceMinor: '2500', yearlyPriceMinor: '25000',
      published: true, displayOrder: 2, marketingLabel: null,
    });
    await repository.upsertPricing('add_on', 'module-attendance', operatorId, {
      currency: 'INR', monthlyPriceMinor: '2000', yearlyPriceMinor: '20000',
      published: false, displayOrder: 3, marketingLabel: 'Draft only',
    });
    const events = await database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM public_offer_pricing_events',
    );
    assert.equal(events.rows[0]?.count, '3');
    await assert.rejects(database.query(`
      UPDATE public_offer_pricing_events SET published = FALSE
    `), /append-only/);
    await assert.rejects(database.query(`
      UPDATE public_offer_pricing SET monthly_price_minor = -1 WHERE plan_id IS NOT NULL
    `));
  });

  await context.test('public catalogue and quotes hide drafts and use authoritative PostgreSQL prices', async () => {
    const catalogue = await service.getCatalogue();
    assert.equal(catalogue.plans.some(({ key }) => key === 'legacy-import'), false);
    assert.equal(catalogue.addOns.find(({ key }) => key === 'module-attendance')?.pricing, null);
    assert.equal(JSON.stringify(catalogue).includes(operatorId), false);
    const quote = await service.previewQuote({
      billingCycle: 'yearly', planKey: 'pilot-core', addOnKeys: ['module-inventory'],
    });
    assert.equal(quote.subtotalMinor, '125000');
    await assert.rejects(service.previewQuote({
      billingCycle: 'monthly', addOnKeys: ['module-attendance'],
    }), /no published price/);
  });

  let requestId = '';
  await context.test('submission writes request and immutable snapshot without provisioning authority', async () => {
    const before = await database.query<{ state: string }>(`
      SELECT concat_ws(':',
        (SELECT COUNT(*) FROM organizations),
        (SELECT COUNT(*) FROM subscriptions),
        (SELECT COUNT(*) FROM entitlement_overrides)) AS state
    `);
    const receipt = await service.submitRequest({
      businessName: 'Integration Clinic', businessType: 'Clinic', contactName: 'Owner',
      phone: '9876543210', email: 'owner@example.test', billingCycle: 'monthly',
      planKey: null, addOnKeys: ['module-inventory'], note: 'Integration request',
    });
    requestId = receipt.receiptId;
    assert.equal(receipt.subtotalMinor, '2500');
    assert.equal(JSON.stringify(receipt).includes('9876543210'), false);
    const stored = await repository.getAccessRequest(requestId);
    assert.equal(stored?.normalizedPhone, '+919876543210');
    assert.equal(stored?.pricingSnapshot.items[0]?.priceMinor, '2500');
    const after = await database.query<{ state: string }>(`
      SELECT concat_ws(':',
        (SELECT COUNT(*) FROM organizations),
        (SELECT COUNT(*) FROM subscriptions),
        (SELECT COUNT(*) FROM entitlement_overrides)) AS state
    `);
    assert.equal(after.rows[0]?.state, before.rows[0]?.state);
    await assert.rejects(service.submitRequest({
      businessName: 'Duplicate Clinic', businessType: 'Clinic', contactName: 'Owner',
      phone: '+919876543210', billingCycle: 'monthly', addOnKeys: ['module-inventory'],
    }), /recent request already exists/);
  });

  await context.test('operator review is auditable and terminal states cannot activate or regress', async () => {
    await assert.rejects(repository.updateAccessRequest(
      requestId, tenantId, { status: 'contacted' },
    ), /Platform operator access required/);
    const contacted = await repository.updateAccessRequest(
      requestId, operatorId, { status: 'contacted', internalNote: 'Reached owner' },
    );
    assert.equal(contacted.status, 'contacted');
    const approved = await repository.updateAccessRequest(
      requestId, operatorId, { status: 'approved' },
    );
    assert.equal(approved.status, 'approved');
    await assert.rejects(repository.updateAccessRequest(
      requestId, operatorId, { status: 'rejected' },
    ), /Invalid access request transition/);
    const listed = await repository.listAccessRequests({ status: 'approved', limit: 10, offset: 0 });
    assert.equal(listed.total, 1);
    assert.equal(listed.items[0]?.id, requestId);
    const events = await database.query<{ action: string; actor_user_id: string | null }>(`
      SELECT action, actor_user_id FROM commercial_access_request_events
      WHERE access_request_id = $1 ORDER BY occurred_at, action
    `, [requestId]);
    assert.ok(events.rows.some(({ action, actor_user_id }) => action === 'submitted' && actor_user_id === null));
    assert.equal(events.rows.filter(({ action }) => action === 'status_changed').length, 2);
    assert.ok(events.rows.filter(({ action }) => action === 'status_changed').every(
      ({ actor_user_id }) => actor_user_id === operatorId,
    ));
    await assert.rejects(database.query(`
      DELETE FROM commercial_access_request_events WHERE access_request_id = $1
    `, [requestId]), /append-only/);
  });
});
