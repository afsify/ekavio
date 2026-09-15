import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { Organization } from '../models/Organization.js';
import { ParentOrganization } from '../models/ParentOrganization.js';
import { asLegacyMongoOrganizationId } from '../persistence/identifiers.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import {
  assertConsolidatedBillingAuthority,
  assertCorporateLinkAuthority,
} from '../services/corporateAuthorizationService.js';
import { entitlementService } from '../services/entitlementService.js';
import { recordSecurityAudit } from '../services/securityAuditService.js';
import { AppError, getErrorMessage } from '../utils/AppError.js';
import { requireAuthorizationContext } from '../utils/tenantScope.js';

export const createParentOrg = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(request);
    const legacyActorUserId = await runtimePersistence.commercial.userToLegacy(context.userId);
    const parentOrg = await ParentOrganization.create({
      name: request.body.name,
      ownerId: legacyActorUserId,
      consolidatedBilling: request.body.consolidatedBilling ?? true,
    });
    await recordSecurityAudit(
      context,
      'corporate.parent.created',
      { parentOrganizationId: String(parentOrg._id) },
      request.ip,
    );
    response.status(201).json({ message: 'Parent organization created successfully', data: parentOrg });
  } catch (error: unknown) {
    next(error instanceof AppError ? error : new AppError(getErrorMessage(error), 500));
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
    const legacyActorUserId = await runtimePersistence.commercial.userToLegacy(context.userId);
    const [parentOrg, childMembership] = await Promise.all([
      ParentOrganization.findOne({ _id: parentId, ownerId: legacyActorUserId }).lean(),
      runtimePersistence.authorization.findActiveMembership(context.userId, childOrgId),
    ]);
    if (!parentOrg) throw new AppError('Corporate relationship not found', 404);
    assertCorporateLinkAuthority({
      actorUserId: legacyActorUserId,
      parentOwnerId: String(parentOrg.ownerId),
      ...(childMembership ? { childMembershipRole: childMembership.role } : {}),
    });

    const legacyChildOrganizationId = await runtimePersistence.commercial.organizationToLegacy(
      childOrgId,
    );
    const childOrg = await Organization.findOneAndUpdate(
      { _id: legacyChildOrganizationId },
      { $set: { parentId } },
      { new: true, runValidators: true },
    );
    if (!childOrg) {
      throw new AppError(
        'Corporate linking is temporarily unavailable for organizations created after the PostgreSQL identity cutover',
        409,
      );
    }
    await recordSecurityAudit(
      context,
      'corporate.child.linked',
      { parentOrganizationId: parentId, childOrganizationId: childOrgId },
      request.ip,
    );
    response.status(200).json({ message: 'Organization linked successfully', data: childOrg });
  } catch (error: unknown) {
    next(error instanceof AppError ? error : new AppError(getErrorMessage(error), 500));
  }
};

export const getConsolidatedBilling = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(request);
    const parentId = request.params.parentId as string;
    const legacyActorUserId = await runtimePersistence.commercial.userToLegacy(context.userId);
    const parentOrg = await ParentOrganization.findOne({
      _id: parentId,
      ownerId: legacyActorUserId,
    }).lean();
    if (!parentOrg) throw new AppError('Corporate relationship not found', 404);
    assertConsolidatedBillingAuthority(legacyActorUserId, String(parentOrg.ownerId));

    const childOrgs = await Organization.find({ parentId }).lean();
    const billingDetails = await Promise.all(childOrgs.map(async (organization) => {
      const legacyOrganizationId = asLegacyMongoOrganizationId(String(organization._id));
      const [commercialState, canonicalOrganizationId] = await Promise.all([
        entitlementService.getEffective(legacyOrganizationId),
        runtimePersistence.idMappings.organizationToPostgres(legacyOrganizationId),
      ]);
      return {
        organizationId: canonicalOrganizationId,
        name: organization.name,
        subscriptionStatus: commercialState.subscription?.status ?? 'none',
        enabledModules: commercialState.modules
          .filter((module) => module.enabled)
          .map((module) => module.key),
      };
    }));
    response.status(200).json({
      data: {
        parentOrganization: parentOrg.name,
        billingDetails,
      },
    });
  } catch (error: unknown) {
    next(error instanceof AppError ? error : new AppError(getErrorMessage(error), 500));
  }
};
