import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { authService } from './authService.js';
import { AppError } from '../utils/AppError.js';

export interface PasswordUser {
  password?: string | null;
  save(): Promise<unknown>;
}

export interface PasswordServiceDependencies {
  findUserById(userId: string): Promise<PasswordUser | null>;
  verifyPassword(password: string, passwordHash: string): Promise<boolean>;
  hashPassword(password: string): Promise<string>;
  revokeSessions(userId: string): Promise<void>;
}

export const createPasswordChangeService = ({
  findUserById,
  verifyPassword,
  hashPassword,
  revokeSessions,
}: PasswordServiceDependencies) => {
  return async (userId: string, oldPassword: string, newPassword: string): Promise<void> => {
    const user = await findUserById(userId);
    if (!user?.password) {
      throw new AppError('User not found or password not set', 404);
    }

    const passwordMatches = await verifyPassword(oldPassword, user.password);
    if (!passwordMatches) {
      throw new AppError('Invalid old password', 400);
    }

    user.password = await hashPassword(newPassword);
    await user.save();
    await revokeSessions(userId);
  };
};

export const changePasswordService = createPasswordChangeService({
  findUserById: async (userId) => User.findById(userId),
  verifyPassword: bcrypt.compare,
  hashPassword: (password) => bcrypt.hash(password, 10),
  revokeSessions: (userId) => authService.revokeUserSessions(userId),
});
