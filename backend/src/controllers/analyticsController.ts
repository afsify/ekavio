import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { Queue } from '../models/Queue.js';
import { Inventory } from '../models/Inventory.js';
import { Attendance } from '../models/Attendance.js';
import { createAppError } from '../utils/AppError.js';

export const getDashboardStats = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      next(createAppError('Tenant ID missing from request context', 401));
      return;
    }

    // 1. Total active queue tokens
    const activeTokensCount = await Queue.countDocuments({
      tenantId,
      status: { $in: ['waiting', 'serving'] },
    });

    // 2. Count of low stock items
    const lowStockCount = await Inventory.countDocuments({
      tenantId,
      $expr: { $lte: ['$currentStock', '$lowStockThreshold'] },
    });

    // 3. Total staff present today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const staffPresentCount = await Attendance.countDocuments({
      tenantId,
      date: { $gte: startOfDay, $lte: endOfDay },
      status: 'present',
    });

    res.status(200).json({
      data: {
        totalQueue: activeTokensCount,
        lowStockItems: lowStockCount,
        presentStaff: staffPresentCount,
      },
    });
  } catch (error: any) {
    next(createAppError(error.message, 500));
  }
};
