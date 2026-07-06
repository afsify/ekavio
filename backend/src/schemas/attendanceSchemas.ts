import { z } from 'zod';

export const markAttendanceSchema = z.object({
  userId: z.string({ message: 'User ID is required' }).min(1, 'User ID cannot be empty'),
  date: z.union([z.string().min(1, 'Date cannot be empty'), z.date()], {
    message: 'Date is required',
  }).refine((val) => !isNaN(new Date(val).getTime()), {
    message: 'Invalid date format',
  }),
  status: z.enum(['present', 'absent', 'half-day'], {
    message: 'Status must be one of: present, absent, half-day',
  }),
});
