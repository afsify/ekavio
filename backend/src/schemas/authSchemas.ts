import { z } from 'zod';
import { passwordSchema } from '../services/identityPolicy.js';

export const registerSchema = z.object({
  orgName: z.string({ message: 'Organization name is required' }).min(1, 'Organization name cannot be empty'),
  orgType: z.string({ message: 'Organization type is required' }).min(1, 'Organization type cannot be empty'),
  userName: z.string({ message: 'User name is required' }).min(1, 'User name cannot be empty'),
  phone: z.string({ message: 'Phone is required' }).min(1, 'Phone cannot be empty'),
  password: passwordSchema,
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(254).optional(),
  phone: z.string().trim().min(1).max(254).optional(),
  password: z.string().min(1).max(1024),
}).strict().refine((value) => Boolean(value.identifier) !== Boolean(value.phone), 'Supply exactly one identifier or legacy phone field');

export const updateThemeSchema = z.object({
  mode: z.enum(['light', 'dark']).optional(),
  primaryColor: z.string().optional(),
});
