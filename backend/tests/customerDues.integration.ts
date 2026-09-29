import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PostgresCustomerRepository } from '../src/domains/customers/repository.js';
import { PostgresCustomerDuesRepository } from '../src/domains/customerDues/repository.js';
import { PostgresDatabase } from '../src/postgres/database.js';
import { migrate } from '../src/postgres/migrations.js';
import { createCustomerDuesService } from '../src/services/customerDuesService.js';
import type { AuthorizationContext } from '../src/services/requestContextService.js';

test('V2-06D PostgreSQL Customer Dues runtime invariants, isolation, and concurrency', async (context) => {
  const adminUrl = process.env.POSTGRES_TEST_URL;
  assert.ok(adminUrl, 'POSTGRES_TEST_URL is required');
  const parsed = new URL(adminUrl);
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(parsed.hostname)
    || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(parsed.hostname));
  assert.equal(parsed.pathname, '/postgres');

  const databaseName = `ekavio_v206d_dues_${randomUUID().replaceAll('-', '')}`;
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

  const now = new Date('2026-10-02T05:00:00.000Z');
  const organizationA = randomUUID();
  const organizationB = randomUUID();
  const branchA = randomUUID();
  const branchA2 = randomUUID();
  const branchB = randomUUID();
  await database.query(`
    INSERT INTO organizations
      (id, name, type, theme_mode, theme_primary_color, created_at, updated_at)
    VALUES
      ($1, 'Dues Org A', 'clinic', 'light', '#4F46E5', $3, $3),
      ($2, 'Dues Org B', 'clinic', 'light', '#4F46E5', $3, $3)
  `, [organizationA, organizationB, now]);
  await database.query(`
    INSERT INTO branches
      (id, organization_id, name, code, status, timezone, created_at, updated_at)
    VALUES
      ($1, $4, 'Main', 'main', 'active', 'Asia/Kolkata', $6, $6),
      ($2, $4, 'Second', 'second', 'active', 'UTC', $6, $6),
      ($3, $5, 'Foreign', 'foreign', 'active', 'UTC', $6, $6)
  `, [branchA, branchA2, branchB, organizationA, organizationB, now]);

  const userId = randomUUID();
  const actorMembershipId = randomUUID();
  await database.query(`
    INSERT INTO users (id, name, phone, password_hash, created_at, updated_at)
    VALUES ($1, 'Dues Manager', '+919876543210', NULL, $2, $2)
  `, [userId, now]);
  await database.query(`
    INSERT INTO memberships (id, user_id, organization_id, role, status, created_at, updated_at)
    VALUES ($1, $2, $3, 'manager', 'active', $4, $4)
  `, [actorMembershipId, userId, organizationA, now]);
  await database.query(`
    INSERT INTO membership_branch_assignments (membership_id, branch_id, organization_id)
    VALUES ($1, $2, $4), ($1, $3, $4)
  `, [actorMembershipId, branchA, branchA2, organizationA]);

  const customerA = randomUUID();
  const customerConcurrent = randomUUID();
  const customerB = randomUUID();
  await database.query(`
    INSERT INTO customers (id, organization_id, name, home_branch_id, status, created_at, updated_at)
    VALUES
      ($1, $4, 'Customer A', $5, 'active', $8, $8),
      ($2, $4, 'Concurrent Customer', $5, 'active', $8, $8),
      ($3, $6, 'Foreign Customer', $7, 'active', $8, $8)
  `, [customerA, customerConcurrent, customerB, organizationA, branchA, organizationB, branchB, now]);

  const repository = new PostgresCustomerDuesRepository(database);
  const customers = new PostgresCustomerRepository(database);
  const service = createCustomerDuesService(repository, customers, () => now);
  const contextFor = (branchId: string): AuthorizationContext => ({
    userId,
    sessionId: randomUUID(),
    organizationId: organizationA,
    membershipId: actorMembershipId,
    branchId,
    role: 'manager',
    permissions: ['ledger.read', 'ledger.manage'],
    platformOperator: false,
  });
  const contextA = contextFor(branchA);
  const contextA2 = contextFor(branchA2);

  const create = (entryType: 'charge' | 'payment' | 'adjustment_increase' | 'adjustment_decrease', amount: string, key: string, branchContext = contextA) =>
    service.create(branchContext, {
      customerId: customerA,
      entryType,
      amount,
      currency: 'INR',
      description: entryType.startsWith('adjustment_') ? `Reviewed ${entryType}` : null,
      idempotencyKey: key,
    });

  await context.test('exact signed journal sequence derives branch and organization balances', async () => {
    const charge = await create('charge', '1000.00', 'sequence-charge');
    assert.equal(charge.amountMinor, '100000');
    assert.equal(charge.signedEffectMinor, '100000');
    assert.equal(charge.amount, '1000.00');
    assert.equal(charge.signedAmount, '1000.00');
    assert.equal('sourceId' in charge, false);
    assert.equal('sourceType' in charge, false);
    assert.equal('createdByMembershipId' in charge, false);

    const payment = await create('payment', '300.00', 'sequence-payment');
    assert.equal(payment.signedEffectMinor, '-30000');
    const increase = await create('adjustment_increase', '100.00', 'sequence-inc');
    assert.equal(increase.signedEffectMinor, '10000');
    const decrease = await create('adjustment_decrease', '50.00', 'sequence-dec');
    assert.equal(decrease.signedEffectMinor, '-5000');
    const reversal = await service.reverse(contextA, payment.id, {
      description: 'Payment reference was incorrect',
      idempotencyKey: 'sequence-reverse-payment',
    });
    assert.equal(reversal.amountMinor, '30000');
    assert.equal(reversal.signedEffectMinor, '30000');
    assert.equal(reversal.reversesEntryId, payment.id);

    const balance = await service.balances(contextA, customerA);
    assert.equal(balance.organizationBalanceMinor, '105000');
    assert.equal(balance.branchBalanceMinor, '105000');
    assert.equal(balance.organizationBalance, '1050.00');
    const list = await service.list(contextA, { page: 1, limit: 3 });
    assert.equal(list.data.length, 3);
    assert.equal(list.total, 5);
    assert.equal(list.totalPages, 2);
    assert.ok(list.data.every(({ branchId }) => branchId === branchA));
  });

  await context.test('branch journal stays local while explicitly labelled customer balance aggregates branches', async () => {
    await create('charge', '25.00', 'second-branch-charge', contextA2);
    const listA = await service.list(contextA, { page: 1, limit: 100 });
    const listA2 = await service.list(contextA2, { page: 1, limit: 100 });
    assert.equal(listA.total, 5);
    assert.equal(listA2.total, 1);
    assert.ok(listA.data.every(({ branchId }) => branchId === branchA));
    assert.ok(listA2.data.every(({ branchId }) => branchId === branchA2));
    const balanceA = await service.balances(contextA, customerA);
    const balanceA2 = await service.balances(contextA2, customerA);
    assert.equal(balanceA.organizationBalanceMinor, '107500');
    assert.equal(balanceA.branchBalanceMinor, '105000');
    assert.equal(balanceA2.organizationBalanceMinor, '107500');
    assert.equal(balanceA2.branchBalanceMinor, '2500');

    const localDate = await service.list(contextA, {
      dateFrom: '2026-10-02', dateTo: '2026-10-02', page: 1, limit: 100,
    });
    assert.equal(localDate.total, 5);
    const nextDay = await service.list(contextA, {
      dateFrom: '2026-10-03', dateTo: '2026-10-03', page: 1, limit: 100,
    });
    assert.equal(nextDay.total, 0);
  });

  await context.test('idempotency is retry-safe and conflicting reuse fails', async () => {
    const input = {
      customerId: customerA,
      entryType: 'charge' as const,
      amount: '2.00',
      currency: 'INR' as const,
      description: 'Retry-safe charge',
      idempotencyKey: 'same-command',
    };
    const first = await service.create(contextA, input);
    const retry = await service.create(contextA, input);
    assert.equal(retry.id, first.id);
    await assert.rejects(
      service.create(contextA, { ...input, amount: '3.00' }),
      /idempotency key was used with a different command/,
    );
    const count = await database.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM customer_due_entries
      WHERE organization_id = $1 AND idempotency_key = 'same-command'
    `, [organizationA]);
    assert.equal(count.rows[0]?.count, '1');
  });

  await context.test('payment policy and advisory locking prevent concurrent overpayment', async () => {
    await service.create(contextA, {
      customerId: customerConcurrent, entryType: 'charge', amount: '100.00', currency: 'INR',
      idempotencyKey: 'concurrent-balance',
    });
    await assert.rejects(service.create(contextA, {
      customerId: customerConcurrent, entryType: 'payment', amount: '100.01', currency: 'INR',
      idempotencyKey: 'overpayment',
    }), /cannot exceed/);
    const payments = await Promise.allSettled([
      service.create(contextA, {
        customerId: customerConcurrent, entryType: 'payment', amount: '80.00', currency: 'INR',
        idempotencyKey: 'concurrent-payment-a',
      }),
      service.create(contextA, {
        customerId: customerConcurrent, entryType: 'payment', amount: '80.00', currency: 'INR',
        idempotencyKey: 'concurrent-payment-b',
      }),
    ]);
    assert.equal(payments.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.equal(payments.filter(({ status }) => status === 'rejected').length, 1);
    assert.equal((await service.balances(contextA, customerConcurrent)).organizationBalanceMinor, '2000');
  });

  await context.test('target locking and uniqueness allow exactly one concurrent reversal', async () => {
    const target = await service.create(contextA, {
      customerId: customerConcurrent, entryType: 'charge', amount: '10.00', currency: 'INR',
      idempotencyKey: 'reversal-target',
    });
    const reversals = await Promise.allSettled([
      service.reverse(contextA, target.id, { description: 'Duplicate correction A', idempotencyKey: 'reverse-a' }),
      service.reverse(contextA, target.id, { description: 'Duplicate correction B', idempotencyKey: 'reverse-b' }),
    ]);
    assert.equal(reversals.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.equal(reversals.filter(({ status }) => status === 'rejected').length, 1);
    const count = await database.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM customer_due_entries WHERE reverses_entry_id = $1
    `, [target.id]);
    assert.equal(count.rows[0]?.count, '1');
  });

  await context.test('tenant, branch, customer, actor, and guessed identifiers fail closed without leaking rows', async () => {
    await assert.rejects(
      service.balances(contextA, customerB), /Customer not found/,
    );
    await assert.rejects(
      service.balances(contextA, randomUUID()), /Customer not found/,
    );
    await assert.rejects(service.create(contextA, {
      customerId: customerB, entryType: 'charge', amount: '1.00', currency: 'INR',
      idempotencyKey: 'foreign-customer',
    }), /canonical customer/);
    await assert.rejects(service.create(contextA, {
      customerId: randomUUID(), entryType: 'charge', amount: '1.00', currency: 'INR',
      idempotencyKey: 'forged-customer',
    }), /canonical customer/);
    const branchATarget = (await service.list(contextA, { page: 1, limit: 1 })).data[0];
    assert.ok(branchATarget);
    await assert.rejects(service.reverse(contextA2, branchATarget.id, {
      description: 'Cross-branch attempt', idempotencyKey: 'cross-branch-reversal',
    }), /not found in the selected branch/);
    await assert.rejects(service.reverse(contextA, randomUUID(), {
      description: 'Forged identifier', idempotencyKey: 'forged-reversal',
    }), /not found in the selected branch/);
    const unassignedContext = { ...contextA, branchId: branchB };
    await assert.rejects(service.create(unassignedContext, {
      customerId: customerA, entryType: 'charge', amount: '1.00', currency: 'INR',
      idempotencyKey: 'unassigned-branch',
    }));
  });

  await context.test('database constraints preserve positive immutable history and exact reversal shape', async () => {
    const target = (await service.list(contextA, { page: 1, limit: 1 })).data[0];
    assert.ok(target);
    await assert.rejects(
      database.query('UPDATE customer_due_entries SET amount_minor = amount_minor + 1 WHERE id = $1', [target.id]),
      /append-only/,
    );
    await assert.rejects(
      database.query('DELETE FROM customer_due_entries WHERE id = $1', [target.id]),
      /append-only/,
    );
    await assert.rejects(database.query(`
      INSERT INTO customer_due_entries (
        organization_id, branch_id, customer_id, entry_type, amount_minor, currency,
        created_by_membership_id, idempotency_key, command_fingerprint
      ) VALUES ($1, $2, $3, 'charge', 0, 'INR', $4, 'zero-direct', $5)
    `, [organizationA, branchA, customerA, actorMembershipId, 'a'.repeat(64)]), /amount_minor/);
    const original = (await database.query<{ id: string; amount_minor: string }>(`
      SELECT id, amount_minor::text FROM customer_due_entries
      WHERE organization_id = $1 AND entry_type = 'charge' ORDER BY created_at LIMIT 1
    `, [organizationA])).rows[0];
    assert.ok(original);
    await assert.rejects(database.query(`
      INSERT INTO customer_due_entries (
        organization_id, branch_id, customer_id, entry_type, amount_minor, currency,
        description, reverses_entry_id, created_by_membership_id, idempotency_key, command_fingerprint
      ) VALUES ($1, $2, $3, 'reversal', $4::bigint + 1, 'INR', 'Invalid partial reversal', $5, $6, 'partial', $7)
    `, [organizationA, branchA, customerA, original.amount_minor, original.id, actorMembershipId, 'b'.repeat(64)]), /exact target magnitude/);
  });
});
