import type { NextFunction, Response } from 'express';
import { disconnectUserSockets } from '../config/socket.js';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import type { MembershipRole } from '../models/Membership.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import { recordSecurityAudit } from '../services/securityAuditService.js';
import { createStaff, listStaff, revokeStaff } from '../services/staffService.js';
import { runtimeRefreshSessions } from '../services/sessionService.js';
import { AppError, getErrorMessage } from '../utils/AppError.js';
import { requireAuthorizationContext } from '../utils/tenantScope.js';

export const getStaff = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(request);
    const staff = await listStaff(runtimePersistence.staff, context);
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
    const staff = await createStaff(runtimePersistence.staff, context, {
      name,
      phone,
      password,
      role,
    });
    await recordSecurityAudit(
      context,
      'membership.created',
      { targetUserId: staff.id, membershipId: staff.membershipId, role: staff.role },
      request.ip,
    );

    response.status(201).json({
      success: true,
      data: {
        id: staff.id,
        name: staff.name,
        phone: staff.phone,
        role: staff.role,
        membershipId: staff.membershipId,
        branchIds: staff.branchIds,
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
    const membership = await revokeStaff(runtimePersistence.staff, context, targetUserId);

    await runtimeRefreshSessions.revokeAllForUser(targetUserId);
    disconnectUserSockets(targetUserId);
    await recordSecurityAudit(
      context,
      'membership.revoked',
      { targetUserId, membershipId: membership.membershipId },
      request.ip,
    );
    response.json({ success: true, message: 'Staff membership revoked successfully.' });
  } catch (error: unknown) {
    next(error instanceof AppError ? error : new AppError(getErrorMessage(error), 500));
  }
};
