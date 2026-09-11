import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { AppError } from '../utils/AppError.js';
import { registerAdminService, loginService, updateThemeService, refreshTokenService } from '../services/authService.js';

export const registerAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await registerAdminService(req.body);
    res.status(201).json({ message: 'Organization and Admin registered successfully', ...result });
  } catch (error: any) {
    next(new AppError(error.message, 500));
  }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await loginService(req.body);
    res.status(200).json(result);
  } catch (error: any) {
    next(error instanceof AppError ? error : new AppError(error.message, 500));
  }
};

export const updateTheme = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      next(new AppError('Unauthorized: tenant identification missing', 401));
      return;
    }

    const theme = await updateThemeService(tenantId, req.body);
    res.status(200).json({
      message: 'Theme updated successfully',
      theme,
    });
  } catch (error: any) {
    next(error instanceof AppError ? error : new AppError(error.message, 500));
  }
};

export const refreshToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    const result = await refreshTokenService(refreshToken);
    res.status(200).json(result);
  } catch (error: any) {
    next(error instanceof AppError ? error : new AppError(error.message, 500));
  }
};
