import { Organization } from '../models/Organization.js';
import { User } from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError.js';

export const registerAdminService = async (data: any) => {
  const { orgName, orgType, userName, phone, password } = data;

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

  return { organization, user: userResponse };
};

export const loginService = async (data: any) => {
  const { phone, password } = data;

  const user = await User.findOne({ phone });

  if (!user) {
    throw new AppError('Invalid credentials', 401);
  }

  const isMatch = await bcrypt.compare(password, user.password || '');
  if (!isMatch) {
    throw new AppError('Invalid credentials', 401);
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

  return {
    accessToken,
    refreshToken,
    userId: user._id,
    tenantId: user.tenantId,
    role: user.role,
    user: userResponse,
    theme,
  };
};

export const updateThemeService = async (tenantId: string, data: any) => {
  const { mode, primaryColor } = data;

  const organization = await Organization.findById(tenantId);
  if (!organization) {
    throw new AppError('Organization not found', 404);
  }

  organization.theme = {
    mode: mode || organization.theme?.mode || 'light',
    primaryColor: primaryColor || organization.theme?.primaryColor || '#4F46E5',
  };

  await organization.save();

  return organization.theme;
};

export const refreshTokenService = async (token: string) => {
  if (!token) {
    throw new AppError('Refresh token is required', 400);
  }

  try {
    const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET || 'default_refresh_secret') as any;
    
    const user = await User.findById(decoded.id);
    if (!user) {
      throw new AppError('User not found', 401);
    }

    const payload = {
      id: user._id,
      tenantId: user.tenantId,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, process.env.JWT_SECRET || 'default_secret', { expiresIn: '15m' });
    const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET || 'default_refresh_secret', { expiresIn: '7d' });

    return {
      accessToken,
      refreshToken,
    };
  } catch (error) {
    throw new AppError('Invalid or expired refresh token', 401);
  }
};
