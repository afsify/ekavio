import type { QueryResultRow } from 'pg';
import type { PostgresDatabase } from './database.js';
import type { SharedCoreSnapshot } from './sharedCoreTypes.js';
import { validateShadowSnapshot } from './shadowValidation.js';

type Comparable = Record<string, unknown>;

export interface VerificationReport {
  matched: boolean;
  mismatchCount: number;
  mismatches: string[];
  sessionRowsCopied: number;
}

const normalize = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Comparable).sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalize(nested)]),
    );
  }
  return value;
};

const valuesEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));

const compare = (
  entity: string,
  expected: Map<string, Comparable>,
  actualRows: Array<Comparable & { legacy_mongo_id: string | null }>,
  mismatches: string[],
  sensitiveFields: ReadonlySet<string> = new Set(),
): void => {
  const actual = new Map(actualRows.filter((row) => row.legacy_mongo_id)
    .map((row) => [row.legacy_mongo_id as string, row]));
  if (actualRows.some((row) => !row.legacy_mongo_id)) mismatches.push(`${entity}: unmapped PostgreSQL row`);

  for (const [legacyId, expectedRow] of expected) {
    const actualRow = actual.get(legacyId);
    if (!actualRow) {
      mismatches.push(`${entity} ${legacyId}: missing PostgreSQL row`);
      continue;
    }
    for (const [field, expectedValue] of Object.entries(expectedRow)) {
      if (!valuesEqual(expectedValue, actualRow[field])) {
        mismatches.push(`${entity} ${legacyId}: ${sensitiveFields.has(field) ? 'credential' : field} mismatch`);
      }
    }
  }
  for (const legacyId of actual.keys()) {
    if (!expected.has(legacyId)) mismatches.push(`${entity} ${legacyId}: unexpected PostgreSQL row`);
  }
};

const keyed = <T>(rows: T[], key: (row: T) => string, value: (row: T) => Comparable): Map<string, Comparable> =>
  new Map(rows.map((row) => [key(row), value(row)]));

const rows = async <Row extends QueryResultRow & Comparable>(
  database: PostgresDatabase,
  sql: string,
): Promise<Array<Row & { legacy_mongo_id: string | null }>> =>
  (await database.query<Row & { legacy_mongo_id: string | null }>(sql)).rows;

export const verifyShadowState = async (
  snapshot: SharedCoreSnapshot,
  database: PostgresDatabase,
): Promise<VerificationReport> => {
  const sourceIssues = validateShadowSnapshot(snapshot);
  if (sourceIssues.length > 0) {
    return { matched: false, mismatchCount: sourceIssues.length, mismatches: sourceIssues, sessionRowsCopied: 0 };
  }

  const mismatches: string[] = [];
  compare('user', keyed(snapshot.users, (row) => row.legacyMongoId, (row) => ({
    name: row.name, phone: row.phone, password_hash: row.passwordHash, platform_role: row.platformRole,
    created_at: row.createdAt, updated_at: row.updatedAt,
  })), await rows(database, `
    SELECT legacy_mongo_id, name, phone, password_hash, platform_role, created_at, updated_at
    FROM users
  `), mismatches, new Set(['password_hash']));

  compare('parent organization', keyed(snapshot.parentOrganizations, (row) => row.legacyMongoId, (row) => ({
    owner_legacy_mongo_id: row.ownerUserLegacyMongoId, name: row.name,
    consolidated_billing: row.consolidatedBilling, created_at: row.createdAt, updated_at: row.updatedAt,
  })), await rows(database, `
    SELECT p.legacy_mongo_id, u.legacy_mongo_id AS owner_legacy_mongo_id, p.name,
      p.consolidated_billing, p.created_at, p.updated_at
    FROM parent_organizations p JOIN users u ON u.id = p.owner_user_id
  `), mismatches);

  compare('organization', keyed(snapshot.organizations, (row) => row.legacyMongoId, (row) => ({
    parent_legacy_mongo_id: row.parentOrganizationLegacyMongoId, name: row.name, type: row.type,
    theme_mode: row.themeMode, theme_primary_color: row.themePrimaryColor,
    created_at: row.createdAt, updated_at: row.updatedAt,
  })), await rows(database, `
    SELECT o.legacy_mongo_id, p.legacy_mongo_id AS parent_legacy_mongo_id, o.name, o.type,
      o.theme_mode, o.theme_primary_color, o.created_at, o.updated_at
    FROM organizations o LEFT JOIN parent_organizations p ON p.id = o.parent_organization_id
  `), mismatches);

  compare('branch', keyed(snapshot.branches, (row) => row.legacyMongoId, (row) => ({
    organization_legacy_mongo_id: row.organizationLegacyMongoId, name: row.name, code: row.code,
    status: row.status, created_at: row.createdAt, updated_at: row.updatedAt,
  })), await rows(database, `
    SELECT b.legacy_mongo_id, o.legacy_mongo_id AS organization_legacy_mongo_id,
      b.name, b.code, b.status, b.created_at, b.updated_at
    FROM branches b JOIN organizations o ON o.id = b.organization_id
  `), mismatches);

  compare('membership', keyed(snapshot.memberships, (row) => row.legacyMongoId, (row) => ({
    user_legacy_mongo_id: row.userLegacyMongoId,
    organization_legacy_mongo_id: row.organizationLegacyMongoId,
    role: row.role, status: row.status, created_at: row.createdAt, updated_at: row.updatedAt,
  })), await rows(database, `
    SELECT m.legacy_mongo_id, u.legacy_mongo_id AS user_legacy_mongo_id,
      o.legacy_mongo_id AS organization_legacy_mongo_id, m.role, m.status, m.created_at, m.updated_at
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    JOIN organizations o ON o.id = m.organization_id
  `), mismatches);

  compare('membership branches', keyed(snapshot.memberships, (row) => row.legacyMongoId, (row) => ({
    branch_legacy_mongo_ids: [...row.branchLegacyMongoIds].sort(),
  })), await rows(database, `
    SELECT m.legacy_mongo_id,
      COALESCE(array_agg(b.legacy_mongo_id ORDER BY b.legacy_mongo_id)
        FILTER (WHERE b.legacy_mongo_id IS NOT NULL), ARRAY[]::varchar[]) AS branch_legacy_mongo_ids
    FROM memberships m
    LEFT JOIN membership_branch_assignments a ON a.membership_id = m.id
    LEFT JOIN branches b ON b.id = a.branch_id
    GROUP BY m.id, m.legacy_mongo_id
  `), mismatches);

  compare('module', keyed(snapshot.moduleDefinitions, (row) => row.legacyMongoId, (row) => ({
    key: row.key, display_name: row.displayName, description: row.description, category: row.category,
    commercial_type: row.commercialType, status: row.status, version: row.version,
    created_at: row.createdAt, updated_at: row.updatedAt,
  })), await rows(database, `
    SELECT legacy_mongo_id, key, display_name, description, category, commercial_type,
      status, version, created_at, updated_at FROM module_definitions
  `), mismatches);

  compare('plan', keyed(snapshot.plans, (row) => row.legacyMongoId, (row) => ({
    key: row.key, name: row.name, description: row.description, status: row.status,
    available: row.available, version: row.version, created_at: row.createdAt, updated_at: row.updatedAt,
  })), await rows(database, `
    SELECT legacy_mongo_id, key, name, description, status, available, version, created_at, updated_at
    FROM plans
  `), mismatches);
  compare('plan modules', keyed(snapshot.plans, (row) => row.legacyMongoId, (row) => ({
    module_keys: [...row.moduleKeys].sort(),
  })), await rows(database, `
    SELECT p.legacy_mongo_id,
      COALESCE(array_agg(m.key ORDER BY m.key) FILTER (WHERE m.key IS NOT NULL), ARRAY[]::text[]) AS module_keys
    FROM plans p LEFT JOIN plan_modules pm ON pm.plan_id = p.id
    LEFT JOIN module_definitions m ON m.id = pm.module_definition_id
    GROUP BY p.id, p.legacy_mongo_id
  `), mismatches);
  compare('plan limits', keyed(snapshot.plans, (row) => row.legacyMongoId, (row) => ({
    limits: [...row.limits].sort((left, right) => left.key.localeCompare(right.key)),
  })), await rows(database, `
    SELECT p.legacy_mongo_id,
      COALESCE(jsonb_agg(jsonb_build_object('key', l.limit_key, 'value', l.value) ORDER BY l.limit_key)
        FILTER (WHERE l.limit_key IS NOT NULL), '[]'::jsonb) AS limits
    FROM plans p LEFT JOIN plan_limits l ON l.plan_id = p.id
    GROUP BY p.id, p.legacy_mongo_id
  `), mismatches);

  compare('add-on', keyed(snapshot.addOns, (row) => row.legacyMongoId, (row) => ({
    key: row.key, name: row.name, description: row.description, status: row.status,
    available: row.available, version: row.version, created_at: row.createdAt, updated_at: row.updatedAt,
  })), await rows(database, `
    SELECT legacy_mongo_id, key, name, description, status, available, version, created_at, updated_at
    FROM add_ons
  `), mismatches);
  compare('add-on modules', keyed(snapshot.addOns, (row) => row.legacyMongoId, (row) => ({
    module_keys: [...row.moduleKeys].sort(),
  })), await rows(database, `
    SELECT a.legacy_mongo_id,
      COALESCE(array_agg(m.key ORDER BY m.key) FILTER (WHERE m.key IS NOT NULL), ARRAY[]::text[]) AS module_keys
    FROM add_ons a LEFT JOIN add_on_modules am ON am.add_on_id = a.id
    LEFT JOIN module_definitions m ON m.id = am.module_definition_id
    GROUP BY a.id, a.legacy_mongo_id
  `), mismatches);
  compare('add-on limits', keyed(snapshot.addOns, (row) => row.legacyMongoId, (row) => ({
    adjustments: [...row.limitAdjustments].sort((left, right) => left.key.localeCompare(right.key)),
  })), await rows(database, `
    SELECT a.legacy_mongo_id,
      COALESCE(jsonb_agg(jsonb_build_object('key', l.limit_key, 'mode', l.mode, 'value', l.value)
        ORDER BY l.limit_key) FILTER (WHERE l.limit_key IS NOT NULL), '[]'::jsonb) AS adjustments
    FROM add_ons a LEFT JOIN add_on_limit_adjustments l ON l.add_on_id = a.id
    GROUP BY a.id, a.legacy_mongo_id
  `), mismatches);

  compare('subscription', keyed(snapshot.subscriptions, (row) => row.legacyMongoId, (row) => ({
    organization_legacy_mongo_id: row.organizationLegacyMongoId,
    plan_legacy_mongo_id: row.planLegacyMongoId, status: row.status, source: row.source,
    starts_at: row.startsAt, current_period_ends_at: row.currentPeriodEndsAt,
    billing_cycle: row.billingCycle, suspended_at: row.suspendedAt, cancelled_at: row.cancelledAt,
    created_by_legacy_mongo_id: row.createdByUserLegacyMongoId,
    updated_by_legacy_mongo_id: row.updatedByUserLegacyMongoId,
    created_at: row.createdAt, updated_at: row.updatedAt,
  })), await rows(database, `
    SELECT s.legacy_mongo_id, o.legacy_mongo_id AS organization_legacy_mongo_id,
      p.legacy_mongo_id AS plan_legacy_mongo_id, s.status, s.source, s.starts_at,
      s.current_period_ends_at, s.billing_cycle, s.suspended_at, s.cancelled_at,
      creator.legacy_mongo_id AS created_by_legacy_mongo_id,
      updater.legacy_mongo_id AS updated_by_legacy_mongo_id, s.created_at, s.updated_at
    FROM subscriptions s JOIN organizations o ON o.id = s.organization_id
    LEFT JOIN plans p ON p.id = s.plan_id
    LEFT JOIN users creator ON creator.id = s.created_by_user_id
    LEFT JOIN users updater ON updater.id = s.updated_by_user_id
  `), mismatches);
  compare('subscription add-ons', keyed(snapshot.subscriptions, (row) => row.legacyMongoId, (row) => ({
    add_ons: [...row.addOns].sort((left, right) => left.addOnLegacyMongoId.localeCompare(right.addOnLegacyMongoId))
      .map((addOn) => ({ add_on_legacy_mongo_id: addOn.addOnLegacyMongoId,
        starts_at: addOn.startsAt, ends_at: addOn.endsAt })),
  })), await rows(database, `
    SELECT s.legacy_mongo_id,
      COALESCE(jsonb_agg(jsonb_build_object('add_on_legacy_mongo_id', a.legacy_mongo_id,
        'starts_at', sa.starts_at, 'ends_at', sa.ends_at) ORDER BY a.legacy_mongo_id)
        FILTER (WHERE a.legacy_mongo_id IS NOT NULL), '[]'::jsonb) AS add_ons
    FROM subscriptions s LEFT JOIN subscription_add_ons sa ON sa.subscription_id = s.id
    LEFT JOIN add_ons a ON a.id = sa.add_on_id
    GROUP BY s.id, s.legacy_mongo_id
  `), mismatches);

  compare('entitlement', keyed(snapshot.entitlements, (row) => row.legacyMongoId, (row) => ({
    organization_legacy_mongo_id: row.organizationLegacyMongoId, module_key: row.moduleKey,
    effect: row.effect, status: row.status, source: row.source, reason: row.reason,
    valid_from: row.validFrom, valid_until: row.validUntil,
    actor_legacy_mongo_id: row.actorUserLegacyMongoId,
    created_at: row.createdAt, updated_at: row.updatedAt,
  })), await rows(database, `
    SELECT e.legacy_mongo_id, o.legacy_mongo_id AS organization_legacy_mongo_id,
      m.key AS module_key, e.effect, e.status, e.source, e.reason, e.valid_from, e.valid_until,
      u.legacy_mongo_id AS actor_legacy_mongo_id, e.created_at, e.updated_at
    FROM entitlement_overrides e
    JOIN organizations o ON o.id = e.organization_id
    JOIN module_definitions m ON m.id = e.module_definition_id
    JOIN users u ON u.id = e.actor_user_id
  `), mismatches);

  const sessionResult = await database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM auth_sessions');
  const sessionRowsCopied = Number(sessionResult.rows[0]?.count ?? 0);
  if (sessionRowsCopied !== 0) mismatches.push('auth sessions: PostgreSQL must contain zero shadow-copied rows');

  return {
    matched: mismatches.length === 0,
    mismatchCount: mismatches.length,
    mismatches: mismatches.sort(),
    sessionRowsCopied,
  };
};
