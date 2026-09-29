import { z } from 'zod';

export const attendanceStatuses = ['present', 'absent', 'half_day'] as const;

export const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() + 1 === month
    && parsed.getUTCDate() === day;
}, 'must be a valid YYYY-MM-DD calendar date');

const attendanceDateTime = z.string().trim().min(1).max(35).refine((value) => {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value)) return true;
  return !Number.isNaN(new Date(value).getTime()) && /(Z|[+-]\d{2}:\d{2})$/i.test(value);
}, 'must be an ISO instant or branch-local datetime');

const statusInput = z.enum(['present', 'absent', 'half_day', 'half-day'])
  .transform((value) => value === 'half-day' ? 'half_day' as const : value);

export const markAttendanceSchema = z.object({
  membershipId: z.string().uuid(),
  attendanceDate: businessDate,
  status: statusInput,
  checkInAt: attendanceDateTime.nullable().optional(),
  checkOutAt: attendanceDateTime.nullable().optional(),
  expectedVersion: z.number().int().positive().optional(),
  correctionReason: z.string().trim().min(3).max(500).optional(),
  idempotencyKey: z.string().trim().min(1).max(128).optional(),
}).strict().superRefine((value, context) => {
  if ((value.expectedVersion === undefined) !== (value.correctionReason === undefined)) {
    context.addIssue({
      code: 'custom',
      path: value.expectedVersion === undefined ? ['expectedVersion'] : ['correctionReason'],
      message: 'expectedVersion and correctionReason must be supplied together',
    });
  }
  if (value.status === 'absent' && (value.checkInAt != null || value.checkOutAt != null)) {
    context.addIssue({
      code: 'custom', path: ['status'], message: 'Absent attendance cannot contain times',
    });
  }
});

export const attendanceRosterQuerySchema = z.object({
  date: businessDate.optional(),
}).strict();

export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
