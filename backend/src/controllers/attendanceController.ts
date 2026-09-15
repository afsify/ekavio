import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import {
  createAttendanceReader,
  createAttendanceWriter,
} from '../services/attendanceService.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import { AppError, getErrorMessage } from '../utils/AppError.js';
import { requireAuthorizationContext } from '../utils/tenantScope.js';

const attendanceDependencies = {
  storage: runtimePersistence.attendanceStorage,
  identities: runtimePersistence.attendanceIdentities,
  operationalIdentity: runtimePersistence.operationalIdentity,
};
const markAttendanceForContext = createAttendanceWriter(attendanceDependencies);
const listAttendanceForContext = createAttendanceReader(attendanceDependencies);

export const markAttendance = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(request);
    const attendance = await markAttendanceForContext(context, request.body);
    response.status(200).json({ message: 'Attendance marked successfully', data: attendance });
  } catch (error: unknown) {
    next(error instanceof AppError ? error : new AppError(getErrorMessage(error), 500));
  }
};

export const getDailyAttendance = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(request);
    const dateQuery = request.query.date as string | undefined;
    const records = await listAttendanceForContext(
      context,
      dateQuery ? new Date(dateQuery) : new Date(),
    );
    response.status(200).json({ data: records });
  } catch (error: unknown) {
    next(error instanceof AppError ? error : new AppError(getErrorMessage(error), 500));
  }
};
