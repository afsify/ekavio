import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import type {
  FinalizeAgreementInput,
  RecordManualPaymentInput,
} from '../schemas/manualCommercialSchemas.js';
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

export const manualCommercialHandlers = {
  async finalizeAgreement(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const context = requireAuthorizationContext(request);
      const requestId = requireUuidParam(request.params.requestId, 'access request identifier');
      response.status(201).json({
        success: true,
        data: await runtimePersistence.manualCommercial.finalizeAgreement(
          requestId,
          context.userId,
          request.body as FinalizeAgreementInput,
        ),
      });
    } catch (error) {
      next(handleError(error));
    }
  },

  async getAgreement(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const context = requireAuthorizationContext(request);
      const requestId = requireUuidParam(request.params.requestId, 'access request identifier');
      response.json({
        success: true,
        data: await runtimePersistence.manualCommercial.getAgreement(requestId, context.userId),
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
      const agreementId = requireUuidParam(request.params.agreementId, 'agreement identifier');
      response.status(201).json({
        success: true,
        data: await runtimePersistence.manualCommercial.recordPayment(
          agreementId,
          context.userId,
          request.body as RecordManualPaymentInput,
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
      const agreementId = requireUuidParam(request.params.agreementId, 'agreement identifier');
      const paymentId = requireUuidParam(request.params.paymentId, 'payment identifier');
      response.json({
        success: true,
        data: await runtimePersistence.manualCommercial.voidPayment(
          agreementId,
          paymentId,
          context.userId,
          request.body.reason as string,
        ),
      });
    } catch (error) {
      next(handleError(error));
    }
  },

  async issueInvitation(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const context = requireAuthorizationContext(request);
      const agreementId = requireUuidParam(request.params.agreementId, 'agreement identifier');
      response.status(201).json({
        success: true,
        data: await runtimePersistence.manualCommercial.issueInvitation(
          agreementId,
          context.userId,
        ),
      });
    } catch (error) {
      next(handleError(error));
    }
  },

  async revokeInvitation(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const context = requireAuthorizationContext(request);
      const agreementId = requireUuidParam(request.params.agreementId, 'agreement identifier');
      const invitationId = requireUuidParam(request.params.invitationId, 'invitation identifier');
      response.json({
        success: true,
        data: await runtimePersistence.manualCommercial.revokeInvitation(
          agreementId,
          invitationId,
          context.userId,
          request.body.reason as string,
        ),
      });
    } catch (error) {
      next(handleError(error));
    }
  },

  async inspectOnboarding(request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      response.json({
        success: true,
        data: await runtimePersistence.manualCommercial.inspectOnboarding(request.body.token as string),
      });
    } catch (error) {
      next(handleError(error));
    }
  },

  async completeOnboarding(request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      response.status(201).json({
        success: true,
        data: await runtimePersistence.manualCommercial.completeOnboarding(
          request.body.token as string,
          request.body.password as string,
          request.body.timezone as string,
          request.body.email as string | undefined,
        ),
      });
    } catch (error) {
      next(handleError(error));
    }
  },

  async getCustomerCommercialSummary(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const context = requireAuthorizationContext(request);
      response.json({
        success: true,
        data: await runtimePersistence.manualCommercial.getCustomerCommercialSummary(
          context.organizationId,
        ),
      });
    } catch (error) {
      next(handleError(error));
    }
  },
};
