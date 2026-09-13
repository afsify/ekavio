import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { Attendance } from '../models/Attendance.js';
import { createAppError, getErrorMessage } from '../utils/AppError.js';

export const markAttendance = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      next(createAppError('Tenant ID missing from request context', 401));
      return;
    }

    const { userId, date, status } = req.body;

    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
      next(createAppError('Invalid date format', 400));
      return;
    }

    const normalizedDate = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()));

    const attendance = await Attendance.findOneAndUpdate(
      { tenantId, userId, date: normalizedDate },
      { $set: { tenantId, userId, date: normalizedDate, status } },
      { new: true, upsert: true, runValidators: true }
    );

    res.status(200).json({ message: 'Attendance marked successfully', data: attendance });
  } catch (error: unknown) {
    next(createAppError(getErrorMessage(error), 500));
  }
};

export const getDailyAttendance = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      next(createAppError('Tenant ID missing from request context', 401));
      return;
    }

    const dateQuery = req.query.date as string | undefined;
    const targetDate = dateQuery ? new Date(dateQuery) : new Date();

    if (isNaN(targetDate.getTime())) {
      next(createAppError('Invalid date parameter', 400));
      return;
    }

    const startOfDay = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()));
    const endOfDay = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 23, 59, 59, 999));

    const records = await Attendance.find({
      tenantId,
      date: { $gte: startOfDay, $lte: endOfDay },
    }).populate('userId', 'name phone role').sort({ createdAt: -1 });

    res.status(200).json({ data: records });
  } catch (error: unknown) {
    next(createAppError(getErrorMessage(error), 500));
  }
};
