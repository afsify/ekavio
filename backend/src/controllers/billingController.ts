import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import type {
  UpdateSubscriptionInput,
  UpsertEntitlementInput,
} from '../schemas/billingSchemas.js';
import {
  getOrganizationCommercialState,
  updateOrganizationSubscription,
  upsertOrganizationEntitlement,
} from '../services/commercialAdministrationService.js';
import { getPublicCommercialCatalogue } from '../services/commercialCatalogueService.js';
import { recordSecurityAudit } from '../services/securityAuditService.js';
import { AppError, getErrorMessage } from '../utils/AppError.js';
import { requireAuthorizationContext } from '../utils/tenantScope.js';

const handleError = (error: unknown): AppError =>
  error instanceof AppError ? error : new AppError(getErrorMessage(error), 500);

export const getSubscription = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(request);
    response.json({
      success: true,
      data: await getOrganizationCommercialState(context.organizationId),
    });
  } catch (error: unknown) {
    next(handleError(error));
  }
};

export const getCatalogue = async (
  _request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    response.json({ success: true, data: await getPublicCommercialCatalogue() });
  } catch (error: unknown) {
    next(handleError(error));
  }
};

export const updateSubscription = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(request);
    const organizationId = request.params.organizationId as string;
    const effective = await updateOrganizationSubscription(
      organizationId,
      context.userId,
      request.body as UpdateSubscriptionInput,
    );
    await recordSecurityAudit(
      context,
      'commercial.subscription.updated',
      { targetOrganizationId: organizationId, status: effective.subscription?.status ?? 'none' },
      request.ip,
      organizationId,
    );
    response.json({ success: true, data: effective });
  } catch (error: unknown) {
    next(handleError(error));
  }
};

export const upsertEntitlement = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(request);
    const organizationId = request.params.organizationId as string;
    const moduleKey = request.params.moduleKey as string;
    const input = request.body as UpsertEntitlementInput;
    const effective = await upsertOrganizationEntitlement(
      organizationId,
      context.userId,
      moduleKey,
      input,
    );
    await recordSecurityAudit(
      context,
      'commercial.entitlement.updated',
      {
        targetOrganizationId: organizationId,
        moduleKey,
        effect: input.effect,
        status: input.status,
      },
      request.ip,
      organizationId,
    );
    response.json({ success: true, data: effective });
  } catch (error: unknown) {
    next(handleError(error));
  }
};
