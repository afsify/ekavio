import type { PostgresDatabase } from './database.js';
import type {
  AttendanceIdentity,
  AttendanceIdentityResolver,
} from '../services/attendanceService.js';
import type { OperationalIdentityContext } from '../persistence/operationalIdentity.js';
import {
  asLegacyMongoUserId,
  asPostgresBranchId,
  asPostgresOrganizationId,
  asPostgresUserId,
  isUuid,
} from '../persistence/identifiers.js';

interface AttendanceIdentityRow {
  id: string;
  legacy_mongo_id: string;
  name: string;
  phone: string;
}

export class PostgresAttendanceIdentityResolver implements AttendanceIdentityResolver {
  public constructor(private readonly database: PostgresDatabase) {}

  private async find(
    userCondition: 'canonical' | 'legacy',
    userIds: string[],
    context: OperationalIdentityContext,
  ): Promise<AttendanceIdentityRow[]> {
    if (!context.canonicalOrganizationId || userIds.length === 0) return [];
    const branchClause = context.canonicalBranchId
      ? `AND EXISTS (
           SELECT 1 FROM membership_branch_assignments assignment
           WHERE assignment.membership_id = membership.id
             AND assignment.organization_id = membership.organization_id
             AND assignment.branch_id = $3
         )`
      : '';
    const result = await this.database.query<AttendanceIdentityRow>(
      `SELECT app_user.id, app_user.legacy_mongo_id, app_user.name, app_user.phone
       FROM users app_user
       JOIN memberships membership ON membership.user_id = app_user.id
       WHERE ${userCondition === 'canonical'
         ? 'app_user.id = ANY($1::uuid[])'
         : 'app_user.legacy_mongo_id = ANY($1::text[])'}
         AND membership.organization_id = $2
         AND membership.status = 'active'
         ${branchClause}
       ORDER BY app_user.id`,
      [
        userIds,
        asPostgresOrganizationId(context.canonicalOrganizationId),
        ...(context.canonicalBranchId ? [asPostgresBranchId(context.canonicalBranchId)] : []),
      ],
    );
    return result.rows;
  }

  public async resolveTarget(
    requestedUserId: string,
    context: OperationalIdentityContext,
  ): Promise<AttendanceIdentity | null> {
    if (!isUuid(requestedUserId)) return null;
    const row = (await this.find('canonical', [asPostgresUserId(requestedUserId)], context))[0];
    return row
      ? {
          requestedUserId: row.id,
          legacyMongoUserId: asLegacyMongoUserId(row.legacy_mongo_id),
          name: row.name,
          phone: row.phone,
          displayUser: { _id: row.legacy_mongo_id, name: row.name, phone: row.phone },
        }
      : null;
  }

  public async resolveStoredUsers(
    legacyMongoUserIds: string[],
    context: OperationalIdentityContext,
  ): Promise<Map<string, AttendanceIdentity>> {
    const validatedIds = legacyMongoUserIds.map(asLegacyMongoUserId);
    const rows = await this.find('legacy', validatedIds, context);
    return new Map(rows.map((row): [string, AttendanceIdentity] => [
      row.legacy_mongo_id,
      {
        requestedUserId: row.id,
        legacyMongoUserId: asLegacyMongoUserId(row.legacy_mongo_id),
        name: row.name,
        phone: row.phone,
        displayUser: { _id: row.legacy_mongo_id, name: row.name, phone: row.phone },
      },
    ]));
  }
}
