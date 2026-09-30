import { createHash } from 'node:crypto';
import type { PostgresDatabase } from '../../postgres/database.js';
import { getMigrationStatus } from '../../postgres/migrations.js';
import { isInventoryAuthorityActivated } from './authority.js';
import { legacyNumberToInrPriceMinor } from './money.js';
import {
  formatQuantityMilli,
  legacyNumberToQuantity,
  parseQuantityToMilli,
} from './quantity.js';
import type {
  InventoryLegacySource,
  InventoryMigrationMapping,
  LegacyInventorySourceRecord,
} from './migrationTypes.js';
import type { InventoryUnitCode } from './units.js';

export interface InventoryMigrationIssue {
  code: string;
  sourceRef: string;
  message: string;
}

interface PlannedInventoryRecord {
  itemId: string;
  movementId: string | null;
  organizationId: string;
  branchId: string;
  locationId: string;
  name: string;
  unitCode: InventoryUnitCode;
  priceMinor: bigint;
  openingQuantity: string;
  reorderThreshold: string;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
  legacyMongoId: string;
  fingerprint: string;
}

export interface InventoryMigrationPlan {
  sourceCount: number;
  acceptedCount: number;
  blockerCount: number;
  organizationCounts: Record<string, number>;
  branchCoverage: number;
  unitCoverage: number;
  priceConversionCoverage: number;
  quantityConversionCoverage: number;
  thresholdCoverage: number;
  openingMovementCount: number;
  zeroOpeningBalanceCount: number;
  openingQuantityByOrganizationBranchUnit: Record<string, string>;
  records: PlannedInventoryRecord[];
  issues: InventoryMigrationIssue[];
}

const objectIdPattern = /^[0-9a-f]{24}$/;

const deterministicUuid = (scope: string, key: string): string => {
  const bytes = Buffer.from(createHash('sha256').update(`${scope}\0${key}`).digest().subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const fingerprint = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

const sourceRef = (record: LegacyInventorySourceRecord): string => `inventory:${record.id}`;

const addIssue = (
  issues: InventoryMigrationIssue[],
  record: LegacyInventorySourceRecord,
  code: string,
  message: string,
): void => {
  issues.push({ code, sourceRef: sourceRef(record), message });
};

export const buildInventoryMigrationPlan = async (input: {
  source: InventoryLegacySource;
  mapping: InventoryMigrationMapping;
  database: PostgresDatabase;
}): Promise<InventoryMigrationPlan> => {
  const source = await input.source.load();
  const mappings = new Map(
    input.mapping.organizations.map((entry) => [entry.legacyOrganizationId, entry]),
  );
  const issues: InventoryMigrationIssue[] = [];
  const records: PlannedInventoryRecord[] = [];
  const usedBranchResolutions = new Set<string>();
  const usedUnitResolutions = new Set<string>();

  for (const record of source) {
    if (!objectIdPattern.test(record.id) || !objectIdPattern.test(record.legacyOrganizationId)) {
      addIssue(issues, record, 'invalid_legacy_identifier', 'Legacy Inventory identifiers are invalid');
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
      addIssue(issues, record, 'missing_branch_mapping', 'Legacy Inventory stock requires a reviewed branch mapping');
      continue;
    }
    usedBranchResolutions.add(`${record.legacyOrganizationId}:${record.id}`);
    const location = await input.database.query<{ id: string }>(`
      SELECT l.id
      FROM stock_locations l
      JOIN branches b ON b.id = l.branch_id AND b.organization_id = l.organization_id
      WHERE l.organization_id = $1 AND l.branch_id = $2
        AND l.is_default = TRUE AND l.status = 'active' AND b.status = 'active'
    `, [mapping.organizationId, branchId]);
    if (location.rowCount !== 1 || !location.rows[0]) {
      addIssue(issues, record, 'invalid_branch_mapping', 'Reviewed branch must have exactly one active default stock location');
      continue;
    }

    const unitCode = mapping.unitResolutions[record.id];
    if (!unitCode) {
      addIssue(issues, record, 'missing_unit_mapping', 'Legacy Inventory item requires reviewed unit evidence');
      continue;
    }
    usedUnitResolutions.add(`${record.legacyOrganizationId}:${record.id}`);

    const name = record.itemName.trim();
    if (name.length < 1 || name.length > 200) {
      addIssue(issues, record, 'invalid_item_name', 'Legacy item name is empty or exceeds 200 characters');
      continue;
    }
    let openingQuantity: string;
    let reorderThreshold: string;
    let priceMinor: bigint;
    try {
      openingQuantity = legacyNumberToQuantity(record.currentStock);
    } catch (error) {
      addIssue(
        issues, record, 'invalid_quantity_precision',
        error instanceof Error ? error.message : 'Legacy stock quantity is invalid',
      );
      continue;
    }
    try {
      reorderThreshold = legacyNumberToQuantity(record.lowStockThreshold);
    } catch (error) {
      addIssue(
        issues, record, 'invalid_threshold_precision',
        error instanceof Error ? error.message : 'Legacy stock threshold is invalid',
      );
      continue;
    }
    try {
      priceMinor = legacyNumberToInrPriceMinor(record.price);
    } catch (error) {
      addIssue(
        issues, record, 'invalid_price_precision',
        error instanceof Error ? error.message : 'Legacy price is invalid',
      );
      continue;
    }
    if (Number.isNaN(record.createdAt.getTime()) || Number.isNaN(record.updatedAt.getTime())) {
      addIssue(issues, record, 'invalid_timestamps', 'Legacy Inventory timestamps are invalid');
      continue;
    }

    const sourceFingerprint = fingerprint({
      id: record.id,
      legacyOrganizationId: record.legacyOrganizationId,
      name,
      openingQuantity,
      reorderThreshold,
      priceMinor: priceMinor.toString(),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      organizationId: mapping.organizationId,
      branchId,
      locationId: location.rows[0].id,
      unitCode,
    });
    const existing = await input.database.query<{
      organization_id: string; name: string; unit_code: string; status: string;
      price_minor: string; currency: string; legacy_source_fingerprint: string;
      created_at: Date; updated_at: Date;
    }>(`
      SELECT organization_id, name, unit_code, status, price_minor::text, currency,
        legacy_source_fingerprint, created_at, updated_at
      FROM inventory_items WHERE legacy_mongo_id = $1
    `, [record.id]);
    if (existing.rows[0]) {
      const row = existing.rows[0];
      const matches = existing.rows.length === 1
        && row.organization_id === mapping.organizationId
        && row.name === name
        && row.unit_code === unitCode
        && row.status === 'active'
        && row.price_minor === priceMinor.toString()
        && row.currency === 'INR'
        && row.legacy_source_fingerprint.trim() === sourceFingerprint
        && row.created_at.getTime() === record.createdAt.getTime()
        && row.updated_at.getTime() === record.updatedAt.getTime();
      if (!matches) {
        addIssue(issues, record, 'target_conflict', 'Existing PostgreSQL Inventory item conflicts with reviewed source facts');
        continue;
      }
    }

    records.push({
      itemId: deterministicUuid('ekavio-inventory-item', record.id),
      movementId: openingQuantity === '0.000'
        ? null
        : deterministicUuid('ekavio-inventory-opening-movement', record.id),
      organizationId: mapping.organizationId,
      branchId,
      locationId: location.rows[0].id,
      name,
      unitCode,
      priceMinor,
      openingQuantity,
      reorderThreshold,
      occurredAt: record.createdAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      legacyMongoId: record.id,
      fingerprint: sourceFingerprint,
    });
  }

  for (const organization of input.mapping.organizations) {
    for (const legacyId of Object.keys(organization.branchResolutions)) {
      if (!usedBranchResolutions.has(`${organization.legacyOrganizationId}:${legacyId}`)) {
        issues.push({
          code: 'unused_branch_resolution', sourceRef: `inventory:${legacyId}`,
          message: 'Reviewed branch resolution does not match a current source record',
        });
      }
    }
    for (const legacyId of Object.keys(organization.unitResolutions)) {
      if (!usedUnitResolutions.has(`${organization.legacyOrganizationId}:${legacyId}`)) {
        issues.push({
          code: 'unused_unit_resolution', sourceRef: `inventory:${legacyId}`,
          message: 'Reviewed unit resolution does not match a current source record',
        });
      }
    }
  }

  const organizationCounts: Record<string, number> = {};
  const quantityTotals = new Map<string, bigint>();
  for (const record of records) {
    organizationCounts[record.organizationId] = (organizationCounts[record.organizationId] ?? 0) + 1;
    const key = `${record.organizationId}:${record.branchId}:${record.unitCode}`;
    quantityTotals.set(key, (quantityTotals.get(key) ?? 0n) + parseQuantityToMilli(record.openingQuantity));
  }
  return {
    sourceCount: source.length,
    acceptedCount: records.length,
    blockerCount: issues.length,
    organizationCounts,
    branchCoverage: new Set(records.map(({ branchId }) => branchId)).size,
    unitCoverage: records.length,
    priceConversionCoverage: records.length,
    quantityConversionCoverage: records.length,
    thresholdCoverage: records.length,
    openingMovementCount: records.filter(({ movementId }) => movementId !== null).length,
    zeroOpeningBalanceCount: records.filter(({ movementId }) => movementId === null).length,
    openingQuantityByOrganizationBranchUnit: Object.fromEntries(
      [...quantityTotals].map(([key, value]) => [key, formatQuantityMilli(value)]),
    ),
    records,
    issues,
  };
};

export class InventoryMigrationBlockedError extends Error {
  public constructor(public readonly issues: readonly InventoryMigrationIssue[]) {
    super(`Inventory migration apply refused: ${issues.length} unresolved blocker(s)`);
  }
}

export interface InventoryMigrationReport {
  mode: 'dry-run' | 'apply';
  sourceCount: number;
  appliedCount: number;
  blockerCount: number;
  organizationCounts: Record<string, number>;
  branchCoverage: number;
  unitCoverage: number;
  priceConversionCoverage: number;
  quantityConversionCoverage: number;
  thresholdCoverage: number;
  openingMovementCount: number;
  zeroOpeningBalanceCount: number;
  openingQuantityByOrganizationBranchUnit: Record<string, string>;
  issues: InventoryMigrationIssue[];
}

const reportFor = (
  plan: InventoryMigrationPlan,
  mode: 'dry-run' | 'apply',
): InventoryMigrationReport => ({
  mode,
  sourceCount: plan.sourceCount,
  appliedCount: mode === 'apply' ? plan.acceptedCount : 0,
  blockerCount: plan.blockerCount,
  organizationCounts: plan.organizationCounts,
  branchCoverage: plan.branchCoverage,
  unitCoverage: plan.unitCoverage,
  priceConversionCoverage: plan.priceConversionCoverage,
  quantityConversionCoverage: plan.quantityConversionCoverage,
  thresholdCoverage: plan.thresholdCoverage,
  openingMovementCount: plan.openingMovementCount,
  zeroOpeningBalanceCount: plan.zeroOpeningBalanceCount,
  openingQuantityByOrganizationBranchUnit: plan.openingQuantityByOrganizationBranchUnit,
  issues: plan.issues,
});

export const runInventoryMigration = async (input: {
  source: InventoryLegacySource;
  mapping: InventoryMigrationMapping;
  database: PostgresDatabase;
  apply?: boolean;
  allowInventoryRecovery?: boolean;
}): Promise<InventoryMigrationReport> => {
  const plan = await buildInventoryMigrationPlan(input);
  if (!input.apply) return reportFor(plan, 'dry-run');
  if (plan.issues.length > 0) throw new InventoryMigrationBlockedError(plan.issues);
  await input.database.transaction(async (client) => {
    if (await isInventoryAuthorityActivated(client) && !input.allowInventoryRecovery) {
      throw new Error('Inventory migration apply refused after PostgreSQL runtime authority activation; explicit reviewed recovery mode is required');
    }
    for (const record of plan.records) {
      const insertedItem = await client.query<{ id: string }>(`
        INSERT INTO inventory_items (
          id, organization_id, name, unit_code, status, price_minor, currency,
          legacy_mongo_id, legacy_source_fingerprint, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'active', $5, 'INR', $6, $7, $8, $9)
        ON CONFLICT (legacy_mongo_id) DO NOTHING
        RETURNING id
      `, [
        record.itemId, record.organizationId, record.name, record.unitCode,
        record.priceMinor.toString(), record.legacyMongoId, record.fingerprint,
        record.createdAt, record.updatedAt,
      ]);
      if (insertedItem.rowCount === 0) {
        const existing = await client.query<{ id: string; legacy_source_fingerprint: string }>(`
          SELECT id, legacy_source_fingerprint
          FROM inventory_items
          WHERE legacy_mongo_id = $1 AND id = $2 AND organization_id = $3
            AND name = $4 AND unit_code = $5 AND status = 'active'
            AND price_minor = $6 AND currency = 'INR'
            AND created_at = $7 AND updated_at = $8
        `, [
          record.legacyMongoId, record.itemId, record.organizationId, record.name,
          record.unitCode, record.priceMinor.toString(), record.createdAt, record.updatedAt,
        ]);
        if (existing.rows[0]?.legacy_source_fingerprint.trim() !== record.fingerprint) {
          throw new Error(`Inventory source changed after review: inventory:${record.legacyMongoId}`);
        }
      }
      await client.query(`
        INSERT INTO stock_balances (
          organization_id, branch_id, item_id, location_id, quantity, reorder_threshold
        ) VALUES ($1, $2, $3, $4, 0, $5)
        ON CONFLICT (item_id, location_id) DO NOTHING
      `, [
        record.organizationId, record.branchId, record.itemId,
        record.locationId, record.reorderThreshold,
      ]);
      if (record.movementId !== null) {
        const movement = await client.query<{ id: string }>(`
          INSERT INTO stock_movements (
            id, organization_id, branch_id, item_id, location_id, movement_type,
            quantity_delta, source_type, source_id, occurred_at
          ) VALUES ($1, $2, $3, $4, $5, 'opening', $6, 'legacy_mongo_inventory', $7, $8)
          ON CONFLICT DO NOTHING
          RETURNING id
        `, [
          record.movementId, record.organizationId, record.branchId, record.itemId,
          record.locationId, record.openingQuantity, record.legacyMongoId, record.occurredAt,
        ]);
        if (movement.rowCount === 1) {
          await client.query(`
            UPDATE stock_balances
            SET quantity = quantity + $5::numeric(18,3), updated_at = NOW()
            WHERE organization_id = $1 AND branch_id = $2 AND item_id = $3 AND location_id = $4
          `, [
            record.organizationId, record.branchId, record.itemId,
            record.locationId, record.openingQuantity,
          ]);
        }
      }
    }
  });
  return reportFor(plan, 'apply');
};

export interface InventoryVerificationReport extends Omit<InventoryMigrationReport, 'mode'> {
  clean: boolean;
  targetImportCount: number;
  balanceReconciliationCount: number;
  mismatches: string[];
}

export const verifyInventoryMigration = async (input: {
  source: InventoryLegacySource;
  mapping: InventoryMigrationMapping;
  database: PostgresDatabase;
}): Promise<InventoryVerificationReport> => {
  const plan = await buildInventoryMigrationPlan(input);
  const mismatches = plan.issues.map(({ code, sourceRef: ref }) => `${code}:${ref}`);
  for (const record of plan.records) {
    const result = await input.database.query<{
      id: string; organization_id: string; name: string; unit_code: string;
      price_minor: string; currency: string; legacy_source_fingerprint: string;
      quantity: string; reorder_threshold: string; movement_count: string;
      movement_delta: string | null; movement_source_id: string | null;
    }>(`
      SELECT i.id, i.organization_id, i.name, i.unit_code, i.price_minor::text,
        i.currency, i.legacy_source_fingerprint, b.quantity::text,
        b.reorder_threshold::text,
        COUNT(m.id)::text AS movement_count,
        MAX(m.quantity_delta)::text AS movement_delta,
        MAX(m.source_id) AS movement_source_id
      FROM inventory_items i
      JOIN stock_balances b
        ON b.item_id = i.id AND b.location_id = $2
        AND b.organization_id = i.organization_id AND b.branch_id = $3
      LEFT JOIN stock_movements m
        ON m.item_id = b.item_id AND m.location_id = b.location_id
        AND m.source_type = 'legacy_mongo_inventory'
      WHERE i.legacy_mongo_id = $1
      GROUP BY i.id, i.organization_id, i.name, i.unit_code, i.price_minor,
        i.currency, i.legacy_source_fingerprint, b.quantity, b.reorder_threshold
    `, [record.legacyMongoId, record.locationId, record.branchId]);
    const row = result.rows[0];
    const expectedMovementCount = record.movementId === null ? '0' : '1';
    if (!row || row.id !== record.itemId || row.organization_id !== record.organizationId
      || row.name !== record.name || row.unit_code !== record.unitCode
      || row.price_minor !== record.priceMinor.toString() || row.currency !== 'INR'
      || row.legacy_source_fingerprint.trim() !== record.fingerprint
      || row.quantity !== record.openingQuantity
      || row.reorder_threshold !== record.reorderThreshold
      || row.movement_count !== expectedMovementCount
      || (record.movementId !== null && row.movement_delta !== record.openingQuantity)
      || (record.movementId !== null && row.movement_source_id !== record.legacyMongoId)) {
      mismatches.push(`target_mismatch:inventory:${record.legacyMongoId}`);
    }
  }
  const targetCount = await input.database.query<{ count: string }>(`
    SELECT COUNT(*)::text AS count FROM inventory_items WHERE legacy_mongo_id IS NOT NULL
  `);
  const targetImportCount = Number(targetCount.rows[0]?.count ?? 0);
  if (targetImportCount !== plan.sourceCount) mismatches.push('source_target_count_mismatch');
  const reconciliation = await input.database.query<{ item_id: string; location_id: string }>(`
    SELECT b.item_id, b.location_id
    FROM stock_balances b
    LEFT JOIN stock_movements m
      ON m.item_id = b.item_id AND m.location_id = b.location_id
    GROUP BY b.item_id, b.location_id, b.quantity
    HAVING b.quantity <> COALESCE(SUM(m.quantity_delta), 0)
  `);
  mismatches.push(...reconciliation.rows.map(({ item_id, location_id }) =>
    `balance_mismatch:${item_id}:${location_id}`));
  const duplicates = await input.database.query<{ legacy_mongo_id: string }>(`
    SELECT legacy_mongo_id FROM inventory_items WHERE legacy_mongo_id IS NOT NULL
    GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
  `);
  mismatches.push(...duplicates.rows.map(({ legacy_mongo_id }) =>
    `duplicate_legacy_id:${legacy_mongo_id}`));
  return {
    clean: mismatches.length === 0,
    sourceCount: plan.sourceCount,
    appliedCount: plan.records.length,
    blockerCount: plan.blockerCount,
    organizationCounts: plan.organizationCounts,
    branchCoverage: plan.branchCoverage,
    unitCoverage: plan.unitCoverage,
    priceConversionCoverage: plan.priceConversionCoverage,
    quantityConversionCoverage: plan.quantityConversionCoverage,
    thresholdCoverage: plan.thresholdCoverage,
    openingMovementCount: plan.openingMovementCount,
    zeroOpeningBalanceCount: plan.zeroOpeningBalanceCount,
    openingQuantityByOrganizationBranchUnit: plan.openingQuantityByOrganizationBranchUnit,
    issues: plan.issues,
    targetImportCount,
    balanceReconciliationCount: reconciliation.rowCount ?? reconciliation.rows.length,
    mismatches,
  };
};

export interface InventoryPreflightReport {
  ready: boolean;
  checks: Record<string, boolean>;
  failures: string[];
  verification: InventoryVerificationReport;
}

export const runInventoryCutoverPreflight = async (input: {
  source: InventoryLegacySource;
  mapping: InventoryMigrationMapping;
  database: PostgresDatabase;
  inventoryAuthority: string;
  allowPendingActivation?: boolean;
}): Promise<InventoryPreflightReport> => {
  const [migrations, verification, tables, invalidLocations, moduleResult,
    repositoryHealth, authorityActivated] = await Promise.all([
    getMigrationStatus(input.database),
    verifyInventoryMigration(input),
    input.database.query<{ ready: boolean }>(`
      SELECT to_regclass('public.inventory_items') IS NOT NULL
        AND to_regclass('public.stock_locations') IS NOT NULL
        AND to_regclass('public.stock_movements') IS NOT NULL
        AND to_regclass('public.stock_balances') IS NOT NULL AS ready
    `),
    input.database.query(`
      SELECT b.id
      FROM branches b
      LEFT JOIN stock_locations l
        ON l.branch_id = b.id AND l.organization_id = b.organization_id
        AND l.is_default = TRUE AND l.status = 'active'
      WHERE b.status = 'active'
      GROUP BY b.id HAVING COUNT(l.id) <> 1
    `),
    input.database.query<{ available: boolean }>(`
      SELECT EXISTS(
        SELECT 1 FROM module_definitions WHERE key = 'inventory' AND status = 'active'
      ) AS available
    `),
    input.database.query('SELECT 1 FROM inventory_items LIMIT 1'),
    isInventoryAuthorityActivated(input.database),
  ]);
  const migration011 = migrations.find(({ name }) => name === '011_inventory_runtime_authority.sql');
  const branchBlockers = verification.issues.filter(({ code }) => code.includes('branch'));
  const unitBlockers = verification.issues.filter(({ code }) => code.includes('unit'));
  const priceBlockers = verification.issues.filter(({ code }) => code.includes('price'));
  const quantityBlockers = verification.issues.filter(({ code }) =>
    code.includes('quantity') || code.includes('threshold'));
  const checks = {
    migration011Applied: migration011?.state === 'applied',
    inventoryTablesReady: tables.rows[0]?.ready === true,
    defaultStockLocationsReady: invalidLocations.rowCount === 0,
    sourceReconciliationClean: verification.clean,
    zeroUnresolvedBlockers: verification.blockerCount === 0,
    branchMappingBlockersZero: branchBlockers.length === 0,
    unitMappingBlockersZero: unitBlockers.length === 0,
    priceConversionBlockersZero: priceBlockers.length === 0,
    quantityConversionBlockersZero: quantityBlockers.length === 0,
    balancesReconcileToMovements: verification.balanceReconciliationCount === 0,
    inventoryEntitlementAvailable: moduleResult.rows[0]?.available === true,
    postgresInventoryRepositoryHealthy: repositoryHealth.command === 'SELECT',
    postgresIsSourceControlledAuthority: input.inventoryAuthority === 'postgresql',
    authorityLatchMatches: authorityActivated || input.allowPendingActivation === true,
  };
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return { ready: failures.length === 0, checks, failures, verification };
};
