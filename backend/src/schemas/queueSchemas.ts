import { z } from 'zod';

export const createTokenSchema = z.object({
  customerName: z.string({ message: 'Customer name is required' }).min(1, 'Customer name cannot be empty'),
  phone: z.string({ message: 'Phone is required' }).min(1, 'Phone cannot be empty'),
  serviceType: z.string({ message: 'Service type is required' }).min(1, 'Service type cannot be empty'),
});

export const updateTokenStatusSchema = z.object({
  status: z.enum(['waiting', 'serving', 'completed', 'cancelled'], {
    message: 'Status must be one of: waiting, serving, completed, cancelled',
  }),
});
