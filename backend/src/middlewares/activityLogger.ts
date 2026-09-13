import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './authMiddleware.js';
import { ActivityLog } from '../models/ActivityLog.js';

export const activityLogger = (action: string) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    // We attach a listener to the response finish event to log only if successful,
    // or we can log immediately. For audit logs, logging immediately is often preferred.
    // However, if we want to log the response or ensure it succeeded:
    
    res.on('finish', async () => {
      // Only log successful actions by default (e.g., status 2xx or 3xx)
      if (res.statusCode >= 200 && res.statusCode < 400) {
        try {
          if (req.auth) {
            const logEntry = new ActivityLog({
              tenantId: req.auth.organizationId,
              userId: req.auth.userId,
              action,
              details: {
                method: req.method,
                originalUrl: req.originalUrl,
              },
              ipAddress: req.ip || req.socket.remoteAddress,
            });
            await logEntry.save();
          }
        } catch (error) {
          console.error('Failed to save activity log:', error);
        }
      }
    });

    next();
  };
};
