import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { createAppError, getErrorMessage } from '../utils/AppError.js';
import { addItemService, getInventoryService, getLowStockAlertsService } from '../services/inventoryService.js';

export const addItem = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      next(createAppError('Tenant ID missing from request context', 401));
      return;
    }

    const newItem = await addItemService(tenantId, req.body);
    res.status(201).json({ message: 'Inventory item added successfully', data: newItem });
  } catch (error: unknown) {
    next(createAppError(getErrorMessage(error), 500));
  }
};

export const getInventory = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      next(createAppError('Tenant ID missing from request context', 401));
      return;
    }

    const result = await getInventoryService(
      tenantId,
      req.query.page as string | undefined,
      req.query.limit as string | undefined,
    );
    res.status(200).json(result);
  } catch (error: unknown) {
    next(createAppError(getErrorMessage(error), 500));
  }
};

export const getLowStockAlerts = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      next(createAppError('Tenant ID missing from request context', 401));
      return;
    }

    const lowStockItems = await getLowStockAlertsService(tenantId);
    res.status(200).json({ data: lowStockItems });
  } catch (error: unknown) {
    next(createAppError(getErrorMessage(error), 500));
  }
};
