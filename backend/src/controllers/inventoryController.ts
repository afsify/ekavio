import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { createAppError, getErrorMessage } from '../utils/AppError.js';
import { addItemService, getInventoryService, getLowStockAlertsService } from '../services/inventoryService.js';
import { requireAuthorizationContext } from '../utils/tenantScope.js';

export const addItem = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const context = requireAuthorizationContext(req);
    const newItem = await addItemService(context, req.body);
    res.status(201).json({ message: 'Inventory item added successfully', data: newItem });
  } catch (error: unknown) {
    next(createAppError(getErrorMessage(error), 500));
  }
};

export const getInventory = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const context = requireAuthorizationContext(req);
    const result = await getInventoryService(
      context,
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
    const context = requireAuthorizationContext(req);
    const lowStockItems = await getLowStockAlertsService(context);
    res.status(200).json({ data: lowStockItems });
  } catch (error: unknown) {
    next(createAppError(getErrorMessage(error), 500));
  }
};
