import { z } from 'zod';
import { subscriptionStatuses } from '../commercial/catalogue.js';

const operatorSources = ['manual', 'pilot', 'support'] as const;

const optionalIsoDate = z.iso.datetime({ offset: true }).optional();
const nullableIsoDate = z.iso.datetime({ offset: true }).nullable().optional();
const isAfter = (later: string, earlier: string): boolean =>
  new Date(later).getTime() > new Date(earlier).getTime();

const subscriptionAddOnSchema = z.object({
  key: z.string().trim().min(1),
  startsAt: optionalIsoDate,
  endsAt: optionalIsoDate,
}).superRefine((value, context) => {
  if (value.startsAt && value.endsAt && !isAfter(value.endsAt, value.startsAt)) {
    context.addIssue({ code: 'custom', path: ['endsAt'], message: 'must be after startsAt' });
  }
});

export const updateSubscriptionSchema = z.object({
  planKey: z.string().trim().min(1).nullable(),
  addOns: z.array(subscriptionAddOnSchema).default([]),
  status: z.enum(subscriptionStatuses),
  source: z.enum(operatorSources).default('manual'),
  startsAt: optionalIsoDate,
  currentPeriodEndsAt: nullableIsoDate,
  billingCycle: z.enum(['monthly', 'yearly']).nullable().optional(),
}).superRefine((value, context) => {
  if (
    value.startsAt &&
    value.currentPeriodEndsAt &&
    !isAfter(value.currentPeriodEndsAt, value.startsAt)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['currentPeriodEndsAt'],
      message: 'must be after startsAt',
    });
  }
});

export const upsertEntitlementSchema = z.object({
  effect: z.enum(['grant', 'revoke']),
  status: z.enum(['active', 'inactive']).default('active'),
  source: z.enum(operatorSources).default('manual'),
  reason: z.string().trim().min(1).max(500),
  validFrom: nullableIsoDate,
  validUntil: nullableIsoDate,
}).superRefine((value, context) => {
  if (value.validFrom && value.validUntil && !isAfter(value.validUntil, value.validFrom)) {
    context.addIssue({ code: 'custom', path: ['validUntil'], message: 'must be after validFrom' });
  }
});

export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
export type UpsertEntitlementInput = z.infer<typeof upsertEntitlementSchema>;
