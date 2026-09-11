import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';

export const updateProfile = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name } = req.body;
    const userId = req.user?.id;

    if (!name) {
      res.status(400).json({ success: false, message: 'Name is required' });
      return;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { name },
      { new: true }
    ).select('-password');

    if (!updatedUser) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.json({
      success: true,
      data: updatedUser
    });
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user?.id;

    if (!oldPassword || !newPassword) {
      res.status(400).json({ success: false, message: 'Both old and new passwords are required' });
      return;
    }

    const user = await User.findById(userId);
    if (!user || !user.password) {
      res.status(404).json({ success: false, message: 'User not found or password not set' });
      return;
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      res.status(400).json({ success: false, message: 'Invalid old password' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    next(error);
  }
};
