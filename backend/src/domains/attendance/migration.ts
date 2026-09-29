import { createHash } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import type { PostgresDatabase } from '../../postgres/database.js';
import { getMigrationStatus } from '../../postgres/migrations.js';
import type { AttendanceStatus } from './repository.js';
import { isAttendanceAuthorityActivated } from './authority.js';
import type {
  AttendanceLegacySource,
  AttendanceMigrationMapping,
  LegacyAttendanceSourceRecord,
} from './migrationTypes.js';

export interface AttendanceMigrationIssue {
  code: string;
  sourceRef: string;
  message: string;
}

interface IdentityRow extends QueryResultRow {
  organization_id: string;
  user_id: string;
  membership_id: string;
  membership_status: string;
  branches: Array<{ id: string; status: string; timezone: string | null }>;
}

interface PlannedAttendanceRecord {
  id: string;
  organizationId: string;
  branchId: string;
  membershipId: string;
  attendanceDate: string;
  status: AttendanceStatus;
  legacyMongoId: string;
  fingerprint: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AttendanceMigrationPlan {
  sourceCount: number;
  acceptedCount: number;
  blockerCount: number;
  statusCounts: Record<AttendanceStatus, number>;
  organizationCounts: Record<string, number>;
  dateCoverage: { earliest: string | null; latest: string | null };
  identityMappings: number;
  records: PlannedAttendanceRecord[];
  issues: AttendanceMigrationIssue[];
}

const objectIdPattern = /^[0-9a-f]{24}$/;
const statusMap: Record<string, AttendanceStatus | undefined> = {
  present: 'present',
  absent: 'absent',
  'half-day': 'half_day',
  half_day: 'half_day',
};

const deterministicUuid = (scope: string, key: string): string => {
  const hash = createHash('sha256').update(`${scope}:${key}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};

const fingerprint = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

const sourceRef = (record: LegacyAttendanceSourceRecord): string => `attendance:${record.id}`;

const validDate = (date: Date): string | null => {
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const addIssue = (
  issues: AttendanceMigrationIssue[],
  record: LegacyAttendanceSourceRecord,
  code: string,
  message: string,
): void => {
  issues.push({ code, sourceRef: sourceRef(record), message });
};

export const buildAttendanceMigrationPlan = async (input: {
  source: AttendanceLegacySource;
  mapping: AttendanceMigrationMapping;
  database: PostgresDatabase;
}): Promise<AttendanceMigrationPlan> => {
  const source = await input.source.load();
  const mappingByLegacyOrganization = new Map(
    input.mapping.organizations.map((entry) => [entry.legacyOrganizationId, entry]),
  );
  const issues: AttendanceMigrationIssue[] = [];
  const records: PlannedAttendanceRecord[] = [];
  const usedOverrides = new Set<string>();
  const targetKeys = new Map<string, LegacyAttendanceSourceRecord>();

  for (const record of source) {
    if (!objectIdPattern.test(record.id)
      || !objectIdPattern.test(record.legacyOrganizationId)
      || !objectIdPattern.test(record.legacyUserId)) {
      addIssue(issues, record, 'invalid_legacy_identifier', 'Legacy Attendance identifiers are invalid');
      continue;
    }
    const attendanceDate = validDate(record.date);
    if (!attendanceDate) {
      addIssue(issues, record, 'invalid_date', 'Legacy Attendance date is invalid');
      continue;
    }
    const status = statusMap[record.status];
    if (!status) {
      addIssue(issues, record, 'invalid_status', 'Legacy Attendance status is unsupported');
      continue;
    }
    if (Number.isNaN(record.createdAt.getTime()) || Number.isNaN(record.updatedAt.getTime())) {
      addIssue(issues, record, 'invalid_timestamps', 'Legacy Attendance timestamps are invalid');
      continue;
    }
    const mapping = mappingByLegacyOrganization.get(record.legacyOrganizationId);
    if (!mapping) {
      addIssue(issues, record, 'unmapped_organization', 'Legacy organization has no reviewed canonical mapping');
      continue;
    }
    const identity = await input.database.query<IdentityRow>(`
      SELECT o.id AS organization_id, u.id AS user_id, m.id AS membership_id,
        m.status AS membership_status,
        COALESCE(jsonb_agg(
          jsonb_build_object('id', b.id, 'status', b.status, 'timezone', b.timezone)
          ORDER BY b.id
        ) FILTER (WHERE b.id IS NOT NULL), '[]'::jsonb) AS branches
      FROM organizations o
      JOIN users u ON u.legacy_mongo_id = $3
      JOIN memberships m ON m.user_id = u.id AND m.organization_id = o.id
      LEFT JOIN membership_branch_assignments a
        ON a.membership_id = m.id AND a.organization_id = m.organization_id
      LEFT JOIN branches b ON b.id = a.branch_id AND b.organization_id = a.organization_id
      WHERE o.id = $1 AND o.legacy_mongo_id = $2
      GROUP BY o.id, u.id, m.id
    `, [mapping.organizationId, record.legacyOrganizationId, record.legacyUserId]);
    const identityRow = identity.rows[0];
    if (!identityRow) {
      addIssue(issues, record, 'missing_membership', 'Canonical user and organization membership mapping is missing');
      continue;
    }
    const candidates = identityRow.branches.filter(
      (branch) => branch.status === 'active' && branch.timezone,
    );
    const override = mapping.branchResolutions[record.id];
    let branchId: string | undefined;
    if (override) {
      usedOverrides.add(`${record.legacyOrganizationId}:${record.id}`);
      if (!candidates.some((branch) => branch.id === override)) {
        addIssue(issues, record, 'invalid_branch_resolution', 'Reviewed branch is not an active assigned branch with a timezone');
        continue;
      }
      branchId = override;
    } else if (candidates.length === 1) {
      branchId = candidates[0]!.id;
    } else if (candidates.length === 0) {
      addIssue(issues, record, 'missing_branch_assignment', 'Membership has no active assigned branch with a reviewed timezone');
      continue;
    } else {
      addIssue(issues, record, 'ambiguous_branch_assignment', 'Membership has multiple plausible branches and requires reviewed resolution');
      continue;
    }

    const targetKey = `${identityRow.organization_id}:${identityRow.membership_id}:${attendanceDate}`;
    const duplicate = targetKeys.get(targetKey);
    if (duplicate) {
      addIssue(issues, duplicate, 'duplicate_attendance_key', 'Multiple legacy records target the same membership business date');
      addIssue(issues, record, 'duplicate_attendance_key', 'Multiple legacy records target the same membership business date');
      continue;
    }
    targetKeys.set(targetKey, record);

    const sourceFingerprint = fingerprint({
      id: record.id,
      legacyOrganizationId: record.legacyOrganizationId,
      legacyUserId: record.legacyUserId,
      attendanceDate,
      status,
      organizationId: identityRow.organization_id,
      membershipId: identityRow.membership_id,
      branchId,
    });
    const target = await input.database.query<{
      id: string; organization_id: string; branch_id: string; membership_id: string;
      attendance_date: string; status: string; source: string; check_in_at: Date | null;
      check_out_at: Date | null; legacy_mongo_id: string | null;
      legacy_source_fingerprint: string | null;
    }>(`
      SELECT id, organization_id, branch_id, membership_id, attendance_date::text,
        status, source, check_in_at, check_out_at, legacy_mongo_id,
        legacy_source_fingerprint
      FROM attendance_records
      WHERE legacy_mongo_id = $1
         OR (organization_id = $2 AND membership_id = $3 AND attendance_date = $4::date)
    `, [record.id, identityRow.organization_id, identityRow.membership_id, attendanceDate]);
    if (target.rows.length > 0) {
      const existing = target.rows[0]!;
      const matches = target.rows.length === 1
        && existing.organization_id === identityRow.organization_id
        && existing.branch_id === branchId
        && existing.membership_id === identityRow.membership_id
        && existing.attendance_date === attendanceDate
        && existing.status === status
        && existing.source === 'import'
        && existing.check_in_at === null
        && existing.check_out_at === null
        && existing.legacy_mongo_id === record.id
        && existing.legacy_source_fingerprint?.trim() === sourceFingerprint;
      if (!matches) {
        addIssue(issues, record, 'target_conflict', 'Existing PostgreSQL Attendance row conflicts with reviewed migration facts');
        continue;
      }
    }
    records.push({
      id: deterministicUuid('attendance', record.id),
      organizationId: identityRow.organization_id,
      branchId,
      membershipId: identityRow.membership_id,
      attendanceDate,
      status,
      legacyMongoId: record.id,
      fingerprint: sourceFingerprint,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  for (const organization of input.mapping.organizations) {
    for (const legacyAttendanceId of Object.keys(organization.branchResolutions)) {
      const key = `${organization.legacyOrganizationId}:${legacyAttendanceId}`;
      if (!usedOverrides.has(key)) {
        issues.push({
          code: 'unused_branch_resolution',
          sourceRef: `attendance:${legacyAttendanceId}`,
          message: 'Reviewed branch resolution does not match a current source record',
        });
      }
    }
  }

  const statusCounts = { present: 0, absent: 0, half_day: 0 };
  const organizationCounts: Record<string, number> = {};
  for (const record of records) {
    statusCounts[record.status] += 1;
    organizationCounts[record.organizationId] = (organizationCounts[record.organizationId] ?? 0) + 1;
  }
  const dates = records.map(({ attendanceDate }) => attendanceDate).sort();
  return {
    sourceCount: source.length,
    acceptedCount: records.length,
    blockerCount: issues.length,
    statusCounts,
    organizationCounts,
    dateCoverage: { earliest: dates[0] ?? null, latest: dates.at(-1) ?? null },
    identityMappings: new Set(records.map((record) => record.membershipId)).size,
    records,
    issues,
  };
};

export class AttendanceMigrationBlockedError extends Error {
  public constructor(public readonly issues: readonly AttendanceMigrationIssue[]) {
    super(`Attendance migration apply refused: ${issues.length} unresolved blocker(s)`);
  }
}

export interface AttendanceMigrationReport {
  mode: 'dry-run' | 'apply';
  sourceCount: number;
  appliedCount: number;
  blockerCount: number;
  statusCounts: Record<AttendanceStatus, number>;
  organizationCounts: Record<string, number>;
  dateCoverage: { earliest: string | null; latest: string | null };
  identityMappings: number;
  issues: AttendanceMigrationIssue[];
}

const reportFor = (
  plan: AttendanceMigrationPlan,
  mode: 'dry-run' | 'apply',
): AttendanceMigrationReport => ({
  mode,
  sourceCount: plan.sourceCount,
  appliedCount: mode === 'apply' ? plan.acceptedCount : 0,
  blockerCount: plan.blockerCount,
  statusCounts: plan.statusCounts,
  organizationCounts: plan.organizationCounts,
  dateCoverage: plan.dateCoverage,
  identityMappings: plan.identityMappings,
  issues: plan.issues,
});

export const runAttendanceMigration = async (input: {
  source: AttendanceLegacySource;
  mapping: AttendanceMigrationMapping;
  database: PostgresDatabase;
  apply?: boolean;
  allowAttendanceRecovery?: boolean;
}): Promise<AttendanceMigrationReport> => {
  const plan = await buildAttendanceMigrationPlan(input);
  if (!input.apply) return reportFor(plan, 'dry-run');
  if (plan.issues.length > 0) throw new AttendanceMigrationBlockedError(plan.issues);
  await input.database.transaction(async (client) => {
    if (await isAttendanceAuthorityActivated(client) && !input.allowAttendanceRecovery) {
      throw new Error('Attendance migration apply refused after PostgreSQL runtime authority activation; explicit reviewed recovery mode is required');
    }
    for (const record of plan.records) {
      const inserted = await client.query<{ id: string }>(`
        INSERT INTO attendance_records (
          id, organization_id, branch_id, membership_id, attendance_date,
          check_in_at, check_out_at, status, source,
          created_by_membership_id, version, legacy_mongo_id,
          legacy_source_fingerprint, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5::date, NULL, NULL, $6, 'import', NULL, 1, $7, $8, $9, $10)
        ON CONFLICT (legacy_mongo_id) DO NOTHING
        RETURNING id
      `, [
        record.id, record.organizationId, record.branchId, record.membershipId,
        record.attendanceDate, record.status, record.legacyMongoId,
        record.fingerprint, record.createdAt, record.updatedAt,
      ]);
      if (inserted.rowCount === 0) {
        const existing = await client.query<{ id: string; legacy_source_fingerprint: string }>(`
          SELECT id, legacy_source_fingerprint
          FROM attendance_records
          WHERE legacy_mongo_id = $1 AND organization_id = $2
            AND branch_id = $3 AND membership_id = $4
            AND attendance_date = $5::date AND status = $6 AND source = 'import'
            AND check_in_at IS NULL AND check_out_at IS NULL
        `, [
          record.legacyMongoId, record.organizationId, record.branchId,
          record.membershipId, record.attendanceDate, record.status,
        ]);
        if (existing.rows[0]?.legacy_source_fingerprint.trim() !== record.fingerprint) {
          throw new Error(`Attendance source changed after review: attendance:${record.legacyMongoId}`);
        }
      }
    }
  });
  return reportFor(plan, 'apply');
};

export interface AttendanceVerificationReport {
  clean: boolean;
  sourceCount: number;
  targetImportCount: number;
  appliedCount: number;
  blockerCount: number;
  statusCounts: Record<AttendanceStatus, number>;
  organizationCounts: Record<string, number>;
  dateCoverage: { earliest: string | null; latest: string | null };
  identityMappings: number;
  mismatches: string[];
}

export const verifyAttendanceMigration = async (input: {
  source: AttendanceLegacySource;
  mapping: AttendanceMigrationMapping;
  database: PostgresDatabase;
}): Promise<AttendanceVerificationReport> => {
  const plan = await buildAttendanceMigrationPlan(input);
  const mismatches = plan.issues.map(({ code, sourceRef }) => `${code}:${sourceRef}`);
  for (const record of plan.records) {
    const result = await input.database.query<{
      organization_id: string; branch_id: string; membership_id: string;
      attendance_date: string; status: string; source: string;
      check_in_at: Date | null; check_out_at: Date | null;
      legacy_source_fingerprint: string;
    }>(`
      SELECT organization_id, branch_id, membership_id, attendance_date::text,
        status, source, check_in_at, check_out_at, legacy_source_fingerprint
      FROM attendance_records WHERE legacy_mongo_id = $1
    `, [record.legacyMongoId]);
    const row = result.rows[0];
    if (!row || row.organization_id !== record.organizationId
      || row.branch_id !== record.branchId || row.membership_id !== record.membershipId
      || row.attendance_date !== record.attendanceDate || row.status !== record.status
      || row.source !== 'import' || row.check_in_at !== null || row.check_out_at !== null
      || row.legacy_source_fingerprint.trim() !== record.fingerprint) {
      mismatches.push(`target_mismatch:attendance:${record.legacyMongoId}`);
    }
  }
  const sourceIds = plan.records.map(({ legacyMongoId }) => legacyMongoId);
  const targetCount = sourceIds.length > 0
    ? await input.database.query<{ count: string }>(`
        SELECT COUNT(*)::text AS count
        FROM attendance_records
        WHERE source = 'import' AND legacy_mongo_id = ANY($1::text[])
      `, [sourceIds])
    : { rows: [{ count: '0' }] };
  const targetImportCount = Number(targetCount.rows[0]?.count ?? 0);
  if (targetImportCount !== plan.sourceCount) mismatches.push('source_target_count_mismatch');
  const duplicates = await input.database.query<{ issue: string }>(`
    SELECT 'duplicate_subject_day' AS issue
    FROM attendance_records
    GROUP BY organization_id, membership_id, attendance_date HAVING COUNT(*) > 1
    UNION ALL
    SELECT 'duplicate_legacy_id' AS issue
    FROM attendance_records WHERE legacy_mongo_id IS NOT NULL
    GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
  `);
  mismatches.push(...duplicates.rows.map(({ issue }) => issue));
  return {
    clean: mismatches.length === 0,
    sourceCount: plan.sourceCount,
    targetImportCount,
    appliedCount: plan.records.length,
    blockerCount: plan.blockerCount,
    statusCounts: plan.statusCounts,
    organizationCounts: plan.organizationCounts,
    dateCoverage: plan.dateCoverage,
    identityMappings: plan.identityMappings,
    mismatches,
  };
};

export interface AttendancePreflightReport {
  ready: boolean;
  checks: Record<string, boolean>;
  failures: string[];
  verification: AttendanceVerificationReport;
}

export const runAttendanceCutoverPreflight = async (input: {
  source: AttendanceLegacySource;
  mapping: AttendanceMigrationMapping;
  database: PostgresDatabase;
  attendanceAuthority: string;
  allowPendingActivation?: boolean;
}): Promise<AttendancePreflightReport> => {
  const [migrations, verification, invalidTimezones, duplicateTargets,
    invalidMappings, attendanceModule, repositoryHealth, authorityActivated] = await Promise.all([
    getMigrationStatus(input.database),
    verifyAttendanceMigration(input),
    input.database.query(`
      SELECT id FROM branches
      WHERE status = 'active' AND (timezone IS NULL OR NOT ekavio_is_valid_iana_timezone(timezone))
    `),
    input.database.query(`
      SELECT organization_id, membership_id, attendance_date
      FROM attendance_records
      GROUP BY organization_id, membership_id, attendance_date HAVING COUNT(*) > 1
    `),
    input.database.query(`
      SELECT r.id
      FROM attendance_records r
      LEFT JOIN memberships m
        ON m.id = r.membership_id AND m.organization_id = r.organization_id
      LEFT JOIN membership_branch_assignments a
        ON a.membership_id = r.membership_id
       AND a.organization_id = r.organization_id
       AND a.branch_id = r.branch_id
      WHERE m.id IS NULL OR a.membership_id IS NULL
    `),
    input.database.query<{ available: boolean }>(`
      SELECT EXISTS(
        SELECT 1 FROM module_definitions WHERE key = 'attendance' AND status = 'active'
      ) AS available
    `),
    input.database.query('SELECT 1 FROM attendance_records LIMIT 1'),
    isAttendanceAuthorityActivated(input.database),
  ]);
  const migration009 = migrations.find(({ name }) => name === '009_attendance_runtime_authority.sql');
  const checks = {
    migration009Applied: migration009?.state === 'applied',
    branchTimezonesValid: invalidTimezones.rowCount === 0,
    sourceReconciliationClean: verification.clean,
    zeroUnresolvedBlockers: verification.blockerCount === 0,
    targetUniquenessClean: duplicateTargets.rowCount === 0,
    canonicalMembershipMappingsValid: invalidMappings.rowCount === 0,
    attendanceEntitlementAvailable: attendanceModule.rows[0]?.available === true,
    postgresAttendanceRepositoryHealthy: repositoryHealth.command === 'SELECT',
    postgresIsSourceControlledAuthority: input.attendanceAuthority === 'postgresql',
    authorityLatchMatches: authorityActivated || input.allowPendingActivation === true,
  };
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return { ready: failures.length === 0, checks, failures, verification };
};
