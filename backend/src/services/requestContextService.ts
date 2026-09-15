import type { MembershipRole } from '../models/Membership.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
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
  runtimePersistence.authorization,
);
