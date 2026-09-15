import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { getRuntimeConfig } from '../config/env.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import { changePasswordService } from '../services/profileService.js';
import { clearRefreshCookie } from '../utils/authCookies.js';
import { disconnectUserSockets } from '../config/socket.js';

export const updateProfile = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { name } = request.body;
    const userId = request.user?.id;

    if (!name) {
      response.status(400).json({ success: false, message: 'Name is required' });
      return;
    }

    const updatedUser = await runtimePersistence.accounts.updateProfileName(userId, name);

    if (!updatedUser) {
      response.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    response.json({ success: true, data: updatedUser });
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { oldPassword, newPassword } = request.body;
    const userId = request.user?.id;

    if (!oldPassword || !newPassword) {
      response.status(400).json({
        success: false,
        message: 'Both old and new passwords are required',
      });
      return;
    }

    if (!userId) {
      response.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    await changePasswordService(userId, oldPassword, newPassword);
    disconnectUserSockets(userId);
    clearRefreshCookie(response, getRuntimeConfig());
    response.json({
      success: true,
      message: 'Password changed successfully. Sign in again to continue.',
    });
  } catch (error) {
    next(error);
  }
};
