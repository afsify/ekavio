import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import {
  offerTypes,
  operatorAccessRequestListQuerySchema,
  type OperatorAccessRequestUpdateInput,
  type PublicAccessRequestInput,
  type PublicPricingUpdateInput,
  type PublicQuoteInput,
} from '../schemas/publicCommercialSchemas.js';
import type { createPublicCommercialService } from '../services/publicCommercialService.js';
import { AppError, getErrorMessage } from '../utils/AppError.js';
import { requireAuthorizationContext } from '../utils/tenantScope.js';

type PublicCommercialService = ReturnType<typeof createPublicCommercialService>;

const handleError = (error: unknown): AppError =>
  error instanceof AppError ? error : new AppError(getErrorMessage(error), 500);

const requestIdSchema = z.string().uuid();
const offerParamsSchema = z.object({
  offerType: z.enum(offerTypes),
  offerKey: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9-]*$/),
}).strict();

export const createPublicCommercialHandlers = (service: PublicCommercialService) => ({
  async getCatalogue(_request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      response.json({ success: true, data: await service.getCatalogue() });
    } catch (error) {
      next(handleError(error));
    }
  },

  async previewQuote(request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      response.json({
        success: true,
        data: await service.previewQuote(request.body as PublicQuoteInput),
      });
    } catch (error) {
      next(handleError(error));
    }
  },

  async submitRequest(request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      response.status(201).json({
        success: true,
        data: await service.submitRequest(request.body as PublicAccessRequestInput),
      });
    } catch (error) {
      next(handleError(error));
    }
  },

  async getOperatorPricing(
    _request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      response.json({ success: true, data: await service.getOperatorPricing() });
    } catch (error) {
      next(handleError(error));
    }
  },

  async updatePricing(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const context = requireAuthorizationContext(request);
      const params = offerParamsSchema.safeParse(request.params);
      if (!params.success) throw new AppError('Invalid public pricing target', 400);
      response.json({
        success: true,
        data: await service.updatePricing(
          params.data.offerType,
          params.data.offerKey,
          context.userId,
          request.body as PublicPricingUpdateInput,
        ),
      });
    } catch (error) {
      next(handleError(error));
    }
  },

  async listRequests(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const query = operatorAccessRequestListQuerySchema.safeParse(request.query);
      if (!query.success) throw new AppError('Invalid access request filters', 400);
      const result = await service.listRequests(query.data.status, query.data.page, query.data.limit);
      response.json({
        success: true,
        data: result.items,
        pagination: {
          page: query.data.page,
          limit: query.data.limit,
          total: result.total,
        },
      });
    } catch (error) {
      next(handleError(error));
    }
  },

  async getRequest(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const requestId = requestIdSchema.safeParse(request.params.requestId);
      if (!requestId.success) throw new AppError('Invalid access request identifier', 400);
      response.json({ success: true, data: await service.getRequest(requestId.data) });
    } catch (error) {
      next(handleError(error));
    }
  },

  async updateRequest(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const context = requireAuthorizationContext(request);
      const requestId = requestIdSchema.safeParse(request.params.requestId);
      if (!requestId.success) throw new AppError('Invalid access request identifier', 400);
      response.json({
        success: true,
        data: await service.updateRequest(
          requestId.data,
          context.userId,
          request.body as OperatorAccessRequestUpdateInput,
        ),
      });
    } catch (error) {
      next(handleError(error));
    }
  },
});

export const publicCommercialHandlers = createPublicCommercialHandlers(
  runtimePersistence.publicCommercial,
);
