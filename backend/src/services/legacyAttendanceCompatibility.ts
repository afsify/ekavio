import type { AuthorizationContext } from './requestContextService.js';
import type {
  OperationalIdentityBridge,
  OperationalIdentityContext,
} from '../persistence/operationalIdentity.js';
import { AppError } from '../utils/AppError.js';

export interface LegacyAttendanceWriteInput {
  userId: string;
  date: string;
  status: 'present' | 'absent' | 'half-day';
}

export interface AttendanceStorageRepository {
  upsert(input: {
    legacyMongoOrganizationId: string;
    legacyMongoUserId: string;
    date: Date;
    status: LegacyAttendanceWriteInput['status'];
  }): Promise<unknown>;
  listForDay(legacyMongoOrganizationId: string, start: Date, end: Date): Promise<unknown[]>;
}

export interface AttendanceIdentity {
  requestedUserId: string;
  legacyMongoUserId: string;
  name: string;
  phone: string;
  displayUser: { _id: unknown; name: string; phone: string };
}

export interface AttendanceIdentityResolver {
  resolveTarget(
    requestedUserId: string,
    context: OperationalIdentityContext,
  ): Promise<AttendanceIdentity | null>;
  resolveStoredUsers(
    legacyMongoUserIds: string[],
    context: OperationalIdentityContext,
  ): Promise<Map<string, AttendanceIdentity>>;
}

export interface LegacyAttendanceDependencies {
  storage: AttendanceStorageRepository;
  identities: AttendanceIdentityResolver;
  operationalIdentity: OperationalIdentityBridge;
}

export const normalizeLegacyAttendanceDate = (date: string): Date => {
  const targetDate = new Date(date);
  if (Number.isNaN(targetDate.getTime())) throw new AppError('Invalid date format', 400);
  return new Date(Date.UTC(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth(),
    targetDate.getUTCDate(),
  ));
};

/** Explicit migration/recovery compatibility only. Ordinary runtime never composes this writer. */
export const createLegacyAttendanceWriter = ({
  storage,
  identities,
  operationalIdentity,
}: LegacyAttendanceDependencies) => async (
  context: AuthorizationContext,
  input: LegacyAttendanceWriteInput,
): Promise<unknown> => {
  const operational = await operationalIdentity.resolve(context);
  const target = await identities.resolveTarget(input.userId, operational);
  if (!target) throw new AppError('Attendance target not found', 404);
  return storage.upsert({
    legacyMongoOrganizationId: operational.legacyMongoOrganizationId,
    legacyMongoUserId: target.legacyMongoUserId,
    date: normalizeLegacyAttendanceDate(input.date),
    status: input.status,
  });
};

/** Explicit migration/recovery compatibility only. Ordinary runtime never composes this reader. */
export const createLegacyAttendanceReader = ({
  storage,
  identities,
  operationalIdentity,
}: LegacyAttendanceDependencies) => async (
  context: AuthorizationContext,
  targetDate: Date,
): Promise<unknown[]> => {
  if (Number.isNaN(targetDate.getTime())) throw new AppError('Invalid date parameter', 400);
  const startOfDay = new Date(Date.UTC(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth(),
    targetDate.getUTCDate(),
  ));
  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCHours(23, 59, 59, 999);
  const operational = await operationalIdentity.resolve(context);
  const records = await storage.listForDay(
    operational.legacyMongoOrganizationId,
    startOfDay,
    endOfDay,
  );
  const recordRows = records as Array<{ userId: unknown }>;
  const identitiesByLegacyId = await identities.resolveStoredUsers(
    recordRows.map((record) => String(record.userId)),
    operational,
  );
  return recordRows.map((record) => ({
    ...record,
    userId: identitiesByLegacyId.get(String(record.userId))?.displayUser ?? null,
  }));
};

// Stable aliases retained only for existing migration/parity compatibility tests.
export const createAttendanceWriter = createLegacyAttendanceWriter;
export const createAttendanceReader = createLegacyAttendanceReader;
export const normalizeAttendanceDate = normalizeLegacyAttendanceDate;
