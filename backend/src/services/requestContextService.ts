import mongoose from 'mongoose';
import { Branch } from '../models/Branch.js';
import { Membership } from '../models/Membership.js';
import type { MembershipRole } from '../models/Membership.js';
import { Organization } from '../models/Organization.js';
import { Session } from '../models/Session.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { permissionsForRole, type Permission } from './authorizationPolicy.js';

export interface AccessIdentityClaims {
  userId: string;
  defaultOrganizationId: string;
  sessionId: string;
}

export interface ActiveMembershipRecord {
  id: string;
  userId: string;
  organizationId: string;
  role: MembershipRole;
  branchIds: string[];
}

export interface BranchAccessRecord {
  id: string;
  organizationId: string;
  status: 'active' | 'inactive';
}

export interface AuthorizationContext {
  userId: string;
  sessionId: string;
  organizationId: string;
  membershipId: string;
  role: MembershipRole;
  permissions: Permission[];
  platformOperator: boolean;
  branchId?: string;
}

export interface ContextSelection {
  organizationId?: string;
  branchId?: string;
}

export interface AuthorizationContextRepository {
  isSessionActive(sessionId: string, userId: string, now: Date): Promise<boolean>;
  findActiveMembership(
    userId: string,
    organizationId: string,
  ): Promise<ActiveMembershipRecord | null>;
  organizationExists(organizationId: string): Promise<boolean>;
  findBranch(branchId: string): Promise<BranchAccessRecord | null>;
  isPlatformOperator(userId: string): Promise<boolean>;
}

const isObjectId = (value: string): boolean => mongoose.isValidObjectId(value);

export const mongooseAuthorizationContextRepository: AuthorizationContextRepository = {
  async isSessionActive(sessionId, userId, now) {
    if (!isObjectId(userId)) return false;

    const session = await Session.exists({
      sessionId,
      userId,
      revokedAt: null,
      expiresAt: { $gt: now },
    });
    return Boolean(session);
  },

  async findActiveMembership(userId, organizationId) {
    if (!isObjectId(userId) || !isObjectId(organizationId)) return null;

    const membership = await Membership.findOne({
      userId,
      organizationId,
      status: 'active',
    }).lean();
    if (!membership) return null;

    return {
      id: String(membership._id),
      userId: String(membership.userId),
      organizationId: String(membership.organizationId),
      role: membership.role,
      branchIds: membership.branchIds.map(String),
    };
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

export const createAuthorizationContextResolver = (
  repository: AuthorizationContextRepository,
) => {
  return async (
    claims: AccessIdentityClaims,
    selection: ContextSelection = {},
  ): Promise<AuthorizationContext> => {
    const sessionIsActive = await repository.isSessionActive(
      claims.sessionId,
      claims.userId,
      new Date(),
    );
    if (!sessionIsActive) {
      throw new AppError('Authentication session is no longer active', 401);
    }

    const organizationId = selection.organizationId ?? claims.defaultOrganizationId;
    const membership = await repository.findActiveMembership(claims.userId, organizationId);
    if (!membership || !(await repository.organizationExists(organizationId))) {
      throw new AppError('Access denied to this organization', 403);
    }

    let branchId: string | undefined;
    if (selection.branchId) {
      const branch = await repository.findBranch(selection.branchId);
      if (
        !branch ||
        branch.status !== 'active' ||
        branch.organizationId !== organizationId ||
        !membership.branchIds.includes(branch.id)
      ) {
        throw new AppError('Access denied to this branch', 403);
      }
      branchId = branch.id;
    } else if (membership.branchIds.length > 0) {
      for (const assignedBranchId of membership.branchIds) {
        const branch = await repository.findBranch(assignedBranchId);
        if (
          branch?.status === 'active' &&
          branch.organizationId === organizationId
        ) {
          branchId = branch.id;
          break;
        }
      }

      if (!branchId) {
        throw new AppError('No active branch is assigned for this organization', 403);
      }
    }

    return {
      userId: claims.userId,
      sessionId: claims.sessionId,
      organizationId,
      membershipId: membership.id,
      role: membership.role,
      permissions: permissionsForRole(membership.role),
      platformOperator: await repository.isPlatformOperator(claims.userId),
      ...(branchId ? { branchId } : {}),
    };
  };
};

export const resolveAuthorizationContext = createAuthorizationContextResolver(
  mongooseAuthorizationContextRepository,
);
