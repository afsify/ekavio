import { z } from 'zod';
import { manualPaymentMethods } from './manualCommercialSchemas.js';

export const commercialRenewalStatuses = [
  'awaiting_payment',
  'paid',
  'applied',
  'cancelled',
] as const;
export const commercialRenewalKinds = ['continuous', 'reactivation'] as const;
export const commercialRenewalQueueViews = [
  'due',
  'expired',
  'in_progress',
  'paid',
  'recent',
  'all',
] as const;

const minorUnitAmount = z.string().regex(/^(0|[1-9][0-9]{0,12})$/, {
  message: 'must be a non-negative integer minor-unit string',
});
const positiveMinorUnitAmount = z.string().regex(/^[1-9][0-9]{0,12}$/, {
  message: 'must be a positive integer minor-unit string',
});
const isoDateTime = z.iso.datetime({ offset: true });

export const finalizeCommercialRenewalSchema = z.object({
  organizationId: z.string().uuid(),
  agreedTotalMinor: minorUnitAmount,
  adjustmentReason: z.string().trim().min(3).max(500).nullable().optional(),
  renewalStartsAt: isoDateTime,
  renewalEndsAt: isoDateTime,
}).strict().superRefine((value, context) => {
  if (new Date(value.renewalEndsAt) <= new Date(value.renewalStartsAt)) {
    context.addIssue({
      code: 'custom',
      path: ['renewalEndsAt'],
      message: 'must be after renewalStartsAt',
    });
  }
  if (value.agreedTotalMinor === '0' && !value.adjustmentReason) {
    context.addIssue({
      code: 'custom',
      path: ['adjustmentReason'],
      message: 'A complimentary renewal requires an explicit reason',
    });
  }
});

export const recordRenewalPaymentSchema = z.object({
  amountMinor: positiveMinorUnitAmount,
  method: z.enum(manualPaymentMethods),
  reference: z.string().trim().min(1).max(160).nullable().optional(),
  paidAt: isoDateTime,
  idempotencyKey: z.string().uuid(),
}).strict();

export const voidRenewalPaymentSchema = z.object({
  reason: z.string().trim().min(3).max(500),
}).strict();

export const cancelCommercialRenewalSchema = z.object({
  reason: z.string().trim().min(3).max(500),
}).strict();

export const applyCommercialRenewalSchema = z.object({}).strict();

export const commercialRenewalQueueQuerySchema = z.object({
  view: z.enum(commercialRenewalQueueViews).default('due'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export type CommercialRenewalStatus = (typeof commercialRenewalStatuses)[number];
export type CommercialRenewalKind = (typeof commercialRenewalKinds)[number];
export type CommercialRenewalQueueView = (typeof commercialRenewalQueueViews)[number];
export type FinalizeCommercialRenewalInput = z.infer<typeof finalizeCommercialRenewalSchema>;
export type RecordRenewalPaymentInput = z.infer<typeof recordRenewalPaymentSchema>;
