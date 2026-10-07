import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { dashboardAnalytics } from '../services/analyticsService.js';
import { requireAuthorizationContext } from '../utils/tenantScope.js';

export const getDashboardStats = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const context = requireAuthorizationContext(req);
    res.setHeader('Cache-Control','no-store');
    res.status(200).json({data:await dashboardAnalytics.get(context)});
  } catch (error: unknown) {
    next(error);
  }
};
