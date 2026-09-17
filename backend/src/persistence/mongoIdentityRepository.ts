import { Branch } from '../models/Branch.js';
import { Membership } from '../models/Membership.js';
import { Organization } from '../models/Organization.js';
import { User } from '../models/User.js';
import type {
  AuthContext,
  AuthContextSelection,
  IdentityRepository,
  IdentityUser,
  MembershipContext,
  PublicUser,
} from '../services/authService.js';
import { permissionsForRole } from '../services/authorizationPolicy.js';
import { createEntitlementService } from '../services/entitlementService.js';
import { legacyMongoEntitlementRepository } from '../postgres/legacyMongoCommercialRepository.js';
import { AppError } from '../utils/AppError.js';

const legacyMongoEntitlements = createEntitlementService(legacyMongoEntitlementRepository);

const toIdentityUser = (user: InstanceType<typeof User>): IdentityUser => ({
  id: String(user._id),
  tenantId: String(user.tenantId),
  role: user.role ?? 'staff',
  ...(user.name ? { name: user.name } : {}),
  phone: user.phone,
  passwordHash: user.password ?? '',
  assignments: (user.assignments ?? []).map((assignment) => ({
    tenantId: String(assignment.tenantId),
    role: assignment.role,
  })),
  platformOperator: user.platformRole === 'operator',
});

export const mongooseIdentityRepository: IdentityRepository = {
  async findByPhone(phone) {
    const users = await User.find({ phone }).select('+platformRole').limit(2);
    return users.map(toIdentityUser);
  },

  async findById(userId) {
    const user = await User.findById(userId).select('+platformRole');
    return user ? toIdentityUser(user) : null;
  },

  async buildContext(user, selection: AuthContextSelection = {}): Promise<AuthContext> {
    const membershipDocuments = await Membership.find({ userId: user.id, status: 'active' }).lean();
    if (membershipDocuments.length === 0) {
      throw new AppError('No active organization membership', 403);
    }
    const organizationIds = membershipDocuments.map((membership) => String(membership.organizationId));
    const organizations = await Organization.find({ _id: { $in: organizationIds } }).lean();
    const organizationById = new Map(
      organizations.map((organization) => [String(organization._id), organization]),
    );
    const branchIds = membershipDocuments.flatMap((membership) => membership.branchIds.map(String));
    const branches = await Branch.find({
      _id: { $in: branchIds },
      organizationId: { $in: organizationIds },
      status: 'active',
    }).lean();
    const branchById = new Map(branches.map((branch) => [String(branch._id), branch]));
    const memberships: MembershipContext[] = membershipDocuments.flatMap((membership) => {
      const organizationId = String(membership.organizationId);
      const organization = organizationById.get(organizationId);
      if (!organization) return [];
      const availableBranches = membership.branchIds.flatMap((branchId) => {
        const branch = branchById.get(String(branchId));
        if (!branch || String(branch.organizationId) !== organizationId) return [];
        return [{ id: String(branch._id), name: branch.name, code: branch.code }];
      });
      return [{
        id: String(membership._id),
        organizationId,
        tenantId: organizationId,
        ...(organization.name ? { orgName: organization.name } : {}),
        role: membership.role,
        status: 'active' as const,
        branchIds: availableBranches.map((branch) => branch.id),
        branches: availableBranches,
      }];
    });
    const requestedOrganizationId = selection.organizationId ?? user.tenantId;
    const activeMembership = memberships.find(
      (membership) => membership.organizationId === requestedOrganizationId,
    );
    if (!activeMembership) throw new AppError('Access denied to this organization', 403);
    let branchId = selection.branchId;
    if (branchId && !activeMembership.branchIds.includes(branchId)) {
      throw new AppError('Access denied to this branch', 403);
    }
    branchId ??= activeMembership.branchIds[0];
    const primaryOrganization = organizationById.get(activeMembership.organizationId);
    const permissions = permissionsForRole(activeMembership.role);
    const assignments = memberships
      .filter((membership) => membership.organizationId !== activeMembership.organizationId)
      .map((membership) => ({
        tenantId: membership.organizationId,
        role: membership.role,
        ...(membership.orgName ? { orgName: membership.orgName } : {}),
      }));
    const publicUser: PublicUser = {
      id: user.id,
      tenantId: activeMembership.organizationId,
      organizationId: activeMembership.organizationId,
      membershipId: activeMembership.id,
      ...(branchId ? { branchId } : {}),
      role: activeMembership.role,
      permissions,
      ...(user.name ? { name: user.name } : {}),
      phone: user.phone,
      assignments,
      memberships,
    };
    return {
      userId: user.id,
      tenantId: activeMembership.organizationId,
      organizationId: activeMembership.organizationId,
      membershipId: activeMembership.id,
      ...(branchId ? { branchId } : {}),
      role: activeMembership.role,
      permissions,
      platformOperator: user.platformOperator === true,
      memberships,
      user: publicUser,
      assignments,
      entitlements: await legacyMongoEntitlements.getEffective(activeMembership.organizationId),
      theme: primaryOrganization?.theme
        ? {
            mode: primaryOrganization.theme.mode,
            primaryColor: primaryOrganization.theme.primaryColor,
          }
        : { mode: 'light', primaryColor: '#4F46E5' },
    };
  },
};
