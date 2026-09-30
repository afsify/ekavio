import { z } from 'zod';
import { parseInrPriceToMinor } from '../domains/inventory/money.js';
import { parseNonNegativeQuantity, parsePositiveQuantity } from '../domains/inventory/quantity.js';
import { inventoryUnits } from '../domains/inventory/units.js';

export const inventoryUnitCodes = inventoryUnits.map(({ code }) => code) as [
  (typeof inventoryUnits)[number]['code'],
  ...(typeof inventoryUnits)[number]['code'][],
];

const exactDecimal = (
  parser: (value: string) => unknown,
  fallback: string,
) => z.string().trim().min(1).max(32).superRefine((value, context) => {
  try {
    parser(value);
  } catch (error) {
    context.addIssue({
      code: 'custom',
      message: error instanceof Error ? error.message : fallback,
    });
  }
});

const nonNegativeQuantity = exactDecimal(parseNonNegativeQuantity, 'Invalid stock quantity');
const positiveQuantity = exactDecimal(parsePositiveQuantity, 'Invalid stock quantity');
const price = exactDecimal(parseInrPriceToMinor, 'Invalid INR price');

const occurredAt = z.string().trim().max(35).refine((value) => (
  /(Z|[+-]\d{2}:\d{2})$/i.test(value) && !Number.isNaN(new Date(value).getTime())
), 'must be an ISO timestamp with an explicit offset');

const optionalCode = z.string().trim().min(1).max(100).nullable().optional();

export const addItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sku: optionalCode,
  barcode: optionalCode,
  unitCode: z.enum(inventoryUnitCodes),
  price: price.nullable().optional(),
  currency: z.literal('INR').default('INR'),
  reorderThreshold: nonNegativeQuantity.default('0'),
  openingQuantity: nonNegativeQuantity.optional(),
  occurredAt: occurredAt.optional(),
  idempotencyKey: z.string().trim().min(1).max(128),
}).strict();

export const updateInventoryItemSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  sku: optionalCode,
  barcode: optionalCode,
  unitCode: z.enum(inventoryUnitCodes).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  price: price.nullable().optional(),
  reorderThreshold: nonNegativeQuantity.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one inventory item field is required',
});

const stockCommandBase = {
  quantity: positiveQuantity,
  occurredAt: occurredAt.optional(),
  idempotencyKey: z.string().trim().min(1).max(128),
};

export const receiveStockSchema = z.object({
  ...stockCommandBase,
  reason: z.string().trim().max(1000).nullable().optional(),
  reference: z.string().trim().min(1).max(128).nullable().optional(),
}).strict();

export const consumeStockSchema = z.object({
  ...stockCommandBase,
  reason: z.string().trim().min(3).max(1000),
  reference: z.string().trim().min(1).max(128).nullable().optional(),
}).strict();

export const adjustStockSchema = z.object({
  ...stockCommandBase,
  direction: z.enum(['increase', 'decrease']),
  reason: z.string().trim().min(3).max(1000),
  reference: z.string().trim().min(1).max(128).nullable().optional(),
}).strict();

export const reverseStockMovementSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
  occurredAt: occurredAt.optional(),
  idempotencyKey: z.string().trim().min(1).max(128),
}).strict();

export const inventoryListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
}).strict();

export const inventoryMovementListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
}).strict();

export type AddInventoryItemInput = z.infer<typeof addItemSchema>;
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;
export type ReceiveStockInput = z.infer<typeof receiveStockSchema>;
export type ConsumeStockInput = z.infer<typeof consumeStockSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type ReverseStockMovementInput = z.infer<typeof reverseStockMovementSchema>;
export type InventoryListQuery = z.infer<typeof inventoryListQuerySchema>;
export type InventoryMovementListQuery = z.infer<typeof inventoryMovementListQuerySchema>;
