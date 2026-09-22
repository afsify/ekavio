import { z } from 'zod';

const nullableText = (maximum: number) => z.string().trim().max(maximum).nullable().optional();

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: nullableText(40),
  notes: nullableText(2000),
}).strict();

export const updateCustomerSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  phone: nullableText(40),
  notes: nullableText(2000),
  status: z.enum(['active', 'inactive']).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const createServiceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: nullableText(2000),
  durationMinutes: z.number().int().positive().max(1440),
  priceMinor: z.string().regex(/^\d+$/).nullable().optional(),
  currency: z.string().regex(/^[A-Za-z]{3}$/).nullable().optional(),
}).strict();

export const updateServiceSchema = createServiceSchema.partial().extend({
  active: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const providerAssignmentSchema = z.object({
  membershipId: z.uuid(),
  active: z.boolean(),
}).strict();

export const createAppointmentSchema = z.object({
  customerId: z.uuid(),
  serviceId: z.uuid(),
  providerMembershipId: z.uuid().nullable().optional(),
  localStart: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/),
  notes: nullableText(2000),
  idempotencyKey: nullableText(128),
}).strict();

export const transitionAppointmentSchema = z.object({
  status: z.enum(['confirmed', 'completed', 'cancelled', 'no_show']),
  expectedVersion: z.number().int().positive(),
  reason: nullableText(500),
}).strict();

export const checkInAppointmentSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(128),
}).strict();
