import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import {
  authService,
  registerAdminService,
  updateThemeService,
} from '../services/authService.js';
import type { AuthService } from '../services/authService.js';
import { getRuntimeConfig } from '../config/env.js';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from '../utils/authCookies.js';
import { AppError, getErrorMessage } from '../utils/AppError.js';
import { disconnectSessionSockets } from '../config/socket.js';

export interface AuthHandlers {
  login(request: Request, response: Response, next: NextFunction): Promise<void>;
  refresh(request: Request, response: Response, next: NextFunction): Promise<void>;
  logout(request: Request, response: Response, next: NextFunction): Promise<void>;
}

export const createAuthHandlers = (service: AuthService): AuthHandlers => ({
  async login(request, response, next) {
    try {
      const userAgent = request.get('user-agent');
      const result = await service.login(request.body, {
        ...(userAgent ? { userAgent } : {}),
        ...(request.ip ? { ipAddress: request.ip } : {}),
      });
      setRefreshCookie(response, result.refreshCredential, getRuntimeConfig());
      response.status(200).json(result.response);
    } catch (error: unknown) {
      next(error instanceof AppError ? error : new AppError(getErrorMessage(error), 500));
    }
  },

  async refresh(request, response, next) {
    try {
      const refreshCredential = readRefreshCookie(request);
      if (!refreshCredential) {
        throw new AppError('Refresh session required', 401);
      }

      const organizationHeader = request.get('x-tenant-id')?.trim();
      const branchHeader = request.get('x-branch-id')?.trim();
      const result = await service.refresh(refreshCredential, {
        ...(organizationHeader ? { organizationId: organizationHeader } : {}),
        ...(branchHeader ? { branchId: branchHeader } : {}),
      });
      setRefreshCookie(response, result.refreshCredential, getRuntimeConfig());
      response.status(200).json(result.response);
    } catch (error: unknown) {
      clearRefreshCookie(response, getRuntimeConfig());
      next(error instanceof AppError ? error : new AppError(getErrorMessage(error), 500));
    }
  },

  async logout(request, response, next) {
    try {
      const sessionId = await service.logout(readRefreshCookie(request));
      if (sessionId) disconnectSessionSockets(sessionId);
      clearRefreshCookie(response, getRuntimeConfig());
      response.status(200).json({ message: 'Signed out successfully' });
    } catch (error: unknown) {
      clearRefreshCookie(response, getRuntimeConfig());
      next(error instanceof AppError ? error : new AppError(getErrorMessage(error), 500));
    }
  },
});

const authHandlers = createAuthHandlers(authService);

export const registerAdmin = async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await registerAdminService(request.body);
    response.status(201).json({
      message: 'Organization and Admin registered successfully',
      ...result,
    });
  } catch (error: unknown) {
    next(new AppError(getErrorMessage(error), 500));
  }
};

export const login = authHandlers.login;
export const refreshSession = authHandlers.refresh;
export const logout = authHandlers.logout;

export const updateTheme = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const organizationId = request.auth?.organizationId;
    if (!organizationId) {
      next(new AppError('Unauthorized: tenant identification missing', 401));
      return;
    }

    const theme = await updateThemeService(organizationId, request.body);
    response.status(200).json({ message: 'Theme updated successfully', theme });
  } catch (error: unknown) {
    next(error instanceof AppError ? error : new AppError(getErrorMessage(error), 500));
  }
};
