import type { PoolClient, QueryResultRow } from 'pg';
import {
  initialAddOns,
  initialModuleCatalogue,
  initialPlans,
  isModuleKey,
  type CommercialSource,
  type LimitKey,
  type ModuleKey,
  type SubscriptionStatus,
} from '../commercial/catalogue.js';
import {
  asPostgresOrganizationId,
  asPostgresUserId,
} from '../persistence/identifiers.js';
import type {
  UpdateSubscriptionInput,
  UpsertEntitlementInput,
} from '../schemas/billingSchemas.js';
import type {
  AddOnGrantRecord,
  CommercialSubscriptionRecord,
  EntitlementRepository,
  EntitlementSnapshot,
  LimitAdjustmentRecord,
  LimitGrantRecord,
  ModuleDefinitionRecord,
} from '../services/entitlementService.js';
import { AppError } from '../utils/AppError.js';
import type { PostgresDatabase } from './database.js';

interface ModuleRow extends QueryResultRow {
  key: string;
  display_name: string;
  description: string;
  category: string;
  commercial_type: 'core' | 'purchasable';
  status: 'active' | 'inactive';
}

interface PlanRow extends QueryResultRow {
  id: string;
  key: string;
  name: string;
  description: string;
  status: 'active' | 'inactive';
  available: boolean;
  module_keys: string[];
  limits: Array<{ key: string; value: number }>;
}

interface AddOnRow extends QueryResultRow {
  id: string;
  key: string;
  name: string;
  description: string;
  status: 'active' | 'inactive';
  available: boolean;
  module_keys: string[];
  limit_adjustments: Array<{ key: string; mode: 'add' | 'override'; value: number }>;
  starts_at?: Date | null;
  ends_at?: Date | null;
}

interface SubscriptionRow extends QueryResultRow {
  id: string;
  status: SubscriptionStatus;
  source: CommercialSource;
  starts_at: Date;
  current_period_ends_at: Date | null;
  plan_id: string | null;
  plan_key: string | null;
  plan_name: string | null;
  plan_status: 'active' | 'inactive' | null;
  plan_module_keys: string[];
  plan_limits: Array<{ key: string; value: number }>;
}

interface OverrideRow extends QueryResultRow {
  module_key: string;
  effect: 'grant' | 'revoke';
  status: 'active' | 'inactive';
  source: CommercialSource;
  valid_from: Date | null;
  valid_until: Date | null;
}

export interface PublicCommercialCatalogue {
  modules: Array<ModuleDefinitionRecord & { status: 'active' }>;
  plans: Array<{
    key: string;
    name: string;
    description: string;
    moduleKeys: ModuleKey[];
    limits: LimitGrantRecord[];
  }>;
  addOns: Array<{
    key: string;
    name: string;
    description: string;
    moduleKeys: ModuleKey[];
    limitAdjustments: LimitAdjustmentRecord[];
  }>;
}

export interface CatalogueReconciliationResult {
  modules: number;
  plans: number;
  addOns: number;
}

const moduleProjection = (row: ModuleRow): ModuleDefinitionRecord => ({
  key: row.key as ModuleKey,
  displayName: row.display_name,
  description: row.description,
  category: row.category,
  commercialType: row.commercial_type,
  status: row.status,
});

const planProjection = (row: PlanRow) => ({
  key: row.key,
  name: row.name,
  description: row.description,
  status: row.status,
  available: row.available,
  moduleKeys: row.module_keys as ModuleKey[],
  limits: row.limits.map((limit) => ({ key: limit.key as LimitKey, value: limit.value })),
});

const addOnProjection = (row: AddOnRow): AddOnGrantRecord & { description: string; available: boolean } => ({
  id: row.id,
  key: row.key,
  name: row.name,
  description: row.description,
  status: row.status,
  available: row.available,
  moduleKeys: row.module_keys as ModuleKey[],
  limitAdjustments: row.limit_adjustments.map((adjustment) => ({
    key: adjustment.key as LimitKey,
    mode: adjustment.mode,
    value: adjustment.value,
  })),
});

const planSelect = `
  SELECT p.id, p.key, p.name, p.description, p.status, p.available,
    ARRAY(
      SELECT m.key FROM plan_modules pm
      JOIN module_definitions m ON m.id = pm.module_definition_id
      WHERE pm.plan_id = p.id ORDER BY m.key
    ) AS module_keys,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', l.limit_key, 'value', l.value)
        ORDER BY l.limit_key)
      FROM plan_limits l WHERE l.plan_id = p.id
    ), '[]'::jsonb) AS limits
  FROM plans p`;

const addOnSelect = `
  SELECT a.id, a.key, a.name, a.description, a.status, a.available,
    ARRAY(
      SELECT m.key FROM add_on_modules am
      JOIN module_definitions m ON m.id = am.module_definition_id
      WHERE am.add_on_id = a.id ORDER BY m.key
    ) AS module_keys,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'key', l.limit_key, 'mode', l.mode, 'value', l.value
      ) ORDER BY l.limit_key)
      FROM add_on_limit_adjustments l WHERE l.add_on_id = a.id
    ), '[]'::jsonb) AS limit_adjustments
  FROM add_ons a`;

const requireOrganizationAndActor = async (
  client: PoolClient,
  organizationId: string,
  actorUserId: string,
): Promise<void> => {
  const result = await client.query<{ organization_exists: boolean; user_exists: boolean }>(`
    SELECT
      EXISTS(SELECT 1 FROM organizations WHERE id = $1) AS organization_exists,
      EXISTS(SELECT 1 FROM users WHERE id = $2) AS user_exists
  `, [organizationId, actorUserId]);
  if (!result.rows[0]?.organization_exists) throw new AppError('Organization not found', 404);
  if (!result.rows[0]?.user_exists) throw new AppError('Operator identity not found', 403);
};

const parseOptionalDate = (value: string | null | undefined): Date | null =>
  value ? new Date(value) : null;

export class PostgresCommercialRepository implements EntitlementRepository {
  public constructor(private readonly database: PostgresDatabase) {}

  public async loadSnapshot(organizationIdValue: string): Promise<EntitlementSnapshot> {
    const organizationId = asPostgresOrganizationId(organizationIdValue);
    return this.database.withClient(async (client) => {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try {
        const modulesResult = await client.query<ModuleRow>(`
            SELECT key, display_name, description, category, commercial_type, status
            FROM module_definitions ORDER BY key
          `);
        const subscriptionResult = await client.query<SubscriptionRow>(`
            SELECT s.id, s.status, s.source, s.starts_at, s.current_period_ends_at,
              p.id AS plan_id, p.key AS plan_key, p.name AS plan_name, p.status AS plan_status,
              COALESCE(ARRAY(
                SELECT m.key FROM plan_modules pm
                JOIN module_definitions m ON m.id = pm.module_definition_id
                WHERE pm.plan_id = p.id ORDER BY m.key
              ), ARRAY[]::text[]) AS plan_module_keys,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object('key', l.limit_key, 'value', l.value)
                  ORDER BY l.limit_key)
                FROM plan_limits l WHERE l.plan_id = p.id
              ), '[]'::jsonb) AS plan_limits
            FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id
            WHERE s.organization_id = $1
          `, [organizationId]);
        const addOnsResult = await client.query<AddOnRow>(`
            SELECT a.id, a.key, a.name, a.description, a.status, a.available,
              sa.starts_at, sa.ends_at,
              ARRAY(
                SELECT m.key FROM add_on_modules am
                JOIN module_definitions m ON m.id = am.module_definition_id
                WHERE am.add_on_id = a.id ORDER BY m.key
              ) AS module_keys,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'key', l.limit_key, 'mode', l.mode, 'value', l.value
                ) ORDER BY l.limit_key)
                FROM add_on_limit_adjustments l WHERE l.add_on_id = a.id
              ), '[]'::jsonb) AS limit_adjustments
            FROM subscriptions s
            JOIN subscription_add_ons sa ON sa.subscription_id = s.id
            JOIN add_ons a ON a.id = sa.add_on_id
            WHERE s.organization_id = $1 ORDER BY a.key
          `, [organizationId]);
        const overridesResult = await client.query<OverrideRow>(`
            SELECT m.key AS module_key, e.effect, e.status, e.source,
              e.valid_from, e.valid_until
            FROM entitlement_overrides e
            JOIN module_definitions m ON m.id = e.module_definition_id
            WHERE e.organization_id = $1 ORDER BY m.key
          `, [organizationId]);

        const subscriptionRow = subscriptionResult.rows[0];
        const subscription: CommercialSubscriptionRecord | null = subscriptionRow
          ? {
              id: subscriptionRow.id,
              status: subscriptionRow.status,
              source: subscriptionRow.source,
              startsAt: subscriptionRow.starts_at,
              ...(subscriptionRow.current_period_ends_at
                ? { currentPeriodEndsAt: subscriptionRow.current_period_ends_at }
                : {}),
              ...(subscriptionRow.plan_id
                ? {
                    plan: {
                      key: subscriptionRow.plan_key!,
                      name: subscriptionRow.plan_name!,
                      status: subscriptionRow.plan_status!,
                      moduleKeys: subscriptionRow.plan_module_keys as ModuleKey[],
                      limits: subscriptionRow.plan_limits.map((limit) => ({
                        key: limit.key as LimitKey,
                        value: limit.value,
                      })),
                    },
                  }
                : {}),
              addOns: addOnsResult.rows.map((row) => ({
                addOn: addOnProjection(row),
                ...(row.starts_at ? { startsAt: row.starts_at } : {}),
                ...(row.ends_at ? { endsAt: row.ends_at } : {}),
              })),
            }
          : null;

        await client.query('COMMIT');
        return {
          modules: modulesResult.rows.map(moduleProjection),
          subscription,
          overrides: overridesResult.rows.map((row) => ({
            moduleKey: row.module_key as ModuleKey,
            effect: row.effect,
            status: row.status,
            source: row.source,
            ...(row.valid_from ? { validFrom: row.valid_from } : {}),
            ...(row.valid_until ? { validUntil: row.valid_until } : {}),
          })),
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  public async getPublicCatalogue(): Promise<PublicCommercialCatalogue> {
    return this.database.withClient(async (client) => {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try {
        const modules = await client.query<ModuleRow>(`
          SELECT key, display_name, description, category, commercial_type, status
          FROM module_definitions WHERE status = 'active' ORDER BY key
        `);
        const plans = await client.query<PlanRow>(`${planSelect}
          WHERE p.status = 'active' AND p.available = TRUE ORDER BY p.key`);
        const addOns = await client.query<AddOnRow>(`${addOnSelect}
          WHERE a.status = 'active' AND a.available = TRUE ORDER BY a.key`);
        await client.query('COMMIT');
        return {
          modules: modules.rows.map(moduleProjection) as PublicCommercialCatalogue['modules'],
          plans: plans.rows.map((row) => {
            const plan = planProjection(row);
            return {
              key: plan.key,
              name: plan.name,
              description: plan.description,
              moduleKeys: plan.moduleKeys,
              limits: plan.limits,
            };
          }),
          addOns: addOns.rows.map((row) => {
            const addOn = addOnProjection(row);
            return {
              key: addOn.key,
              name: addOn.name,
              description: addOn.description,
              moduleKeys: addOn.moduleKeys,
              limitAdjustments: addOn.limitAdjustments,
            };
          }),
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  public reconcileCatalogue(): Promise<CatalogueReconciliationResult> {
    return this.database.transaction(async (client) => {
      const moduleIdByKey = new Map<string, string>();
      for (const module of initialModuleCatalogue) {
        const result = await client.query<{ id: string }>(`
          INSERT INTO module_definitions
            (key, display_name, description, category, commercial_type, status, version,
             created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
          ON CONFLICT (key) DO UPDATE SET
            display_name = EXCLUDED.display_name, description = EXCLUDED.description,
            category = EXCLUDED.category, commercial_type = EXCLUDED.commercial_type,
            status = EXCLUDED.status, version = EXCLUDED.version, updated_at = NOW()
          RETURNING id
        `, [module.key, module.displayName, module.description, module.category,
          module.commercialType, module.status, module.version]);
        moduleIdByKey.set(module.key, result.rows[0]!.id);
      }

      for (const plan of initialPlans) {
        const result = await client.query<{ id: string }>(`
          INSERT INTO plans
            (key, name, description, status, available, version, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
          ON CONFLICT (key) DO UPDATE SET
            name = EXCLUDED.name, description = EXCLUDED.description,
            status = EXCLUDED.status, available = EXCLUDED.available,
            version = EXCLUDED.version, updated_at = NOW()
          RETURNING id
        `, [plan.key, plan.name, plan.description, plan.status, plan.available, plan.version]);
        const planId = result.rows[0]!.id;
        await client.query('DELETE FROM plan_modules WHERE plan_id = $1', [planId]);
        await client.query('DELETE FROM plan_limits WHERE plan_id = $1', [planId]);
        for (const moduleKey of plan.moduleKeys) {
          await client.query(
            'INSERT INTO plan_modules (plan_id, module_definition_id) VALUES ($1, $2)',
            [planId, moduleIdByKey.get(moduleKey)],
          );
        }
        for (const limit of plan.limits) {
          await client.query(
            'INSERT INTO plan_limits (plan_id, limit_key, value) VALUES ($1, $2, $3)',
            [planId, limit.key, limit.value],
          );
        }
      }

      for (const addOn of initialAddOns) {
        const result = await client.query<{ id: string }>(`
          INSERT INTO add_ons
            (key, name, description, status, available, version, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
          ON CONFLICT (key) DO UPDATE SET
            name = EXCLUDED.name, description = EXCLUDED.description,
            status = EXCLUDED.status, available = EXCLUDED.available,
            version = EXCLUDED.version, updated_at = NOW()
          RETURNING id
        `, [addOn.key, addOn.name, addOn.description, addOn.status, addOn.available, addOn.version]);
        const addOnId = result.rows[0]!.id;
        await client.query('DELETE FROM add_on_modules WHERE add_on_id = $1', [addOnId]);
        await client.query('DELETE FROM add_on_limit_adjustments WHERE add_on_id = $1', [addOnId]);
        for (const moduleKey of addOn.moduleKeys) {
          await client.query(
            'INSERT INTO add_on_modules (add_on_id, module_definition_id) VALUES ($1, $2)',
            [addOnId, moduleIdByKey.get(moduleKey)],
          );
        }
        for (const adjustment of addOn.limitAdjustments as readonly LimitAdjustmentRecord[]) {
          await client.query(`
            INSERT INTO add_on_limit_adjustments (add_on_id, limit_key, mode, value)
            VALUES ($1, $2, $3, $4)
          `, [addOnId, adjustment.key, adjustment.mode, adjustment.value]);
        }
      }

      return {
        modules: initialModuleCatalogue.length,
        plans: initialPlans.length,
        addOns: initialAddOns.length,
      };
    });
  }

  public async updateSubscription(
    organizationIdValue: string,
    actorUserIdValue: string,
    input: UpdateSubscriptionInput,
  ): Promise<void> {
    const organizationId = asPostgresOrganizationId(organizationIdValue);
    const actorUserId = asPostgresUserId(actorUserIdValue);
    const uniqueAddOnKeys = [...new Set(input.addOns.map(({ key }) => key))];
    if (uniqueAddOnKeys.length !== input.addOns.length) {
      throw new AppError('Duplicate add-on assignment', 400);
    }

    await this.database.transaction(async (client) => {
      await requireOrganizationAndActor(client, organizationId, actorUserId);
      const existing = await client.query<{ id: string; starts_at: Date }>(
        'SELECT id, starts_at FROM subscriptions WHERE organization_id = $1',
        [organizationId],
      );
      const plan = input.planKey
        ? await client.query<{ id: string }>(`
            SELECT id FROM plans
            WHERE key = $1 AND status = 'active' AND available = TRUE
          `, [input.planKey])
        : { rows: [] as Array<{ id: string }> };
      const addOns = uniqueAddOnKeys.length > 0
        ? await client.query<{ id: string; key: string }>(`
            SELECT id, key FROM add_ons
            WHERE key = ANY($1::text[]) AND status = 'active' AND available = TRUE
          `, [uniqueAddOnKeys])
        : { rows: [] as Array<{ id: string; key: string }> };
      if (input.planKey && !plan.rows[0]) throw new AppError('Plan not found or inactive', 400);
      if (addOns.rows.length !== uniqueAddOnKeys.length) {
        throw new AppError('One or more add-ons are missing or inactive', 400);
      }

      const startsAt = parseOptionalDate(input.startsAt) ?? existing.rows[0]?.starts_at ?? new Date();
      const currentPeriodEndsAt = parseOptionalDate(input.currentPeriodEndsAt);
      if (currentPeriodEndsAt && currentPeriodEndsAt <= startsAt) {
        throw new AppError('Current period end must be after subscription start', 400);
      }
      for (const assignment of input.addOns) {
        const starts = parseOptionalDate(assignment.startsAt);
        const ends = parseOptionalDate(assignment.endsAt);
        if (starts && ends && ends <= starts) {
          throw new AppError('Add-on end must be after add-on start', 400);
        }
      }

      const now = new Date();
      const upserted = await client.query<{ id: string }>(`
        INSERT INTO subscriptions
          (organization_id, plan_id, status, source, starts_at, current_period_ends_at,
           billing_cycle, suspended_at, cancelled_at, created_by_user_id, updated_by_user_id,
           created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11, $11)
        ON CONFLICT (organization_id) DO UPDATE SET
          plan_id = EXCLUDED.plan_id, status = EXCLUDED.status, source = EXCLUDED.source,
          starts_at = EXCLUDED.starts_at,
          current_period_ends_at = EXCLUDED.current_period_ends_at,
          billing_cycle = EXCLUDED.billing_cycle, suspended_at = EXCLUDED.suspended_at,
          cancelled_at = EXCLUDED.cancelled_at, updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = EXCLUDED.updated_at
        RETURNING id
      `, [organizationId, plan.rows[0]?.id ?? null, input.status, input.source, startsAt,
        currentPeriodEndsAt, input.billingCycle ?? null,
        input.status === 'suspended' ? now : null,
        input.status === 'cancelled' ? now : null,
        actorUserId, now]);
      const subscriptionId = upserted.rows[0]!.id;
      await client.query('DELETE FROM subscription_add_ons WHERE subscription_id = $1', [subscriptionId]);
      const addOnIdByKey = new Map(addOns.rows.map((row) => [row.key, row.id]));
      for (const assignment of input.addOns) {
        await client.query(`
          INSERT INTO subscription_add_ons (subscription_id, add_on_id, starts_at, ends_at)
          VALUES ($1, $2, $3, $4)
        `, [subscriptionId, addOnIdByKey.get(assignment.key),
          parseOptionalDate(assignment.startsAt), parseOptionalDate(assignment.endsAt)]);
      }
    });
  }

  public async upsertEntitlement(
    organizationIdValue: string,
    actorUserIdValue: string,
    moduleKeyValue: string,
    input: UpsertEntitlementInput,
  ): Promise<void> {
    const organizationId = asPostgresOrganizationId(organizationIdValue);
    const actorUserId = asPostgresUserId(actorUserIdValue);
    if (!isModuleKey(moduleKeyValue)) throw new AppError('Unknown canonical module', 400);
    const validFrom = parseOptionalDate(input.validFrom);
    const validUntil = parseOptionalDate(input.validUntil);
    if (validFrom && validUntil && validUntil <= validFrom) {
      throw new AppError('Entitlement end must be after entitlement start', 400);
    }

    await this.database.transaction(async (client) => {
      await requireOrganizationAndActor(client, organizationId, actorUserId);
      const module = await client.query<{ id: string }>(`
        SELECT id FROM module_definitions WHERE key = $1 AND status = 'active'
      `, [moduleKeyValue]);
      if (!module.rows[0]) throw new AppError('Module is not available', 400);
      const now = new Date();
      await client.query(`
        INSERT INTO entitlement_overrides
          (organization_id, module_definition_id, effect, status, source, reason,
           valid_from, valid_until, actor_user_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
        ON CONFLICT (organization_id, module_definition_id) DO UPDATE SET
          effect = EXCLUDED.effect, status = EXCLUDED.status, source = EXCLUDED.source,
          reason = EXCLUDED.reason, valid_from = EXCLUDED.valid_from,
          valid_until = EXCLUDED.valid_until, actor_user_id = EXCLUDED.actor_user_id,
          updated_at = EXCLUDED.updated_at
      `, [organizationId, module.rows[0].id, input.effect, input.status, input.source,
        input.reason, validFrom, validUntil, actorUserId, now]);
    });
  }
}
