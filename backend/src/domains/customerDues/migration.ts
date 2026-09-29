import { createHash } from 'node:crypto';
import type { PostgresDatabase } from '../../postgres/database.js';
import { getMigrationStatus } from '../../postgres/migrations.js';
import { isCustomerDuesAuthorityActivated } from './authority.js';
import { legacyNumberToInrMinor } from './money.js';
import type {
  CustomerDuesLegacySource,
  CustomerDuesMigrationMapping,
  LegacyCustomerDueSourceRecord,
} from './migrationTypes.js';

export interface CustomerDuesMigrationIssue {
  code: string;
  sourceRef: string;
  message: string;
}

interface PlannedCustomerDueEntry {
  id: string;
  organizationId: string;
  branchId: string;
  customerId: string;
  entryType: 'charge' | 'payment';
  amountMinor: bigint;
  description: string | null;
  occurredAt: Date;
  legacyMongoId: string;
  fingerprint: string;
}

export interface CustomerDuesMigrationPlan {
  sourceCount: number;
  acceptedCount: number;
  blockerCount: number;
  typeCounts: { charge: number; payment: number };
  organizationCounts: Record<string, number>;
  totalChargeMinor: string;
  totalPaymentMinor: string;
  customerMappingCoverage: number;
  branchMappingCoverage: number;
  dateCoverage: { earliest: string | null; latest: string | null };
  records: PlannedCustomerDueEntry[];
  issues: CustomerDuesMigrationIssue[];
}

const objectIdPattern = /^[0-9a-f]{24}$/;
const typeMap: Record<string, 'charge' | 'payment' | undefined> = {
  credit: 'charge',
  payment: 'payment',
};

const deterministicUuid = (scope: string, key: string): string => {
  const bytes = Buffer.from(createHash('sha256').update(`${scope}\0${key}`).digest().subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const fingerprint = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

const sourceRef = (record: LegacyCustomerDueSourceRecord): string => `ledger:${record.id}`;

const addIssue = (
  issues: CustomerDuesMigrationIssue[],
  record: LegacyCustomerDueSourceRecord,
  code: string,
  message: string,
): void => {
  issues.push({ code, sourceRef: sourceRef(record), message });
};

export const buildCustomerDuesMigrationPlan = async (input: {
  source: CustomerDuesLegacySource;
  mapping: CustomerDuesMigrationMapping;
  database: PostgresDatabase;
}): Promise<CustomerDuesMigrationPlan> => {
  const source = await input.source.load();
  const mappings = new Map(
    input.mapping.organizations.map((entry) => [entry.legacyOrganizationId, entry]),
  );
  const issues: CustomerDuesMigrationIssue[] = [];
  const records: PlannedCustomerDueEntry[] = [];
  const usedCustomerResolutions = new Set<string>();
  const usedBranchResolutions = new Set<string>();

  for (const record of source) {
    if (!objectIdPattern.test(record.id) || !objectIdPattern.test(record.legacyOrganizationId)) {
      addIssue(issues, record, 'invalid_legacy_identifier', 'Legacy Ledger identifiers are invalid');
      continue;
    }
    const mapping = mappings.get(record.legacyOrganizationId);
    if (!mapping) {
      addIssue(issues, record, 'unmapped_organization', 'Legacy organization has no reviewed canonical mapping');
      continue;
    }
    const organization = await input.database.query<{ valid: boolean }>(`
      SELECT EXISTS(
        SELECT 1 FROM organizations WHERE id = $1 AND legacy_mongo_id = $2
      ) AS valid
    `, [mapping.organizationId, record.legacyOrganizationId]);
    if (!organization.rows[0]?.valid) {
      addIssue(issues, record, 'invalid_organization_mapping', 'Canonical organization mapping does not match legacy provenance');
      continue;
    }

    const branchId = mapping.branchResolutions[record.id];
    if (!branchId) {
      addIssue(issues, record, 'missing_branch_mapping', 'Legacy Ledger entry requires a reviewed originating branch');
      continue;
    }
    usedBranchResolutions.add(`${record.legacyOrganizationId}:${record.id}`);
    const branch = await input.database.query<{ valid: boolean }>(`
      SELECT EXISTS(
        SELECT 1 FROM branches
        WHERE id = $1 AND organization_id = $2 AND status = 'active'
      ) AS valid
    `, [branchId, mapping.organizationId]);
    if (!branch.rows[0]?.valid) {
      addIssue(issues, record, 'invalid_branch_mapping', 'Reviewed originating branch is not active in the canonical organization');
      continue;
    }

    const sourceLink = await input.database.query<{ customer_id: string; organization_id: string }>(`
      SELECT customer_id, organization_id
      FROM customer_source_links
      WHERE source_kind = 'ledger' AND legacy_document_id = $1
    `, [record.id]);
    const linkedCustomerId = sourceLink.rows[0]?.customer_id;
    const reviewedCustomerId = mapping.customerResolutions[record.id];
    if (reviewedCustomerId) usedCustomerResolutions.add(`${record.legacyOrganizationId}:${record.id}`);
    if (linkedCustomerId && reviewedCustomerId && linkedCustomerId !== reviewedCustomerId) {
      addIssue(issues, record, 'conflicting_customer_mapping', 'Reviewed customer conflicts with accepted source-link provenance');
      continue;
    }
    const customerId = reviewedCustomerId ?? linkedCustomerId;
    if (!customerId) {
      addIssue(issues, record, 'missing_customer_mapping', 'Legacy Ledger entry has no accepted customer source link or reviewed resolution');
      continue;
    }
    const customer = await input.database.query<{ valid: boolean }>(`
      SELECT EXISTS(
        SELECT 1 FROM customers
        WHERE id = $1 AND organization_id = $2 AND status <> 'merged'
      ) AS valid
    `, [customerId, mapping.organizationId]);
    if (!customer.rows[0]?.valid
      || (sourceLink.rows[0] && sourceLink.rows[0].organization_id !== mapping.organizationId)) {
      addIssue(issues, record, 'invalid_customer_mapping', 'Canonical customer mapping is outside the organization or no longer valid');
      continue;
    }

    const entryType = typeMap[record.type];
    if (!entryType || !['charge', 'payment'].includes(entryType)) {
      addIssue(issues, record, 'invalid_legacy_type', 'Legacy Ledger type is unsupported');
      continue;
    }
    let amountMinor: bigint;
    try {
      amountMinor = legacyNumberToInrMinor(record.amount);
    } catch (error) {
      addIssue(
        issues,
        record,
        'invalid_money_precision',
        error instanceof Error ? error.message : 'Legacy amount is not exactly representable as INR paise',
      );
      continue;
    }
    if (Number.isNaN(record.createdAt.getTime()) || Number.isNaN(record.updatedAt.getTime())) {
      addIssue(issues, record, 'invalid_timestamps', 'Legacy Ledger timestamps are invalid');
      continue;
    }
    if (record.description !== null && record.description.length > 1000) {
      addIssue(issues, record, 'invalid_description', 'Legacy description exceeds the supported limit');
      continue;
    }

    const sourceFingerprint = fingerprint({
      id: record.id,
      legacyOrganizationId: record.legacyOrganizationId,
      customerName: record.customerName,
      phone: record.phone,
      amountMinor: amountMinor.toString(),
      entryType,
      description: record.description,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      organizationId: mapping.organizationId,
      branchId,
      customerId,
    });
    const target = await input.database.query<{
      organization_id: string; branch_id: string; customer_id: string; entry_type: string;
      amount_minor: string; currency: string; description: string | null; source_type: string | null;
      source_id: string | null; occurred_at: Date; legacy_source_fingerprint: string | null;
    }>(`
      SELECT organization_id, branch_id, customer_id, entry_type, amount_minor::text,
        currency, description, source_type, source_id, occurred_at, legacy_source_fingerprint
      FROM customer_due_entries WHERE legacy_mongo_id = $1
    `, [record.id]);
    if (target.rows[0]) {
      const existing = target.rows[0];
      const matches = target.rows.length === 1
        && existing.organization_id === mapping.organizationId
        && existing.branch_id === branchId
        && existing.customer_id === customerId
        && existing.entry_type === entryType
        && existing.amount_minor === amountMinor.toString()
        && existing.currency === 'INR'
        && existing.description === record.description
        && existing.source_type === 'legacy_mongo'
        && existing.source_id === record.id
        && existing.occurred_at.getTime() === record.createdAt.getTime()
        && existing.legacy_source_fingerprint?.trim() === sourceFingerprint;
      if (!matches) {
        addIssue(issues, record, 'target_conflict', 'Existing PostgreSQL Customer Due entry conflicts with reviewed source facts');
        continue;
      }
    }
    records.push({
      id: deterministicUuid('ekavio-customer-due-entry', record.id),
      organizationId: mapping.organizationId,
      branchId,
      customerId,
      entryType,
      amountMinor,
      description: record.description,
      occurredAt: record.createdAt,
      legacyMongoId: record.id,
      fingerprint: sourceFingerprint,
    });
  }

  for (const organization of input.mapping.organizations) {
    for (const legacyId of Object.keys(organization.customerResolutions)) {
      if (!usedCustomerResolutions.has(`${organization.legacyOrganizationId}:${legacyId}`)) {
        issues.push({
          code: 'unused_customer_resolution', sourceRef: `ledger:${legacyId}`,
          message: 'Reviewed customer resolution does not match a current source record',
        });
      }
    }
    for (const legacyId of Object.keys(organization.branchResolutions)) {
      if (!usedBranchResolutions.has(`${organization.legacyOrganizationId}:${legacyId}`)) {
        issues.push({
          code: 'unused_branch_resolution', sourceRef: `ledger:${legacyId}`,
          message: 'Reviewed branch resolution does not match a current source record',
        });
      }
    }
  }

  const typeCounts = { charge: 0, payment: 0 };
  const organizationCounts: Record<string, number> = {};
  let totalChargeMinor = 0n;
  let totalPaymentMinor = 0n;
  for (const record of records) {
    typeCounts[record.entryType] += 1;
    organizationCounts[record.organizationId] = (organizationCounts[record.organizationId] ?? 0) + 1;
    if (record.entryType === 'charge') totalChargeMinor += record.amountMinor;
    else totalPaymentMinor += record.amountMinor;
  }
  const dates = records.map(({ occurredAt }) => occurredAt.toISOString()).sort();
  return {
    sourceCount: source.length,
    acceptedCount: records.length,
    blockerCount: issues.length,
    typeCounts,
    organizationCounts,
    totalChargeMinor: totalChargeMinor.toString(),
    totalPaymentMinor: totalPaymentMinor.toString(),
    customerMappingCoverage: new Set(records.map(({ customerId }) => customerId)).size,
    branchMappingCoverage: new Set(records.map(({ branchId }) => branchId)).size,
    dateCoverage: { earliest: dates[0] ?? null, latest: dates.at(-1) ?? null },
    records,
    issues,
  };
};

export class CustomerDuesMigrationBlockedError extends Error {
  public constructor(public readonly issues: readonly CustomerDuesMigrationIssue[]) {
    super(`Customer Dues migration apply refused: ${issues.length} unresolved blocker(s)`);
  }
}

export interface CustomerDuesMigrationReport {
  mode: 'dry-run' | 'apply';
  sourceCount: number;
  appliedCount: number;
  blockerCount: number;
  typeCounts: { charge: number; payment: number };
  organizationCounts: Record<string, number>;
  totalChargeMinor: string;
  totalPaymentMinor: string;
  customerMappingCoverage: number;
  branchMappingCoverage: number;
  dateCoverage: { earliest: string | null; latest: string | null };
  issues: CustomerDuesMigrationIssue[];
}

const reportFor = (
  plan: CustomerDuesMigrationPlan,
  mode: 'dry-run' | 'apply',
): CustomerDuesMigrationReport => ({
  mode,
  sourceCount: plan.sourceCount,
  appliedCount: mode === 'apply' ? plan.acceptedCount : 0,
  blockerCount: plan.blockerCount,
  typeCounts: plan.typeCounts,
  organizationCounts: plan.organizationCounts,
  totalChargeMinor: plan.totalChargeMinor,
  totalPaymentMinor: plan.totalPaymentMinor,
  customerMappingCoverage: plan.customerMappingCoverage,
  branchMappingCoverage: plan.branchMappingCoverage,
  dateCoverage: plan.dateCoverage,
  issues: plan.issues,
});

export const runCustomerDuesMigration = async (input: {
  source: CustomerDuesLegacySource;
  mapping: CustomerDuesMigrationMapping;
  database: PostgresDatabase;
  apply?: boolean;
  allowCustomerDuesRecovery?: boolean;
}): Promise<CustomerDuesMigrationReport> => {
  const plan = await buildCustomerDuesMigrationPlan(input);
  if (!input.apply) return reportFor(plan, 'dry-run');
  if (plan.issues.length > 0) throw new CustomerDuesMigrationBlockedError(plan.issues);
  await input.database.transaction(async (client) => {
    if (await isCustomerDuesAuthorityActivated(client) && !input.allowCustomerDuesRecovery) {
      throw new Error('Customer Dues migration apply refused after PostgreSQL runtime authority activation; explicit reviewed recovery mode is required');
    }
    for (const record of plan.records) {
      const inserted = await client.query<{ id: string }>(`
        INSERT INTO customer_due_entries (
          id, organization_id, branch_id, customer_id, entry_type, amount_minor,
          currency, description, source_type, source_id, occurred_at,
          legacy_mongo_id, legacy_source_fingerprint
        ) VALUES ($1, $2, $3, $4, $5, $6, 'INR', $7, 'legacy_mongo', $8, $9, $8, $10)
        ON CONFLICT (legacy_mongo_id) DO NOTHING
        RETURNING id
      `, [
        record.id, record.organizationId, record.branchId, record.customerId,
        record.entryType, record.amountMinor.toString(), record.description,
        record.legacyMongoId, record.occurredAt, record.fingerprint,
      ]);
      if (inserted.rowCount === 0) {
        const existing = await client.query<{ legacy_source_fingerprint: string }>(`
          SELECT legacy_source_fingerprint
          FROM customer_due_entries
          WHERE legacy_mongo_id = $1 AND organization_id = $2 AND branch_id = $3
            AND customer_id = $4 AND entry_type = $5 AND amount_minor = $6
            AND currency = 'INR' AND description IS NOT DISTINCT FROM $7
            AND source_type = 'legacy_mongo' AND source_id = $1
            AND occurred_at = $8
        `, [
          record.legacyMongoId, record.organizationId, record.branchId, record.customerId,
          record.entryType, record.amountMinor.toString(), record.description, record.occurredAt,
        ]);
        if (existing.rows[0]?.legacy_source_fingerprint.trim() !== record.fingerprint) {
          throw new Error(`Customer Dues source changed after review: ledger:${record.legacyMongoId}`);
        }
      }
    }
  });
  return reportFor(plan, 'apply');
};

export interface CustomerDuesVerificationReport extends Omit<CustomerDuesMigrationReport, 'mode'> {
  clean: boolean;
  targetImportCount: number;
  mismatches: string[];
}

export const verifyCustomerDuesMigration = async (input: {
  source: CustomerDuesLegacySource;
  mapping: CustomerDuesMigrationMapping;
  database: PostgresDatabase;
}): Promise<CustomerDuesVerificationReport> => {
  const plan = await buildCustomerDuesMigrationPlan(input);
  const mismatches = plan.issues.map(({ code, sourceRef: ref }) => `${code}:${ref}`);
  for (const record of plan.records) {
    const result = await input.database.query<{
      organization_id: string; branch_id: string; customer_id: string; entry_type: string;
      amount_minor: string; currency: string; description: string | null; source_type: string | null;
      source_id: string | null; occurred_at: Date; legacy_source_fingerprint: string;
    }>(`
      SELECT organization_id, branch_id, customer_id, entry_type, amount_minor::text,
        currency, description, source_type, source_id, occurred_at, legacy_source_fingerprint
      FROM customer_due_entries WHERE legacy_mongo_id = $1
    `, [record.legacyMongoId]);
    const row = result.rows[0];
    if (!row || row.organization_id !== record.organizationId || row.branch_id !== record.branchId
      || row.customer_id !== record.customerId || row.entry_type !== record.entryType
      || row.amount_minor !== record.amountMinor.toString() || row.currency !== 'INR'
      || row.description !== record.description || row.source_type !== 'legacy_mongo'
      || row.source_id !== record.legacyMongoId
      || row.occurred_at.getTime() !== record.occurredAt.getTime()
      || row.legacy_source_fingerprint.trim() !== record.fingerprint) {
      mismatches.push(`target_mismatch:ledger:${record.legacyMongoId}`);
    }
  }
  const ids = plan.records.map(({ legacyMongoId }) => legacyMongoId);
  const targetCount = ids.length > 0
    ? await input.database.query<{ count: string }>(`
        SELECT COUNT(*)::text AS count FROM customer_due_entries
        WHERE source_type = 'legacy_mongo' AND legacy_mongo_id = ANY($1::text[])
      `, [ids])
    : { rows: [{ count: '0' }] };
  const targetImportCount = Number(targetCount.rows[0]?.count ?? 0);
  if (targetImportCount !== plan.sourceCount) mismatches.push('source_target_count_mismatch');
  const duplicates = await input.database.query<{ issue: string }>(`
    SELECT 'duplicate_legacy_id' AS issue
    FROM customer_due_entries WHERE legacy_mongo_id IS NOT NULL
    GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
  `);
  mismatches.push(...duplicates.rows.map(({ issue }) => issue));
  return {
    clean: mismatches.length === 0,
    sourceCount: plan.sourceCount,
    appliedCount: plan.records.length,
    blockerCount: plan.blockerCount,
    typeCounts: plan.typeCounts,
    organizationCounts: plan.organizationCounts,
    totalChargeMinor: plan.totalChargeMinor,
    totalPaymentMinor: plan.totalPaymentMinor,
    customerMappingCoverage: plan.customerMappingCoverage,
    branchMappingCoverage: plan.branchMappingCoverage,
    dateCoverage: plan.dateCoverage,
    issues: plan.issues,
    targetImportCount,
    mismatches,
  };
};

export interface CustomerDuesPreflightReport {
  ready: boolean;
  checks: Record<string, boolean>;
  failures: string[];
  verification: CustomerDuesVerificationReport;
}

export const runCustomerDuesCutoverPreflight = async (input: {
  source: CustomerDuesLegacySource;
  mapping: CustomerDuesMigrationMapping;
  database: PostgresDatabase;
  customerDuesAuthority: string;
  allowPendingActivation?: boolean;
}): Promise<CustomerDuesPreflightReport> => {
  const [migrations, verification, tables, invalidMappings, moduleResult,
    repositoryHealth, authorityActivated] = await Promise.all([
    getMigrationStatus(input.database),
    verifyCustomerDuesMigration(input),
    input.database.query<{ ready: boolean }>(`
      SELECT to_regclass('public.customer_due_entries') IS NOT NULL AS ready
    `),
    input.database.query(`
      SELECT e.id
      FROM customer_due_entries e
      LEFT JOIN customers c
        ON c.id = e.customer_id AND c.organization_id = e.organization_id
      LEFT JOIN branches b
        ON b.id = e.branch_id AND b.organization_id = e.organization_id
      WHERE c.id IS NULL OR b.id IS NULL
    `),
    input.database.query<{ available: boolean }>(`
      SELECT EXISTS(
        SELECT 1 FROM module_definitions WHERE key = 'ledger' AND status = 'active'
      ) AS available
    `),
    input.database.query('SELECT 1 FROM customer_due_entries LIMIT 1'),
    isCustomerDuesAuthorityActivated(input.database),
  ]);
  const migration010 = migrations.find(({ name }) => name === '010_customer_dues_runtime_authority.sql');
  const moneyBlockers = verification.issues.filter(({ code }) => code === 'invalid_money_precision');
  const customerBlockers = verification.issues.filter(({ code }) => code.includes('customer'));
  const branchBlockers = verification.issues.filter(({ code }) => code.includes('branch'));
  const checks = {
    migration010Applied: migration010?.state === 'applied',
    customerDuesTablesReady: tables.rows[0]?.ready === true,
    sourceReconciliationClean: verification.clean,
    zeroUnresolvedBlockers: verification.blockerCount === 0,
    moneyConversionBlockersZero: moneyBlockers.length === 0,
    customerMappingBlockersZero: customerBlockers.length === 0,
    branchMappingBlockersZero: branchBlockers.length === 0,
    canonicalCustomerMappingsValid: invalidMappings.rowCount === 0,
    ledgerEntitlementAvailable: moduleResult.rows[0]?.available === true,
    postgresCustomerDuesRepositoryHealthy: repositoryHealth.command === 'SELECT',
    postgresIsSourceControlledAuthority: input.customerDuesAuthority === 'postgresql',
    authorityLatchMatches: authorityActivated || input.allowPendingActivation === true,
  };
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return { ready: failures.length === 0, checks, failures, verification };
};
