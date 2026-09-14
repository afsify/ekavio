import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { Membership } from '../models/Membership.js';
import { Organization } from '../models/Organization.js';
import { ParentOrganization } from '../models/ParentOrganization.js';
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
    const parentOrg = await ParentOrganization.create({
      name: request.body.name,
      ownerId: context.userId,
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
    const [parentOrg, childMembership] = await Promise.all([
      ParentOrganization.findOne({ _id: parentId, ownerId: context.userId }).lean(),
      Membership.findOne({
        userId: context.userId,
        organizationId: childOrgId,
        status: 'active',
      }).lean(),
    ]);
    if (!parentOrg) throw new AppError('Corporate relationship not found', 404);
    assertCorporateLinkAuthority({
      actorUserId: context.userId,
      parentOwnerId: String(parentOrg.ownerId),
      ...(childMembership ? { childMembershipRole: childMembership.role } : {}),
    });

    const childOrg = await Organization.findOneAndUpdate(
      { _id: childOrgId },
      { $set: { parentId } },
      { new: true, runValidators: true },
    );
    if (!childOrg) throw new AppError('Child organization not found', 404);
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
    const parentOrg = await ParentOrganization.findOne({
      _id: parentId,
      ownerId: context.userId,
    }).lean();
    if (!parentOrg) throw new AppError('Corporate relationship not found', 404);
    assertConsolidatedBillingAuthority(context.userId, String(parentOrg.ownerId));

    const childOrgs = await Organization.find({ parentId }).lean();
    const billingDetails = await Promise.all(childOrgs.map(async (organization) => {
      const commercialState = await entitlementService.getEffective(String(organization._id));
      return {
        organizationId: String(organization._id),
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
