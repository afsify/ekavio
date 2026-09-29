import { z } from 'zod';
import { parseInrDecimalToMinor } from '../domains/customerDues/money.js';

export const customerDueEntryTypes = [
  'charge',
  'payment',
  'adjustment_increase',
  'adjustment_decrease',
  'reversal',
] as const;

const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() + 1 === month
    && parsed.getUTCDate() === day;
}, 'must be a valid YYYY-MM-DD date');

const occurredAt = z.string().trim().max(35).refine((value) => (
  /(Z|[+-]\d{2}:\d{2})$/i.test(value) && !Number.isNaN(new Date(value).getTime())
), 'must be an ISO timestamp with an explicit offset');

const amount = z.string().trim().min(1).max(32).superRefine((value, context) => {
  try {
    parseInrDecimalToMinor(value);
  } catch (error) {
    context.addIssue({
      code: 'custom',
      message: error instanceof Error ? error.message : 'Invalid INR amount',
    });
  }
});

export const createCustomerDueEntrySchema = z.object({
  customerId: z.uuid(),
  entryType: z.enum(['charge', 'payment', 'adjustment_increase', 'adjustment_decrease']),
  amount,
  currency: z.literal('INR').default('INR'),
  dueDate: businessDate.nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  occurredAt: occurredAt.optional(),
  idempotencyKey: z.string().trim().min(1).max(128),
}).strict().superRefine((value, context) => {
  if (value.entryType.startsWith('adjustment_') && (value.description?.length ?? 0) < 3) {
    context.addIssue({
      code: 'custom', path: ['description'],
      message: 'Adjustments require a reason of at least three characters',
    });
  }
});

export const reverseCustomerDueEntrySchema = z.object({
  description: z.string().trim().min(3).max(1000),
  occurredAt: occurredAt.optional(),
  idempotencyKey: z.string().trim().min(1).max(128),
}).strict();

export const customerDueListQuerySchema = z.object({
  customerId: z.uuid().optional(),
  entryType: z.enum(customerDueEntryTypes).optional(),
  dateFrom: businessDate.optional(),
  dateTo: businessDate.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
}).strict().refine(
  (value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo,
  { message: 'dateFrom must not be later than dateTo', path: ['dateFrom'] },
);

export const customerDueCustomerQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
}).strict();

export type CreateCustomerDueEntryInput = z.infer<typeof createCustomerDueEntrySchema>;
export type ReverseCustomerDueEntryInput = z.infer<typeof reverseCustomerDueEntrySchema>;
export type CustomerDueListQuery = z.infer<typeof customerDueListQuerySchema>;
