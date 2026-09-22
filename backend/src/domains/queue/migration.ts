import type { PostgresDatabase } from '../../postgres/database.js';
import { getMigrationStatus } from '../../postgres/migrations.js';
import { buildOperationalMigrationPlan, type OperationalMigrationPlan } from './migrationPlan.js';
import type { OperationalLegacySource, OperationalMigrationMapping } from './migrationTypes.js';
import { isOperationalAuthorityActivated } from './operationalAuthority.js';

export class OperationalMigrationBlockedError extends Error {
  public constructor(public readonly issues: readonly { code: string; sourceRef: string; message: string }[]) {
    super(`Operational shadow apply refused: ${issues.length} unresolved issue(s)`);
  }
}

export interface OperationalMigrationReport {
  mode: 'dry-run' | 'apply';
  sourceCounts: { queue: number; ledgerCustomers: number };
  acceptedQueueRows: number;
  rejectedQueueRows: number;
  quarantinedQueueRows: number;
  customerCandidates: number;
  serviceCandidates: number;
  sessionCandidates: number;
  issues: OperationalMigrationPlan['issues'];
  applied: boolean;
}

const reportFor = (plan: OperationalMigrationPlan, mode: 'dry-run' | 'apply'): OperationalMigrationReport => ({
  mode,
  sourceCounts: plan.sourceCounts,
  acceptedQueueRows: plan.acceptedQueueRows,
  rejectedQueueRows: plan.rejectedQueueRows,
  quarantinedQueueRows: plan.quarantinedQueueRows,
  customerCandidates: plan.customers.length,
  serviceCandidates: plan.services.length,
  sessionCandidates: plan.sessions.length,
  issues: plan.issues,
  applied: mode === 'apply',
});

export const runOperationalMigration = async (input: {
  source: OperationalLegacySource;
  mapping: OperationalMigrationMapping;
  database?: PostgresDatabase;
  apply?: boolean;
  allowOperationalRecovery?: boolean;
}): Promise<OperationalMigrationReport> => {
  const plan = buildOperationalMigrationPlan(await input.source.load(), input.mapping);
  if (!input.apply) return reportFor(plan, 'dry-run');
  if (!input.database) throw new Error('PostgreSQL database is required for operational apply');
  if (plan.issues.length > 0) throw new OperationalMigrationBlockedError(plan.issues);

  await input.database.transaction(async (client) => {
    if (await isOperationalAuthorityActivated(client) && !input.allowOperationalRecovery) {
      throw new Error('Operational shadow apply refused after PostgreSQL runtime authority activation; explicit reviewed recovery mode is required');
    }
    for (const organization of plan.mapping.organizations) {
      const context = await client.query<{ branch_id: string }>(`
        SELECT b.id AS branch_id
        FROM organizations o
        JOIN branches b ON b.organization_id = o.id
        WHERE o.id = $1 AND o.legacy_mongo_id = $2 AND b.id = $3
      `, [organization.organizationId, organization.legacyOrganizationId, organization.branchId]);
      if (!context.rows[0]) {
        throw new Error(`Reviewed mapping does not match PostgreSQL organization/branch: ${organization.legacyOrganizationId}`);
      }
      const timezone = await client.query(`
        UPDATE branches
        SET timezone = $1, updated_at = NOW()
        WHERE id = $2 AND organization_id = $3 AND ekavio_is_valid_iana_timezone($1)
        RETURNING id
      `, [organization.timezone, organization.branchId, organization.organizationId]);
      if (timezone.rowCount !== 1) throw new Error(`Invalid reviewed branch timezone: ${organization.timezone}`);
    }

    for (const customer of plan.customers) {
      await client.query(`
        INSERT INTO customers (
          id, organization_id, name, normalized_phone, display_phone
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
          normalized_phone = EXCLUDED.normalized_phone,
          display_phone = EXCLUDED.display_phone,
          updated_at = NOW()
        WHERE customers.organization_id = EXCLUDED.organization_id
          AND customers.status <> 'merged'
      `, [customer.id, customer.organizationId, customer.name, customer.normalizedPhone, customer.displayPhone]);
      for (const source of customer.sources) {
        const result = await client.query(`
          INSERT INTO customer_source_links (
            source_kind, legacy_document_id, organization_id, customer_id, source_fingerprint
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (source_kind, legacy_document_id) DO UPDATE
          SET customer_id = EXCLUDED.customer_id
          WHERE customer_source_links.organization_id = EXCLUDED.organization_id
            AND customer_source_links.source_fingerprint = EXCLUDED.source_fingerprint
          RETURNING legacy_document_id
        `, [
          source.sourceKind, source.legacyDocumentId, customer.organizationId,
          customer.id, source.fingerprint,
        ]);
        if (result.rowCount !== 1) throw new Error(`Customer source changed after review: ${source.sourceRef}`);
      }
    }

    for (const service of plan.services) {
      await client.query(`
        INSERT INTO services (
          id, organization_id, name, normalized_name, duration_minutes
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name, normalized_name = EXCLUDED.normalized_name,
          duration_minutes = EXCLUDED.duration_minutes, updated_at = NOW()
        WHERE services.organization_id = EXCLUDED.organization_id
      `, [
        service.id, service.organizationId, service.name,
        service.normalizedName, service.durationMinutes,
      ]);
      await client.query(`
        INSERT INTO service_branch_availability (
          service_id, branch_id, organization_id, active
        ) VALUES ($1, $2, $3, TRUE)
        ON CONFLICT (service_id, branch_id) DO UPDATE
        SET active = TRUE, updated_at = NOW()
        WHERE service_branch_availability.organization_id = EXCLUDED.organization_id
      `, [service.id, service.branchId, service.organizationId]);
    }
    for (const source of plan.serviceSources) {
      const result = await client.query(`
        INSERT INTO service_source_links (
          legacy_queue_document_id, organization_id, service_id, source_label, source_fingerprint
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (legacy_queue_document_id) DO UPDATE
        SET service_id = EXCLUDED.service_id, source_label = EXCLUDED.source_label
        WHERE service_source_links.organization_id = EXCLUDED.organization_id
          AND service_source_links.source_fingerprint = EXCLUDED.source_fingerprint
        RETURNING legacy_queue_document_id
      `, [
        source.legacyQueueDocumentId, source.organizationId, source.serviceId,
        source.sourceLabel, source.fingerprint,
      ]);
      if (result.rowCount !== 1) throw new Error(`Service source changed after review: queue:${source.legacyQueueDocumentId}`);
    }

    for (const session of plan.sessions) {
      await client.query(`
        INSERT INTO queue_sessions (
          id, organization_id, branch_id, local_business_date, lane_key, status, closed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status, closed_at = EXCLUDED.closed_at, updated_at = NOW()
        WHERE queue_sessions.organization_id = EXCLUDED.organization_id
          AND queue_sessions.branch_id = EXCLUDED.branch_id
          AND queue_sessions.local_business_date = EXCLUDED.local_business_date
          AND queue_sessions.lane_key = EXCLUDED.lane_key
      `, [
        session.id, session.organizationId, session.branchId, session.localBusinessDate,
        session.laneKey, session.status, session.closedAt,
      ]);
    }

    for (const token of plan.tokens) {
      const tokenResult = await client.query(`
        INSERT INTO queue_tokens (
          id, organization_id, branch_id, queue_session_id, token_number,
          customer_id, service_id, status, legacy_mongo_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (legacy_mongo_id) DO UPDATE
        SET queue_session_id = EXCLUDED.queue_session_id,
          token_number = EXCLUDED.token_number,
          customer_id = EXCLUDED.customer_id,
          service_id = EXCLUDED.service_id,
          status = EXCLUDED.status,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at
        WHERE queue_tokens.organization_id = EXCLUDED.organization_id
          AND queue_tokens.branch_id = EXCLUDED.branch_id
        RETURNING id
      `, [
        token.id, token.organizationId, token.branchId, token.sessionId,
        token.tokenNumber.toString(), token.customerId, token.serviceId, token.status,
        token.legacyMongoId, token.createdAt, token.updatedAt,
      ]);
      if (tokenResult.rowCount !== 1) throw new Error(`Queue token scope changed: queue:${token.legacyMongoId}`);
      const sourceResult = await client.query(`
        INSERT INTO queue_token_source_links (
          legacy_queue_document_id, queue_token_id, organization_id, source_fingerprint
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (legacy_queue_document_id) DO UPDATE
        SET queue_token_id = EXCLUDED.queue_token_id
        WHERE queue_token_source_links.organization_id = EXCLUDED.organization_id
          AND queue_token_source_links.source_fingerprint = EXCLUDED.source_fingerprint
        RETURNING legacy_queue_document_id
      `, [token.legacyMongoId, token.id, token.organizationId, token.fingerprint]);
      if (sourceResult.rowCount !== 1) throw new Error(`Queue source changed after review: queue:${token.legacyMongoId}`);
      await client.query(`
        INSERT INTO queue_status_events (
          queue_token_id, organization_id, queue_token_version, from_status,
          to_status, source, occurred_at
        ) VALUES ($1, $2, 1, NULL, $3, 'migration', $4)
        ON CONFLICT (queue_token_id, queue_token_version) DO NOTHING
      `, [token.id, token.organizationId, token.status, token.createdAt]);
    }
    await client.query(`
      UPDATE queue_sessions s
      SET next_token_number = GREATEST(s.next_token_number, tokens.maximum + 1), updated_at = NOW()
      FROM (
        SELECT queue_session_id, MAX(token_number) AS maximum
        FROM queue_tokens
        WHERE legacy_mongo_id IS NOT NULL
        GROUP BY queue_session_id
      ) tokens
      WHERE s.id = tokens.queue_session_id
    `);
  });
  return reportFor(plan, 'apply');
};

export interface OperationalVerificationReport {
  clean: boolean;
  sourceCounts: { queue: number; ledgerCustomers: number };
  sourceDisposition: { accepted: number; rejected: number; quarantined: number };
  shadowCounts: { queueTokens: number; customerSources: number; serviceSources: number };
  nativeCounts: { queueTokens: number; appointments: number };
  mismatches: string[];
}

export const verifyOperationalMigration = async (input: {
  source: OperationalLegacySource;
  mapping: OperationalMigrationMapping;
  database: PostgresDatabase;
}): Promise<OperationalVerificationReport> => {
  const plan = buildOperationalMigrationPlan(await input.source.load(), input.mapping);
  const mismatches = plan.issues.map(({ code, sourceRef, message }) => `${code}:${sourceRef}:${message}`);
  const queueCount = await input.database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM queue_token_source_links');
  const customerCount = await input.database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM customer_source_links');
  const serviceCount = await input.database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM service_source_links');
  const shadowCounts = {
    queueTokens: Number(queueCount.rows[0]!.count),
    customerSources: Number(customerCount.rows[0]!.count),
    serviceSources: Number(serviceCount.rows[0]!.count),
  };
  if (shadowCounts.queueTokens !== plan.tokens.length) mismatches.push('Queue source/token count mismatch');
  if (shadowCounts.customerSources !== plan.customers.reduce((sum, customer) => sum + customer.sources.length, 0)) {
    mismatches.push('Customer source-link count mismatch');
  }
  if (shadowCounts.serviceSources !== plan.serviceSources.length) mismatches.push('Service source-link count mismatch');

  for (const organization of plan.mapping.organizations) {
    const result = await input.database.query<{
      legacy_mongo_id: string | null; timezone: string | null;
    }>(`
      SELECT o.legacy_mongo_id, b.timezone
      FROM organizations o
      JOIN branches b ON b.organization_id = o.id
      WHERE o.id = $1 AND b.id = $2
    `, [organization.organizationId, organization.branchId]);
    const row = result.rows[0];
    if (!row || row.legacy_mongo_id !== organization.legacyOrganizationId
      || row.timezone !== organization.timezone) {
      mismatches.push(`Organization/branch/timezone mapping mismatch: ${organization.legacyOrganizationId}`);
    }
  }

  for (const customer of plan.customers) {
    for (const source of customer.sources) {
      const result = await input.database.query<{
        organization_id: string; customer_id: string; source_fingerprint: string;
      }>(`
        SELECT organization_id, customer_id, source_fingerprint
        FROM customer_source_links
        WHERE source_kind = $1 AND legacy_document_id = $2
      `, [source.sourceKind, source.legacyDocumentId]);
      const row = result.rows[0];
      if (!row || row.organization_id !== customer.organizationId
        || row.customer_id !== customer.id
        || row.source_fingerprint.trim() !== source.fingerprint) {
        mismatches.push(`Customer source mapping mismatch: ${source.sourceRef}`);
      }
    }
  }

  for (const service of plan.services) {
    const result = await input.database.query<{
      organization_id: string; name: string; normalized_name: string;
      duration_minutes: number; branch_id: string; availability_active: boolean;
    }>(`
      SELECT s.organization_id, s.name, s.normalized_name, s.duration_minutes,
        a.branch_id, a.active AS availability_active
      FROM services s
      JOIN service_branch_availability a
        ON a.service_id = s.id AND a.organization_id = s.organization_id
      WHERE s.id = $1 AND s.organization_id = $2 AND a.branch_id = $3
    `, [service.id, service.organizationId, service.branchId]);
    const row = result.rows[0];
    if (!row || row.organization_id !== service.organizationId || row.name !== service.name
      || row.normalized_name !== service.normalizedName
      || row.duration_minutes !== service.durationMinutes || row.branch_id !== service.branchId
      || !row.availability_active) {
      mismatches.push(`Service/availability mismatch: ${service.id}`);
    }
  }

  for (const source of plan.serviceSources) {
    const result = await input.database.query<{
      organization_id: string; service_id: string; source_label: string; source_fingerprint: string;
    }>(`
      SELECT organization_id, service_id, source_label, source_fingerprint
      FROM service_source_links
      WHERE legacy_queue_document_id = $1
    `, [source.legacyQueueDocumentId]);
    const row = result.rows[0];
    if (!row || row.organization_id !== source.organizationId || row.service_id !== source.serviceId
      || row.source_label !== source.sourceLabel
      || row.source_fingerprint.trim() !== source.fingerprint) {
      mismatches.push(`Service source mapping mismatch: queue:${source.legacyQueueDocumentId}`);
    }
  }

  const maximumBySession = new Map<string, bigint>();
  for (const token of plan.tokens) {
    const current = maximumBySession.get(token.sessionId) ?? 0n;
    if (token.tokenNumber > current) maximumBySession.set(token.sessionId, token.tokenNumber);
  }
  for (const session of plan.sessions) {
    const result = await input.database.query<{
      organization_id: string; branch_id: string; local_business_date: string;
      lane_key: string; status: string; next_token_number: string; closed_at: Date | null;
    }>(`
      SELECT organization_id, branch_id, local_business_date::text, lane_key,
        status, next_token_number::text, closed_at
      FROM queue_sessions WHERE id = $1
    `, [session.id]);
    const row = result.rows[0];
    const expectedNext = (maximumBySession.get(session.id) ?? 0n) + 1n;
    if (!row || row.organization_id !== session.organizationId || row.branch_id !== session.branchId
      || row.local_business_date !== session.localBusinessDate || row.lane_key !== session.laneKey
      || row.status !== session.status || BigInt(row.next_token_number) < expectedNext
      || (row.closed_at?.getTime() ?? null) !== (session.closedAt?.getTime() ?? null)) {
      mismatches.push(`Queue session mismatch: ${session.id}`);
    }
  }

  for (const token of plan.tokens) {
    const result = await input.database.query<{
      organization_id: string; branch_id: string; queue_session_id: string; token_number: string;
      customer_id: string; service_id: string; status: string; created_at: Date; updated_at: Date;
      source_fingerprint: string; event_status: string | null;
      event_source: string | null; event_occurred_at: Date | null;
    }>(`
      SELECT t.organization_id, t.branch_id, t.queue_session_id, t.token_number::text,
        t.customer_id, t.service_id, t.status, t.created_at, t.updated_at,
        l.source_fingerprint, e.to_status AS event_status,
        e.source AS event_source, e.occurred_at AS event_occurred_at
      FROM queue_tokens t
      JOIN queue_token_source_links l ON l.queue_token_id = t.id
      LEFT JOIN queue_status_events e
        ON e.queue_token_id = t.id AND e.queue_token_version = 1
      WHERE t.legacy_mongo_id = $1
    `, [token.legacyMongoId]);
    const row = result.rows[0];
    if (!row || row.organization_id !== token.organizationId || row.branch_id !== token.branchId
      || row.queue_session_id !== token.sessionId || row.token_number !== token.tokenNumber.toString()
      || row.customer_id !== token.customerId || row.service_id !== token.serviceId
      || row.status !== token.status || row.created_at.getTime() !== token.createdAt.getTime()
      || row.updated_at.getTime() !== token.updatedAt.getTime()
      || row.source_fingerprint.trim() !== token.fingerprint
      || row.event_status !== token.status || row.event_source !== 'migration'
      || row.event_occurred_at?.getTime() !== token.createdAt.getTime()) {
      mismatches.push(`Queue token mismatch: ${token.legacyMongoId}`);
    }
  }
  const [nativeQueueCount, appointmentCount] = await Promise.all([
    input.database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM queue_tokens WHERE legacy_mongo_id IS NULL',
    ),
    input.database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM appointments'),
  ]);
  const nativeCounts = {
    queueTokens: Number(nativeQueueCount.rows[0]!.count),
    appointments: Number(appointmentCount.rows[0]!.count),
  };
  const duplicateChecks = await input.database.query<{ issue: string }>(`
    SELECT 'duplicate legacy_mongo_id' AS issue
    FROM queue_tokens WHERE legacy_mongo_id IS NOT NULL
    GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
    UNION ALL
    SELECT 'duplicate session token' AS issue
    FROM queue_tokens GROUP BY queue_session_id, token_number HAVING COUNT(*) > 1
  `);
  mismatches.push(...duplicateChecks.rows.map(({ issue }) => issue));
  return {
    clean: mismatches.length === 0,
    sourceCounts: plan.sourceCounts,
    sourceDisposition: {
      accepted: plan.acceptedQueueRows,
      rejected: plan.rejectedQueueRows,
      quarantined: plan.quarantinedQueueRows,
    },
    shadowCounts,
    nativeCounts,
    mismatches,
  };
};

export interface OperationalPreflightReport {
  ready: boolean;
  checks: Record<string, boolean>;
  failures: string[];
  verification: OperationalVerificationReport;
}

export const runOperationalCutoverPreflight = async (input: {
  source: OperationalLegacySource;
  mapping: OperationalMigrationMapping;
  database: PostgresDatabase;
  operationalAuthority: string;
  allowPendingActivation?: boolean;
}): Promise<OperationalPreflightReport> => {
  const [migrations, verification, missingTimezones, constraints, authorityActivated] = await Promise.all([
    getMigrationStatus(input.database),
    verifyOperationalMigration(input),
    input.database.query<{ id: string }>(`
      SELECT id FROM branches
      WHERE status = 'active' AND (timezone IS NULL OR NOT ekavio_is_valid_iana_timezone(timezone))
    `),
    input.database.query<{ name: string }>(`
      SELECT conname AS name
      FROM pg_constraint
      WHERE conname IN (
        'queue_tokens_session_number_unique',
        'queue_sessions_scope_unique',
        'appointments_provider_overlap_exclude'
      )
    `),
    isOperationalAuthorityActivated(input.database),
  ]);
  const constraintNames = new Set(constraints.rows.map(({ name }) => name));
  const checks = {
    migrationsCurrent: migrations.every(({ state }) => state === 'applied'),
    activeBranchTimezonesReviewed: missingTimezones.rowCount === 0,
    migrationVerificationClean: verification.clean,
    noUnresolvedCustomerOrServiceCollision: verification.mismatches.every((value) =>
      !value.startsWith('ambiguous_customer:') && !value.startsWith('service_collision:')),
    noUnmappedQueueDocument: verification.mismatches.every((value) =>
      !value.startsWith('unmapped_organization:')),
    queueRelationsAndConstraintsClean: verification.clean,
    queueConcurrencyConstraintsPresent: [
      'queue_tokens_session_number_unique',
      'queue_sessions_scope_unique',
      'appointments_provider_overlap_exclude',
    ].every((name) => constraintNames.has(name)),
    postgresIsSourceControlledAuthority: input.operationalAuthority === 'postgresql',
    authorityLatchMatches: authorityActivated || input.allowPendingActivation === true,
  };
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return { ready: failures.length === 0, checks, failures, verification };
};
