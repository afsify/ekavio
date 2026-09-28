import type { NextFunction, Response } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import {
  commercialRenewalQueueQuerySchema,
  type FinalizeCommercialRenewalInput,
  type RecordRenewalPaymentInput,
} from '../schemas/commercialRenewalSchemas.js';
import { AppError, getErrorMessage } from '../utils/AppError.js';
import { requireAuthorizationContext } from '../utils/tenantScope.js';

const uuid = z.string().uuid();
const handleError = (error: unknown): AppError =>
  error instanceof AppError ? error : new AppError(getErrorMessage(error), 500);

const requireUuidParam = (value: unknown, label: string): string => {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw new AppError(`Invalid ${label}`, 400);
  return parsed.data;
};

export const commercialRenewalHandlers = {
  async getCustomerRenewals(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const context = requireAuthorizationContext(request);
      response.json({
        success: true,
        data: await runtimePersistence.commercialRenewals.getCustomerRenewals(
          context.organizationId,
        ),
      });
    } catch (error) {
      next(handleError(error));
    }
  },

  async previewRenewal(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const context = requireAuthorizationContext(request);
      const subscriptionId = requireUuidParam(
        request.params.subscriptionId,
        'subscription identifier',
      );
      response.json({
        success: true,
        data: await runtimePersistence.commercialRenewals.previewRenewal(
          subscriptionId,
          context.userId,
        ),
      });
    } catch (error) {
      next(handleError(error));
    }
  },

  async listQueue(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const context = requireAuthorizationContext(request);
      const query = commercialRenewalQueueQuerySchema.safeParse(request.query);
      if (!query.success) throw new AppError('Invalid renewal queue filters', 400);
      const result = await runtimePersistence.commercialRenewals.listOperatorQueue(
        context.userId,
        query.data.view,
        query.data.page,
        query.data.limit,
      );
      response.json({
        success: true,
        data: result.items,
        observedAt: result.observedAt,
        pagination: { page: query.data.page, limit: query.data.limit, total: result.total },
      });
    } catch (error) {
      next(handleError(error));
    }
  },

  async finalizeRenewal(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const context = requireAuthorizationContext(request);
      const subscriptionId = requireUuidParam(
        request.params.subscriptionId,
        'subscription identifier',
      );
      response.status(201).json({
        success: true,
        data: await runtimePersistence.commercialRenewals.finalizeRenewal(
          subscriptionId,
          context.userId,
          request.body as FinalizeCommercialRenewalInput,
        ),
      });
    } catch (error) {
      next(handleError(error));
    }
  },

  async getRenewal(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const context = requireAuthorizationContext(request);
      const renewalId = requireUuidParam(request.params.renewalId, 'renewal identifier');
      response.json({
        success: true,
        data: await runtimePersistence.commercialRenewals.getRenewal(renewalId, context.userId),
      });
    } catch (error) {
      next(handleError(error));
    }
  },

  async recordPayment(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const context = requireAuthorizationContext(request);
      const renewalId = requireUuidParam(request.params.renewalId, 'renewal identifier');
      response.status(201).json({
        success: true,
        data: await runtimePersistence.commercialRenewals.recordPayment(
          renewalId,
          context.userId,
          request.body as RecordRenewalPaymentInput,
        ),
      });
    } catch (error) {
      next(handleError(error));
    }
  },

  async voidPayment(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const context = requireAuthorizationContext(request);
      const renewalId = requireUuidParam(request.params.renewalId, 'renewal identifier');
      const paymentId = requireUuidParam(request.params.paymentId, 'payment identifier');
      response.json({
        success: true,
        data: await runtimePersistence.commercialRenewals.voidPayment(
          renewalId,
          paymentId,
          context.userId,
          request.body.reason as string,
        ),
      });
    } catch (error) {
      next(handleError(error));
    }
  },

  async applyRenewal(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const context = requireAuthorizationContext(request);
      const renewalId = requireUuidParam(request.params.renewalId, 'renewal identifier');
      response.json({
        success: true,
        data: await runtimePersistence.commercialRenewals.applyRenewal(
          renewalId,
          context.userId,
        ),
      });
    } catch (error) {
      next(handleError(error));
    }
  },

  async cancelRenewal(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const context = requireAuthorizationContext(request);
      const renewalId = requireUuidParam(request.params.renewalId, 'renewal identifier');
      response.json({
        success: true,
        data: await runtimePersistence.commercialRenewals.cancelRenewal(
          renewalId,
          context.userId,
          request.body.reason as string,
        ),
      });
    } catch (error) {
      next(handleError(error));
    }
  },
};
