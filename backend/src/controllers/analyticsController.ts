import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import { createAppError, getErrorMessage } from '../utils/AppError.js';
import { requireAuthorizationContext } from '../utils/tenantScope.js';
import { MODULES } from '../commercial/catalogue.js';

export const getDashboardStats = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const context = requireAuthorizationContext(req);
    const entitlements = await runtimePersistence.commercial.getEffective(context.organizationId);
    const enabledModules = new Set(
      entitlements.modules.filter((module) => module.enabled).map((module) => module.key),
    );

    // 1. Total active queue tokens
    if (!context.branchId) throw createAppError('An active branch context is required', 400);
    const activeTokensCount = enabledModules.has(MODULES.QUEUE)
      ? await runtimePersistence.queue.countActive(context.organizationId, context.branchId)
      : 0;

    // 2. Count of low stock items
    const lowStockCount = enabledModules.has(MODULES.INVENTORY)
      ? await runtimePersistence.inventoryService.countLowStock(context)
      : 0;

    const staffPresentCount = enabledModules.has(MODULES.ATTENDANCE)
      ? await runtimePersistence.attendanceService.countPresentToday(context)
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
