import assert from 'node:assert/strict';
import test from 'node:test';
import {
  legacyNumberToInrPriceMinor,
  parseInrPriceToMinor,
} from '../src/domains/inventory/money.js';
import {
  legacyNumberToQuantity,
  parseNonNegativeQuantity,
  parsePositiveQuantity,
} from '../src/domains/inventory/quantity.js';
import { inventoryUnits } from '../src/domains/inventory/units.js';
import {
  addItemSchema,
  adjustStockSchema,
  consumeStockSchema,
  receiveStockSchema,
} from '../src/schemas/inventorySchemas.js';

test('Inventory quantities use exact NUMERIC(18,3) decimal-string semantics', () => {
  assert.equal(parsePositiveQuantity('1'), '1.000');
  assert.equal(parsePositiveQuantity('1.000'), '1.000');
  assert.equal(parsePositiveQuantity('0.001'), '0.001');
  assert.equal(parsePositiveQuantity('1.125'), '1.125');
  assert.equal(parsePositiveQuantity('999999999999999.999'), '999999999999999.999');
  assert.equal(parseNonNegativeQuantity('0'), '0.000');
  assert.equal(legacyNumberToQuantity(1.5), '1.500');
  assert.equal(legacyNumberToQuantity(0.125), '0.125');

  for (const value of ['0', '-1', '1.0001', 'NaN', 'Infinity', '1e3', '  ']) {
    assert.throws(() => parsePositiveQuantity(value), undefined, value);
  }
  assert.throws(() => parseNonNegativeQuantity('-0.001'));
  assert.throws(() => legacyNumberToQuantity(1.0005), /three-decimal precision/);
  assert.throws(() => legacyNumberToQuantity(Number.NaN));
});

test('Inventory prices use exact non-negative INR paise', () => {
  assert.equal(parseInrPriceToMinor('0'), 0n);
  assert.equal(parseInrPriceToMinor('0.01'), 1n);
  assert.equal(parseInrPriceToMinor('2.50'), 250n);
  assert.equal(parseInrPriceToMinor('92233720368547758.07'), 9_223_372_036_854_775_807n);
  assert.equal(legacyNumberToInrPriceMinor(2.5), 250n);
  assert.equal(legacyNumberToInrPriceMinor(99.99), 9999n);

  for (const value of ['-1', '1.001', 'NaN', 'Infinity', '1e3', '']) {
    assert.throws(() => parseInrPriceToMinor(value), undefined, value);
  }
  assert.throws(() => legacyNumberToInrPriceMinor(1.005), /two-decimal precision/);
});

test('Inventory schemas expose explicit units and typed stock commands', () => {
  assert.deepEqual(inventoryUnits.map(({ code }) => code), [
    'unit', 'piece', 'pack', 'box', 'kg', 'g', 'litre', 'ml',
  ]);
  const item = addItemSchema.parse({
    name: 'Sample item',
    unitCode: 'piece',
    price: '2.50',
    reorderThreshold: '1.125',
    openingQuantity: '10',
    idempotencyKey: 'item-create-1',
  });
  assert.equal(item.currency, 'INR');
  assert.equal('currentStock' in item, false);
  assert.equal(addItemSchema.safeParse({ ...item, unitCode: 'bucket' }).success, false);
  assert.equal(addItemSchema.safeParse({ ...item, currentStock: 5 }).success, false);
  assert.equal(receiveStockSchema.safeParse({ quantity: '1.125', idempotencyKey: 'r1' }).success, true);
  assert.equal(consumeStockSchema.safeParse({ quantity: '1', reason: 'Used', idempotencyKey: 'c1' }).success, true);
  assert.equal(consumeStockSchema.safeParse({ quantity: '1', idempotencyKey: 'c1' }).success, false);
  assert.equal(adjustStockSchema.safeParse({
    direction: 'decrease', quantity: '1', reason: 'Count correction', idempotencyKey: 'a1',
  }).success, true);
});
