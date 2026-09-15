import { Attendance } from '../models/Attendance.js';
import { Membership } from '../models/Membership.js';
import { User } from '../models/User.js';
import type {
  AttendanceIdentity,
  AttendanceIdentityResolver,
  AttendanceStorageRepository,
} from '../services/attendanceService.js';

export const mongooseAttendanceStorageRepository: AttendanceStorageRepository = {
  upsert(input) {
    return Attendance.findOneAndUpdate(
      {
        tenantId: input.legacyMongoOrganizationId,
        userId: input.legacyMongoUserId,
        date: input.date,
      },
      {
        $set: {
          tenantId: input.legacyMongoOrganizationId,
          userId: input.legacyMongoUserId,
          date: input.date,
          status: input.status,
        },
      },
      { new: true, upsert: true, runValidators: true },
    );
  },

  async listForDay(legacyMongoOrganizationId, start, end) {
    return Attendance.find({
      tenantId: legacyMongoOrganizationId,
      date: { $gte: start, $lte: end },
    }).sort({ createdAt: -1 }).lean();
  },
};

export const mongooseAttendanceIdentityResolver: AttendanceIdentityResolver = {
  async resolveTarget(requestedUserId, context) {
    const membership = await Membership.findOne({
      userId: requestedUserId,
      organizationId: context.legacyMongoOrganizationId,
      status: 'active',
      ...(context.legacyMongoBranchId ? { branchIds: context.legacyMongoBranchId } : {}),
    }).lean();
    if (!membership) return null;
    const user = await User.findById(requestedUserId).select('name phone').lean();
    return user
      ? {
          requestedUserId,
          legacyMongoUserId: String(user._id),
          name: user.name,
          phone: user.phone,
          displayUser: { _id: user._id, name: user.name, phone: user.phone },
        }
      : null;
  },

  async resolveStoredUsers(legacyMongoUserIds, context) {
    const memberships = await Membership.find({
      userId: { $in: legacyMongoUserIds },
      organizationId: context.legacyMongoOrganizationId,
      status: 'active',
      ...(context.legacyMongoBranchId ? { branchIds: context.legacyMongoBranchId } : {}),
    }).select('userId').lean();
    const allowedIds = memberships.map((membership) => membership.userId);
    const users = await User.find({ _id: { $in: allowedIds } }).select('name phone').lean();
    return new Map(users.map((user): [string, AttendanceIdentity] => {
      const id = String(user._id);
      return [id, {
        requestedUserId: id,
        legacyMongoUserId: id,
        name: user.name,
        phone: user.phone,
        displayUser: user,
      }];
    }));
  },
};
