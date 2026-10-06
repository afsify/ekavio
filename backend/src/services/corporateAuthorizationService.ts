import type { MembershipRole } from '../models/Membership.js';
import { permissions, permissionsForRole, type Permission } from './authorizationPolicy.js';
import { AppError } from '../utils/AppError.js';

export const assertCorporateLinkAuthority = (input: {
  actorUserId: string;
  parentOwnerId: string;
  childMembershipRole?: MembershipRole;
  childPermissions?: Permission[];
}): void => {
  if (input.parentOwnerId !== input.actorUserId) {
    throw new AppError('Corporate relationship not found', 404);
  }
  if (
    !input.childMembershipRole ||
    !(input.childPermissions ?? permissionsForRole(input.childMembershipRole)).includes(permissions.ORGANIZATION_MANAGE)
  ) {
    throw new AppError('Access denied to child organization', 403);
  }
};

export const assertConsolidatedBillingAuthority = (
  actorUserId: string,
  parentOwnerId: string,
): void => {
  if (actorUserId !== parentOwnerId) {
    // An organization admin is deliberately not a cross-organization override.
    throw new AppError('Corporate relationship not found', 404);
  }
};
