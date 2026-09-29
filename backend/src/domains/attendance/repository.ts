import type { PoolClient, QueryResultRow } from 'pg';
import type { PostgresDatabase } from '../../postgres/database.js';
import { AppError } from '../../utils/AppError.js';

export type AttendanceStatus = 'present' | 'absent' | 'half_day';
export type AttendanceSource = 'manual' | 'kiosk' | 'import';

export interface AttendanceRecord {
  id: string;
  organizationId: string;
  branchId: string;
  membershipId: string;
  attendanceDate: string;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  status: AttendanceStatus;
  source: AttendanceSource;
  version: number;
  manualOverrideReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AttendanceRosterEntry {
  membershipId: string;
  displayName: string;
  role: string;
  membershipStatus: string;
  attendance: AttendanceRecord | null;
  correctionCount: number;
}

export interface AttendanceChange {
  id: string;
  attendanceRecordId: string;
  resultingVersion: number;
  priorStatus: AttendanceStatus;
  newStatus: AttendanceStatus;
  priorCheckInAt: Date | null;
  newCheckInAt: Date | null;
  priorCheckOutAt: Date | null;
  newCheckOutAt: Date | null;
  reason: string;
  occurredAt: Date;
}

export interface AttendanceBranchContext {
  id: string;
  name: string;
  timezone: string;
}

interface AttendanceRow extends QueryResultRow {
  id: string;
  organization_id: string;
  branch_id: string;
  membership_id: string;
  attendance_date: string;
  check_in_at: Date | null;
  check_out_at: Date | null;
  status: AttendanceStatus;
  source: AttendanceSource;
  version: number;
  manual_override_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

interface RosterRow extends QueryResultRow {
  membership_id: string;
  display_name: string;
  role: string;
  membership_status: string;
  record_id: string | null;
  record_organization_id: string | null;
  record_branch_id: string | null;
  record_membership_id: string | null;
  record_attendance_date: string | null;
  record_check_in_at: Date | null;
  record_check_out_at: Date | null;
  record_status: AttendanceStatus | null;
  record_source: AttendanceSource | null;
  record_version: number | null;
  record_manual_override_reason: string | null;
  record_created_at: Date | null;
  record_updated_at: Date | null;
  correction_count: string;
}

interface ChangeRow extends QueryResultRow {
  id: string;
  attendance_record_id: string;
  resulting_version: number;
  prior_status: AttendanceStatus;
  new_status: AttendanceStatus;
  prior_check_in_at: Date | null;
  new_check_in_at: Date | null;
  prior_check_out_at: Date | null;
  new_check_out_at: Date | null;
  reason: string;
  occurred_at: Date;
}

const attendanceColumns = `
  id, organization_id, branch_id, membership_id, attendance_date::text,
  check_in_at, check_out_at, status, source, version,
  manual_override_reason, created_at, updated_at
`;

const projectRecord = (row: AttendanceRow): AttendanceRecord => ({
  id: row.id,
  organizationId: row.organization_id,
  branchId: row.branch_id,
  membershipId: row.membership_id,
  attendanceDate: row.attendance_date,
  checkInAt: row.check_in_at,
  checkOutAt: row.check_out_at,
  status: row.status,
  source: row.source,
  version: row.version,
  manualOverrideReason: row.manual_override_reason,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const sameInstant = (left: Date | null, right: Date | null): boolean =>
  left?.getTime() === right?.getTime();

const sameFacts = (
  row: AttendanceRow,
  status: AttendanceStatus,
  checkInAt: Date | null,
  checkOutAt: Date | null,
): boolean => row.status === status
  && sameInstant(row.check_in_at, checkInAt)
  && sameInstant(row.check_out_at, checkOutAt);

const requireActor = async (
  client: PoolClient,
  organizationId: string,
  branchId: string,
  membershipId: string,
): Promise<void> => {
  const result = await client.query<{ allowed: boolean }>(`
    SELECT EXISTS(
      SELECT 1
      FROM memberships m
      JOIN membership_branch_assignments a
        ON a.membership_id = m.id
       AND a.organization_id = m.organization_id
       AND a.branch_id = $2
      WHERE m.id = $3 AND m.organization_id = $1 AND m.status = 'active'
    ) AS allowed
  `, [organizationId, branchId, membershipId]);
  if (!result.rows[0]?.allowed) {
    throw new AppError('Attendance actor is not active in the selected branch', 403);
  }
};

export class PostgresAttendanceRepository {
  public constructor(private readonly database: PostgresDatabase) {}

  public async branchContext(
    organizationId: string,
    branchId: string,
  ): Promise<AttendanceBranchContext> {
    const result = await this.database.query<{ id: string; name: string; timezone: string | null }>(`
      SELECT id, name, timezone
      FROM branches
      WHERE id = $1 AND organization_id = $2 AND status = 'active'
    `, [branchId, organizationId]);
    const row = result.rows[0];
    if (!row?.timezone) throw new AppError('Active branch has no reviewed IANA timezone', 409);
    return { id: row.id, name: row.name, timezone: row.timezone };
  }

  public async listDailyRoster(input: {
    organizationId: string;
    branchId: string;
    attendanceDate: string;
  }): Promise<AttendanceRosterEntry[]> {
    const result = await this.database.query<RosterRow>(`
      WITH visible_memberships AS (
        SELECT m.id
        FROM memberships m
        JOIN membership_branch_assignments a
          ON a.membership_id = m.id
         AND a.organization_id = m.organization_id
         AND a.branch_id = $2
        WHERE m.organization_id = $1 AND m.status = 'active'
        UNION
        SELECT r.membership_id
        FROM attendance_records r
        WHERE r.organization_id = $1
          AND r.branch_id = $2
          AND r.attendance_date = $3::date
      )
      SELECT m.id AS membership_id, u.name AS display_name, m.role,
        m.status AS membership_status,
        r.id AS record_id,
        r.organization_id AS record_organization_id,
        r.branch_id AS record_branch_id,
        r.membership_id AS record_membership_id,
        r.attendance_date::text AS record_attendance_date,
        r.check_in_at AS record_check_in_at,
        r.check_out_at AS record_check_out_at,
        r.status AS record_status,
        r.source AS record_source,
        r.version AS record_version,
        r.manual_override_reason AS record_manual_override_reason,
        r.created_at AS record_created_at,
        r.updated_at AS record_updated_at,
        COALESCE((
          SELECT COUNT(*) FROM attendance_record_changes c
          WHERE c.attendance_record_id = r.id
        ), 0)::text AS correction_count
      FROM visible_memberships visible
      JOIN memberships m ON m.id = visible.id AND m.organization_id = $1
      JOIN users u ON u.id = m.user_id
      LEFT JOIN attendance_records r
        ON r.organization_id = m.organization_id
       AND r.membership_id = m.id
       AND r.attendance_date = $3::date
       AND r.branch_id = $2
      ORDER BY LOWER(u.name), m.id
    `, [input.organizationId, input.branchId, input.attendanceDate]);
    return result.rows.map((row) => ({
      membershipId: row.membership_id,
      displayName: row.display_name,
      role: row.role,
      membershipStatus: row.membership_status,
      attendance: row.record_id ? projectRecord({
        id: row.record_id,
        organization_id: row.record_organization_id!,
        branch_id: row.record_branch_id!,
        membership_id: row.record_membership_id!,
        attendance_date: row.record_attendance_date!,
        check_in_at: row.record_check_in_at,
        check_out_at: row.record_check_out_at,
        status: row.record_status!,
        source: row.record_source!,
        version: row.record_version!,
        manual_override_reason: row.record_manual_override_reason,
        created_at: row.record_created_at!,
        updated_at: row.record_updated_at!,
      }) : null,
      correctionCount: Number(row.correction_count),
    }));
  }

  public mark(input: {
    organizationId: string;
    branchId: string;
    membershipId: string;
    attendanceDate: string;
    status: AttendanceStatus;
    checkInAt: Date | null;
    checkOutAt: Date | null;
    actorMembershipId: string;
    expectedVersion?: number;
    correctionReason?: string;
    idempotencyKey?: string;
  }): Promise<AttendanceRecord> {
    return this.database.transaction(async (client) => {
      await requireActor(client, input.organizationId, input.branchId, input.actorMembershipId);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `${input.organizationId}:${input.membershipId}:${input.attendanceDate}`,
      ]);

      if (input.idempotencyKey) {
        const retried = await client.query<AttendanceRow>(`
          SELECT ${attendanceColumns}
          FROM attendance_records
          WHERE organization_id = $1 AND idempotency_key = $2
          FOR UPDATE
        `, [input.organizationId, input.idempotencyKey]);
        const row = retried.rows[0];
        if (row) {
          if (
            row.branch_id !== input.branchId
            || row.membership_id !== input.membershipId
            || row.attendance_date !== input.attendanceDate
            || !sameFacts(row, input.status, input.checkInAt, input.checkOutAt)
          ) {
            throw new AppError('Attendance idempotency key was already used with different values', 409);
          }
          return projectRecord(row);
        }
      }

      const existing = await client.query<AttendanceRow>(`
        SELECT ${attendanceColumns}
        FROM attendance_records
        WHERE organization_id = $1 AND membership_id = $2 AND attendance_date = $3::date
        FOR UPDATE
      `, [input.organizationId, input.membershipId, input.attendanceDate]);
      const row = existing.rows[0];
      if (row) {
        if (row.branch_id !== input.branchId) {
          throw new AppError('Attendance is already owned by another branch for this member and date', 409);
        }
        const correctionRequested = input.expectedVersion !== undefined
          || input.correctionReason !== undefined;
        if (!correctionRequested) {
          if (sameFacts(row, input.status, input.checkInAt, input.checkOutAt)) {
            return projectRecord(row);
          }
          throw new AppError('Changing attendance requires expectedVersion and correctionReason', 409);
        }
        if (input.expectedVersion === undefined || !input.correctionReason) {
          throw new AppError('Changing attendance requires expectedVersion and correctionReason', 409);
        }
        if (input.expectedVersion !== row.version) {
          throw new AppError('Attendance version conflict', 409);
        }
        if (sameFacts(row, input.status, input.checkInAt, input.checkOutAt)) {
          throw new AppError('Attendance correction must change a factual field', 409);
        }
        const corrected = await client.query<AttendanceRow>(`
          UPDATE attendance_records
          SET status = $5, check_in_at = $6, check_out_at = $7,
            manual_override_by_membership_id = $8,
            manual_override_reason = $9,
            version = version + 1,
            updated_at = NOW()
          WHERE organization_id = $1 AND branch_id = $2
            AND membership_id = $3 AND attendance_date = $4::date
            AND version = $10
          RETURNING ${attendanceColumns}
        `, [
          input.organizationId, input.branchId, input.membershipId, input.attendanceDate,
          input.status, input.checkInAt, input.checkOutAt, input.actorMembershipId,
          input.correctionReason, input.expectedVersion,
        ]);
        if (!corrected.rows[0]) throw new AppError('Attendance version conflict', 409);
        return projectRecord(corrected.rows[0]);
      }

      if (input.expectedVersion !== undefined || input.correctionReason) {
        throw new AppError('Attendance correction target not found', 404);
      }
      const inserted = await client.query<AttendanceRow>(`
        INSERT INTO attendance_records (
          organization_id, branch_id, membership_id, attendance_date,
          check_in_at, check_out_at, status, source,
          created_by_membership_id, idempotency_key
        ) VALUES ($1, $2, $3, $4::date, $5, $6, $7, 'manual', $8, $9)
        RETURNING ${attendanceColumns}
      `, [
        input.organizationId, input.branchId, input.membershipId, input.attendanceDate,
        input.checkInAt, input.checkOutAt, input.status,
        input.actorMembershipId, input.idempotencyKey ?? null,
      ]);
      return projectRecord(inserted.rows[0]!);
    });
  }

  public async listChanges(input: {
    organizationId: string;
    branchId: string;
    attendanceRecordId: string;
  }): Promise<AttendanceChange[] | null> {
    const record = await this.database.query<{ exists: boolean }>(`
      SELECT EXISTS(
        SELECT 1 FROM attendance_records
        WHERE id = $1 AND organization_id = $2 AND branch_id = $3
      ) AS exists
    `, [input.attendanceRecordId, input.organizationId, input.branchId]);
    if (!record.rows[0]?.exists) return null;
    const result = await this.database.query<ChangeRow>(`
      SELECT id, attendance_record_id, resulting_version,
        prior_status, new_status, prior_check_in_at, new_check_in_at,
        prior_check_out_at, new_check_out_at, reason, occurred_at
      FROM attendance_record_changes
      WHERE attendance_record_id = $1 AND organization_id = $2 AND branch_id = $3
      ORDER BY resulting_version, occurred_at, id
    `, [input.attendanceRecordId, input.organizationId, input.branchId]);
    return result.rows.map((row) => ({
      id: row.id,
      attendanceRecordId: row.attendance_record_id,
      resultingVersion: row.resulting_version,
      priorStatus: row.prior_status,
      newStatus: row.new_status,
      priorCheckInAt: row.prior_check_in_at,
      newCheckInAt: row.new_check_in_at,
      priorCheckOutAt: row.prior_check_out_at,
      newCheckOutAt: row.new_check_out_at,
      reason: row.reason,
      occurredAt: row.occurred_at,
    }));
  }

  public async countPresent(input: {
    organizationId: string;
    branchId: string;
    attendanceDate: string;
  }): Promise<number> {
    const result = await this.database.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM attendance_records
      WHERE organization_id = $1 AND branch_id = $2
        AND attendance_date = $3::date AND status = 'present'
    `, [input.organizationId, input.branchId, input.attendanceDate]);
    return Number(result.rows[0]?.count ?? 0);
  }
}
