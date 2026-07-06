import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { Queue } from '../models/Queue.js';
import { AppError } from '../utils/AppError.js';

export const createToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      next(new AppError('Tenant ID missing from request context', 401));
      return;
    }

    const { customerName, phone, serviceType, tokenNumber: customTokenNumber } = req.body;

    const count = await Queue.countDocuments({ tenantId });
    const tokenNumber = customTokenNumber || `#${count + 1}`;

    const queueEntry = new Queue({
      tenantId,
      tokenNumber,
      customerName,
      phone,
      serviceType,
      status: 'waiting',
    });

    await queueEntry.save();

    res.status(201).json({ message: 'Token created successfully', data: queueEntry });
  } catch (error: any) {
    next(new AppError(error.message, 500));
  }
};

export const getQueue = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      next(new AppError('Tenant ID missing from request context', 401));
      return;
    }

    const queue = await Queue.find({ tenantId, status: { $in: ['waiting', 'serving'] } }).sort({ createdAt: 1 });

    res.status(200).json({ data: queue });
  } catch (error: any) {
    next(new AppError(error.message, 500));
  }
};

export const updateTokenStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      next(new AppError('Tenant ID missing from request context', 401));
      return;
    }

    const { tokenId } = req.params;
    const { status } = req.body;

    const updatedToken = await Queue.findOneAndUpdate(
      { _id: tokenId, tenantId } as any,
      { status },
      { new: true, runValidators: true }
    );

    if (!updatedToken) {
      next(new AppError('Token not found or does not belong to tenant', 404));
      return;
    }

    res.status(200).json({ message: 'Token status updated successfully', data: updatedToken });
  } catch (error: any) {
    next(new AppError(error.message, 500));
  }
};
