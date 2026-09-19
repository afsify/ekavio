import { createHash } from 'node:crypto';
import { normalizeCustomerName, normalizePhone } from '../customers/normalization.js';
import { normalizeServiceName } from '../services/normalization.js';
import { instantToBranchLocalDateTime } from '../appointments/timezone.js';
import type {
  OperationalLegacySnapshot,
  OperationalMigrationMapping,
  OrganizationMigrationMapping,
} from './migrationTypes.js';

export interface MigrationIssue {
  code: string;
  sourceRef: string;
  message: string;
}

interface PlannedCustomerSource {
  sourceKind: 'queue' | 'ledger';
  legacyDocumentId: string;
  sourceRef: string;
  fingerprint: string;
}

export interface PlannedCustomer {
  id: string;
  organizationId: string;
  name: string;
  normalizedPhone: string;
  displayPhone: string;
  groupKey: string;
  sources: PlannedCustomerSource[];
}

export interface PlannedService {
  id: string;
  organizationId: string;
  branchId: string;
  name: string;
  normalizedName: string;
  durationMinutes: number;
}

export interface PlannedServiceSource {
  legacyQueueDocumentId: string;
  organizationId: string;
  serviceId: string;
  sourceLabel: string;
  fingerprint: string;
}

export interface PlannedQueueSession {
  id: string;
  organizationId: string;
  branchId: string;
  localBusinessDate: string;
  laneKey: string;
  status: 'open' | 'closed';
  closedAt: Date | null;
}

export interface PlannedQueueToken {
  id: string;
  legacyMongoId: string;
  organizationId: string;
  branchId: string;
  sessionId: string;
  tokenNumber: bigint;
  customerId: string;
  serviceId: string;
  status: 'waiting' | 'serving' | 'completed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
  fingerprint: string;
}

export interface OperationalMigrationPlan {
  sourceCounts: { queue: number; ledgerCustomers: number };
  acceptedQueueRows: number;
  rejectedQueueRows: number;
  quarantinedQueueRows: number;
  customers: PlannedCustomer[];
  services: PlannedService[];
  serviceSources: PlannedServiceSource[];
  sessions: PlannedQueueSession[];
  tokens: PlannedQueueToken[];
  issues: MigrationIssue[];
  mapping: OperationalMigrationMapping;
}

const fingerprint = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export const deterministicUuid = (scope: string, key: string): string => {
  const bytes = Buffer.from(createHash('sha256').update(`${scope}\0${key}`).digest().subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

interface NormalizedCustomerSource extends PlannedCustomerSource {
  organizationId: string;
  mapping: OrganizationMigrationMapping;
  name: string;
  nameKey: string;
  normalizedPhone: string;
  displayPhone: string;
}

const mappingByLegacyId = (mapping: OperationalMigrationMapping): Map<string, OrganizationMigrationMapping> =>
  new Map(mapping.organizations.map((entry) => [entry.legacyOrganizationId, entry]));

export const buildOperationalMigrationPlan = (
  snapshot: OperationalLegacySnapshot,
  mapping: OperationalMigrationMapping,
): OperationalMigrationPlan => {
  const issues: MigrationIssue[] = [];
  const mappings = mappingByLegacyId(mapping);
  const customerSources: NormalizedCustomerSource[] = [];

  for (const organization of mapping.organizations) {
    try {
      instantToBranchLocalDateTime(new Date(0), organization.timezone);
    } catch (error) {
      issues.push({
        code: 'invalid_timezone', sourceRef: `mapping:${organization.legacyOrganizationId}`,
        message: error instanceof Error ? error.message : 'Invalid timezone',
      });
    }
    const customerRefs = new Set([
      ...snapshot.queue
        .filter((row) => row.legacyOrganizationId === organization.legacyOrganizationId)
        .map((row) => `queue:${row.id}`),
      ...snapshot.ledgerCustomers
        .filter((row) => row.legacyOrganizationId === organization.legacyOrganizationId)
        .map((row) => `ledger:${row.id}`),
    ]);
    for (const sourceRef of Object.keys(organization.customerGroups)) {
      if (!customerRefs.has(sourceRef)) issues.push({
        code: 'unused_mapping_entry', sourceRef: `mapping:${organization.legacyOrganizationId}`,
        message: `Customer resolution does not match a source record: ${sourceRef}`,
      });
    }
    const serviceLabels = new Set(snapshot.queue
      .filter((row) => row.legacyOrganizationId === organization.legacyOrganizationId)
      .map((row) => row.serviceType));
    for (const label of Object.keys(organization.serviceResolutions)) {
      if (!serviceLabels.has(label)) issues.push({
        code: 'unused_mapping_entry', sourceRef: `mapping:${organization.legacyOrganizationId}`,
        message: `Service resolution does not match a source label: ${label}`,
      });
    }
    const queueIds = new Set(snapshot.queue
      .filter((row) => row.legacyOrganizationId === organization.legacyOrganizationId)
      .map((row) => row.id));
    for (const legacyQueueId of Object.keys(organization.queueSessionOverrides)) {
      if (!queueIds.has(legacyQueueId)) issues.push({
        code: 'unused_mapping_entry', sourceRef: `mapping:${organization.legacyOrganizationId}`,
        message: `Queue session override does not match a source record: ${legacyQueueId}`,
      });
    }
  }

  const addCustomerSource = (input: {
    sourceKind: 'queue' | 'ledger'; id: string; legacyOrganizationId: string;
    customerName: string; phone: string; createdAt: Date; updatedAt: Date;
  }): void => {
    const sourceRef = `${input.sourceKind}:${input.id}`;
    const organization = mappings.get(input.legacyOrganizationId);
    if (!organization) {
      issues.push({ code: 'unmapped_organization', sourceRef, message: 'No reviewed organization/branch mapping exists' });
      return;
    }
    try {
      const name = normalizeCustomerName(input.customerName);
      const normalizedPhone = normalizePhone(input.phone, {
        ...(organization.defaultCallingCode ? { defaultCallingCode: organization.defaultCallingCode } : {}),
      });
      if (!normalizedPhone) throw new Error('Legacy customer phone is empty');
      customerSources.push({
        sourceKind: input.sourceKind, legacyDocumentId: input.id, sourceRef,
        fingerprint: fingerprint(input), organizationId: organization.organizationId,
        mapping: organization, name: name.display, nameKey: name.key,
        normalizedPhone, displayPhone: input.phone,
      });
    } catch (error) {
      issues.push({ code: 'invalid_customer', sourceRef, message: error instanceof Error ? error.message : 'Invalid customer' });
    }
  };

  for (const row of snapshot.queue) addCustomerSource({
    sourceKind: 'queue', id: row.id, legacyOrganizationId: row.legacyOrganizationId,
    customerName: row.customerName, phone: row.phone, createdAt: row.createdAt, updatedAt: row.updatedAt,
  });
  for (const row of snapshot.ledgerCustomers) addCustomerSource({
    sourceKind: 'ledger', id: row.id, legacyOrganizationId: row.legacyOrganizationId,
    customerName: row.customerName, phone: row.phone, createdAt: row.createdAt, updatedAt: row.updatedAt,
  });

  const byPhone = new Map<string, NormalizedCustomerSource[]>();
  for (const source of customerSources) {
    const key = `${source.organizationId}|${source.normalizedPhone}`;
    byPhone.set(key, [...(byPhone.get(key) ?? []), source]);
  }
  for (const group of byPhone.values()) {
    if (new Set(group.map(({ nameKey }) => nameKey)).size <= 1) continue;
    for (const source of group) {
      if (!source.mapping.customerGroups[source.sourceRef]) {
        issues.push({
          code: 'ambiguous_customer', sourceRef: source.sourceRef,
          message: 'Phone matches multiple normalized names; every source requires an explicit customerGroups resolution',
        });
      }
    }
  }

  const customerGroups = new Map<string, NormalizedCustomerSource[]>();
  for (const source of customerSources) {
    const reviewed = source.mapping.customerGroups[source.sourceRef];
    const groupKey = reviewed ?? `${source.normalizedPhone}|${source.nameKey}`;
    const key = `${source.organizationId}|${groupKey}`;
    customerGroups.set(key, [...(customerGroups.get(key) ?? []), source]);
  }
  const customers: PlannedCustomer[] = [...customerGroups.entries()].map(([key, sources]) => {
    const ordered = [...sources].sort((a, b) => a.sourceRef.localeCompare(b.sourceRef));
    const first = ordered[0]!;
    return {
      id: deterministicUuid('ekavio-customer', key), organizationId: first.organizationId,
      name: first.name, normalizedPhone: first.normalizedPhone, displayPhone: first.displayPhone,
      groupKey: key.slice(first.organizationId.length + 1),
      sources: ordered.map(({ sourceKind, legacyDocumentId, sourceRef, fingerprint: sourceFingerprint }) => ({
        sourceKind, legacyDocumentId, sourceRef, fingerprint: sourceFingerprint,
      })),
    };
  });
  const customerIdBySource = new Map(customers.flatMap((customer) =>
    customer.sources.map((source) => [source.sourceRef, customer.id] as const)));

  const serviceRows = snapshot.queue.map((row) => {
    const organization = mappings.get(row.legacyOrganizationId);
    const sourceRef = `queue:${row.id}`;
    if (!organization) return undefined;
    try {
      return { row, organization, sourceRef, normalized: normalizeServiceName(row.serviceType) };
    } catch (error) {
      issues.push({ code: 'invalid_service', sourceRef, message: error instanceof Error ? error.message : 'Invalid service' });
      return undefined;
    }
  }).filter((value): value is NonNullable<typeof value> => value !== undefined);

  const rawCollisionGroups = new Map<string, typeof serviceRows>();
  for (const entry of serviceRows) {
    const key = `${entry.organization.organizationId}|${entry.normalized.key}`;
    rawCollisionGroups.set(key, [...(rawCollisionGroups.get(key) ?? []), entry]);
  }
  for (const group of rawCollisionGroups.values()) {
    const labels = new Set(group.map(({ normalized }) => normalized.display));
    if (labels.size <= 1) continue;
    for (const entry of group) {
      if (!entry.organization.serviceResolutions[entry.row.serviceType]) {
        issues.push({
          code: 'service_collision', sourceRef: entry.sourceRef,
          message: 'Materially different labels normalize alike; each raw label requires reviewed serviceResolutions',
        });
      }
    }
  }

  const servicesByKey = new Map<string, PlannedService>();
  const serviceSources: PlannedServiceSource[] = [];
  const serviceIdBySource = new Map<string, string>();
  for (const entry of serviceRows) {
    const canonical = normalizeServiceName(
      entry.organization.serviceResolutions[entry.row.serviceType] ?? entry.row.serviceType,
    );
    const key = `${entry.organization.organizationId}|${canonical.key}`;
    const service = servicesByKey.get(key) ?? {
      id: deterministicUuid('ekavio-service', key),
      organizationId: entry.organization.organizationId,
      branchId: entry.organization.branchId,
      name: canonical.display,
      normalizedName: canonical.key,
      durationMinutes: entry.organization.defaultServiceDurationMinutes,
    };
    servicesByKey.set(key, service);
    serviceIdBySource.set(entry.sourceRef, service.id);
    serviceSources.push({
      legacyQueueDocumentId: entry.row.id,
      organizationId: entry.organization.organizationId,
      serviceId: service.id,
      sourceLabel: entry.row.serviceType,
      fingerprint: fingerprint({ serviceType: entry.row.serviceType, updatedAt: entry.row.updatedAt }),
    });
  }

  const sessionsByKey = new Map<string, PlannedQueueSession>();
  const tokens: PlannedQueueToken[] = [];
  const seenSessionNumbers = new Map<string, string>();
  const validStatuses = new Set(['waiting', 'serving', 'completed', 'cancelled']);
  for (const row of snapshot.queue) {
    const sourceRef = `queue:${row.id}`;
    const organization = mappings.get(row.legacyOrganizationId);
    if (!organization) continue;
    const customerId = customerIdBySource.get(sourceRef);
    const serviceId = serviceIdBySource.get(sourceRef);
    if (!customerId || !serviceId) continue;
    let assignment: { localBusinessDate: string; laneKey: string; status: 'open' | 'closed' };
    try {
      assignment = organization.queueSessionOverrides[row.id] ?? {
        localBusinessDate: instantToBranchLocalDateTime(row.createdAt, organization.timezone).slice(0, 10),
        laneKey: organization.sessionPolicy.laneKey,
        status: organization.sessionPolicy.status,
      };
    } catch (error) {
      issues.push({ code: 'invalid_timezone', sourceRef, message: error instanceof Error ? error.message : 'Invalid timezone' });
      continue;
    }
    const tokenMatch = /^#?([1-9][0-9]*)$/.exec(row.tokenLabel.trim());
    if (!tokenMatch) {
      issues.push({ code: 'invalid_token_label', sourceRef, message: 'Token label is not a positive integer label' });
      continue;
    }
    if (!validStatuses.has(row.status)) {
      issues.push({ code: 'invalid_queue_status', sourceRef, message: `Unsupported Queue status: ${row.status}` });
      continue;
    }
    const sessionKey = `${organization.organizationId}|${organization.branchId}|${assignment.localBusinessDate}|${assignment.laneKey}`;
    const sessionId = deterministicUuid('ekavio-queue-session', sessionKey);
    const tokenNumber = BigInt(tokenMatch[1]!);
    const numberKey = `${sessionId}|${tokenNumber}`;
    const previous = seenSessionNumbers.get(numberKey);
    if (previous) {
      issues.push({
        code: 'duplicate_session_token', sourceRef,
        message: `Token number duplicates ${previous}; add reviewed queueSessionOverrides to separate historical sessions`,
      });
      continue;
    }
    seenSessionNumbers.set(numberKey, sourceRef);
    const existingSession = sessionsByKey.get(sessionKey);
    if (existingSession && existingSession.status !== assignment.status) {
      issues.push({
        code: 'conflicting_session_status', sourceRef,
        message: 'Rows assigned to one reviewed Queue session must use one open/closed status',
      });
      continue;
    }
    const closedAt = assignment.status === 'closed' ? row.updatedAt : null;
    sessionsByKey.set(sessionKey, existingSession ? {
      ...existingSession,
      closedAt: existingSession.closedAt && closedAt && existingSession.closedAt > closedAt
        ? existingSession.closedAt : closedAt,
    } : {
      id: sessionId, organizationId: organization.organizationId, branchId: organization.branchId,
      localBusinessDate: assignment.localBusinessDate, laneKey: assignment.laneKey,
      status: assignment.status, closedAt,
    });
    tokens.push({
      id: deterministicUuid('ekavio-queue-token', row.id), legacyMongoId: row.id,
      organizationId: organization.organizationId, branchId: organization.branchId,
      sessionId, tokenNumber, customerId, serviceId,
      status: row.status as PlannedQueueToken['status'], createdAt: row.createdAt,
      updatedAt: row.updatedAt, fingerprint: fingerprint(row),
    });
  }

  const rejectedCodes = new Set([
    'unmapped_organization', 'invalid_customer', 'invalid_service', 'invalid_timezone',
    'invalid_token_label', 'invalid_queue_status',
  ]);
  const rejectedQueueIds = new Set(issues
    .filter(({ code, sourceRef }) => rejectedCodes.has(code) && sourceRef.startsWith('queue:'))
    .map(({ sourceRef }) => sourceRef.slice('queue:'.length)));
  const quarantinedQueueIds = new Set(issues
    .filter(({ code, sourceRef }) => !rejectedCodes.has(code) && sourceRef.startsWith('queue:'))
    .map(({ sourceRef }) => sourceRef.slice('queue:'.length)));
  for (const id of rejectedQueueIds) quarantinedQueueIds.delete(id);
  const unresolvedQueueIds = new Set([...rejectedQueueIds, ...quarantinedQueueIds]);
  return {
    sourceCounts: { queue: snapshot.queue.length, ledgerCustomers: snapshot.ledgerCustomers.length },
    acceptedQueueRows: snapshot.queue.length - unresolvedQueueIds.size,
    rejectedQueueRows: rejectedQueueIds.size,
    quarantinedQueueRows: quarantinedQueueIds.size,
    customers, services: [...servicesByKey.values()], serviceSources,
    sessions: [...sessionsByKey.values()], tokens, issues, mapping,
  };
};
