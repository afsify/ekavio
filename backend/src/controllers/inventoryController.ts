import type { NextFunction, Response } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import {
  inventoryListQuerySchema,
  inventoryMovementListQuerySchema,
  type AddInventoryItemInput,
  type AdjustStockInput,
  type ConsumeStockInput,
  type ReceiveStockInput,
  type ReverseStockMovementInput,
  type UpdateInventoryItemInput,
} from '../schemas/inventorySchemas.js';
import { recordSecurityAudit } from '../services/securityAuditService.js';
import { AppError, getErrorMessage } from '../utils/AppError.js';
import { requireAuthorizationContext } from '../utils/tenantScope.js';
import { dynamicFieldsService } from '../services/dynamicFieldsService.js';
import { fieldCreationRequest } from '../domains/dynamicFields/service.js';

const uuid = z.string().uuid();
const handleError = (error: unknown): AppError =>
  error instanceof AppError ? error : new AppError(getErrorMessage(error), 500);

const itemIdFrom = (request: AuthenticatedRequest): string => {
  const parsed = uuid.safeParse(request.params.itemId);
  if (!parsed.success) throw new AppError('Invalid inventory item identifier', 400);
  return parsed.data;
};

export const listInventoryItems = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const query = inventoryListQuerySchema.safeParse(request.query);
    if (!query.success) throw new AppError('Invalid inventory list filters', 400);
    response.status(200).json(await runtimePersistence.inventoryService.listItems(
      requireAuthorizationContext(request),
      query.data,
    ));
  } catch (error) {
    next(handleError(error));
  }
};

export const createInventoryItem = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(request);
    const data = await dynamicFieldsService.mutate(context,'inventory_item',request.body.customFields,true,()=>runtimePersistence.inventoryService.createItem(
      context,
      request.body as AddInventoryItemInput,
    ),fieldCreationRequest(request.body));
    await recordSecurityAudit(context, 'inventory.item_created', {
      itemId: data.id,
      branchId: data.branchId,
    }, request.ip);
    response.status(201).json({ data });
  } catch (error) {
    next(handleError(error));
  }
};

export const getInventoryItem = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data = await runtimePersistence.inventoryService.getItem(
      requireAuthorizationContext(request),
      itemIdFrom(request),
    );
    response.status(200).json({ data });
  } catch (error) {
    next(handleError(error));
  }
};

export const updateInventoryItem = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(request);
    const data = await dynamicFieldsService.mutate(context,'inventory_item',request.body.customFields,false,()=>runtimePersistence.inventoryService.updateItem(
      context,
      itemIdFrom(request),
      request.body as UpdateInventoryItemInput,
    ));
    await recordSecurityAudit(context, 'inventory.item_updated', {
      itemId: data.id,
      branchId: data.branchId,
    }, request.ip);
    response.status(200).json({ data });
  } catch (error) {
    next(handleError(error));
  }
};

const stockChange = (
  operation: 'receive' | 'consume' | 'adjust',
) => async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(request);
    const itemId = itemIdFrom(request);
    const data = operation === 'receive'
      ? await runtimePersistence.inventoryService.receive(
        context, itemId, request.body as ReceiveStockInput,
      )
      : operation === 'consume'
        ? await runtimePersistence.inventoryService.consume(
          context, itemId, request.body as ConsumeStockInput,
        )
        : await runtimePersistence.inventoryService.adjust(
          context, itemId, request.body as AdjustStockInput,
        );
    await recordSecurityAudit(context, 'inventory.stock_changed', {
      itemId,
      movementId: data.id,
      movementType: data.movementType,
    }, request.ip);
    response.status(201).json({ data });
  } catch (error) {
    next(handleError(error));
  }
};

export const receiveInventoryStock = stockChange('receive');
export const consumeInventoryStock = stockChange('consume');
export const adjustInventoryStock = stockChange('adjust');

export const listInventoryMovements = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const query = inventoryMovementListQuerySchema.safeParse(request.query);
    if (!query.success) throw new AppError('Invalid inventory movement filters', 400);
    response.status(200).json(await runtimePersistence.inventoryService.listMovements(
      requireAuthorizationContext(request),
      itemIdFrom(request),
      query.data,
    ));
  } catch (error) {
    next(handleError(error));
  }
};

export const reverseInventoryMovement = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const target = uuid.safeParse(request.params.movementId);
    if (!target.success) throw new AppError('Invalid stock movement identifier', 400);
    const context = requireAuthorizationContext(request);
    const data = await runtimePersistence.inventoryService.reverse(
      context,
      target.data,
      request.body as ReverseStockMovementInput,
    );
    await recordSecurityAudit(context, 'inventory.movement_reversed', {
      itemId: data.itemId,
      movementId: data.id,
      reversesMovementId: target.data,
    }, request.ip);
    response.status(201).json({ data });
  } catch (error) {
    next(handleError(error));
  }
};

export const listLowStockInventory = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const query = inventoryMovementListQuerySchema.safeParse(request.query);
    if (!query.success) throw new AppError('Invalid low-stock filters', 400);
    response.status(200).json(await runtimePersistence.inventoryService.lowStock(
      requireAuthorizationContext(request),
      query.data,
    ));
  } catch (error) {
    next(handleError(error));
  }
};

export const listInventoryUnits = (
  _request: AuthenticatedRequest,
  response: Response,
): void => {
  response.status(200).json({ data: runtimePersistence.inventoryService.units() });
};
