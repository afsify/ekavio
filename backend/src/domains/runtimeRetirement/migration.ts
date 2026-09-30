import { createHash } from 'node:crypto';
import type { PostgresDatabase } from '../../postgres/database.js';
import { getMigrationStatus } from '../../postgres/migrations.js';
import {
  isSecurityAuditAction,
  validateAuditDetails,
  type SafeAuditDetails,
  type SecurityAuditAction,
} from '../../services/auditPolicy.js';
import { isFinalRuntimeAuthorityActivated } from './authority.js';
import type {
  AuditLegacySource,
  CorporateLegacySource,
  LegacyActivityLogRecord,
} from './migrationTypes.js';

const objectIdPattern = /^[0-9a-f]{24}$/;

const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const deterministicUuid = (scope: string, key: string): string => {
  const bytes = Buffer.from(createHash('sha256').update(`${scope}\0${key}`).digest().subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const value = bytes.toString('hex');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
};

const stable = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stable(item)]));
  }
  return value;
};
const fingerprint = (value: unknown): string => hash(JSON.stringify(stable(value)));

export interface MigrationIssue {
  code: string;
  sourceRef: string;
  message: string;
}

interface PlannedParent {
  id: string;
  legacyMongoId: string;
  ownerUserId: string;
  name: string;
  consolidatedBilling: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface PlannedChildLink {
  organizationId: string;
  legacyOrganizationId: string;
  parentOrganizationId: string;
  legacyParentOrganizationId: string;
}

export interface CorporateMigrationPlan {
  sourceParentCount: number;
  sourceChildLinkCount: number;
  mappedParentCount: number;
  mappedChildLinkCount: number;
  blockerCount: number;
  parents: PlannedParent[];
  childLinks: PlannedChildLink[];
  issues: MigrationIssue[];
}

export const buildCorporateMigrationPlan = async (input: {
  source: CorporateLegacySource;
  database: PostgresDatabase;
}): Promise<CorporateMigrationPlan> => {
  const [sourceParents, sourceLinks] = await Promise.all([
    input.source.loadParents(),
    input.source.loadChildLinks(),
  ]);
  const issues: MigrationIssue[] = [];
  const parents: PlannedParent[] = [];
  const childLinks: PlannedChildLink[] = [];
  const parentIds = new Map<string, string>();
  const seenParents = new Set<string>();

  for (const parent of sourceParents) {
    const ref = `parent:${parent.id}`;
    if (!objectIdPattern.test(parent.id) || !objectIdPattern.test(parent.ownerLegacyUserId)) {
      issues.push({ code: 'invalid_legacy_identifier', sourceRef: ref, message: 'Legacy parent identifiers are invalid' });
      continue;
    }
    if (seenParents.has(parent.id)) {
      issues.push({ code: 'duplicate_parent_source', sourceRef: ref, message: 'Legacy parent occurs more than once' });
      continue;
    }
    seenParents.add(parent.id);
    const name = parent.name.trim();
    if (name.length < 2 || name.length > 120) {
      issues.push({ code: 'invalid_parent_name', sourceRef: ref, message: 'Legacy parent name is outside accepted bounds' });
      continue;
    }
    if (Number.isNaN(parent.createdAt.getTime()) || Number.isNaN(parent.updatedAt.getTime())) {
      issues.push({ code: 'invalid_parent_timestamps', sourceRef: ref, message: 'Legacy parent timestamps are invalid' });
      continue;
    }
    const owner = await input.database.query<{ id: string }>(
      'SELECT id FROM users WHERE legacy_mongo_id = $1',
      [parent.ownerLegacyUserId],
    );
    if (owner.rowCount !== 1 || !owner.rows[0]) {
      issues.push({ code: 'missing_owner_mapping', sourceRef: ref, message: 'Legacy parent owner has no unique canonical user mapping' });
      continue;
    }
    const target = await input.database.query<{
      id: string; owner_user_id: string; name: string; consolidated_billing: boolean;
      created_at: Date; updated_at: Date;
    }>(`
      SELECT id, owner_user_id, name, consolidated_billing, created_at, updated_at
      FROM parent_organizations WHERE legacy_mongo_id = $1
    `, [parent.id]);
    const id = target.rows[0]?.id ?? deterministicUuid('ekavio-parent-organization', parent.id);
    if (target.rows[0]) {
      const row = target.rows[0];
      if (
        row.owner_user_id !== owner.rows[0].id || row.name !== name ||
        row.consolidated_billing !== parent.consolidatedBilling ||
        row.created_at.getTime() !== parent.createdAt.getTime() ||
        row.updated_at.getTime() !== parent.updatedAt.getTime()
      ) {
        issues.push({ code: 'parent_target_conflict', sourceRef: ref, message: 'Canonical parent conflicts with legacy source facts' });
        continue;
      }
    }
    parentIds.set(parent.id, id);
    parents.push({
      id,
      legacyMongoId: parent.id,
      ownerUserId: owner.rows[0].id,
      name,
      consolidatedBilling: parent.consolidatedBilling,
      createdAt: parent.createdAt,
      updatedAt: parent.updatedAt,
    });
  }

  const seenChildren = new Set<string>();
  for (const link of sourceLinks) {
    const ref = `organization:${link.legacyOrganizationId}`;
    if (
      !objectIdPattern.test(link.legacyOrganizationId) ||
      !objectIdPattern.test(link.legacyParentOrganizationId)
    ) {
      issues.push({ code: 'invalid_legacy_identifier', sourceRef: ref, message: 'Legacy corporate link identifiers are invalid' });
      continue;
    }
    if (seenChildren.has(link.legacyOrganizationId)) {
      issues.push({ code: 'multiple_source_relationships', sourceRef: ref, message: 'Legacy child has multiple incompatible parent relationships' });
      continue;
    }
    seenChildren.add(link.legacyOrganizationId);
    const parentId = parentIds.get(link.legacyParentOrganizationId);
    if (!parentId) {
      issues.push({ code: 'unknown_source_parent', sourceRef: ref, message: 'Legacy child points to an unknown or blocked parent' });
      continue;
    }
    const organization = await input.database.query<{
      id: string; parent_organization_id: string | null;
    }>(`
      SELECT id, parent_organization_id
      FROM organizations WHERE legacy_mongo_id = $1
    `, [link.legacyOrganizationId]);
    if (organization.rowCount !== 1 || !organization.rows[0]) {
      issues.push({ code: 'missing_child_mapping', sourceRef: ref, message: 'Legacy child has no unique canonical organization mapping' });
      continue;
    }
    if (
      organization.rows[0].parent_organization_id &&
      organization.rows[0].parent_organization_id !== parentId
    ) {
      issues.push({ code: 'child_target_conflict', sourceRef: ref, message: 'Canonical child already has a conflicting parent' });
      continue;
    }
    childLinks.push({
      organizationId: organization.rows[0].id,
      legacyOrganizationId: link.legacyOrganizationId,
      parentOrganizationId: parentId,
      legacyParentOrganizationId: link.legacyParentOrganizationId,
    });
  }

  return {
    sourceParentCount: sourceParents.length,
    sourceChildLinkCount: sourceLinks.length,
    mappedParentCount: parents.length,
    mappedChildLinkCount: childLinks.length,
    blockerCount: issues.length,
    parents,
    childLinks,
    issues,
  };
};

export class RetirementMigrationBlockedError extends Error {
  public constructor(public readonly issues: readonly MigrationIssue[]) {
    super(`V2-06F migration apply refused: ${issues.length} unresolved blocker(s)`);
  }
}

export interface CorporateMigrationReport extends Omit<CorporateMigrationPlan, 'parents' | 'childLinks'> {
  mode: 'dry-run' | 'apply';
  appliedParentCount: number;
  appliedChildLinkCount: number;
}

export const runCorporateMigration = async (input: {
  source: CorporateLegacySource;
  database: PostgresDatabase;
  apply?: boolean;
  allowRecovery?: boolean;
}): Promise<CorporateMigrationReport> => {
  const plan = await buildCorporateMigrationPlan(input);
  if (input.apply && plan.issues.length > 0) throw new RetirementMigrationBlockedError(plan.issues);
  if (input.apply) {
    await input.database.transaction(async (client) => {
      if (await isFinalRuntimeAuthorityActivated(client, 'corporate') && !input.allowRecovery) {
        throw new Error('Corporate migration apply refused after PostgreSQL authority activation; explicit reviewed recovery mode is required');
      }
      for (const parent of plan.parents) {
        await client.query(`
          INSERT INTO parent_organizations (
            id, legacy_mongo_id, owner_user_id, name, consolidated_billing,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (legacy_mongo_id) DO NOTHING
        `, [
          parent.id, parent.legacyMongoId, parent.ownerUserId, parent.name,
          parent.consolidatedBilling, parent.createdAt, parent.updatedAt,
        ]);
      }
      for (const link of plan.childLinks) {
        const updated = await client.query(`
          UPDATE organizations
          SET parent_organization_id = $1
          WHERE id = $2
            AND (parent_organization_id IS NULL OR parent_organization_id = $1)
        `, [link.parentOrganizationId, link.organizationId]);
        if (updated.rowCount !== 1) throw new Error('Corporate child relationship changed after review');
      }
    });
  }
  return {
    mode: input.apply ? 'apply' : 'dry-run',
    sourceParentCount: plan.sourceParentCount,
    sourceChildLinkCount: plan.sourceChildLinkCount,
    mappedParentCount: plan.mappedParentCount,
    mappedChildLinkCount: plan.mappedChildLinkCount,
    appliedParentCount: input.apply ? plan.mappedParentCount : 0,
    appliedChildLinkCount: input.apply ? plan.mappedChildLinkCount : 0,
    blockerCount: plan.blockerCount,
    issues: plan.issues,
  };
};

export interface CorporateVerificationReport extends CorporateMigrationReport {
  clean: boolean;
  targetParentCount: number;
  targetChildLinkCount: number;
  mismatches: string[];
}

export const verifyCorporateMigration = async (input: {
  source: CorporateLegacySource;
  database: PostgresDatabase;
}): Promise<CorporateVerificationReport> => {
  const plan = await buildCorporateMigrationPlan(input);
  const mismatches = plan.issues.map(({ code, sourceRef }) => `${code}:${sourceRef}`);
  let targetChildLinkCount = 0;
  for (const link of plan.childLinks) {
    const result = await input.database.query<{ matches: boolean }>(`
      SELECT EXISTS(
        SELECT 1 FROM organizations
        WHERE id = $1 AND legacy_mongo_id = $2 AND parent_organization_id = $3
      ) AS matches
    `, [link.organizationId, link.legacyOrganizationId, link.parentOrganizationId]);
    if (result.rows[0]?.matches) targetChildLinkCount += 1;
    else mismatches.push(`child_link_mismatch:organization:${link.legacyOrganizationId}`);
  }
  const legacyIds = plan.parents.map(({ legacyMongoId }) => legacyMongoId);
  const target = await input.database.query<{ count: string }>(`
    SELECT COUNT(*)::text AS count
    FROM parent_organizations
    WHERE legacy_mongo_id = ANY($1::text[])
  `, [legacyIds]);
  const targetParentCount = Number(target.rows[0]?.count ?? 0);
  if (targetParentCount !== plan.sourceParentCount) mismatches.push('parent_source_target_count_mismatch');
  if (targetChildLinkCount !== plan.sourceChildLinkCount) mismatches.push('child_link_source_target_count_mismatch');
  return {
    mode: 'apply',
    clean: mismatches.length === 0,
    sourceParentCount: plan.sourceParentCount,
    sourceChildLinkCount: plan.sourceChildLinkCount,
    mappedParentCount: plan.mappedParentCount,
    mappedChildLinkCount: plan.mappedChildLinkCount,
    appliedParentCount: targetParentCount,
    appliedChildLinkCount: targetChildLinkCount,
    blockerCount: plan.blockerCount,
    targetParentCount,
    targetChildLinkCount,
    issues: plan.issues,
    mismatches,
  };
};

export type UnsafeAuditReason =
  | 'invalid_legacy_identifier'
  | 'missing_organization_mapping'
  | 'missing_actor_mapping'
  | 'unknown_action'
  | 'unsafe_details'
  | 'invalid_ip_address'
  | 'invalid_timestamp'
  | 'duplicate_source_identifier';

interface PlannedAuditEvent {
  id: string;
  legacyMongoId: string;
  organizationId: string;
  actorUserId: string;
  action: SecurityAuditAction;
  details: SafeAuditDetails;
  ipAddress: string | null;
  occurredAt: Date;
  sourceFingerprint: string;
}

interface PlannedAuditDisposition {
  id: string;
  sourceRefHash: string;
  sourceFingerprint: string;
  reasonCode: UnsafeAuditReason;
}

export interface AuditMigrationPlan {
  sourceCount: number;
  safeCount: number;
  unsafeCount: number;
  blockerCount: number;
  perActionCounts: Record<string, number>;
  unsafeReasonCounts: Record<string, number>;
  organizationCoverage: number;
  timestampCoverage: number;
  events: PlannedAuditEvent[];
  dispositions: PlannedAuditDisposition[];
  issues: MigrationIssue[];
}

const auditSourceFacts = (record: LegacyActivityLogRecord) => ({
  id: record.id,
  legacyOrganizationId: record.legacyOrganizationId,
  legacyActorUserId: record.legacyActorUserId,
  action: record.action,
  details: record.details,
  ipAddress: record.ipAddress,
  createdAt: Number.isNaN(record.createdAt.getTime()) ? 'invalid' : record.createdAt.toISOString(),
});

export const buildAuditMigrationPlan = async (input: {
  source: AuditLegacySource;
  database: PostgresDatabase;
}): Promise<AuditMigrationPlan> => {
  const source = await input.source.loadActivityLogs();
  const events: PlannedAuditEvent[] = [];
  const dispositions: PlannedAuditDisposition[] = [];
  const issues: MigrationIssue[] = [];
  const seen = new Set<string>();
  const disposition = (record: LegacyActivityLogRecord, reasonCode: UnsafeAuditReason): void => {
    const sourceRefHash = hash(`activity:${record.id}`);
    dispositions.push({
      id: deterministicUuid('ekavio-audit-disposition', sourceRefHash),
      sourceRefHash,
      sourceFingerprint: fingerprint(auditSourceFacts(record)),
      reasonCode,
    });
  };

  for (const record of source) {
    const sourceRefHash = hash(`activity:${record.id}`);
    if (seen.has(record.id)) {
      issues.push({ code: 'duplicate_source_identifier', sourceRef: sourceRefHash, message: 'Legacy audit identifier occurs more than once' });
      continue;
    }
    seen.add(record.id);
    if (
      !objectIdPattern.test(record.id) ||
      !objectIdPattern.test(record.legacyOrganizationId) ||
      !objectIdPattern.test(record.legacyActorUserId)
    ) {
      disposition(record, 'invalid_legacy_identifier');
      continue;
    }
    if (Number.isNaN(record.createdAt.getTime())) {
      disposition(record, 'invalid_timestamp');
      continue;
    }
    if (!isSecurityAuditAction(record.action)) {
      disposition(record, 'unknown_action');
      continue;
    }
    let details: SafeAuditDetails;
    try {
      details = validateAuditDetails(record.details ?? {});
    } catch {
      disposition(record, 'unsafe_details');
      continue;
    }
    const ipAddress = record.ipAddress?.trim() || null;
    if (ipAddress && ipAddress.length > 128) {
      disposition(record, 'invalid_ip_address');
      continue;
    }
    const organization = await input.database.query<{ id: string }>(
      'SELECT id FROM organizations WHERE legacy_mongo_id = $1',
      [record.legacyOrganizationId],
    );
    if (organization.rowCount !== 1 || !organization.rows[0]) {
      disposition(record, 'missing_organization_mapping');
      continue;
    }
    const actor = await input.database.query<{ id: string }>(
      'SELECT id FROM users WHERE legacy_mongo_id = $1',
      [record.legacyActorUserId],
    );
    if (actor.rowCount !== 1 || !actor.rows[0]) {
      disposition(record, 'missing_actor_mapping');
      continue;
    }
    const sourceFingerprint = fingerprint(auditSourceFacts(record));
    const existing = await input.database.query<{
      id: string; organization_id: string; actor_user_id: string | null; action: string;
      details: unknown; ip_address: string | null; occurred_at: Date; created_at: Date;
    }>(`
      SELECT id, organization_id, actor_user_id, action, details, ip_address,
        occurred_at, created_at
      FROM audit_events WHERE legacy_mongo_id = $1
    `, [record.id]);
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (
        row.organization_id !== organization.rows[0].id ||
        row.actor_user_id !== actor.rows[0].id || row.action !== record.action ||
        fingerprint(row.details ?? {}) !== fingerprint(details) || row.ip_address !== ipAddress ||
        row.occurred_at.getTime() !== record.createdAt.getTime() ||
        row.created_at.getTime() !== record.createdAt.getTime()
      ) {
        issues.push({ code: 'audit_target_conflict', sourceRef: sourceRefHash, message: 'Canonical audit event conflicts with safe legacy facts' });
        continue;
      }
    }
    events.push({
      id: existing.rows[0]?.id ?? deterministicUuid('ekavio-audit-event', record.id),
      legacyMongoId: record.id,
      organizationId: organization.rows[0].id,
      actorUserId: actor.rows[0].id,
      action: record.action,
      details,
      ipAddress,
      occurredAt: record.createdAt,
      sourceFingerprint,
    });
  }

  const perActionCounts: Record<string, number> = {};
  for (const event of events) perActionCounts[event.action] = (perActionCounts[event.action] ?? 0) + 1;
  const unsafeReasonCounts: Record<string, number> = {};
  for (const item of dispositions) {
    unsafeReasonCounts[item.reasonCode] = (unsafeReasonCounts[item.reasonCode] ?? 0) + 1;
  }
  return {
    sourceCount: source.length,
    safeCount: events.length,
    unsafeCount: dispositions.length,
    blockerCount: issues.length,
    perActionCounts,
    unsafeReasonCounts,
    organizationCoverage: new Set(events.map(({ organizationId }) => organizationId)).size,
    timestampCoverage: events.length,
    events,
    dispositions,
    issues,
  };
};

export interface AuditMigrationReport extends Omit<AuditMigrationPlan, 'events' | 'dispositions'> {
  mode: 'dry-run' | 'apply';
  migratedCount: number;
  dispositionCount: number;
}

export const runAuditMigration = async (input: {
  source: AuditLegacySource;
  database: PostgresDatabase;
  apply?: boolean;
  allowRecovery?: boolean;
}): Promise<AuditMigrationReport> => {
  const plan = await buildAuditMigrationPlan(input);
  if (input.apply && plan.issues.length > 0) throw new RetirementMigrationBlockedError(plan.issues);
  if (input.apply) {
    await input.database.transaction(async (client) => {
      if (await isFinalRuntimeAuthorityActivated(client, 'security_audit') && !input.allowRecovery) {
        throw new Error('Audit migration apply refused after PostgreSQL authority activation; explicit reviewed recovery mode is required');
      }
      for (const event of plan.events) {
        await client.query(`
          INSERT INTO audit_events (
            id, organization_id, actor_user_id, action, details, ip_address,
            legacy_mongo_id, occurred_at, created_at
          ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $8)
          ON CONFLICT (legacy_mongo_id) DO NOTHING
        `, [
          event.id, event.organizationId, event.actorUserId, event.action,
          JSON.stringify(event.details), event.ipAddress, event.legacyMongoId, event.occurredAt,
        ]);
      }
      for (const item of plan.dispositions) {
        await client.query(`
          INSERT INTO legacy_audit_migration_dispositions (
            id, source_ref_hash, source_fingerprint, reason_code
          ) VALUES ($1, $2, $3, $4)
          ON CONFLICT (source_ref_hash) DO NOTHING
        `, [item.id, item.sourceRefHash, item.sourceFingerprint, item.reasonCode]);
      }
    });
  }
  return {
    mode: input.apply ? 'apply' : 'dry-run',
    sourceCount: plan.sourceCount,
    safeCount: plan.safeCount,
    unsafeCount: plan.unsafeCount,
    blockerCount: plan.blockerCount,
    perActionCounts: plan.perActionCounts,
    unsafeReasonCounts: plan.unsafeReasonCounts,
    organizationCoverage: plan.organizationCoverage,
    timestampCoverage: plan.timestampCoverage,
    migratedCount: input.apply ? plan.safeCount : 0,
    dispositionCount: input.apply ? plan.unsafeCount : 0,
    issues: plan.issues,
  };
};

export interface AuditVerificationReport extends AuditMigrationReport {
  clean: boolean;
  targetSafeCount: number;
  targetDispositionCount: number;
  targetDuplicateCount: number;
  mismatches: string[];
}

export const verifyAuditMigration = async (input: {
  source: AuditLegacySource;
  database: PostgresDatabase;
}): Promise<AuditVerificationReport> => {
  const plan = await buildAuditMigrationPlan(input);
  const mismatches = plan.issues.map(({ code, sourceRef }) => `${code}:${sourceRef}`);
  let targetSafeCount = 0;
  for (const event of plan.events) {
    const target = await input.database.query<{ matches: boolean }>(`
      SELECT EXISTS(
        SELECT 1 FROM audit_events
        WHERE legacy_mongo_id = $1 AND organization_id = $2 AND actor_user_id = $3
          AND action = $4 AND details = $5::jsonb AND ip_address IS NOT DISTINCT FROM $6
          AND occurred_at = $7 AND created_at = $7
      ) AS matches
    `, [
      event.legacyMongoId, event.organizationId, event.actorUserId, event.action,
      JSON.stringify(event.details), event.ipAddress, event.occurredAt,
    ]);
    if (target.rows[0]?.matches) targetSafeCount += 1;
    else mismatches.push(`safe_event_mismatch:${hash(`activity:${event.legacyMongoId}`)}`);
  }
  let targetDispositionCount = 0;
  for (const item of plan.dispositions) {
    const target = await input.database.query<{ matches: boolean }>(`
      SELECT EXISTS(
        SELECT 1 FROM legacy_audit_migration_dispositions
        WHERE source_ref_hash = $1 AND source_fingerprint = $2 AND reason_code = $3
      ) AS matches
    `, [item.sourceRefHash, item.sourceFingerprint, item.reasonCode]);
    if (target.rows[0]?.matches) targetDispositionCount += 1;
    else mismatches.push(`unsafe_disposition_mismatch:${item.sourceRefHash}`);
  }
  const duplicates = await input.database.query<{ count: string }>(`
    SELECT COUNT(*)::text AS count FROM (
      SELECT legacy_mongo_id FROM audit_events WHERE legacy_mongo_id IS NOT NULL
      GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
    ) duplicate
  `);
  const targetDuplicateCount = Number(duplicates.rows[0]?.count ?? 0);
  if (targetSafeCount !== plan.safeCount) mismatches.push('safe_source_target_count_mismatch');
  if (targetDispositionCount !== plan.unsafeCount) mismatches.push('unsafe_source_disposition_count_mismatch');
  if (plan.safeCount + plan.unsafeCount !== plan.sourceCount) mismatches.push('source_accounting_mismatch');
  if (targetDuplicateCount !== 0) mismatches.push('legacy_provenance_duplicate');
  return {
    mode: 'apply',
    clean: mismatches.length === 0,
    sourceCount: plan.sourceCount,
    safeCount: plan.safeCount,
    unsafeCount: plan.unsafeCount,
    blockerCount: plan.blockerCount,
    perActionCounts: plan.perActionCounts,
    unsafeReasonCounts: plan.unsafeReasonCounts,
    organizationCoverage: plan.organizationCoverage,
    timestampCoverage: plan.timestampCoverage,
    migratedCount: targetSafeCount,
    dispositionCount: targetDispositionCount,
    targetSafeCount,
    targetDispositionCount,
    targetDuplicateCount,
    issues: plan.issues,
    mismatches,
  };
};

export interface FinalRuntimePreflightReport {
  ready: boolean;
  checks: Record<string, boolean>;
  failures: string[];
  corporate: CorporateVerificationReport;
  audit: AuditVerificationReport;
}

export const runFinalRuntimePreflight = async (input: {
  corporateSource: CorporateLegacySource;
  auditSource: AuditLegacySource;
  database: PostgresDatabase;
  corporateAuthority: string;
  securityAuditAuthority: string;
  mongoRuntimeAuthority: string;
  allowPendingActivation?: boolean;
}): Promise<FinalRuntimePreflightReport> => {
  const [migrations, corporate, audit, schema, triggers, corporateHealth, auditHealth,
    corporateLatch, auditLatch] = await Promise.all([
    getMigrationStatus(input.database),
    verifyCorporateMigration({ source: input.corporateSource, database: input.database }),
    verifyAuditMigration({ source: input.auditSource, database: input.database }),
    input.database.query<{ ready: boolean }>(`
      SELECT to_regclass('public.parent_organizations') IS NOT NULL
        AND to_regclass('public.audit_events') IS NOT NULL
        AND to_regclass('public.legacy_audit_migration_dispositions') IS NOT NULL
        AND to_regclass('public.final_runtime_authority') IS NOT NULL AS ready
    `),
    input.database.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM pg_trigger
      WHERE NOT tgisinternal
        AND tgname IN ('audit_events_append_only', 'legacy_audit_dispositions_append_only')
    `),
    input.database.query('SELECT 1 FROM parent_organizations LIMIT 1'),
    input.database.query('SELECT 1 FROM audit_events LIMIT 1'),
    isFinalRuntimeAuthorityActivated(input.database, 'corporate'),
    isFinalRuntimeAuthorityActivated(input.database, 'security_audit'),
  ]);
  const migration012 = migrations.find(({ name }) =>
    name === '012_corporate_audit_runtime_authority.sql');
  const checks = {
    migration012Applied: migration012?.state === 'applied',
    corporateAuditSchemaReady: schema.rows[0]?.ready === true,
    appendOnlyProtectionReady: Number(triggers.rows[0]?.count ?? 0) === 2,
    corporateReconciliationClean: corporate.clean,
    corporateBlockersZero: corporate.blockerCount === 0,
    auditReconciliationClean: audit.clean,
    auditBlockersZero: audit.blockerCount === 0,
    unsafeAuditDispositionRecorded: audit.targetDispositionCount === audit.unsafeCount,
    corporateRepositoryHealthy: corporateHealth.command === 'SELECT',
    auditRepositoryHealthy: auditHealth.command === 'SELECT',
    corporateSourceControlledAuthority: input.corporateAuthority === 'postgresql',
    securityAuditSourceControlledAuthority: input.securityAuditAuthority === 'postgresql',
    mongoRuntimeIsOfflineOnly: input.mongoRuntimeAuthority === 'offline-only',
    corporateAuthorityLatchMatches: corporateLatch || input.allowPendingActivation === true,
    securityAuditAuthorityLatchMatches: auditLatch || input.allowPendingActivation === true,
  };
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return { ready: failures.length === 0, checks, failures, corporate, audit };
};
