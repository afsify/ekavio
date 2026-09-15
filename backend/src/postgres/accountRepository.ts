import type { PostgresDatabase } from './database.js';
import type {
  AccountRepository,
  RegistrationPersistenceInput,
  RegistrationResult,
} from '../services/accountPersistence.js';
import {
  asPostgresBranchId,
  asPostgresMembershipId,
  asPostgresOrganizationId,
  asPostgresUserId,
  generateLegacyMongoBranchId,
  generateLegacyMongoMembershipId,
  generateLegacyMongoOrganizationId,
  generateLegacyMongoUserId,
} from '../persistence/identifiers.js';

export class PostgresAccountRepository implements AccountRepository {
  public constructor(private readonly database: PostgresDatabase) {}

  public registerAdmin(input: RegistrationPersistenceInput): Promise<RegistrationResult> {
    return this.database.transaction(async (client) => {
      const now = new Date();
      const organization = await client.query<{ id: string }>(
        `INSERT INTO organizations
          (legacy_mongo_id, name, type, theme_mode, theme_primary_color, created_at, updated_at)
         VALUES ($1, $2, $3, 'light', '#4F46E5', $4, $4)
         RETURNING id`,
        [generateLegacyMongoOrganizationId(), input.orgName, input.orgType, now],
      );
      const organizationId = organization.rows[0]?.id;
      if (!organizationId) throw new Error('PostgreSQL registration returned no organization ID');
      const branch = await client.query<{ id: string }>(
        `INSERT INTO branches
          (legacy_mongo_id, organization_id, name, code, status, created_at, updated_at)
         VALUES ($1, $2, 'Main', 'main', 'active', $3, $3)
         RETURNING id`,
        [generateLegacyMongoBranchId(), organizationId, now],
      );
      const branchId = branch.rows[0]?.id;
      if (!branchId) throw new Error('PostgreSQL registration returned no branch ID');
      const user = await client.query<{ id: string }>(
        `INSERT INTO users
          (legacy_mongo_id, name, phone, password_hash, platform_role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NULL, $5, $5)
         RETURNING id`,
        [generateLegacyMongoUserId(), input.userName, input.phone, input.passwordHash, now],
      );
      const userId = user.rows[0]?.id;
      if (!userId) throw new Error('PostgreSQL registration returned no user ID');
      const membership = await client.query<{ id: string }>(
        `INSERT INTO memberships
          (legacy_mongo_id, user_id, organization_id, role, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'admin', 'active', $4, $4)
         RETURNING id`,
        [generateLegacyMongoMembershipId(), userId, organizationId, now],
      );
      const membershipId = membership.rows[0]?.id;
      if (!membershipId) throw new Error('PostgreSQL registration returned no membership ID');
      await client.query(
        `INSERT INTO membership_branch_assignments (membership_id, branch_id, organization_id)
         VALUES ($1, $2, $3)`,
        [membershipId, branchId, organizationId],
      );
      return {
        organization: { id: organizationId, name: input.orgName, type: input.orgType },
        branch: {
          id: branchId,
          organizationId,
          name: 'Main',
          code: 'main',
          status: 'active',
        },
        user: {
          id: userId,
          tenantId: organizationId,
          name: input.userName,
          phone: input.phone,
          role: 'admin',
        },
      };
    });
  }

  public async updateTheme(
    organizationId: string,
    data: { mode?: 'light' | 'dark'; primaryColor?: string },
  ): Promise<{ mode: 'light' | 'dark'; primaryColor: string } | null> {
    const result = await this.database.query<{ theme_mode: 'light' | 'dark'; theme_primary_color: string }>(
      `UPDATE organizations
       SET theme_mode = COALESCE($2, theme_mode),
           theme_primary_color = COALESCE($3, theme_primary_color),
           updated_at = NOW()
       WHERE id = $1
       RETURNING theme_mode, theme_primary_color`,
      [asPostgresOrganizationId(organizationId), data.mode ?? null, data.primaryColor ?? null],
    );
    const row = result.rows[0];
    return row ? { mode: row.theme_mode, primaryColor: row.theme_primary_color } : null;
  }

  public async updateProfileName(userId: string | undefined, name: string): Promise<unknown | null> {
    if (!userId) return null;
    const result = await this.database.query<{ id: string; name: string; phone: string }>(
      `UPDATE users SET name = $2, updated_at = NOW() WHERE id = $1
       RETURNING id, name, phone`,
      [asPostgresUserId(userId), name],
    );
    return result.rows[0] ?? null;
  }

  public async findPasswordHash(userId: string): Promise<string | null> {
    const result = await this.database.query<{ password_hash: string | null }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [asPostgresUserId(userId)],
    );
    return result.rows[0]?.password_hash ?? null;
  }

  public replacePasswordHashAndRevokeSessions(
    userId: string,
    passwordHash: string,
  ): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const now = new Date();
      const updated = await client.query(
        'UPDATE users SET password_hash = $2, updated_at = $3 WHERE id = $1',
        [asPostgresUserId(userId), passwordHash, now],
      );
      if (updated.rowCount !== 1) return false;
      await client.query(
        `UPDATE auth_sessions
         SET revoked_at = $2, updated_at = $2
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [asPostgresUserId(userId), now],
      );
      return true;
    });
  }

  public async assignBranch(
    membershipId: string,
    organizationId: string,
    branchId: string,
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(
        `INSERT INTO membership_branch_assignments (membership_id, branch_id, organization_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (membership_id, branch_id) DO NOTHING`,
        [
          asPostgresMembershipId(membershipId),
          asPostgresBranchId(branchId),
          asPostgresOrganizationId(organizationId),
        ],
      );
    });
  }
}
