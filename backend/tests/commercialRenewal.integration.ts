import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PostgresCommercialRenewalRepository } from '../src/postgres/commercialRenewalRepository.js';
import { PostgresCommercialRepository } from '../src/postgres/commercialRepository.js';
import { PostgresDatabase } from '../src/postgres/database.js';
import { getMigrationStatus, migrate } from '../src/postgres/migrations.js';
import { PostgresPublicCommercialRepository } from '../src/postgres/publicCommercialRepository.js';
import { createCommercialRenewalService } from '../src/services/commercialRenewalService.js';
import { createEntitlementService } from '../src/services/entitlementService.js';

test('V2-06B5C manual renewal lifecycle, tenancy, settlement, and concurrency', async (context) => {
  const adminUrl = process.env.POSTGRES_TEST_URL;
  assert.ok(adminUrl, 'POSTGRES_TEST_URL is required');
  const parsed = new URL(adminUrl);
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(parsed.hostname));
  assert.equal(parsed.pathname, '/postgres');

  const cleanDatabaseName = `ekavio_v206b5c_${randomUUID().replaceAll('-', '')}`;
  const upgradeDatabaseName = `ekavio_v206b5c_upgrade_${randomUUID().replaceAll('-', '')}`;
  const admin = new PostgresDatabase(adminUrl);
  await admin.query(`CREATE DATABASE "${cleanDatabaseName}"`);
  await admin.query(`CREATE DATABASE "${upgradeDatabaseName}"`);
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${cleanDatabaseName}`;
  const upgradeUrl = new URL(adminUrl);
  upgradeUrl.pathname = `/${upgradeDatabaseName}`;
  const database = new PostgresDatabase(databaseUrl.toString());
  const upgradeDatabase = new PostgresDatabase(upgradeUrl.toString());
  const temporaryMigrations = await mkdtemp(path.join(tmpdir(), 'ekavio-v206b5c-'));
  context.after(async () => {
    await database.close();
    await upgradeDatabase.close();
    for (const databaseName of [cleanDatabaseName, upgradeDatabaseName]) {
      await admin.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
        [databaseName],
      );
      await admin.query(`DROP DATABASE "${databaseName}"`);
    }
    await admin.close();
    await rm(temporaryMigrations, { recursive: true, force: true });
  });

  await migrate(database);
  assert.deepEqual(
    (await getMigrationStatus(database)).map(({ state }) => state),
    Array.from({ length: 20 }, () => 'applied'),
  );
  const migrationDirectory = path.resolve(process.cwd(), 'postgres', 'migrations');
  const accepted = (await readdir(migrationDirectory))
    .filter((name) => /^00[1-7]_.*\.sql$/.test(name));
  for (const name of accepted) {
    await copyFile(path.join(migrationDirectory, name), path.join(temporaryMigrations, name));
  }
  await migrate(upgradeDatabase, temporaryMigrations);
  assert.equal((await getMigrationStatus(upgradeDatabase, temporaryMigrations)).length, 7);
  await migrate(upgradeDatabase);
  assert.deepEqual(
    (await getMigrationStatus(upgradeDatabase)).map(({ state }) => state),
    Array.from({ length: 20 }, () => 'applied'),
  );

  const now = new Date('2026-10-01T00:00:00.000Z');
  const operatorId = randomUUID();
  const tenantAdminId = randomUUID();
  await database.query(`
    INSERT INTO users
      (id, name, phone, password_hash, platform_role, created_at, updated_at)
    VALUES
      ($1, 'Renewal Operator', '+919000001001', NULL, 'operator', $3, $3),
      ($2, 'Tenant Admin', '+919000001002', NULL, NULL, $3, $3)
  `, [operatorId, tenantAdminId, now]);
  const commercial = new PostgresCommercialRepository(database);
  await commercial.reconcileCatalogue();
  const pricing = new PostgresPublicCommercialRepository(database);
  for (const [offerType, key, monthly, yearly] of [
    ['plan', 'pilot-core', '10000', '100000'],
    ['add_on', 'module-inventory', '2500', '25000'],
  ] as const) {
    await pricing.upsertPricing(offerType, key, operatorId, {
      currency: 'INR',
      monthlyPriceMinor: monthly,
      yearlyPriceMinor: yearly,
      published: true,
      displayOrder: 1,
      marketingLabel: null,
    });
  }
  const repository = new PostgresCommercialRenewalRepository(database);
  const service = createCommercialRenewalService(repository, () => now);

  const createSubscription = async (input: {
    name: string;
    status?: 'active' | 'trialing' | 'inactive' | 'suspended' | 'cancelled';
    startsAt: Date;
    endsAt: Date;
    billingCycle?: 'monthly' | 'yearly';
    planKey?: string | null;
    addOnKeys?: string[];
  }) => {
    const organizationId = randomUUID();
    const subscriptionId = randomUUID();
    await database.query(`
      INSERT INTO organizations
        (id, name, type, theme_mode, theme_primary_color, created_at, updated_at)
      VALUES ($1, $2, 'clinic', 'light', '#4F46E5', $3, $3)
    `, [organizationId, input.name, now]);
    const plan = input.planKey === null
      ? { rows: [] as Array<{ id: string }> }
      : await database.query<{ id: string }>(
          'SELECT id FROM plans WHERE key = $1',
          [input.planKey ?? 'pilot-core'],
        );
    await database.query(`
      INSERT INTO subscriptions
        (id, organization_id, plan_id, status, source, starts_at,
         current_period_ends_at, billing_cycle, suspended_at, cancelled_at,
         created_by_user_id, updated_by_user_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 'manual', $5, $6, $7, $8, $9, $10, $10, $11, $11)
    `, [subscriptionId, organizationId, plan.rows[0]?.id ?? null,
      input.status ?? 'active', input.startsAt, input.endsAt,
      input.billingCycle ?? 'monthly', input.status === 'suspended' ? now : null,
      input.status === 'cancelled' ? now : null, operatorId, now]);
    for (const key of input.addOnKeys ?? ['module-inventory']) {
      const addOn = await database.query<{ id: string }>('SELECT id FROM add_ons WHERE key = $1', [key]);
      await database.query(`
        INSERT INTO subscription_add_ons (subscription_id, add_on_id, starts_at, ends_at)
        VALUES ($1, $2, $3, $4)
      `, [subscriptionId, addOn.rows[0]!.id, input.startsAt, input.endsAt]);
    }
    return { organizationId, subscriptionId };
  };
  const inputFor = (
    organizationId: string,
    renewalStartsAt: Date,
    renewalEndsAt: Date,
    overrides: Record<string, unknown> = {},
  ) => ({
    organizationId,
    agreedTotalMinor: '12500',
    adjustmentReason: null,
    renewalStartsAt: renewalStartsAt.toISOString(),
    renewalEndsAt: renewalEndsAt.toISOString(),
    ...overrides,
  });

  const activeStart = new Date('2026-09-15T00:00:00.000Z');
  const activeEnd = new Date('2026-10-15T00:00:00.000Z');
  const renewedEnd = new Date('2026-11-15T00:00:00.000Z');
  const active = await createSubscription({
    name: 'STAGING RENEWAL ACTIVE', startsAt: activeStart, endsAt: activeEnd,
  });
  let activeRenewalId = '';

  await context.test('active renewal is operator-only, canonical, priced by the server, and period-safe', async () => {
    await assert.rejects(
      service.previewRenewal(active.subscriptionId, tenantAdminId),
      /Platform operator access required/,
    );
    const preview = await service.previewRenewal(active.subscriptionId, operatorId);
    assert.equal(preview.listSubtotalMinor, '12500');
    assert.equal(preview.listPricingSnapshot.complete, true);
    assert.equal(preview.suggestedRenewalStartsAt, activeEnd.toISOString());
    assert.equal((await database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM commercial_renewals',
    )).rows[0]?.count, '0');
    await assert.rejects(
      service.finalizeRenewal(
        active.subscriptionId,
        tenantAdminId,
        inputFor(active.organizationId, activeEnd, renewedEnd),
      ),
      /Platform operator access required/,
    );
    await assert.rejects(
      service.finalizeRenewal(
        randomUUID(),
        operatorId,
        inputFor(active.organizationId, activeEnd, renewedEnd),
      ),
      /Subscription not found/,
    );
    await assert.rejects(
      service.finalizeRenewal(
        active.subscriptionId,
        operatorId,
        inputFor(randomUUID(), activeEnd, renewedEnd),
      ),
      /does not belong/,
    );
    await assert.rejects(
      service.finalizeRenewal(
        active.subscriptionId,
        operatorId,
        inputFor(active.organizationId, new Date('2026-10-16T00:00:00.000Z'), renewedEnd),
      ),
      /authoritative current-period end/,
    );
    await assert.rejects(
      service.finalizeRenewal(
        active.subscriptionId,
        operatorId,
        inputFor(active.organizationId, activeEnd, renewedEnd, {
          agreedTotalMinor: '12000', adjustmentReason: null,
        }),
      ),
      /price adjustment requires a reason/,
    );
    const bundle = await service.finalizeRenewal(
      active.subscriptionId,
      operatorId,
      inputFor(active.organizationId, activeEnd, renewedEnd),
    );
    activeRenewalId = bundle.renewal.id;
    assert.equal(bundle.renewal.renewalKind, 'continuous');
    assert.equal(bundle.renewal.status, 'awaiting_payment');
    assert.equal(bundle.renewal.listSubtotalMinor, '12500');
    assert.equal(bundle.renewal.listPricingSnapshot.complete, true);
    assert.equal(bundle.renewal.listPricingSnapshot.items.length, 2);
    assert.equal(bundle.renewal.selectedPlanKey, 'pilot-core');
    assert.deepEqual(bundle.renewal.selectedAddOnKeys, ['module-inventory']);
    const unchanged = await database.query<{ starts_at: Date; current_period_ends_at: Date }>(`
      SELECT starts_at, current_period_ends_at FROM subscriptions WHERE id = $1
    `, [active.subscriptionId]);
    assert.equal(unchanged.rows[0]?.starts_at.toISOString(), activeStart.toISOString());
    assert.equal(unchanged.rows[0]?.current_period_ends_at.toISOString(), activeEnd.toISOString());
    await assert.rejects(
      service.finalizeRenewal(
        active.subscriptionId,
        operatorId,
        inputFor(active.organizationId, activeEnd, renewedEnd),
      ),
      /actionable renewal already exists/,
    );
    await assert.rejects(
      service.listOperatorQueue(tenantAdminId, 'all', 1, 10),
      /Platform operator access required/,
    );
    const queue = await service.listOperatorQueue(operatorId, 'in_progress', 1, 50);
    const queueItem = queue.items.find(({ subscriptionId }) => subscriptionId === active.subscriptionId);
    assert.ok(queueItem);
    assert.equal(queueItem.expired, false);
    assert.equal(queueItem.secondsUntilExpiry, 14 * 24 * 60 * 60);
  });

  await context.test('suspended, cancelled, and explicitly inactive subscriptions fail closed', async () => {
    for (const status of ['suspended', 'cancelled', 'inactive'] as const) {
      const blocked = await createSubscription({
        name: `STAGING RENEWAL ${status}`,
        status,
        startsAt: activeStart,
        endsAt: activeEnd,
      });
      await assert.rejects(
        service.finalizeRenewal(
          blocked.subscriptionId,
          operatorId,
          inputFor(blocked.organizationId, activeEnd, renewedEnd),
        ),
        new RegExp(`status ${status} requires explicit resolution`),
      );
    }
  });

  await context.test('missing public pricing requires an explicit negotiated reason', async () => {
    const manualPrice = await createSubscription({
      name: 'STAGING RENEWAL MANUAL PRICE',
      startsAt: activeStart,
      endsAt: activeEnd,
      planKey: null,
      addOnKeys: ['module-attendance'],
    });
    await assert.rejects(
      service.finalizeRenewal(
        manualPrice.subscriptionId,
        operatorId,
        inputFor(manualPrice.organizationId, activeEnd, renewedEnd, {
          agreedTotalMinor: '7000', adjustmentReason: null,
        }),
      ),
      /without complete public list pricing requires an explicit reason/,
    );
    const renewal = await service.finalizeRenewal(
      manualPrice.subscriptionId,
      operatorId,
      inputFor(manualPrice.organizationId, activeEnd, renewedEnd, {
        agreedTotalMinor: '7000', adjustmentReason: 'Explicit manually negotiated renewal',
      }),
    );
    assert.equal(renewal.renewal.listSubtotalMinor, null);
    assert.equal(renewal.renewal.listPricingSnapshot.complete, false);
    const cancelled = await service.cancelRenewal(
      renewal.renewal.id,
      operatorId,
      'Customer deferred the renewal',
    );
    assert.equal(cancelled.renewal.status, 'cancelled');
    await assert.rejects(
      service.applyRenewal(renewal.renewal.id, operatorId),
      /Cancelled renewal cannot be applied/,
    );
  });

  await context.test('renewal payments are partial, idempotent, exact, immutable, and safely voided', async () => {
    const firstKey = randomUUID();
    const firstPayment = {
      amountMinor: '5000', method: 'upi' as const, reference: 'RENEWAL-TEST-1',
      paidAt: now.toISOString(), idempotencyKey: firstKey,
    };
    await assert.rejects(
      service.recordPayment(activeRenewalId, tenantAdminId, firstPayment),
      /Platform operator access required/,
    );
    let bundle = await service.recordPayment(activeRenewalId, operatorId, firstPayment);
    const firstPaymentId = bundle.payments[0]!.id;
    assert.equal(bundle.confirmedTotalMinor, '5000');
    assert.equal(bundle.renewal.status, 'awaiting_payment');
    bundle = await service.recordPayment(activeRenewalId, operatorId, firstPayment);
    assert.equal(bundle.payments.length, 1);
    await assert.rejects(
      service.recordPayment(activeRenewalId, operatorId, { ...firstPayment, amountMinor: '5001' }),
      /idempotency key was already used/,
    );
    await assert.rejects(
      service.applyRenewal(activeRenewalId, operatorId),
      /exactly settled/,
    );
    await assert.rejects(
      service.recordPayment(activeRenewalId, operatorId, {
        ...firstPayment, amountMinor: '8000', idempotencyKey: randomUUID(),
      }),
      /exceed the exact agreed renewal total/,
    );
    bundle = await service.recordPayment(activeRenewalId, operatorId, {
      amountMinor: '7500', method: 'bank_transfer', reference: 'RENEWAL-TEST-2',
      paidAt: now.toISOString(), idempotencyKey: randomUUID(),
    });
    assert.equal(bundle.confirmedTotalMinor, '12500');
    assert.equal(bundle.renewal.status, 'paid');
    bundle = await service.voidPayment(
      activeRenewalId,
      firstPaymentId,
      operatorId,
      'Duplicate staging payment',
    );
    assert.equal(bundle.confirmedTotalMinor, '7500');
    assert.equal(bundle.renewal.status, 'awaiting_payment');
    const confirmedPaymentId = bundle.payments.find(({ status }) => status === 'confirmed')!.id;
    await assert.rejects(
      database.query('DELETE FROM manual_renewal_payments WHERE id = $1', [confirmedPaymentId]),
      /append-only/,
    );
    await assert.rejects(
      database.query('UPDATE manual_renewal_payments SET amount_minor = 1 WHERE id = $1', [confirmedPaymentId]),
      /immutable/,
    );
    bundle = await service.recordPayment(activeRenewalId, operatorId, {
      amountMinor: '5000', method: 'cash', reference: 'Replacement staging entry',
      paidAt: now.toISOString(), idempotencyKey: randomUUID(),
    });
    assert.equal(bundle.confirmedTotalMinor, '12500');
    assert.equal(bundle.renewal.status, 'paid');
  });

  await context.test('concurrent application extends the canonical subscription exactly once', async () => {
    const beforeEnd = await createEntitlementService(
      commercial,
      () => new Date(activeEnd.getTime() - 1),
    ).getEffective(active.organizationId);
    assert.equal(beforeEnd.subscription?.status, 'active');
    assert.equal(beforeEnd.modules.find(({ key }) => key === 'inventory')?.enabled, true);
    const atEnd = await createEntitlementService(commercial, () => activeEnd)
      .getEffective(active.organizationId);
    assert.equal(atEnd.subscription?.status, 'expired');
    assert.equal(atEnd.modules.every(({ enabled }) => !enabled), true);

    const results = await Promise.all([
      service.applyRenewal(activeRenewalId, operatorId),
      service.applyRenewal(activeRenewalId, operatorId),
    ]);
    assert.ok(results.every(({ renewal }) => renewal.status === 'applied'));
    const subscription = await database.query<{
      status: string; source: string; starts_at: Date; current_period_ends_at: Date;
      add_on_starts_at: Date; add_on_ends_at: Date;
    }>(`
      SELECT s.status, s.source, s.starts_at, s.current_period_ends_at,
        MIN(sa.starts_at) AS add_on_starts_at, MAX(sa.ends_at) AS add_on_ends_at
      FROM subscriptions s
      JOIN subscription_add_ons sa ON sa.subscription_id = s.id
      WHERE s.id = $1
      GROUP BY s.id
    `, [active.subscriptionId]);
    assert.equal(subscription.rows[0]?.status, 'active');
    assert.equal(subscription.rows[0]?.source, 'manual');
    assert.equal(subscription.rows[0]?.starts_at.toISOString(), activeEnd.toISOString());
    assert.equal(subscription.rows[0]?.current_period_ends_at.toISOString(), renewedEnd.toISOString());
    assert.equal(subscription.rows[0]?.add_on_starts_at.toISOString(), activeEnd.toISOString());
    assert.equal(subscription.rows[0]?.add_on_ends_at.toISOString(), renewedEnd.toISOString());
    const eventCount = await database.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM commercial_renewal_events
      WHERE renewal_id = $1 AND action = 'renewal_applied'
    `, [activeRenewalId]);
    assert.equal(eventCount.rows[0]?.count, '1');
    await service.applyRenewal(activeRenewalId, operatorId);
    const after = await createEntitlementService(
      commercial,
      () => new Date('2026-10-20T00:00:00.000Z'),
    ).getEffective(active.organizationId);
    assert.equal(after.subscription?.status, 'active');
    assert.equal(after.modules.find(({ key }) => key === 'queue')?.enabled, true);
    assert.equal(after.modules.find(({ key }) => key === 'inventory')?.enabled, true);
    await assert.rejects(
      service.voidPayment(
        activeRenewalId,
        results[0]!.payments.find(({ status }) => status === 'confirmed')!.id,
        operatorId,
        'Too late to void',
      ),
      /cannot be voided after renewal application/,
    );
  });

  await context.test('expired subscription reactivation is explicit and restores entitlements safely', async () => {
    const expiredStart = new Date('2026-08-01T00:00:00.000Z');
    const expiredEnd = new Date('2026-09-01T00:00:00.000Z');
    const reactivatedEnd = new Date('2026-11-01T00:00:00.000Z');
    const expired = await createSubscription({
      name: 'STAGING RENEWAL EXPIRED', startsAt: expiredStart, endsAt: expiredEnd,
    });
    const before = await createEntitlementService(commercial, () => now)
      .getEffective(expired.organizationId);
    assert.equal(before.subscription?.status, 'expired');
    await assert.rejects(
      service.finalizeRenewal(
        expired.subscriptionId,
        operatorId,
        inputFor(expired.organizationId, expiredEnd, reactivatedEnd, {
          agreedTotalMinor: '0', adjustmentReason: 'Complimentary reactivation test',
        }),
      ),
      /cannot be backdated/,
    );
    const renewal = await service.finalizeRenewal(
      expired.subscriptionId,
      operatorId,
      inputFor(expired.organizationId, now, reactivatedEnd, {
        agreedTotalMinor: '0', adjustmentReason: 'Complimentary reactivation test',
      }),
    );
    assert.equal(renewal.renewal.renewalKind, 'reactivation');
    assert.equal(renewal.renewal.status, 'paid');
    const applied = await service.applyRenewal(renewal.renewal.id, operatorId);
    assert.equal(applied.renewal.status, 'applied');
    const effective = await createEntitlementService(
      commercial,
      () => new Date('2026-10-15T00:00:00.000Z'),
    ).getEffective(expired.organizationId);
    assert.equal(effective.subscription?.status, 'active');
    assert.equal(effective.modules.find(({ key }) => key === 'inventory')?.enabled, true);
    const reactivationEvent = await database.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM commercial_renewal_events
      WHERE renewal_id = $1 AND action = 'subscription_reactivated'
    `, [renewal.renewal.id]);
    assert.equal(reactivationEvent.rows[0]?.count, '1');
  });

  await context.test('application rollback leaves subscription and renewal unchanged', async () => {
    const rollbackEnd = new Date('2026-10-20T00:00:00.000Z');
    const rollbackRenewedEnd = new Date('2026-11-20T00:00:00.000Z');
    const rollback = await createSubscription({
      name: 'STAGING RENEWAL ROLLBACK', startsAt: activeStart, endsAt: rollbackEnd,
    });
    const renewal = await service.finalizeRenewal(
      rollback.subscriptionId,
      operatorId,
      inputFor(rollback.organizationId, rollbackEnd, rollbackRenewedEnd, {
        agreedTotalMinor: '0', adjustmentReason: 'FORCE_ROLLBACK_TEST',
      }),
    );
    await database.query(`
      CREATE FUNCTION ekavio_test_fail_renewal_apply()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.adjustment_reason = 'FORCE_ROLLBACK_TEST' AND NEW.status = 'applied' THEN
          RAISE EXCEPTION 'forced renewal apply rollback';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await database.query(`
      CREATE TRIGGER commercial_renewals_test_rollback
      BEFORE UPDATE ON commercial_renewals
      FOR EACH ROW EXECUTE FUNCTION ekavio_test_fail_renewal_apply()
    `);
    await assert.rejects(
      service.applyRenewal(renewal.renewal.id, operatorId),
      /forced renewal apply rollback/,
    );
    await database.query('DROP TRIGGER commercial_renewals_test_rollback ON commercial_renewals');
    await database.query('DROP FUNCTION ekavio_test_fail_renewal_apply()');
    const subscription = await database.query<{ current_period_ends_at: Date }>(`
      SELECT current_period_ends_at FROM subscriptions WHERE id = $1
    `, [rollback.subscriptionId]);
    assert.equal(subscription.rows[0]?.current_period_ends_at.toISOString(), rollbackEnd.toISOString());
    const unchanged = await service.getRenewal(renewal.renewal.id, operatorId);
    assert.equal(unchanged.renewal.status, 'paid');
    assert.equal(unchanged.renewal.appliedAt, null);
  });

  await context.test('concurrent finalization creates one actionable renewal for a period', async () => {
    const targetEnd = new Date('2026-10-25T00:00:00.000Z');
    const targetRenewedEnd = new Date('2026-11-25T00:00:00.000Z');
    const target = await createSubscription({
      name: 'STAGING RENEWAL CONCURRENCY', startsAt: activeStart, endsAt: targetEnd,
    });
    const results = await Promise.allSettled([
      service.finalizeRenewal(
        target.subscriptionId,
        operatorId,
        inputFor(target.organizationId, targetEnd, targetRenewedEnd),
      ),
      service.finalizeRenewal(
        target.subscriptionId,
        operatorId,
        inputFor(target.organizationId, targetEnd, targetRenewedEnd),
      ),
    ]);
    assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.equal(results.filter(({ status }) => status === 'rejected').length, 1);
    const count = await database.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM commercial_renewals
      WHERE subscription_id = $1 AND status IN ('awaiting_payment', 'paid')
    `, [target.subscriptionId]);
    assert.equal(count.rows[0]?.count, '1');
  });

  await context.test('tenant renewal history is scoped and events contain no payment secrets', async () => {
    const own = await service.getCustomerRenewals(active.organizationId);
    assert.equal(own.length, 1);
    assert.equal(own[0]?.renewal.status, 'applied');
    assert.equal(JSON.stringify(own).includes(operatorId), false);
    assert.deepEqual(await service.getCustomerRenewals(randomUUID()), []);
    const events = await database.query<{ action: string; details: unknown }>(`
      SELECT action, details FROM commercial_renewal_events
      WHERE renewal_id = $1 ORDER BY occurred_at, id
    `, [activeRenewalId]);
    for (const action of [
      'renewal_created', 'renewal_finalized', 'payment_recorded', 'payment_voided',
      'renewal_paid', 'renewal_applied',
    ]) assert.ok(events.rows.some((event) => event.action === action), action);
    const serialized = JSON.stringify(events.rows);
    for (const forbidden of ['upiPin', 'bankPassword', 'Authorization', 'Cookie', 'DATABASE_URL']) {
      assert.equal(serialized.includes(forbidden), false);
    }
    await assert.rejects(
      database.query('DELETE FROM commercial_renewal_events WHERE renewal_id = $1', [activeRenewalId]),
      /append-only/,
    );
    await assert.rejects(
      database.query('DELETE FROM commercial_renewals WHERE id = $1', [activeRenewalId]),
      /history is append-only/,
    );
  });
});
