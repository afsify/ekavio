import type { QueryResultRow } from 'pg';
import type { PostgresDatabase } from './database.js';
import { isUuid, asPostgresUserId } from '../persistence/identifiers.js';
import type {
  AuthContext,
  AuthContextSelection,
  BranchContext,
  IdentityRepository,
  IdentityUser,
  MembershipContext,
  PublicUser,
} from '../services/authService.js';
import type { EffectiveEntitlements } from '../services/entitlementService.js';
import type { MembershipRole } from '../models/Membership.js';
import { permissionsForRole } from '../services/authorizationPolicy.js';
import { AppError } from '../utils/AppError.js';

interface UserRow extends QueryResultRow {
  id: string;
  name: string;
  phone: string;
  password_hash: string | null;
  platform_role: 'operator' | null;
}

interface IdentityMembershipRow extends QueryResultRow {
  id: string;
  user_id: string;
  organization_id: string;
  organization_name: string;
  theme_mode: 'light' | 'dark';
  theme_primary_color: string;
  role: MembershipRole;
}

interface IdentityBranchRow extends QueryResultRow {
  id: string;
  membership_id: string;
  organization_id: string;
  name: string;
  code: string;
}

export interface IdentityEntitlementResolver {
  getEffective(organizationId: string): Promise<EffectiveEntitlements>;
}

export class PostgresIdentityRepository implements IdentityRepository {
  public constructor(
    private readonly database: PostgresDatabase,
    private readonly entitlements: IdentityEntitlementResolver,
  ) {}

  private async membershipsForUser(userId: string): Promise<IdentityMembershipRow[]> {
    const result = await this.database.query<IdentityMembershipRow>(
      `SELECT membership.id,
              membership.user_id,
              membership.organization_id,
              organization.name AS organization_name,
              organization.theme_mode,
              organization.theme_primary_color,
              membership.role
       FROM memberships membership
       JOIN organizations organization ON organization.id = membership.organization_id
       WHERE membership.user_id = $1 AND membership.status = 'active'
       ORDER BY membership.created_at, membership.id`,
      [asPostgresUserId(userId)],
    );
    return result.rows;
  }

  private async toIdentityUser(row: UserRow): Promise<IdentityUser> {
    const memberships = await this.membershipsForUser(row.id);
    const primary = memberships[0];
    return {
      id: row.id,
      tenantId: primary?.organization_id ?? '',
      role: primary?.role ?? 'staff',
      name: row.name,
      phone: row.phone,
      passwordHash: row.password_hash ?? '',
      assignments: memberships.map((membership) => ({
        tenantId: membership.organization_id,
        role: membership.role,
      })),
      platformOperator: row.platform_role === 'operator',
    };
  }

  public async findByPhone(phone: string): Promise<IdentityUser[]> {
    const result = await this.database.query<UserRow>(
      `SELECT id, name, phone, password_hash, platform_role
       FROM users WHERE phone = $1 ORDER BY id LIMIT 2`,
      [phone],
    );
    return Promise.all(result.rows.map((row) => this.toIdentityUser(row)));
  }

  public async findById(userId: string): Promise<IdentityUser | null> {
    if (!isUuid(userId)) return null;
    const result = await this.database.query<UserRow>(
      `SELECT id, name, phone, password_hash, platform_role
       FROM users WHERE id = $1`,
      [asPostgresUserId(userId)],
    );
    const row = result.rows[0];
    return row ? this.toIdentityUser(row) : null;
  }

  public async buildContext(
    user: IdentityUser,
    selection: AuthContextSelection = {},
  ): Promise<AuthContext> {
    if (!isUuid(user.id)) throw new AppError('User identity not found', 401);
    const membershipRows = await this.membershipsForUser(user.id);
    if (membershipRows.length === 0) {
      throw new AppError('No active organization membership', 403);
    }

    const branchResult = await this.database.query<IdentityBranchRow>(
      `SELECT branch.id,
              assignment.membership_id,
              branch.organization_id,
              branch.name,
              branch.code
       FROM membership_branch_assignments assignment
       JOIN branches branch
         ON branch.id = assignment.branch_id
        AND branch.organization_id = assignment.organization_id
       WHERE assignment.membership_id = ANY($1::uuid[])
         AND branch.status = 'active'
       ORDER BY branch.code, branch.id`,
      [membershipRows.map((membership) => membership.id)],
    );
    const branchesByMembership = new Map<string, BranchContext[]>();
    for (const branch of branchResult.rows) {
      const current = branchesByMembership.get(branch.membership_id) ?? [];
      current.push({ id: branch.id, name: branch.name, code: branch.code });
      branchesByMembership.set(branch.membership_id, current);
    }

    const memberships: MembershipContext[] = membershipRows.map((membership) => {
      const branches = branchesByMembership.get(membership.id) ?? [];
      return {
        id: membership.id,
        organizationId: membership.organization_id,
        tenantId: membership.organization_id,
        orgName: membership.organization_name,
        role: membership.role,
        status: 'active',
        branchIds: branches.map((branch) => branch.id),
        branches,
      };
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

    const organization = membershipRows.find(
      (membership) => membership.organization_id === activeMembership.organizationId,
    );
    if (!organization) throw new AppError('Access denied to this organization', 403);
    const permissions = permissionsForRole(activeMembership.role);
    const assignments = memberships
      .filter((membership) => membership.id !== activeMembership.id)
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
      entitlements: await this.entitlements.getEffective(activeMembership.organizationId),
      theme: {
        mode: organization.theme_mode,
        primaryColor: organization.theme_primary_color,
      },
    };
  }
}
