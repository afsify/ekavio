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

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const query = { tenantId };

    const totalDocs = await Ledger.countDocuments(query);
    const totalPages = Math.ceil(totalDocs / limit);

    const entries = await Ledger.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({ data: entries, totalDocs, totalPages });
  } catch (error: any) {
    next(createAppError(error.message, 500));
  }
};
