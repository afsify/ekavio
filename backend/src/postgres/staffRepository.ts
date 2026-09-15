import type { QueryResultRow } from 'pg';
import type { PostgresDatabase } from './database.js';
import type {
  CreateStaffPersistenceInput,
  StaffRecord,
  StaffRepository,
} from '../services/staffService.js';
import type { MembershipRole } from '../models/Membership.js';
import {
  asPostgresBranchId,
  asPostgresOrganizationId,
  asPostgresUserId,
  generateLegacyMongoMembershipId,
  generateLegacyMongoUserId,
} from '../persistence/identifiers.js';

interface StaffRow extends QueryResultRow {
  id: string;
  name: string;
  phone: string;
  role: MembershipRole;
  membership_id: string;
  branch_ids: string[];
  created_at: Date;
}

const toStaffRecord = (row: StaffRow): StaffRecord => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  role: row.role,
  membershipId: row.membership_id,
  branchIds: row.branch_ids.map(String),
  createdAt: row.created_at,
});

const findStaff = async (
  query: (text: string, values: unknown[]) => Promise<StaffRow[]>,
  organizationId: string,
  userId?: string,
): Promise<StaffRow[]> => {
  return query(
    `SELECT app_user.id,
            app_user.name,
            app_user.phone,
            membership.role,
            membership.id AS membership_id,
            COALESCE(
              array_agg(assignment.branch_id ORDER BY assignment.branch_id)
                FILTER (WHERE assignment.branch_id IS NOT NULL),
              ARRAY[]::uuid[]
            ) AS branch_ids,
            app_user.created_at
     FROM memberships membership
     JOIN users app_user ON app_user.id = membership.user_id
     LEFT JOIN membership_branch_assignments assignment
       ON assignment.membership_id = membership.id
      AND assignment.organization_id = membership.organization_id
     WHERE membership.organization_id = $1
       AND membership.status = 'active'
       AND ($2::uuid IS NULL OR app_user.id = $2)
     GROUP BY app_user.id, membership.id
     ORDER BY app_user.created_at DESC`,
    [asPostgresOrganizationId(organizationId), userId ? asPostgresUserId(userId) : null],
  );
};

export class PostgresStaffRepository implements StaffRepository {
  public constructor(private readonly database: PostgresDatabase) {}

  public async list(organizationId: string): Promise<StaffRecord[]> {
    return (await findStaff(
      async (text, values) => (await this.database.query<StaffRow>(text, values)).rows,
      organizationId,
    )).map(toStaffRecord);
  }

  public create(input: CreateStaffPersistenceInput): Promise<StaffRecord | 'phone-conflict'> {
    return this.database.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [input.phone]);
      const duplicate = await client.query<{ exists: boolean }>(
        'SELECT EXISTS (SELECT 1 FROM users WHERE phone = $1) AS exists',
        [input.phone],
      );
      if (duplicate.rows[0]?.exists) return 'phone-conflict';

      const now = new Date();
      const user = await client.query<{ id: string }>(
        `INSERT INTO users
          (legacy_mongo_id, name, phone, password_hash, platform_role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NULL, $5, $5)
         RETURNING id`,
        [generateLegacyMongoUserId(), input.name, input.phone, input.passwordHash, now],
      );
      const userId = user.rows[0]?.id;
      if (!userId) throw new Error('PostgreSQL staff identity creation returned no ID');
      const membership = await client.query<{ id: string }>(
        `INSERT INTO memberships
          (legacy_mongo_id, user_id, organization_id, role, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'active', $5, $5)
         RETURNING id`,
        [
          generateLegacyMongoMembershipId(),
          userId,
          asPostgresOrganizationId(input.organizationId),
          input.role,
          now,
        ],
      );
      const membershipId = membership.rows[0]?.id;
      if (!membershipId) throw new Error('PostgreSQL membership creation returned no ID');
      if (input.branchId) {
        await client.query(
          `INSERT INTO membership_branch_assignments
            (membership_id, branch_id, organization_id)
           VALUES ($1, $2, $3)`,
          [
            membershipId,
            asPostgresBranchId(input.branchId),
            asPostgresOrganizationId(input.organizationId),
          ],
        );
      }
      const rows = await findStaff(
        async (text, values) => (await client.query<StaffRow>(text, values)).rows,
        input.organizationId,
        userId,
      );
      const row = rows[0];
      if (!row) throw new Error('PostgreSQL staff creation could not be read back');
      return toStaffRecord(row);
    });
  }

  public async revoke(
    organizationId: string,
    userId: string,
  ): Promise<{ membershipId: string } | null> {
    const result = await this.database.query<{ id: string }>(
      `UPDATE memberships
       SET status = 'revoked', updated_at = NOW()
       WHERE user_id = $1 AND organization_id = $2 AND status = 'active'
       RETURNING id`,
      [asPostgresUserId(userId), asPostgresOrganizationId(organizationId)],
    );
    const row = result.rows[0];
    return row ? { membershipId: row.id } : null;
  }
}
