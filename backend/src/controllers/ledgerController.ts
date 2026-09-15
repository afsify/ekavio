import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { Ledger } from '../models/Ledger.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import { legacyOrganizationScope } from '../persistence/operationalIdentity.js';
import { createAppError, getErrorMessage } from '../utils/AppError.js';
import { requireAuthorizationContext } from '../utils/tenantScope.js';

export const addEntry = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const context = requireAuthorizationContext(req);
    const operational = await runtimePersistence.operationalIdentity.resolve(context);

    const { customerName, phone, amount, type, description } = req.body;

    const newEntry = await Ledger.create({
      tenantId: operational.legacyMongoOrganizationId,
      customerName,
      phone,
      amount,
      type,
      description,
    });

    res.status(201).json({ message: 'Ledger entry added successfully', data: newEntry });
  } catch (error: unknown) {
    next(createAppError(getErrorMessage(error), 500));
  }
};

export const getTenantLedger = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const context = requireAuthorizationContext(req);
    const operational = await runtimePersistence.operationalIdentity.resolve(context);

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const query = legacyOrganizationScope(operational);

    const totalDocs = await Ledger.countDocuments(query);
    const totalPages = Math.ceil(totalDocs / limit);

    const entries = await Ledger.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({ data: entries, totalDocs, totalPages });
  } catch (error: unknown) {
    next(createAppError(getErrorMessage(error), 500));
  }
};
