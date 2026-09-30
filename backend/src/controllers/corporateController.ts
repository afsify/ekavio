import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import { corporateParentIdSchema } from '../schemas/corporateSchemas.js';
import { recordSecurityAudit } from '../services/securityAuditService.js';
import { AppError, getErrorMessage } from '../utils/AppError.js';
import { requireAuthorizationContext } from '../utils/tenantScope.js';

const parentDto = (parent: {
  id: string;
  name: string;
  consolidated_billing: boolean;
  created_at: Date;
  updated_at: Date;
}) => ({
  id: parent.id,
  name: parent.name,
  consolidatedBilling: parent.consolidated_billing,
  createdAt: parent.created_at,
  updatedAt: parent.updated_at,
});

const handleCorporateError = (error: unknown, next: NextFunction): void => {
  next(error instanceof AppError ? error : new AppError(getErrorMessage(error), 500));
};

export const createParentOrg = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(request);
    const parent = await runtimePersistence.corporate.createParent({
      ownerUserId: context.userId,
      name: request.body.name as string,
      consolidatedBilling: (request.body.consolidatedBilling as boolean | undefined) ?? true,
    });
    await recordSecurityAudit(
      context,
      'corporate.parent.created',
      { parentOrganizationId: parent.id },
      request.ip,
    );
    response.status(201).json({
      message: 'Parent organization created successfully',
      data: parentDto(parent),
    });
  } catch (error: unknown) {
    handleCorporateError(error, next);
  }
};

export const listParentOrgs = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(request);
    const parents = await runtimePersistence.corporate.listParents(context.userId);
    response.status(200).json({ data: parents.map(parentDto) });
  } catch (error: unknown) {
    handleCorporateError(error, next);
  }
};

export const linkChildOrg = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(request);
    const { parentId, childOrgId } = request.body as { parentId: string; childOrgId: string };
    const child = await runtimePersistence.corporate.linkChild({
      actorUserId: context.userId,
      parentId,
      childOrganizationId: childOrgId,
    });
    await recordSecurityAudit(
      context,
      'corporate.child.linked',
      { parentOrganizationId: parentId, childOrganizationId: childOrgId },
      request.ip,
      childOrgId,
    );
    response.status(200).json({
      message: 'Organization linked successfully',
      data: { id: child.id, name: child.name, type: child.type, parentOrganizationId: parentId },
    });
  } catch (error: unknown) {
    handleCorporateError(error, next);
  }
};

export const getCorporateSummary = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(request);
    const parsedParentId = corporateParentIdSchema.safeParse(request.params.parentId);
    if (!parsedParentId.success) throw new AppError('Parent organization id is invalid', 400);
    const parent = await runtimePersistence.corporate.findParentForOwner(
      context.userId,
      parsedParentId.data,
    );
    if (!parent) throw new AppError('Corporate relationship not found', 404);
    const children = await runtimePersistence.corporate.listChildren(context.userId, parent.id);
    const organizations = await Promise.all(children.map(async (organization) => {
      const commercialState = await runtimePersistence.commercial.getEffective(organization.id);
      return {
        organizationId: organization.id,
        name: organization.name,
        type: organization.type,
        subscriptionStatus: commercialState.subscription?.status ?? 'none',
        enabledModules: commercialState.modules
          .filter((module) => module.enabled)
          .map((module) => module.key),
      };
    }));
    response.status(200).json({
      data: {
        parent: parentDto(parent),
        organizations,
      },
    });
  } catch (error: unknown) {
    handleCorporateError(error, next);
  }
};
