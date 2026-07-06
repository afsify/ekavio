import { z } from 'zod';

export const registerSchema = z.object({
  orgName: z.string({ message: 'Organization name is required' }).min(1, 'Organization name cannot be empty'),
  orgType: z.string({ message: 'Organization type is required' }).min(1, 'Organization type cannot be empty'),
  userName: z.string({ message: 'User name is required' }).min(1, 'User name cannot be empty'),
  phone: z.string({ message: 'Phone is required' }).min(1, 'Phone cannot be empty'),
  password: z.string({ message: 'Password is required' }).min(6, 'Password must be at least 6 characters'),
});

export const loginSchema = z.object({
  phone: z.string({ message: 'Phone is required' }).min(1, 'Phone cannot be empty'),
  password: z.string({ message: 'Password is required' }).min(1, 'Password cannot be empty'),
});
