import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { Queue } from '../models/Queue.js';
import { Inventory } from '../models/Inventory.js';
import { Attendance } from '../models/Attendance.js';
import { createAppError, getErrorMessage } from '../utils/AppError.js';
import { organizationScope, requireAuthorizationContext } from '../utils/tenantScope.js';

export const getDashboardStats = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const context = requireAuthorizationContext(req);
    const scope = organizationScope(context);

    // 1. Total active queue tokens
    const activeTokensCount = await Queue.countDocuments({
      ...scope,
      status: { $in: ['waiting', 'serving'] },
    });

    // 2. Count of low stock items
    const lowStockCount = await Inventory.countDocuments({
      ...scope,
      $expr: { $lte: ['$currentStock', '$lowStockThreshold'] },
    });

    // 3. Total staff present today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const staffPresentCount = await Attendance.countDocuments({
      ...scope,
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
  } catch (error: unknown) {
    next(createAppError(getErrorMessage(error), 500));
  }
};
