import type { NextFunction, Response } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import { attendanceRosterQuerySchema, type MarkAttendanceInput } from '../schemas/attendanceSchemas.js';
import { AppError, getErrorMessage } from '../utils/AppError.js';
import { requireAuthorizationContext } from '../utils/tenantScope.js';

const uuid = z.string().uuid();
const handleError = (error: unknown): AppError =>
  error instanceof AppError ? error : new AppError(getErrorMessage(error), 500);

export const markAttendance = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(request);
    const result = await runtimePersistence.attendanceService.mark(
      context,
      request.body as MarkAttendanceInput,
    );
    response.status(200).json({ success: true, data: result });
  } catch (error) {
    next(handleError(error));
  }
};

export const getDailyAttendance = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(request);
    const query = attendanceRosterQuerySchema.safeParse(request.query);
    if (!query.success) throw new AppError('Attendance date must be a valid YYYY-MM-DD value', 400);
    const data = await runtimePersistence.attendanceService.dailyRoster(
      context,
      query.data.date,
    );
    response.status(200).json({ success: true, data });
  } catch (error) {
    next(handleError(error));
  }
};

export const getAttendanceHistory = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const parsed = uuid.safeParse(request.params.recordId);
    if (!parsed.success) throw new AppError('Invalid attendance record identifier', 400);
    const context = requireAuthorizationContext(request);
    const data = await runtimePersistence.attendanceService.history(context, parsed.data);
    response.status(200).json({ success: true, data });
  } catch (error) {
    next(handleError(error));
  }
};
