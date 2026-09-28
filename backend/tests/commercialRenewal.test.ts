import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCommercialRenewalSchema,
  cancelCommercialRenewalSchema,
  commercialRenewalQueueQuerySchema,
  finalizeCommercialRenewalSchema,
  recordRenewalPaymentSchema,
  voidRenewalPaymentSchema,
} from '../src/schemas/commercialRenewalSchemas.js';

const validRenewal = {
  organizationId: '7d9e36f2-5814-4d10-9450-2d0d59ea1585',
  agreedTotalMinor: '12500',
  adjustmentReason: null,
  renewalStartsAt: '2026-11-01T00:00:00.000Z',
  renewalEndsAt: '2026-12-01T00:00:00.000Z',
};

test('renewal finalization accepts exact integer money and exact reviewed periods only', () => {
  assert.equal(finalizeCommercialRenewalSchema.safeParse(validRenewal).success, true);
  assert.equal(finalizeCommercialRenewalSchema.safeParse({
    ...validRenewal, agreedTotalMinor: '-1',
  }).success, false);
  assert.equal(finalizeCommercialRenewalSchema.safeParse({
    ...validRenewal, agreedTotalMinor: '1.5',
  }).success, false);
  assert.equal(finalizeCommercialRenewalSchema.safeParse({
    ...validRenewal, agreedTotalMinor: '0', adjustmentReason: null,
  }).success, false);
  assert.equal(finalizeCommercialRenewalSchema.safeParse({
    ...validRenewal, renewalEndsAt: validRenewal.renewalStartsAt,
  }).success, false);
  assert.equal(finalizeCommercialRenewalSchema.safeParse({
    ...validRenewal, listSubtotalMinor: '1',
  }).success, false);
  assert.equal(finalizeCommercialRenewalSchema.safeParse({
    ...validRenewal, planKey: 'client-controlled-plan',
  }).success, false);
});

test('renewal payment inputs are strict and reject sensitive or non-manual fields', () => {
  const payment = {
    amountMinor: '5000',
    method: 'upi',
    reference: 'SAFE-REFERENCE',
    paidAt: '2026-10-01T08:00:00.000Z',
    idempotencyKey: '70b8783a-ddd8-4773-a423-5c5b346593ea',
  };
  assert.equal(recordRenewalPaymentSchema.safeParse(payment).success, true);
  assert.equal(recordRenewalPaymentSchema.safeParse({ ...payment, amountMinor: '0' }).success, false);
  assert.equal(recordRenewalPaymentSchema.safeParse({ ...payment, method: 'card' }).success, false);
  for (const sensitive of ['upiPin', 'cardNumber', 'cvv', 'bankPassword', 'otp']) {
    assert.equal(recordRenewalPaymentSchema.safeParse({ ...payment, [sensitive]: 'secret' }).success, false);
  }
  assert.equal(voidRenewalPaymentSchema.safeParse({ reason: 'Duplicate entry' }).success, true);
  assert.equal(voidRenewalPaymentSchema.safeParse({ reason: '' }).success, false);
});

test('renewal action and queue schemas expose only the intended deterministic boundary', () => {
  assert.equal(applyCommercialRenewalSchema.safeParse({}).success, true);
  assert.equal(applyCommercialRenewalSchema.safeParse({ force: true }).success, false);
  assert.equal(cancelCommercialRenewalSchema.safeParse({ reason: 'Customer deferred renewal' }).success, true);
  assert.equal(cancelCommercialRenewalSchema.safeParse({ reason: 'x' }).success, false);
  assert.deepEqual(commercialRenewalQueueQuerySchema.parse({}), {
    view: 'due', page: 1, limit: 25,
  });
  assert.equal(commercialRenewalQueueQuerySchema.safeParse({ view: 'unknown' }).success, false);
  assert.equal(commercialRenewalQueueQuerySchema.safeParse({ limit: '101' }).success, false);
});
