import bcrypt from 'bcryptjs';
import type { NextFunction, Response } from 'express';
import { disconnectUserSockets } from '../config/socket.js';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { Membership, membershipRoles, type MembershipRole } from '../models/Membership.js';
import { User } from '../models/User.js';
import { recordSecurityAudit } from '../services/securityAuditService.js';
import { runtimeRefreshSessions } from '../services/sessionService.js';
import { AppError, getErrorMessage } from '../utils/AppError.js';
import { requireAuthorizationContext } from '../utils/tenantScope.js';

const assignableRoles = new Set<MembershipRole>(
  membershipRoles.filter((role) => role !== 'owner'),
);

export const getStaff = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(request);
    const memberships = await Membership.find({
      organizationId: context.organizationId,
      status: 'active',
    })
      .sort({ createdAt: -1 })
      .lean();
    const users = await User.find({
      _id: { $in: memberships.map((membership) => membership.userId) },
    })
      .select('name phone createdAt')
      .lean();
    const userById = new Map(users.map((user) => [String(user._id), user]));
    const staff = memberships.flatMap((membership) => {
      const user = userById.get(String(membership.userId));
      if (!user) return [];
      return [{
        id: String(user._id),
        name: user.name,
        phone: user.phone,
        role: membership.role,
        membershipId: String(membership._id),
        branchIds: membership.branchIds.map(String),
        createdAt: user.createdAt,
      }];
    });
    response.json({ success: true, data: staff });
  } catch (error: unknown) {
    next(error instanceof AppError ? error : new AppError(getErrorMessage(error), 500));
  }
};

export const addStaff = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(request);
    const { name, password } = request.body;
    const phone = typeof request.body.phone === 'string' ? request.body.phone.trim() : '';
    const role = (request.body.role ?? 'staff') as MembershipRole;
    if (!assignableRoles.has(role)) {
      throw new AppError('Unsupported organization role', 400);
    }

    // Identity linking requires proof of ownership and is intentionally deferred.
    if (await User.exists({ phone })) {
      throw new AppError('An identity with this phone already exists', 409);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      tenantId: context.organizationId,
      name,
      phone,
      password: hashedPassword,
      role: role === 'admin' ? 'admin' : 'staff',
    });
    const membership = await Membership.create({
      userId: newUser._id,
      organizationId: context.organizationId,
      role,
      status: 'active',
      branchIds: context.branchId ? [context.branchId] : [],
    });
    await recordSecurityAudit(
      context,
      'membership.created',
      { targetUserId: String(newUser._id), membershipId: String(membership._id), role },
      request.ip,
    );

    response.status(201).json({
      success: true,
      data: {
        id: String(newUser._id),
        name: newUser.name,
        phone: newUser.phone,
        role: membership.role,
        membershipId: String(membership._id),
        branchIds: membership.branchIds.map(String),
      },
    });
  } catch (error: unknown) {
    next(error instanceof AppError ? error : new AppError(getErrorMessage(error), 500));
  }
};

export const deleteStaff = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(request);
    const targetUserId = request.params.id as string;
    if (targetUserId === context.userId) {
      throw new AppError('You cannot revoke your own active membership', 400);
    }

    const membership = await Membership.findOneAndUpdate(
      {
        userId: targetUserId,
        organizationId: context.organizationId,
        status: 'active',
      },
      { $set: { status: 'revoked' } },
      { new: true, runValidators: true },
    );
    if (!membership) {
      throw new AppError('Staff membership not found', 404);
    }

    await runtimeRefreshSessions.revokeAllForUser(targetUserId);
    disconnectUserSockets(targetUserId);
    await recordSecurityAudit(
      context,
      'membership.revoked',
      { targetUserId, membershipId: String(membership._id) },
      request.ip,
    );
    response.json({ success: true, message: 'Staff membership revoked successfully.' });
  } catch (error: unknown) {
    next(error instanceof AppError ? error : new AppError(getErrorMessage(error), 500));
  }
};
