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
  account: ['auth_sessions', 'user_email_identities', 'user_preferences', 'staff_invitations',
    'staff_invitation_branches', 'identity_challenges', 'account_security_events'],
  administration: ['organization_profiles', 'organization_roles', 'organization_role_permissions',
    'organization_admin_events'],
  fields: ['custom_field_definitions', 'custom_field_options', 'custom_field_entities',
    'custom_field_values', 'custom_field_creation_requests', 'custom_field_selected_options',
    'form_layouts', 'form_sections', 'form_placements', 'field_admin_events'],
  analytics: ['dashboard_preferences', 'notification_preferences', 'user_notifications', 'report_export_events'],
  crm: ['crm_pipeline_stages', 'crm_leads', 'crm_follow_ups', 'crm_activity_events', 'crm_admin_events'],
  purchasing: ['suppliers', 'purchase_orders', 'purchase_order_lines', 'purchase_receipts',
    'purchase_receipt_lines', 'purchasing_activity_events'],
  hr: ['hr_leave_types', 'hr_work_calendars', 'hr_calendar_days', 'hr_shift_templates',
    'hr_leave_requests', 'hr_shift_assignments', 'hr_events', 'hr_leave_decisions', 'hr_commands'],
  tasks: ['work_tasks', 'work_task_events', 'work_task_commands'],
  commercialHistory: ['commercial_access_requests', 'commercial_access_request_events',
    'commercial_onboarding_invitations', 'organization_billing_profiles', 'commercial_activation_events',
    'commercial_renewal_events', 'public_offer_pricing', 'public_offer_pricing_events',
    'plan_modules', 'plan_limits', 'add_on_modules', 'add_on_limit_adjustments'],
  authority: ['commercial_runtime_authority', 'operational_runtime_authority', 'final_runtime_authority',
    'legacy_audit_migration_dispositions'],
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
  '013_identity_email_recovery.sql',
  '014_organization_rbac.sql',
  '015_dynamic_fields.sql',
  '016_analytics_notifications.sql',
  '017_public_commercial_experience.sql',
  '018_crm_followups.sql',
  '019_suppliers_purchasing.sql',
  '020_hr_plus.sql',
  '021_work_tasks.sql',
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
  coverage: { contractVersion: string; reviewedThrough: string; additionalMigrations: string[] };
  migrations: { applied: number; expected: number; names: string[] };
  counts: Record<string, string>;
  integrity: Record<string, string>;
}

const verifySnapshot = async (
  database: PostgresDatabase,
  migrationsDirectory?: string,
): Promise<RestoreIntegrityReport> => {
  const migrations = await getMigrationStatus(database, migrationsDirectory);
  const names = migrations.map(({ name }) => name);
  if (
    migrations.some(({ state }) => state !== 'applied') ||
    names.length < expectedMigrations.length ||
    expectedMigrations.some((name, index) => names[index] !== name)
  ) {
    throw new Error('Restored database must include applied checksums 001 through 021 and zero pending migrations');
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

  const counts: Record<string, string> = {};
  // Include canonical history/configuration tables as well as the minimum
  // required domain set. Schema names/counts are safe; record contents are not.
  const catalogue = await database.query<{ name: string }>(`
    SELECT r.relname AS name FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relkind IN ('r','p') ORDER BY r.relname
  `);
  for (const { name } of catalogue.rows) counts[name] = await countRows(database, name);
  const integrity: Record<string, string> = {
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

  // Check every restored composite FK, not just a few historical parent links.
  // Identifiers/expressions come only from PostgreSQL's schema catalogue; no row
  // values or caller SQL are returned. MATCH SIMPLE nullable relationships skip
  // rows with any NULL key, matching PostgreSQL semantics.
  const foreignKeys = await database.query<{ name: string; child: string; parent: string;
    children: string[]; parents: string[]; validated: boolean }>(`
    SELECT c.conname AS name, child.relname AS child, parent.relname AS parent,
      c.convalidated AS validated,
      ARRAY(SELECT a.attname::TEXT FROM unnest(c.conkey) WITH ORDINALITY k(num, ord)
        JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY ord) AS children,
      ARRAY(SELECT a.attname::TEXT FROM unnest(c.confkey) WITH ORDINALITY k(num, ord)
        JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY ord) AS parents
    FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid
      JOIN pg_class parent ON parent.oid=c.confrelid JOIN pg_namespace n ON n.oid=child.relnamespace
    WHERE c.contype='f' AND n.nspname='public' ORDER BY child.relname,c.conname
  `);
  if (!foreignKeys.rows.length || foreignKeys.rows.some(row => !row.validated)) {
    throw new Error('Restored foreign-key validation is incomplete');
  }
  for (const key of foreignKeys.rows) {
    const present = key.children.map(column => `child.${identifier(column)} IS NOT NULL`).join(' AND ');
    const matches = key.children.map((column, index) =>
      `parent.${identifier(key.parents[index]!)}=child.${identifier(column)}`).join(' AND ');
    integrity[`fk:${key.child}:${key.name}`] = await countIntegrityFailures(database,
      `SELECT COUNT(*)::TEXT AS count FROM public.${identifier(key.child)} child
       WHERE ${present} AND NOT EXISTS(SELECT 1 FROM public.${identifier(key.parent)} parent WHERE ${matches})`);
  }
  const checks = await database.query<{ name: string; table: string; expression: string; validated: boolean }>(`
    SELECT c.conname AS name,r.relname AS table,pg_get_expr(c.conbin,c.conrelid) AS expression,c.convalidated AS validated
    FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE c.contype='c' AND n.nspname='public' ORDER BY r.relname,c.conname
  `);
  // Accepted 012 deliberately retains NOT VALID checks for legacy audit facts.
  // Re-evaluate ALL actual rows here, including those constraints, without
  // mutating validation state or pretending the catalogue flag was validated.
  if (!checks.rows.length) throw new Error('Restored CHECK catalogue is missing');
  for (const check of checks.rows) {
    integrity[`check:${check.table}:${check.name}`] = await countIntegrityFailures(database,
      `SELECT COUNT(*)::TEXT AS count FROM public.${identifier(check.table)} WHERE NOT (${check.expression})`);
  }
  integrity.disabled_triggers = await countIntegrityFailures(database, `
    SELECT COUNT(*)::TEXT AS count FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND t.tgenabled='D'
  `);
  integrity.missing_history_guards = await countIntegrityFailures(database, `
    SELECT COUNT(*)::TEXT AS count FROM (VALUES
      ('customer_due_entries','customer_due_entries_append_only'),
      ('stock_movements','stock_movements_append_only'),
      ('stock_movements','stock_purchasing_reversal_guard'),
      ('purchase_receipts','purchase_receipts_immutable'),
      ('purchase_receipt_lines','purchase_receipt_lines_immutable'),
      ('hr_events','hr_events_immutable'),('hr_leave_decisions','hr_decisions_immutable'),
      ('hr_commands','hr_commands_immutable'),('hr_leave_requests','hr_guard'),
      ('hr_shift_assignments','hr_guard'),('work_tasks','work_tasks_guard'),
      ('work_tasks','work_tasks_history'),('work_tasks','work_tasks_complete'),
      ('work_task_events','work_task_events_immutable'),
      ('work_task_commands','work_task_commands_immutable')) required(relation,name)
    WHERE NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public'
      AND r.relname=required.relation AND t.tgname=required.name AND t.tgenabled='O')
  `);
  integrity.missing_hr_exclusions = await countIntegrityFailures(database, `
    SELECT COUNT(*)::TEXT AS count FROM (VALUES ('hr_leave_requests'),('hr_shift_assignments')) required(relation)
    WHERE NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public'
      AND r.relname=required.relation AND c.contype='x' AND c.convalidated)
  `);
  integrity.stock_projection_mismatches = await countIntegrityFailures(database, `
    SELECT COUNT(*)::TEXT AS count FROM stock_balances b FULL JOIN
      (SELECT item_id,location_id,SUM(quantity_delta) quantity FROM stock_movements GROUP BY item_id,location_id) m
      USING(item_id,location_id) WHERE b.item_id IS NULL OR b.quantity IS DISTINCT FROM COALESCE(m.quantity,0)
  `);
  integrity.dues_reversal_mismatches = await countIntegrityFailures(database, `
    SELECT COUNT(*)::TEXT AS count FROM customer_due_entries r JOIN customer_due_entries e ON e.id=r.reverses_entry_id
      WHERE r.entry_type='reversal' AND (e.entry_type='reversal' OR e.amount_minor<>r.amount_minor)
  `);
  integrity.stock_reversal_mismatches = await countIntegrityFailures(database, `
    SELECT COUNT(*)::TEXT AS count FROM stock_movements r JOIN stock_movements m ON m.id=r.reverses_movement_id
      WHERE r.movement_type='reversal' AND (m.movement_type='reversal'
        OR r.quantity_delta+m.quantity_delta<>0 OR m.purchase_receipt_line_id IS NOT NULL)
  `);
  integrity.crm_conversion_mismatches = await countIntegrityFailures(database, `
    SELECT COUNT(*)::TEXT AS count FROM crm_leads
      WHERE (status='converted') IS DISTINCT FROM (converted_customer_id IS NOT NULL)
  `);
  integrity.receipt_movement_mismatches = await countIntegrityFailures(database, `
    SELECT COUNT(*)::TEXT AS count FROM purchase_receipt_lines r JOIN stock_movements m ON m.id=r.movement_id
      WHERE m.purchase_receipt_line_id IS DISTINCT FROM r.id OR m.movement_type<>'receive' OR m.quantity_delta<>r.quantity
  `);
  integrity.over_received_lines = await countIntegrityFailures(database, `
    SELECT COUNT(*)::TEXT AS count FROM purchase_order_lines l JOIN
      (SELECT purchase_order_line_id,SUM(quantity) quantity FROM purchase_receipt_lines GROUP BY purchase_order_line_id) r
      ON r.purchase_order_line_id=l.id WHERE r.quantity>l.ordered_quantity
  `);
  integrity.hr_leave_publication_conflicts = await countIntegrityFailures(database, `
    SELECT COUNT(*)::TEXT AS count FROM hr_leave_requests l JOIN hr_shift_assignments s
      ON s.organization_id=l.organization_id AND s.membership_id=l.membership_id
      WHERE l.status='approved' AND s.status='published' AND daterange(l.start_date,l.end_date,'[]') &&
        daterange((s.starts_at AT TIME ZONE s.timezone_snapshot)::date,
        ((s.ends_at-interval '1 microsecond') AT TIME ZONE s.timezone_snapshot)::date,'[]')
  `);
  integrity.task_projection_mismatches = await countIntegrityFailures(database, `
    SELECT count(*)::text AS count FROM work_tasks t
    LEFT JOIN work_task_events e ON e.task_id=t.id AND e.organization_id=t.organization_id
      AND e.branch_id=t.branch_id AND e.resulting_version=t.version
    WHERE e.id IS NULL OR (SELECT count(*) FROM work_task_events all_events WHERE all_events.task_id=t.id)<>t.version
      OR (e.new_status,e.new_assignee,e.new_due_at,e.new_priority,e.new_due_timezone,e.action,e.actor_user_id,e.actor_membership_id,e.reason,e.occurred_at)
      IS DISTINCT FROM (t.status,t.assigned_membership_id,t.due_at,t.priority,t.due_timezone,t.last_action,t.updated_by,t.actor_membership_id,t.last_reason,t.updated_at)
  `);
  integrity.task_history_chain_mismatches = await countIntegrityFailures(database, `
    WITH chain AS (SELECT e.*,lag(new_status) OVER w AS previous_status,lag(new_assignee) OVER w AS previous_assignee,
      lag(new_due_at) OVER w AS previous_due,lag(new_priority) OVER w AS previous_priority,
      lag(new_due_timezone) OVER w AS previous_zone,lag(resulting_version) OVER w AS previous_version
      FROM work_task_events e WINDOW w AS (PARTITION BY task_id ORDER BY resulting_version))
    SELECT count(*)::text AS count FROM chain e WHERE
      (resulting_version=1 AND (action<>'task.created' OR old_status IS NOT NULL OR new_status<>'todo')) OR
      (resulting_version>1 AND (previous_version IS DISTINCT FROM resulting_version-1 OR
       (old_status,old_assignee,old_due_at,old_priority,old_due_timezone) IS DISTINCT FROM
       (previous_status,previous_assignee,previous_due,previous_priority,previous_zone))) OR
      new_status NOT IN ('todo','in_progress','completed','cancelled') OR
      (action='task.started' AND (old_status,new_status) IS DISTINCT FROM ('todo','in_progress')) OR
      (action='task.reset' AND (old_status,new_status) IS DISTINCT FROM ('in_progress','todo')) OR
      (action='task.completed' AND (old_status NOT IN ('todo','in_progress') OR new_status<>'completed')) OR
      (action='task.cancelled' AND (old_status NOT IN ('todo','in_progress') OR new_status<>'cancelled')) OR
      (action='task.reopened' AND (old_status,new_status) IS DISTINCT FROM ('completed','todo')) OR
      (action IN ('task.cancelled','task.reopened') AND (reason IS NULL OR length(btrim(reason))=0)) OR
      (action IN ('task.updated','task.assigned') AND (old_status NOT IN ('todo','in_progress') OR new_status IS DISTINCT FROM old_status))
  `);
  integrity.task_command_mismatches = await countIntegrityFailures(database, `
    SELECT count(*)::text AS count FROM work_task_events e
    LEFT JOIN work_task_commands c ON c.event_id=e.id
    JOIN memberships m ON m.id=e.actor_membership_id AND m.organization_id=e.organization_id
    WHERE c.event_id IS NULL OR c.actor_membership_id<>e.actor_membership_id OR m.user_id<>e.actor_user_id
      OR c.command<>CASE e.action WHEN 'task.created' THEN 'create' WHEN 'task.updated' THEN 'update'
        WHEN 'task.assigned' THEN 'update' WHEN 'task.cancelled' THEN 'cancel' WHEN 'task.reopened' THEN 'reopen' ELSE 'status' END
  `);
  if (Object.values(integrity).some((count) => count !== '0')) {
    throw new Error('Restored database contains referential or domain-integrity failures');
  }

  return {
    status: 'verified',
    coverage: {
      contractVersion: 'v2-10-recovery-integrity-v1',
      reviewedThrough: '021_work_tasks.sql',
      // Later migrations are checksum/catalogue checked, not automatically
      // certified for their new domain-specific business invariants.
      additionalMigrations: names.slice(expectedMigrations.length),
    },
    migrations: {
      applied: migrations.length,
      expected: migrations.length,
      names,
    },
    counts,
    integrity,
  };
};

/** Only schema names/counts leave this bounded consistent read-only snapshot.
 * Empty domains prove structure, never populated recovery or application behavior. */
export const verifyRestoredDatabase = (database: PostgresDatabase, migrationsDirectory?: string): Promise<RestoreIntegrityReport> =>
  database.atomic(async client => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='15s'");
    return verifySnapshot(database, migrationsDirectory);
  });
