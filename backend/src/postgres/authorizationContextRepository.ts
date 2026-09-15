import type { PostgresDatabase } from './database.js';
import {
  asPostgresBranchId,
  asPostgresOrganizationId,
  asPostgresUserId,
  isUuid,
} from '../persistence/identifiers.js';
import type {
  ActiveMembershipRecord,
  AuthorizationContextRepository,
  BranchAccessRecord,
} from '../services/requestContextService.js';
import type { MembershipRole } from '../models/Membership.js';

interface MembershipRow {
  id: string;
  user_id: string;
  organization_id: string;
  role: MembershipRole;
  branch_ids: string[];
}

interface BranchRow {
  id: string;
  organization_id: string;
  status: 'active' | 'inactive';
}

export class PostgresAuthorizationContextRepository implements AuthorizationContextRepository {
  public constructor(private readonly database: PostgresDatabase) {}

  public async isSessionActive(sessionId: string, userId: string, now: Date): Promise<boolean> {
    if (!isUuid(userId)) return false;
    const result = await this.database.query<{ active: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM auth_sessions session
         JOIN users app_user ON app_user.id = session.user_id
         WHERE session.session_id = $1
           AND session.user_id = $2
           AND session.revoked_at IS NULL
           AND session.expires_at > $3
       ) AS active`,
      [sessionId, asPostgresUserId(userId), now],
    );
    return result.rows[0]?.active === true;
  }

  public async findActiveMembership(
    userId: string,
    organizationId: string,
  ): Promise<ActiveMembershipRecord | null> {
    if (!isUuid(userId) || !isUuid(organizationId)) return null;
    const result = await this.database.query<MembershipRow>(
      `SELECT membership.id,
              membership.user_id,
              membership.organization_id,
              membership.role,
              COALESCE(
                array_agg(assignment.branch_id ORDER BY assignment.branch_id)
                  FILTER (WHERE assignment.branch_id IS NOT NULL),
                ARRAY[]::uuid[]
              ) AS branch_ids
       FROM memberships membership
       JOIN users app_user ON app_user.id = membership.user_id
       JOIN organizations organization ON organization.id = membership.organization_id
       LEFT JOIN membership_branch_assignments assignment
         ON assignment.membership_id = membership.id
        AND assignment.organization_id = membership.organization_id
       WHERE membership.user_id = $1
         AND membership.organization_id = $2
         AND membership.status = 'active'
       GROUP BY membership.id`,
      [asPostgresUserId(userId), asPostgresOrganizationId(organizationId)],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          userId: row.user_id,
          organizationId: row.organization_id,
          role: row.role,
          branchIds: row.branch_ids.map(String),
        }
      : null;
  }

  public async organizationExists(organizationId: string): Promise<boolean> {
    if (!isUuid(organizationId)) return false;
    const result = await this.database.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM organizations WHERE id = $1) AS exists',
      [asPostgresOrganizationId(organizationId)],
    );
    return result.rows[0]?.exists === true;
  }

  public async findBranch(branchId: string): Promise<BranchAccessRecord | null> {
    if (!isUuid(branchId)) return null;
    const result = await this.database.query<BranchRow>(
      'SELECT id, organization_id, status FROM branches WHERE id = $1',
      [asPostgresBranchId(branchId)],
    );
    const row = result.rows[0];
    return row
      ? { id: row.id, organizationId: row.organization_id, status: row.status }
      : null;
  }

  public async isPlatformOperator(userId: string): Promise<boolean> {
    if (!isUuid(userId)) return false;
    const result = await this.database.query<{ operator: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM users WHERE id = $1 AND platform_role = 'operator'
       ) AS operator`,
      [asPostgresUserId(userId)],
    );
    return result.rows[0]?.operator === true;
  }
}
