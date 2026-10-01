import type { PostgresDatabase } from './database.js';
import { getMigrationStatus } from './migrations.js';

const requiredTables = Object.freeze({
  identity: [
    'users',
    'parent_organizations',
    'organizations',
    'branches',
    'memberships',
    'membership_branch_assignments',
  ],
  commercial: [
    'module_definitions',
    'plans',
    'add_ons',
    'subscriptions',
    'subscription_add_ons',
    'entitlement_overrides',
    'commercial_agreements',
    'manual_commercial_payments',
    'commercial_renewals',
    'manual_renewal_payments',
  ],
  operational: [
    'customers',
    'services',
    'appointments',
    'queue_sessions',
    'queue_tokens',
    'attendance_records',
    'customer_due_entries',
    'inventory_items',
    'stock_locations',
    'stock_balances',
    'stock_movements',
  ],
  audit: ['audit_events'],
} as const);

const expectedMigrations = Object.freeze([
  '001_shared_core.sql',
  '002_auth_session_compatibility.sql',
  '003_commercial_runtime_authority.sql',
  '004_operational_queue_foundation.sql',
  '005_operational_runtime_authority.sql',
  '006_public_commercial_intake.sql',
  '007_manual_commercial_activation.sql',
  '008_manual_subscription_renewals.sql',
  '009_attendance_runtime_authority.sql',
  '010_customer_dues_runtime_authority.sql',
  '011_inventory_runtime_authority.sql',
  '012_corporate_audit_runtime_authority.sql',
] as const);

const identifier = (value: string): string => `"${value.replaceAll('"', '""')}"`;

const countRows = async (database: PostgresDatabase, table: string): Promise<string> => {
  const result = await database.query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM ${identifier(table)}`,
  );
  return result.rows[0]?.count ?? '0';
};

const countIntegrityFailures = async (
  database: PostgresDatabase,
  sql: string,
): Promise<string> => {
  const result = await database.query<{ count: string }>(sql);
  return result.rows[0]?.count ?? '0';
};

export interface RestoreIntegrityReport {
  status: 'verified';
  migrations: { applied: number; expected: number; names: string[] };
  counts: Record<string, string>;
  integrity: Record<string, string>;
}

export const verifyRestoredDatabase = async (
  database: PostgresDatabase,
): Promise<RestoreIntegrityReport> => {
  const migrations = await getMigrationStatus(database);
  const names = migrations.map(({ name }) => name);
  if (
    migrations.some(({ state }) => state !== 'applied') ||
    names.length !== expectedMigrations.length ||
    names.some((name, index) => name !== expectedMigrations[index])
  ) {
    throw new Error('Restored database migration status is not exactly 001 through 012');
  }

  const tables = Object.values(requiredTables).flat();
  for (const table of tables) {
    const result = await database.query<{ relation: string | null }>(
      'SELECT to_regclass($1) AS relation',
      [`public.${table}`],
    );
    if (result.rows[0]?.relation !== table) {
      throw new Error(`Restored database is missing required table: ${table}`);
    }
  }

  const counts = Object.fromEntries(
    await Promise.all(tables.map(async (table) => [table, await countRows(database, table)])),
  );
  const integrity = {
    membership_orphans: await countIntegrityFailures(database, `
      SELECT COUNT(*)::TEXT AS count
      FROM memberships membership
      LEFT JOIN users user_record ON user_record.id = membership.user_id
      LEFT JOIN organizations organization ON organization.id = membership.organization_id
      WHERE user_record.id IS NULL OR organization.id IS NULL
    `),
    branch_orphans: await countIntegrityFailures(database, `
      SELECT COUNT(*)::TEXT AS count
      FROM branches branch
      LEFT JOIN organizations organization ON organization.id = branch.organization_id
      WHERE organization.id IS NULL
    `),
    subscription_orphans: await countIntegrityFailures(database, `
      SELECT COUNT(*)::TEXT AS count
      FROM subscriptions subscription
      LEFT JOIN organizations organization ON organization.id = subscription.organization_id
      LEFT JOIN plans plan ON plan.id = subscription.plan_id
      WHERE organization.id IS NULL OR plan.id IS NULL
    `),
    audit_event_orphans: await countIntegrityFailures(database, `
      SELECT COUNT(*)::TEXT AS count
      FROM audit_events event
      LEFT JOIN organizations organization ON organization.id = event.organization_id
      LEFT JOIN users actor ON actor.id = event.actor_user_id
      WHERE (event.organization_id IS NOT NULL AND organization.id IS NULL)
         OR (event.actor_user_id IS NOT NULL AND actor.id IS NULL)
    `),
  };
  if (Object.values(integrity).some((count) => count !== '0')) {
    throw new Error('Restored database contains core referential-integrity failures');
  }

  return {
    status: 'verified',
    migrations: {
      applied: migrations.length,
      expected: expectedMigrations.length,
      names,
    },
    counts,
    integrity,
  };
};
