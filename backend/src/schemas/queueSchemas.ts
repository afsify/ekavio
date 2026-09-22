import { z } from 'zod';

export const createTokenSchema = z.object({
  customerId: z.uuid(),
  serviceId: z.uuid(),
  providerMembershipId: z.uuid().nullable().optional(),
  idempotencyKey: z.string().trim().min(1).max(128).nullable().optional(),
}).strict();

export const updateTokenStatusSchema = z.object({
  status: z.enum(['waiting', 'serving', 'completed', 'cancelled'], {
    message: 'Status must be one of: waiting, serving, completed, cancelled',
  }),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().max(500).nullable().optional(),
}).strict();
