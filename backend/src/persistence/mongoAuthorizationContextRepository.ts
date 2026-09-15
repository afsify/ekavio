import mongoose from 'mongoose';
import { Branch } from '../models/Branch.js';
import { Membership } from '../models/Membership.js';
import { Organization } from '../models/Organization.js';
import { Session } from '../models/Session.js';
import { User } from '../models/User.js';
import type { AuthorizationContextRepository } from '../services/requestContextService.js';

const isObjectId = (value: string): boolean => mongoose.isValidObjectId(value);

export const mongooseAuthorizationContextRepository: AuthorizationContextRepository = {
  async isSessionActive(sessionId, userId, now) {
    if (!isObjectId(userId)) return false;
    return Boolean(await Session.exists({
      sessionId,
      userId,
      revokedAt: null,
      expiresAt: { $gt: now },
    }));
  },

  async findActiveMembership(userId, organizationId) {
    if (!isObjectId(userId) || !isObjectId(organizationId)) return null;
    const membership = await Membership.findOne({
      userId,
      organizationId,
      status: 'active',
    }).lean();
    return membership
      ? {
          id: String(membership._id),
          userId: String(membership.userId),
          organizationId: String(membership.organizationId),
          role: membership.role,
          branchIds: membership.branchIds.map(String),
        }
      : null;
  },

  async organizationExists(organizationId) {
    if (!isObjectId(organizationId)) return false;
    return Boolean(await Organization.exists({ _id: organizationId }));
  },

  async findBranch(branchId) {
    if (!isObjectId(branchId)) return null;
    const branch = await Branch.findById(branchId).lean();
    return branch
      ? {
          id: String(branch._id),
          organizationId: String(branch.organizationId),
          status: branch.status,
        }
      : null;
  },

  async isPlatformOperator(userId) {
    if (!isObjectId(userId)) return false;
    const user = await User.findById(userId).select('+platformRole').lean();
    return user?.platformRole === 'operator';
  },
};
