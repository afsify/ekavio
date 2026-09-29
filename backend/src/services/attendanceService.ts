import type {
  AttendanceChange,
  AttendanceRecord,
  AttendanceRosterEntry,
  PostgresAttendanceRepository,
} from '../domains/attendance/repository.js';
import {
  branchLocalDateTimeToInstant,
  instantToBranchBusinessDate,
  instantToBranchLocalDateTime,
} from '../domains/appointments/timezone.js';
import type { MarkAttendanceInput } from '../schemas/attendanceSchemas.js';
import type { AuthorizationContext } from './requestContextService.js';
import { AppError } from '../utils/AppError.js';

const branchIdFor = (context: AuthorizationContext): string => {
  if (!context.branchId) throw new AppError('An active branch context is required', 400);
  return context.branchId;
};

const mapAttendanceError = (error: unknown): AppError => {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : 'Attendance request failed';
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  if (code === '23505' || /version conflict|already owned|idempotency/i.test(message)) {
    return new AppError(message, 409);
  }
  if (['23503', '23514', '22P02'].includes(code)
    || /invalid|requires|must|cannot|assigned|business date|timezone/i.test(message)) {
    return new AppError(message, 400);
  }
  return new AppError('Attendance request failed safely', 500);
};

const resolveInstant = (
  value: string | null | undefined,
  timezone: string,
): Date | null => {
  if (value == null) return null;
  if (/(Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new AppError('Attendance time is invalid', 400);
    return parsed;
  }
  try {
    return branchLocalDateTimeToInstant(value, timezone);
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : 'Attendance time is invalid', 400);
  }
};

const serializeRecord = (record: AttendanceRecord, timezone: string) => ({
  ...record,
  checkInAt: record.checkInAt?.toISOString() ?? null,
  checkOutAt: record.checkOutAt?.toISOString() ?? null,
  checkInLocal: record.checkInAt ? instantToBranchLocalDateTime(record.checkInAt, timezone) : null,
  checkOutLocal: record.checkOutAt ? instantToBranchLocalDateTime(record.checkOutAt, timezone) : null,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

const serializeRosterEntry = (entry: AttendanceRosterEntry, timezone: string) => ({
  membershipId: entry.membershipId,
  displayName: entry.displayName,
  role: entry.role,
  membershipStatus: entry.membershipStatus,
  attendance: entry.attendance ? serializeRecord(entry.attendance, timezone) : null,
  correctionCount: entry.correctionCount,
});

const serializeChange = (change: AttendanceChange, timezone: string) => ({
  ...change,
  priorCheckInAt: change.priorCheckInAt?.toISOString() ?? null,
  newCheckInAt: change.newCheckInAt?.toISOString() ?? null,
  priorCheckOutAt: change.priorCheckOutAt?.toISOString() ?? null,
  newCheckOutAt: change.newCheckOutAt?.toISOString() ?? null,
  priorCheckInLocal: change.priorCheckInAt
    ? instantToBranchLocalDateTime(change.priorCheckInAt, timezone) : null,
  newCheckInLocal: change.newCheckInAt
    ? instantToBranchLocalDateTime(change.newCheckInAt, timezone) : null,
  priorCheckOutLocal: change.priorCheckOutAt
    ? instantToBranchLocalDateTime(change.priorCheckOutAt, timezone) : null,
  newCheckOutLocal: change.newCheckOutAt
    ? instantToBranchLocalDateTime(change.newCheckOutAt, timezone) : null,
  occurredAt: change.occurredAt.toISOString(),
});

export const createAttendanceService = (
  repository: PostgresAttendanceRepository,
  now: () => Date = () => new Date(),
) => ({
  async dailyRoster(context: AuthorizationContext, requestedDate?: string) {
    try {
      const branchId = branchIdFor(context);
      const branch = await repository.branchContext(context.organizationId, branchId);
      const attendanceDate = requestedDate
        ?? instantToBranchBusinessDate(now(), branch.timezone);
      const roster = await repository.listDailyRoster({
        organizationId: context.organizationId,
        branchId,
        attendanceDate,
      });
      const summary = roster.reduce((counts, entry) => {
        const key = entry.attendance?.status ?? 'unmarked';
        counts[key] += 1;
        return counts;
      }, { present: 0, absent: 0, half_day: 0, unmarked: 0 });
      return {
        attendanceDate,
        branch,
        summary: { total: roster.length, ...summary },
        roster: roster.map((entry) => serializeRosterEntry(entry, branch.timezone)),
      };
    } catch (error) {
      throw mapAttendanceError(error);
    }
  },

  async mark(context: AuthorizationContext, input: MarkAttendanceInput) {
    try {
      const branchId = branchIdFor(context);
      const branch = await repository.branchContext(context.organizationId, branchId);
      const checkInAt = resolveInstant(input.checkInAt, branch.timezone);
      const checkOutAt = resolveInstant(input.checkOutAt, branch.timezone);
      for (const instant of [checkInAt, checkOutAt]) {
        if (instant && instantToBranchBusinessDate(instant, branch.timezone) !== input.attendanceDate) {
          throw new AppError('Attendance time must belong to the selected branch business date', 400);
        }
      }
      if (checkInAt && checkOutAt && checkOutAt <= checkInAt) {
        throw new AppError('Attendance checkout must be later than check-in', 400);
      }
      const record = await repository.mark({
        organizationId: context.organizationId,
        branchId,
        membershipId: input.membershipId,
        attendanceDate: input.attendanceDate,
        status: input.status,
        checkInAt,
        checkOutAt,
        actorMembershipId: context.membershipId,
        ...(input.expectedVersion !== undefined ? { expectedVersion: input.expectedVersion } : {}),
        ...(input.correctionReason ? { correctionReason: input.correctionReason } : {}),
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      });
      return { branch, record: serializeRecord(record, branch.timezone) };
    } catch (error) {
      throw mapAttendanceError(error);
    }
  },

  async history(context: AuthorizationContext, attendanceRecordId: string) {
    try {
      const branchId = branchIdFor(context);
      const branch = await repository.branchContext(context.organizationId, branchId);
      const changes = await repository.listChanges({
        organizationId: context.organizationId,
        branchId,
        attendanceRecordId,
      });
      if (!changes) throw new AppError('Attendance record not found', 404);
      return {
        branch,
        changes: changes.map((change) => serializeChange(change, branch.timezone)),
      };
    } catch (error) {
      throw mapAttendanceError(error);
    }
  },

  async countPresentToday(context: AuthorizationContext): Promise<number> {
    try {
      const branchId = branchIdFor(context);
      const branch = await repository.branchContext(context.organizationId, branchId);
      return repository.countPresent({
        organizationId: context.organizationId,
        branchId,
        attendanceDate: instantToBranchBusinessDate(now(), branch.timezone),
      });
    } catch (error) {
      throw mapAttendanceError(error);
    }
  },
});

export type AttendanceService = ReturnType<typeof createAttendanceService>;
