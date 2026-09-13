import { Attendance } from '../models/Attendance.js';
import { Membership } from '../models/Membership.js';
import { User } from '../models/User.js';
import type { AuthorizationContext } from './requestContextService.js';
import { AppError } from '../utils/AppError.js';
import { organizationScope } from '../utils/tenantScope.js';

export interface AttendanceWriteInput {
  userId: string;
  date: string;
  status: 'present' | 'absent' | 'half-day';
}

export interface AttendanceRepository {
  targetHasAccess(userId: string, organizationId: string, branchId?: string): Promise<boolean>;
  upsert(input: {
    organizationId: string;
    userId: string;
    date: Date;
    status: AttendanceWriteInput['status'];
  }): Promise<unknown>;
}

export const normalizeAttendanceDate = (date: string): Date => {
  const targetDate = new Date(date);
  if (Number.isNaN(targetDate.getTime())) {
    throw new AppError('Invalid date format', 400);
  }
  return new Date(
    Date.UTC(
      targetDate.getUTCFullYear(),
      targetDate.getUTCMonth(),
      targetDate.getUTCDate(),
    ),
  );
};

export const createAttendanceWriter = (repository: AttendanceRepository) => {
  return async (context: AuthorizationContext, input: AttendanceWriteInput) => {
    const targetHasAccess = await repository.targetHasAccess(
      input.userId,
      context.organizationId,
      context.branchId,
    );
    if (!targetHasAccess) {
      // Use the same response for missing and foreign users to avoid an identity oracle.
      throw new AppError('Attendance target not found', 404);
    }

    return repository.upsert({
      organizationId: context.organizationId,
      userId: input.userId,
      date: normalizeAttendanceDate(input.date),
      status: input.status,
    });
  };
};

export const mongooseAttendanceRepository: AttendanceRepository = {
  async targetHasAccess(userId, organizationId, branchId) {
    return Boolean(
      await Membership.exists({
        userId,
        organizationId,
        status: 'active',
        ...(branchId ? { branchIds: branchId } : {}),
      }),
    );
  },

  async upsert(input) {
    return Attendance.findOneAndUpdate(
      {
        tenantId: input.organizationId,
        userId: input.userId,
        date: input.date,
      },
      {
        $set: {
          tenantId: input.organizationId,
          userId: input.userId,
          date: input.date,
          status: input.status,
        },
      },
      { new: true, upsert: true, runValidators: true },
    );
  },
};

export const markAttendanceForContext = createAttendanceWriter(
  mongooseAttendanceRepository,
);

export const listAttendanceForContext = async (
  context: AuthorizationContext,
  targetDate: Date,
) => {
  if (Number.isNaN(targetDate.getTime())) {
    throw new AppError('Invalid date parameter', 400);
  }
  const startOfDay = new Date(
    Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()),
  );
  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const records = await Attendance.find({
    ...organizationScope(context),
    date: { $gte: startOfDay, $lte: endOfDay },
  }).sort({ createdAt: -1 }).lean();
  const targetUserIds = records.map((record) => record.userId);
  const memberships = await Membership.find({
    userId: { $in: targetUserIds },
    organizationId: context.organizationId,
    status: 'active',
    ...(context.branchId ? { branchIds: context.branchId } : {}),
  }).select('userId').lean();
  const allowedUserIds = memberships.map((membership) => membership.userId);
  const users = await User.find({ _id: { $in: allowedUserIds } })
    .select('name phone')
    .lean();
  const userById = new Map(users.map((user) => [String(user._id), user]));
  return records.map((record) => ({
    ...record,
    userId: userById.get(String(record.userId)) ?? null,
  }));
};
