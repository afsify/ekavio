import { z } from 'zod';

export const addLedgerEntrySchema = z.object({
  customerName: z.string({ message: 'Customer name is required' }).min(1, 'Customer name cannot be empty'),
  phone: z.string({ message: 'Phone is required' }).min(1, 'Phone cannot be empty'),
  amount: z.number({ message: 'Amount is required' }).min(0, 'Amount cannot be negative'),
  type: z.enum(['credit', 'payment'], {
    message: 'Type must be one of: credit, payment',
  }),
  description: z.string().optional().default(''),
});
