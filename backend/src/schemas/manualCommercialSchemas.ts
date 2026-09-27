import { z } from 'zod';
import { billingCycles } from './publicCommercialSchemas.js';

export const agreementStatuses = [
  'awaiting_payment',
  'paid',
  'onboarding_pending',
  'activated',
  'cancelled',
] as const;
export const manualPaymentMethods = ['upi', 'bank_transfer', 'cash', 'other'] as const;
export const manualPaymentStatuses = ['confirmed', 'void'] as const;

const offerKey = z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9-]*$/);
const minorUnitAmount = z.string().regex(/^(0|[1-9][0-9]{0,12})$/, {
  message: 'must be a non-negative integer minor-unit string',
});
const positiveMinorUnitAmount = z.string().regex(/^[1-9][0-9]{0,12}$/, {
  message: 'must be a positive integer minor-unit string',
});
const optionalText = (maximum: number) => z.string().trim().min(1).max(maximum).nullable().optional();
const isoDateTime = z.iso.datetime({ offset: true });
const isAfter = (later: string, earlier: string): boolean =>
  new Date(later).getTime() > new Date(earlier).getTime();

export const billingProfileInputSchema = z.object({
  legalName: z.string().trim().min(2).max(160),
  contactName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(32),
  email: z.string().trim().email().max(254).nullable().optional(),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(100),
  state: optionalText(100),
  postalCode: optionalText(20),
  gstin: z.string().trim().toUpperCase()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/)
    .nullable().optional(),
}).strict();

export const finalizeAgreementSchema = z.object({
  billingCycle: z.enum(billingCycles),
  planKey: offerKey.nullable().optional(),
  addOnKeys: z.array(offerKey).max(8).default([]),
  agreedTotalMinor: minorUnitAmount,
  adjustmentReason: z.string().trim().min(3).max(500).nullable().optional(),
  startsAt: isoDateTime,
  currentPeriodEndsAt: isoDateTime,
  billingProfile: billingProfileInputSchema,
}).strict().superRefine((value, context) => {
  if (!value.planKey && value.addOnKeys.length === 0) {
    context.addIssue({ code: 'custom', path: ['addOnKeys'], message: 'Select at least one offer' });
  }
  if (new Set(value.addOnKeys).size !== value.addOnKeys.length) {
    context.addIssue({ code: 'custom', path: ['addOnKeys'], message: 'Duplicate add-ons are not allowed' });
  }
  if (!isAfter(value.currentPeriodEndsAt, value.startsAt)) {
    context.addIssue({
      code: 'custom',
      path: ['currentPeriodEndsAt'],
      message: 'must be after startsAt',
    });
  }
  if (value.agreedTotalMinor === '0' && !value.adjustmentReason) {
    context.addIssue({
      code: 'custom',
      path: ['adjustmentReason'],
      message: 'A complimentary agreement requires an explicit reason',
    });
  }
});

export const recordManualPaymentSchema = z.object({
  amountMinor: positiveMinorUnitAmount,
  method: z.enum(manualPaymentMethods),
  reference: optionalText(160),
  paidAt: isoDateTime,
  idempotencyKey: z.string().uuid(),
}).strict();

export const voidManualPaymentSchema = z.object({
  reason: z.string().trim().min(3).max(500),
}).strict();

export const revokeOnboardingInvitationSchema = z.object({
  reason: z.string().trim().min(3).max(500),
}).strict();

export const emptyCommercialActionSchema = z.object({}).strict();

const onboardingToken = z.string().min(43).max(128).regex(/^[A-Za-z0-9_-]+$/);

export const inspectOnboardingSchema = z.object({
  token: onboardingToken,
}).strict();

export const completeOnboardingSchema = z.object({
  token: onboardingToken,
  password: z.string().min(12, 'Password must be at least 12 characters').max(128),
  timezone: z.string().trim().min(1).max(100),
}).strict();

export type AgreementStatus = (typeof agreementStatuses)[number];
export type ManualPaymentMethod = (typeof manualPaymentMethods)[number];
export type ManualPaymentStatus = (typeof manualPaymentStatuses)[number];
export type BillingProfileInput = z.infer<typeof billingProfileInputSchema>;
export type FinalizeAgreementInput = z.infer<typeof finalizeAgreementSchema>;
export type RecordManualPaymentInput = z.infer<typeof recordManualPaymentSchema>;
