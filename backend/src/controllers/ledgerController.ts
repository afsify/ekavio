import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { Ledger } from '../models/Ledger.js';
import { createAppError } from '../utils/AppError.js';

export const addEntry = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      next(createAppError('Tenant ID missing from request context', 401));
      return;
    }

    const { customerName, phone, amount, type, description } = req.body;

    const newEntry = await Ledger.create({
      tenantId,
      customerName,
      phone,
      amount,
      type,
      description,
    });

    res.status(201).json({ message: 'Ledger entry added successfully', data: newEntry });
  } catch (error: any) {
    next(createAppError(error.message, 500));
  }
};

export const getTenantLedger = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      next(createAppError('Tenant ID missing from request context', 401));
      return;
    }

    const entries = await Ledger.find({ tenantId }).sort({ createdAt: -1 });

    res.status(200).json({ data: entries });
  } catch (error: any) {
    next(createAppError(error.message, 500));
  }
};
