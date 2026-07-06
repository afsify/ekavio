import { z } from 'zod';

export const addItemSchema = z.object({
  itemName: z.string({ message: 'Item name is required' }).min(1, 'Item name cannot be empty'),
  currentStock: z.number({ message: 'Current stock is required' }).min(0, 'Current stock cannot be negative'),
  lowStockThreshold: z.number({ message: 'Low stock threshold is required' }).min(0, 'Threshold cannot be negative'),
  price: z.number({ message: 'Price is required' }).min(0, 'Price cannot be negative'),
});
