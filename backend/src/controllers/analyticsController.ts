import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { Queue } from '../models/Queue.js';
import { Inventory } from '../models/Inventory.js';
import { Attendance } from '../models/Attendance.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import { legacyOrganizationScope } from '../persistence/operationalIdentity.js';
import { createAppError, getErrorMessage } from '../utils/AppError.js';
import { requireAuthorizationContext } from '../utils/tenantScope.js';
import { MODULES } from '../commercial/catalogue.js';

export const getDashboardStats = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const context = requireAuthorizationContext(req);
    const operational = await runtimePersistence.operationalIdentity.resolve(context);
    const scope = legacyOrganizationScope(operational);
    const entitlements = await runtimePersistence.commercial.getEffective(context.organizationId);
    const enabledModules = new Set(
      entitlements.modules.filter((module) => module.enabled).map((module) => module.key),
    );

    // 1. Total active queue tokens
    const activeTokensCount = enabledModules.has(MODULES.QUEUE)
      ? await Queue.countDocuments({
          ...scope,
          status: { $in: ['waiting', 'serving'] },
        })
      : 0;

    // 2. Count of low stock items
    const lowStockCount = enabledModules.has(MODULES.INVENTORY)
      ? await Inventory.countDocuments({
          ...scope,
          $expr: { $lte: ['$currentStock', '$lowStockThreshold'] },
        })
      : 0;

    // 3. Total staff present today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const staffPresentCount = enabledModules.has(MODULES.ATTENDANCE)
      ? await Attendance.countDocuments({
          ...scope,
          date: { $gte: startOfDay, $lte: endOfDay },
          status: 'present',
        })
      : 0;

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
