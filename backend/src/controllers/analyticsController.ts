import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { Inventory } from '../models/Inventory.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import { legacyOrganizationScope } from '../persistence/operationalIdentity.js';
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
    let lowStockCount = 0;
    if (enabledModules.has(MODULES.INVENTORY)) {
      const operational = await runtimePersistence.operationalIdentity.resolve(context);
      lowStockCount = await Inventory.countDocuments({
        ...legacyOrganizationScope(operational),
        $expr: { $lte: ['$currentStock', '$lowStockThreshold'] },
      });
    }

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
