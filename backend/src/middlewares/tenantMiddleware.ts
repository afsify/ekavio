import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './authMiddleware.js';
import { Organization } from '../models/Organization.js';

export const requireModule = (moduleName: string) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        res.status(401).json({ message: 'Tenant ID missing from request context' });
        return;
      }

      const organization = await Organization.findById(tenantId);

      if (!organization) {
        res.status(404).json({ message: 'Organization not found' });
        return;
      }

      if (organization.subscriptionStatus !== 'active') {
        res.status(403).json({ message: 'Organization subscription is not active' });
        return;
      }

      if (!organization.activeModules.includes(moduleName)) {
        res.status(403).json({ message: `Access denied. Module '${moduleName}' is not active.` });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
