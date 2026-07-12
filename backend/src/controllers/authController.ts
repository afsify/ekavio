import type { Request, Response, NextFunction } from 'express';
import { Organization } from '../models/Organization.js';
import { User } from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError.js';

export const registerAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { orgName, orgType, userName, phone, password } = req.body;

    const organization = new Organization({
      name: orgName,
      type: orgType,
      activeModules: ['queue'] // Default modules
    });

    await organization.save();

    const hashedPassword = await bcrypt.hash(password, 10);

    const adminUser = new User({
      tenantId: organization._id,
      name: userName,
      phone,
      password: hashedPassword,
      role: 'admin'
    });

    await adminUser.save();

    const userResponse = {
      id: adminUser._id,
      tenantId: adminUser.tenantId,
      name: adminUser.name,
      phone: adminUser.phone,
      role: adminUser.role,
    };

    res.status(201).json({ message: 'Organization and Admin registered successfully', organization, user: userResponse });
  } catch (error: any) {
    next(new AppError(error.message, 500));
  }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { phone, password } = req.body;

    const user = await User.findOne({ phone });

    if (!user) {
      next(new AppError('Invalid credentials', 401));
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password || '');
    if (!isMatch) {
      next(new AppError('Invalid credentials', 401));
      return;
    }

    const payload = {
      id: user._id,
      tenantId: user.tenantId,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, process.env.JWT_SECRET || 'default_secret', { expiresIn: '15m' });
    const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET || 'default_refresh_secret', { expiresIn: '7d' });

    const userResponse = {
      id: user._id,
      tenantId: user.tenantId,
      name: user.name,
      phone: user.phone,
      role: user.role,
    };

    const organization = await Organization.findById(user.tenantId);
    const theme = organization?.theme || { mode: 'light', primaryColor: '#4F46E5' };

    res.status(200).json({
      accessToken,
      refreshToken,
      userId: user._id,
      tenantId: user.tenantId,
      role: user.role,
      user: userResponse,
      theme,
    });
  } catch (error: any) {
    next(new AppError(error.message, 500));
  }
};
