import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import type { MembershipRole } from '../models/Membership.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import { recordSecurityAudit } from '../services/securityAuditService.js';
import { createStaff } from '../services/staffService.js';
import { OrganizationAdministrationService } from '../services/organizationAdministrationService.js';
import { runtimePostgresDatabase } from '../persistence/runtimePersistence.js';
import { AppError } from '../utils/AppError.js';
import { requireAuthorizationContext } from '../utils/tenantScope.js';

export const getStaff = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(request);
    const staff = await new OrganizationAdministrationService(runtimePostgresDatabase).staff(context);
    response.json({ success: true, data: staff });
  } catch (error: unknown) {
    next(error);
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
    next(error);
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
    const service=new OrganizationAdministrationService(runtimePostgresDatabase);
    const members=await service.staff(context);
    const member=members.find(value=>value.id===targetUserId);
    if(!member) throw new AppError('Staff membership not found',404);
    await service.saveMember(context,String(member.membershipId),{role:member.role,customRoleId:member.customRoleId,status:'revoked',branchIds:member.branchIds,version:member.version});
    response.json({ success: true, message: 'Staff membership revoked successfully.' });
  } catch (error: unknown) {
    next(error);
  }
};
