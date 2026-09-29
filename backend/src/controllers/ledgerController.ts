import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import { customerDueListQuerySchema } from '../schemas/customerDuesSchemas.js';
import { AppError, getErrorMessage } from '../utils/AppError.js';
import { requireAuthorizationContext } from '../utils/tenantScope.js';

/** Time-bounded read-only compatibility adapter over canonical PostgreSQL Customer Dues. */
export const getTenantLedger = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = customerDueListQuerySchema.safeParse(req.query);
    if (!query.success) throw new AppError('Invalid Customer Dues list filters', 400);
    const result = await runtimePersistence.customerDuesService.list(
      requireAuthorizationContext(req),
      query.data,
    );
    res.status(200).json({ ...result, compatibility: 'customer-dues-read-only' });
  } catch (error: unknown) {
    next(error instanceof AppError ? error : new AppError(getErrorMessage(error), 500));
  }
};
