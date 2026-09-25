import { z } from 'zod';

export const billingCycles = ['monthly', 'yearly'] as const;
export const offerTypes = ['plan', 'add_on'] as const;
export const accessRequestStatuses = [
  'pending',
  'contacted',
  'approved',
  'rejected',
  'activated',
] as const;

const offerKey = z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9-]*$/);
const selectedAddOns = z.array(offerKey).max(8).default([]);

export const publicQuoteSchema = z.object({
  billingCycle: z.enum(billingCycles),
  planKey: offerKey.nullable().optional(),
  addOnKeys: selectedAddOns,
}).strict().superRefine((value, context) => {
  if (!value.planKey && value.addOnKeys.length === 0) {
    context.addIssue({ code: 'custom', path: ['addOnKeys'], message: 'Select at least one offer' });
  }
  if (new Set(value.addOnKeys).size !== value.addOnKeys.length) {
    context.addIssue({ code: 'custom', path: ['addOnKeys'], message: 'Duplicate add-ons are not allowed' });
  }
});

export const publicAccessRequestSchema = z.object({
  businessName: z.string().trim().min(2).max(160),
  businessType: z.string().trim().min(2).max(80),
  contactName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(32),
  email: z.string().trim().email().max(254).optional(),
  billingCycle: z.enum(billingCycles),
  planKey: offerKey.nullable().optional(),
  addOnKeys: selectedAddOns,
  note: z.string().trim().max(500).optional(),
}).strict().superRefine((value, context) => {
  if (!value.planKey && value.addOnKeys.length === 0) {
    context.addIssue({ code: 'custom', path: ['addOnKeys'], message: 'Select at least one offer' });
  }
  if (new Set(value.addOnKeys).size !== value.addOnKeys.length) {
    context.addIssue({ code: 'custom', path: ['addOnKeys'], message: 'Duplicate add-ons are not allowed' });
  }
});

const minorUnitAmount = z.string().regex(/^(0|[1-9][0-9]{0,12})$/, {
  message: 'must be a non-negative integer minor-unit string',
});

export const publicPricingUpdateSchema = z.object({
  currency: z.literal('INR'),
  monthlyPriceMinor: minorUnitAmount.nullable(),
  yearlyPriceMinor: minorUnitAmount.nullable(),
  published: z.boolean(),
  displayOrder: z.number().int().min(0).max(10000),
  marketingLabel: z.string().trim().min(1).max(80).nullable(),
}).strict().superRefine((value, context) => {
  if (value.published && value.monthlyPriceMinor === null && value.yearlyPriceMinor === null) {
    context.addIssue({
      code: 'custom',
      path: ['published'],
      message: 'Published pricing requires at least one billing-cycle amount',
    });
  }
});

export const operatorAccessRequestUpdateSchema = z.object({
  status: z.enum(['contacted', 'approved', 'rejected']).optional(),
  internalNote: z.string().trim().max(1000).nullable().optional(),
}).strict().refine(
  (value) => value.status !== undefined || value.internalNote !== undefined,
  { message: 'Provide a status or internal note' },
);

export const operatorAccessRequestListQuerySchema = z.object({
  status: z.enum(accessRequestStatuses).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export type BillingCycle = (typeof billingCycles)[number];
export type OfferType = (typeof offerTypes)[number];
export type AccessRequestStatus = (typeof accessRequestStatuses)[number];
export type PublicQuoteInput = z.infer<typeof publicQuoteSchema>;
export type PublicAccessRequestInput = z.infer<typeof publicAccessRequestSchema>;
export type PublicPricingUpdateInput = z.infer<typeof publicPricingUpdateSchema>;
export type OperatorAccessRequestUpdateInput = z.infer<typeof operatorAccessRequestUpdateSchema>;
