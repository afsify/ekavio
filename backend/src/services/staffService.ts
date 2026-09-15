import bcrypt from 'bcryptjs';
import type { MembershipRole } from '../models/Membership.js';
import type { AuthorizationContext } from './requestContextService.js';
import { AppError } from '../utils/AppError.js';

export interface StaffRecord {
  id: string;
  name: string;
  phone: string;
  role: MembershipRole;
  membershipId: string;
  branchIds: string[];
  createdAt?: Date;
}

export interface CreateStaffPersistenceInput {
  organizationId: string;
  branchId?: string;
  name: string;
  phone: string;
  passwordHash: string;
  role: Exclude<MembershipRole, 'owner'>;
}

export interface StaffRepository {
  list(organizationId: string): Promise<StaffRecord[]>;
  create(input: CreateStaffPersistenceInput): Promise<StaffRecord | 'phone-conflict'>;
  revoke(organizationId: string, userId: string): Promise<{ membershipId: string } | null>;
}

const assignableRoles = new Set<MembershipRole>(['admin', 'manager', 'hr', 'staff']);

const requireAssignableRole = (role: MembershipRole): Exclude<MembershipRole, 'owner'> => {
  if (!assignableRoles.has(role)) throw new AppError('Unsupported organization role', 400);
  return role as Exclude<MembershipRole, 'owner'>;
};

export const listStaff = (
  repository: StaffRepository,
  context: AuthorizationContext,
): Promise<StaffRecord[]> => repository.list(context.organizationId);

export const createStaff = async (
  repository: StaffRepository,
  context: AuthorizationContext,
  input: { name: string; phone: string; password: string; role?: MembershipRole },
): Promise<StaffRecord> => {
  const role = requireAssignableRole(input.role ?? 'staff');
  const result = await repository.create({
    organizationId: context.organizationId,
    ...(context.branchId ? { branchId: context.branchId } : {}),
    name: input.name,
    phone: input.phone.trim(),
    passwordHash: await bcrypt.hash(input.password, 10),
    role,
  });
  if (result === 'phone-conflict') {
    throw new AppError('An identity with this phone already exists', 409);
  }
  return result;
};

export const revokeStaff = async (
  repository: StaffRepository,
  context: AuthorizationContext,
  targetUserId: string,
): Promise<{ membershipId: string }> => {
  if (targetUserId === context.userId) {
    throw new AppError('You cannot revoke your own active membership', 400);
  }
  const revoked = await repository.revoke(context.organizationId, targetUserId);
  if (!revoked) throw new AppError('Staff membership not found', 404);
  return revoked;
};
