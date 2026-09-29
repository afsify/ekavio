import type { NextFunction, Response } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import {
  customerDueCustomerQuerySchema,
  customerDueListQuerySchema,
  type CreateCustomerDueEntryInput,
  type ReverseCustomerDueEntryInput,
} from '../schemas/customerDuesSchemas.js';
import { recordSecurityAudit } from '../services/securityAuditService.js';
import { AppError, getErrorMessage } from '../utils/AppError.js';
import { requireAuthorizationContext } from '../utils/tenantScope.js';

const uuid = z.string().uuid();
const handleError = (error: unknown): AppError =>
  error instanceof AppError ? error : new AppError(getErrorMessage(error), 500);

export const listCustomerDueEntries = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const query = customerDueListQuerySchema.safeParse(request.query);
    if (!query.success) throw new AppError('Invalid Customer Dues list filters', 400);
    const data = await runtimePersistence.customerDuesService.list(
      requireAuthorizationContext(request),
      query.data,
    );
    response.status(200).json(data);
  } catch (error) {
    next(handleError(error));
  }
};

export const createCustomerDueEntry = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(request);
    const data = await runtimePersistence.customerDuesService.create(
      context,
      request.body as CreateCustomerDueEntryInput,
    );
    await recordSecurityAudit(context, 'customer_dues.entry_created', {
      entryId: data.id,
      customerId: data.customerId,
      entryType: data.entryType,
    }, request.ip);
    response.status(201).json({ data });
  } catch (error) {
    next(handleError(error));
  }
};

export const reverseCustomerDueEntry = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const target = uuid.safeParse(request.params.entryId);
    if (!target.success) throw new AppError('Invalid Customer Due entry identifier', 400);
    const context = requireAuthorizationContext(request);
    const data = await runtimePersistence.customerDuesService.reverse(
      context,
      target.data,
      request.body as ReverseCustomerDueEntryInput,
    );
    await recordSecurityAudit(context, 'customer_dues.entry_reversed', {
      entryId: data.id,
      reversesEntryId: target.data,
      customerId: data.customerId,
    }, request.ip);
    response.status(201).json({ data });
  } catch (error) {
    next(handleError(error));
  }
};

export const getCustomerDueBalance = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customer = uuid.safeParse(request.params.customerId);
    if (!customer.success) throw new AppError('Invalid customer identifier', 400);
    const data = await runtimePersistence.customerDuesService.balances(
      requireAuthorizationContext(request),
      customer.data,
    );
    response.status(200).json({ data });
  } catch (error) {
    next(handleError(error));
  }
};

export const getCustomerDueHistory = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customer = uuid.safeParse(request.params.customerId);
    const query = customerDueListQuerySchema.safeParse(request.query);
    if (!customer.success) throw new AppError('Invalid customer identifier', 400);
    if (!query.success) throw new AppError('Invalid Customer Dues history filters', 400);
    const data = await runtimePersistence.customerDuesService.history(
      requireAuthorizationContext(request),
      customer.data,
      query.data,
    );
    response.status(200).json(data);
  } catch (error) {
    next(handleError(error));
  }
};

export const searchCustomerDueCustomers = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const query = customerDueCustomerQuerySchema.safeParse(request.query);
    if (!query.success) throw new AppError('Invalid customer search filters', 400);
    const data = await runtimePersistence.customerDuesService.searchCustomers(
      requireAuthorizationContext(request),
      query.data.search,
      query.data.page,
      query.data.limit,
    );
    response.status(200).json(data);
  } catch (error) {
    next(handleError(error));
  }
};
