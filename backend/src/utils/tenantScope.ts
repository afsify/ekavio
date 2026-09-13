import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import type { AuthorizationContext } from '../services/requestContextService.js';
import { AppError } from './AppError.js';

export type OrganizationContext = Pick<AuthorizationContext, 'organizationId'>;

export const organizationScope = (context: OrganizationContext) => ({
  tenantId: context.organizationId,
});

export const organizationResourceScope = (
  context: OrganizationContext,
  resourceId: string,
) => ({
  _id: resourceId,
  tenantId: context.organizationId,
});

export const organizationAndBranchScope = (context: AuthorizationContext) => ({
  tenantId: context.organizationId,
  ...(context.branchId ? { branchId: context.branchId } : {}),
});

export const requireAuthorizationContext = (
  request: AuthenticatedRequest,
): AuthorizationContext => {
  if (!request.auth) {
    throw new AppError('Authorization context missing', 401);
  }
  return request.auth;
};
