import type { Response, NextFunction } from 'express';
import type { ModuleKey } from '../commercial/catalogue.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import type { AuthenticatedRequest } from './authMiddleware.js';

export interface EntitlementReader {
  getEffective(organizationId: string): Promise<{
    modules: Array<{ key: ModuleKey; enabled: boolean }>;
  }>;
}

export const createRequireEntitlement = (reader: EntitlementReader) =>
  (moduleKey: ModuleKey) =>
    async (
      request: AuthenticatedRequest,
      response: Response,
      next: NextFunction,
    ): Promise<void> => {
      try {
        const organizationId = request.auth?.organizationId;
        if (!organizationId) {
          response.status(401).json({ message: 'Tenant ID missing from request context' });
          return;
        }

        const effective = await reader.getEffective(organizationId);
        const module = effective.modules.find((candidate) => candidate.key === moduleKey);
        if (!module?.enabled) {
          response.status(403).json({
            error: {
              code: 'ENTITLEMENT_REQUIRED',
              message: 'Organization does not have the required commercial entitlement',
              module: moduleKey,
            },
          });
          return;
        }

        next();
      } catch (error) {
        next(error);
      }
    };

export const requireEntitlement = createRequireEntitlement(runtimePersistence.commercial);
