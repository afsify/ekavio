import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { Inventory } from '../models/Inventory.js';
import { AppError } from '../utils/AppError.js';

export const addItem = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      next(new AppError('Tenant ID missing from request context', 401));
      return;
    }

    const { itemName, currentStock, lowStockThreshold, price } = req.body;

    const newItem = new Inventory({
      tenantId,
      itemName,
      currentStock,
      lowStockThreshold,
      price,
    });

    await newItem.save();

    res.status(201).json({ message: 'Inventory item added successfully', data: newItem });
  } catch (error: any) {
    next(new AppError(error.message, 500));
  }
};

export const getInventory = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      next(new AppError('Tenant ID missing from request context', 401));
      return;
    }

    const items = await Inventory.find({ tenantId }).sort({ itemName: 1 });

    res.status(200).json({ data: items });
  } catch (error: any) {
    next(new AppError(error.message, 500));
  }
};

export const getLowStockAlerts = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      next(new AppError('Tenant ID missing from request context', 401));
      return;
    }

    const lowStockItems = await Inventory.find({
      tenantId,
      $expr: { $lte: ['$currentStock', '$lowStockThreshold'] },
    }).sort({ currentStock: 1 });

    res.status(200).json({ data: lowStockItems });
  } catch (error: any) {
    next(new AppError(error.message, 500));
  }
};
