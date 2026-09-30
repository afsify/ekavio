import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PostgresInventoryRepository } from '../src/domains/inventory/repository.js';
import { PostgresDatabase } from '../src/postgres/database.js';
import { migrate } from '../src/postgres/migrations.js';
import { createInventoryService } from '../src/services/inventoryService.js';
import type { AuthorizationContext } from '../src/services/requestContextService.js';

test('V2-06E PostgreSQL Inventory invariants, isolation, idempotency, and concurrency', async (context) => {
  const adminUrl = process.env.POSTGRES_TEST_URL;
  assert.ok(adminUrl, 'POSTGRES_TEST_URL is required');
  const parsed = new URL(adminUrl);
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(parsed.hostname)
    || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(parsed.hostname));
  assert.equal(parsed.pathname, '/postgres');

  const databaseName = `ekavio_v206e_inventory_${randomUUID().replaceAll('-', '')}`;
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

  const now = new Date('2026-10-03T05:00:00.000Z');
  const organizationA = randomUUID();
  const organizationB = randomUUID();
  const branchA = randomUUID();
  const branchA2 = randomUUID();
  const branchAUnassigned = randomUUID();
  const branchB = randomUUID();
  await database.query(`
    INSERT INTO organizations
      (id, name, type, theme_mode, theme_primary_color, created_at, updated_at)
    VALUES
      ($1, 'Inventory Org A', 'shop', 'light', '#4F46E5', $3, $3),
      ($2, 'Inventory Org B', 'shop', 'light', '#4F46E5', $3, $3)
  `, [organizationA, organizationB, now]);
  await database.query(`
    INSERT INTO branches
      (id, organization_id, name, code, status, timezone, created_at, updated_at)
    VALUES
      ($1, $5, 'Main', 'main', 'active', 'Asia/Kolkata', $7, $7),
      ($2, $5, 'Second', 'second', 'active', 'UTC', $7, $7),
      ($3, $5, 'Unassigned', 'unassigned', 'active', 'UTC', $7, $7),
      ($4, $6, 'Foreign', 'foreign', 'active', 'UTC', $7, $7)
  `, [branchA, branchA2, branchAUnassigned, branchB, organizationA, organizationB, now]);
  const defaults = await database.query<{ branch_id: string }>(`
    SELECT branch_id FROM stock_locations WHERE is_default = TRUE AND status = 'active'
  `);
  assert.equal(defaults.rowCount, 4);

  const userA = randomUUID();
  const membershipA = randomUUID();
  const userB = randomUUID();
  const membershipB = randomUUID();
  await database.query(`
    INSERT INTO users (id, name, phone, password_hash, created_at, updated_at)
    VALUES
      ($1, 'Inventory Manager A', '+919876543210', NULL, $3, $3),
      ($2, 'Inventory Manager B', '+919876543211', NULL, $3, $3)
  `, [userA, userB, now]);
  await database.query(`
    INSERT INTO memberships (id, user_id, organization_id, role, status, created_at, updated_at)
    VALUES
      ($1, $3, $5, 'manager', 'active', $7, $7),
      ($2, $4, $6, 'manager', 'active', $7, $7)
  `, [membershipA, membershipB, userA, userB, organizationA, organizationB, now]);
  await database.query(`
    INSERT INTO membership_branch_assignments (membership_id, branch_id, organization_id)
    VALUES ($1, $2, $4), ($1, $3, $4), ($5, $6, $7)
  `, [membershipA, branchA, branchA2, organizationA, membershipB, branchB, organizationB]);

  const repository = new PostgresInventoryRepository(database);
  const service = createInventoryService(repository, () => now);
  const contextFor = (
    organizationId: string,
    branchId: string,
    membershipId = membershipA,
    userId = userA,
  ): AuthorizationContext => ({
    userId,
    sessionId: randomUUID(),
    organizationId,
    membershipId,
    branchId,
    role: 'manager',
    permissions: ['inventory.read', 'inventory.manage'],
    platformOperator: false,
  });
  const contextA = contextFor(organizationA, branchA);
  const contextA2 = contextFor(organizationA, branchA2);
  const contextB = contextFor(organizationB, branchB, membershipB, userB);

  const createItem = (
    key: string,
    overrides: Partial<Parameters<typeof service.createItem>[1]> = {},
  ) => service.createItem(contextA, {
    name: `Item ${key}`,
    unitCode: 'piece',
    price: '2.50',
    currency: 'INR',
    reorderThreshold: '5',
    openingQuantity: '10',
    idempotencyKey: key,
    ...overrides,
  });

  let sequenceItemId = '';
  let sequenceConsumeId = '';
  let sequenceReversalId = '';

  await context.test('catalogue creation and movement sequence maintain exact projected balance', async () => {
    const item = await createItem('sequence-item', { name: 'Sequence item', sku: 'SEQ-1' });
    sequenceItemId = item.id;
    assert.match(item.id, /^[0-9a-f-]{36}$/);
    assert.equal(item.priceMinor, '250');
    assert.equal(item.price, '2.50');
    assert.equal(item.quantity, '10.000');
    assert.equal(item.reorderThreshold, '5.000');
    assert.equal(item.unit.code, 'piece');
    assert.equal('_id' in item, false);
    assert.equal('currentStock' in item, false);

    const retry = await createItem('sequence-item', { name: 'Sequence item', sku: 'SEQ-1' });
    assert.equal(retry.id, item.id);
    await assert.rejects(
      createItem('sequence-item', { name: 'Different item', sku: 'SEQ-1' }),
      /idempotency key was used with a different command/,
    );

    await service.receive(contextA, item.id, {
      quantity: '5', reference: 'receipt-1', idempotencyKey: 'sequence-receive',
    });
    const consume = await service.consume(contextA, item.id, {
      quantity: '4', reason: 'Internal use', idempotencyKey: 'sequence-consume',
    });
    sequenceConsumeId = consume.id;
    await service.adjust(contextA, item.id, {
      direction: 'increase', quantity: '2', reason: 'Count correction',
      idempotencyKey: 'sequence-adjust-in',
    });
    await service.adjust(contextA, item.id, {
      direction: 'decrease', quantity: '3', reason: 'Damaged stock',
      idempotencyKey: 'sequence-adjust-out',
    });
    const reversal = await service.reverse(contextA, consume.id, {
      reason: 'Consumption was recorded against the wrong item',
      idempotencyKey: 'sequence-reverse-consume',
    });
    sequenceReversalId = reversal.id;
    assert.equal(reversal.quantityDelta, '4.000');
    assert.equal(reversal.reversesMovementId, consume.id);

    const current = await service.getItem(contextA, item.id);
    assert.equal(current.quantity, '14.000');
    const journal = await service.listMovements(contextA, item.id, { page: 1, limit: 100 });
    assert.equal(journal.total, 6);
    assert.ok(journal.data.some(({ id }) => id === consume.id));
    assert.ok(journal.data.some(({ id }) => id === reversal.id));
    const reconciliation = await database.query<{ balance: string; journal: string }>(`
      SELECT b.quantity::text AS balance, COALESCE(SUM(m.quantity_delta), 0)::text AS journal
      FROM stock_balances b
      LEFT JOIN stock_movements m ON m.item_id = b.item_id AND m.location_id = b.location_id
      WHERE b.item_id = $1 AND b.branch_id = $2
      GROUP BY b.quantity
    `, [item.id, branchA]);
    assert.deepEqual(reconciliation.rows[0], { balance: '14.000', journal: '14.000' });
  });

  await context.test('catalogue is organization-shared while quantities and journals remain branch-scoped', async () => {
    const branchA2Item = await service.getItem(contextA2, sequenceItemId);
    assert.equal(branchA2Item.id, sequenceItemId);
    assert.equal(branchA2Item.quantity, '0.000');
    assert.notEqual(branchA2Item.locationId, (await service.getItem(contextA, sequenceItemId)).locationId);
    assert.equal((await service.listMovements(contextA2, sequenceItemId, { page: 1, limit: 100 })).total, 0);
    await assert.rejects(service.reverse(contextA2, sequenceConsumeId, {
      reason: 'Cross branch attempt', idempotencyKey: 'cross-branch-reversal',
    }), /not found in the selected branch/);
    await assert.rejects(service.getItem(contextB, sequenceItemId), /Inventory item not found/);
    await assert.rejects(service.getItem(contextA, randomUUID()), /Inventory item not found/);
    const unassigned = contextFor(organizationA, branchAUnassigned);
    await assert.rejects(service.receive(unassigned, sequenceItemId, {
      quantity: '1', idempotencyKey: 'unassigned-receive',
    }), /actor must be active and assigned/);
  });

  await context.test('stock command idempotency is retry-safe and conflicting reuse fails', async () => {
    const input = { quantity: '1.125', reference: 'delivery-a', idempotencyKey: 'receive-retry' };
    const first = await service.receive(contextA, sequenceItemId, input);
    const retry = await service.receive(contextA, sequenceItemId, input);
    assert.equal(retry.id, first.id);
    await assert.rejects(
      service.receive(contextA, sequenceItemId, { ...input, quantity: '2.125' }),
      /idempotency key was used with a different command/,
    );
    const count = await database.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM stock_movements
      WHERE organization_id = $1 AND idempotency_key = 'receive-retry'
    `, [organizationA]);
    assert.equal(count.rows[0]?.count, '1');
  });

  await context.test('row locking prevents negative stock under concurrent consume and adjustment commands', async () => {
    const item = await createItem('concurrent-item', {
      name: 'Concurrent item', openingQuantity: '5', reorderThreshold: '0', sku: 'CON-1',
    });
    await assert.rejects(service.consume(contextA, item.id, {
      quantity: '6', reason: 'Too much', idempotencyKey: 'over-consume',
    }), /cannot make the balance negative/);
    assert.equal((await service.getItem(contextA, item.id)).quantity, '5.000');
    const attempts = await Promise.allSettled([
      service.consume(contextA, item.id, {
        quantity: '4', reason: 'Concurrent use', idempotencyKey: 'concurrent-consume',
      }),
      service.adjust(contextA, item.id, {
        direction: 'decrease', quantity: '4', reason: 'Concurrent count',
        idempotencyKey: 'concurrent-adjust',
      }),
    ]);
    assert.equal(attempts.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.equal(attempts.filter(({ status }) => status === 'rejected').length, 1);
    assert.equal((await service.getItem(contextA, item.id)).quantity, '1.000');
  });

  await context.test('concurrent receives serialize without losing exact quantity', async () => {
    const item = await createItem('receive-concurrency-item', {
      name: 'Receive concurrency', openingQuantity: '0', reorderThreshold: '0', sku: 'REC-1',
    });
    const results = await Promise.all([
      service.receive(contextA, item.id, { quantity: '0.125', idempotencyKey: 'receive-a' }),
      service.receive(contextA, item.id, { quantity: '0.875', idempotencyKey: 'receive-b' }),
    ]);
    assert.equal(new Set(results.map(({ id }) => id)).size, 2);
    assert.equal((await service.getItem(contextA, item.id)).quantity, '1.000');
  });

  await context.test('reversals are exact, single-use, non-recursive, concurrent-safe, and non-negative', async () => {
    await assert.rejects(service.reverse(contextA, sequenceReversalId, {
      reason: 'Cannot reverse a reversal', idempotencyKey: 'reversal-of-reversal',
    }), /cannot reverse another reversal/);
    await assert.rejects(service.reverse(contextA, sequenceConsumeId, {
      reason: 'Second reversal', idempotencyKey: 'duplicate-reversal',
    }), /already reversed/);

    const single = await createItem('reversal-concurrency-item', {
      name: 'Reversal concurrency', openingQuantity: '0', reorderThreshold: '0', sku: 'REV-1',
    });
    const received = await service.receive(contextA, single.id, {
      quantity: '5', idempotencyKey: 'reversal-receive',
    });
    const attempts = await Promise.allSettled([
      service.reverse(contextA, received.id, { reason: 'Correction A', idempotencyKey: 'reverse-a' }),
      service.reverse(contextA, received.id, { reason: 'Correction B', idempotencyKey: 'reverse-b' }),
    ]);
    assert.equal(attempts.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.equal(attempts.filter(({ status }) => status === 'rejected').length, 1);
    assert.equal((await service.getItem(contextA, single.id)).quantity, '0.000');

    const unsafe = await createItem('unsafe-reversal-item', {
      name: 'Unsafe reversal', openingQuantity: '0', reorderThreshold: '0', sku: 'REV-2',
    });
    const receipt = await service.receive(contextA, unsafe.id, {
      quantity: '10', idempotencyKey: 'unsafe-receive',
    });
    await service.consume(contextA, unsafe.id, {
      quantity: '6', reason: 'Used safely', idempotencyKey: 'unsafe-consume',
    });
    await assert.rejects(service.reverse(contextA, receipt.id, {
      reason: 'Would make negative', idempotencyKey: 'unsafe-reverse',
    }), /cannot make the balance negative/);
    assert.equal((await service.getItem(contextA, unsafe.id)).quantity, '4.000');
  });

  await context.test('catalogue constraints preserve identifiers, unit meaning, status, and history', async () => {
    await assert.rejects(createItem('duplicate-sku', {
      name: 'Duplicate SKU', sku: 'SEQ-1', openingQuantity: '0',
    }), /SKU is already used/);
    const barcodeItem = await createItem('barcode-item', {
      name: 'Barcode item', barcode: '890000000001', openingQuantity: '0', sku: null,
    });
    await assert.rejects(createItem('duplicate-barcode', {
      name: 'Duplicate barcode', barcode: '890000000001', openingQuantity: '0', sku: null,
    }), /Barcode is already used/);
    const duplicateName = await createItem('duplicate-name', {
      name: 'Barcode item', openingQuantity: '0', sku: null,
    });
    assert.notEqual(duplicateName.id, barcodeItem.id);

    await assert.rejects(
      service.updateItem(contextA, sequenceItemId, { unitCode: 'box' }),
      /unit cannot change after stock movement history exists/,
    );
    const updated = await service.updateItem(contextA, barcodeItem.id, {
      unitCode: 'box', price: '0.01', reorderThreshold: '2.125',
    });
    assert.equal(updated.unitCode, 'box');
    assert.equal(updated.priceMinor, '1');
    assert.equal(updated.reorderThreshold, '2.125');
    await service.updateItem(contextA, barcodeItem.id, { status: 'inactive' });
    await assert.rejects(service.receive(contextA, barcodeItem.id, {
      quantity: '1', idempotencyKey: 'inactive-receive',
    }), /Inactive inventory items/);

    const movement = (await service.listMovements(contextA, sequenceItemId, { page: 1, limit: 1 })).data[0];
    assert.ok(movement);
    await assert.rejects(
      database.query('UPDATE stock_movements SET quantity_delta = quantity_delta + 1 WHERE id = $1', [movement.id]),
      /append-only/,
    );
    await assert.rejects(
      database.query('DELETE FROM stock_movements WHERE id = $1', [movement.id]),
      /append-only/,
    );
    await assert.rejects(
      database.query('DELETE FROM inventory_items WHERE id = $1', [sequenceItemId]),
      /violates foreign key constraint/,
    );
  });

  await context.test('low-stock reporting is selected-branch and server authoritative', async () => {
    const lowA = await service.lowStock(contextA, { page: 1, limit: 100 });
    const lowA2 = await service.lowStock(contextA2, { page: 1, limit: 100 });
    assert.ok(lowA.data.every(({ branchId }) => branchId === branchA));
    assert.ok(lowA2.data.every(({ branchId }) => branchId === branchA2));
    assert.equal(lowA.total, await service.countLowStock(contextA));
    assert.equal(lowA2.total, await service.countLowStock(contextA2));
    assert.notEqual(lowA.total, 0);
  });
});
