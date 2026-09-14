import type { PoolClient } from 'pg';
import type { PostgresDatabase } from './database.js';
import type { SharedCoreSnapshot } from './sharedCoreTypes.js';

type IdMap = Map<string, string>;

const requireId = (ids: IdMap, legacyId: string, relation: string): string => {
  const value = ids.get(legacyId);
  if (!value) throw new Error(`Validated ${relation} mapping is unavailable`);
  return value;
};

// Identifiers passed here are fixed in source; all source data remains parameterized.
const upsertLegacyRow = async (
  client: PoolClient,
  table: string,
  legacyMongoId: string,
  fields: Record<string, unknown>,
): Promise<string> => {
  const names = ['legacy_mongo_id', ...Object.keys(fields)];
  const values = [legacyMongoId, ...Object.values(fields)];
  const placeholders = names.map((_, index) => `$${index + 1}`).join(', ');
  const updates = names.slice(1).map((name) => `${name} = EXCLUDED.${name}`).join(', ');
  const result = await client.query<{ id: string }>(
    `INSERT INTO ${table} (${names.join(', ')}) VALUES (${placeholders})
     ON CONFLICT (legacy_mongo_id) DO UPDATE SET ${updates}
     RETURNING id`,
    values,
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error(`PostgreSQL did not return an id for ${table}`);
  return id;
};

export class PostgresSharedCoreRepository {
  public constructor(private readonly database: PostgresDatabase) {}

  public apply(snapshot: SharedCoreSnapshot): Promise<void> {
    return this.database.transaction(async (client) => {
      const userIds: IdMap = new Map();
      for (const row of snapshot.users) {
        userIds.set(row.legacyMongoId, await upsertLegacyRow(client, 'users', row.legacyMongoId, {
          name: row.name,
          phone: row.phone,
          password_hash: row.passwordHash,
          platform_role: row.platformRole,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        }));
      }

      const parentIds: IdMap = new Map();
      for (const row of snapshot.parentOrganizations) {
        parentIds.set(row.legacyMongoId, await upsertLegacyRow(
          client,
          'parent_organizations',
          row.legacyMongoId,
          {
            owner_user_id: requireId(userIds, row.ownerUserLegacyMongoId, 'parent owner'),
            name: row.name,
            consolidated_billing: row.consolidatedBilling,
            created_at: row.createdAt,
            updated_at: row.updatedAt,
          },
        ));
      }

      const organizationIds: IdMap = new Map();
      for (const row of snapshot.organizations) {
        organizationIds.set(row.legacyMongoId, await upsertLegacyRow(
          client,
          'organizations',
          row.legacyMongoId,
          {
            parent_organization_id: row.parentOrganizationLegacyMongoId
              ? requireId(parentIds, row.parentOrganizationLegacyMongoId, 'organization parent')
              : null,
            name: row.name,
            type: row.type,
            theme_mode: row.themeMode,
            theme_primary_color: row.themePrimaryColor,
            created_at: row.createdAt,
            updated_at: row.updatedAt,
          },
        ));
      }

      const branchIds: IdMap = new Map();
      for (const row of snapshot.branches) {
        branchIds.set(row.legacyMongoId, await upsertLegacyRow(client, 'branches', row.legacyMongoId, {
          organization_id: requireId(organizationIds, row.organizationLegacyMongoId, 'branch organization'),
          name: row.name,
          code: row.code,
          status: row.status,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        }));
      }

      const membershipIds: IdMap = new Map();
      for (const row of snapshot.memberships) {
        membershipIds.set(row.legacyMongoId, await upsertLegacyRow(client, 'memberships', row.legacyMongoId, {
          user_id: requireId(userIds, row.userLegacyMongoId, 'membership user'),
          organization_id: requireId(organizationIds, row.organizationLegacyMongoId, 'membership organization'),
          role: row.role,
          status: row.status,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        }));
      }
      for (const row of snapshot.memberships) {
        const membershipId = requireId(membershipIds, row.legacyMongoId, 'membership');
        const organizationId = requireId(organizationIds, row.organizationLegacyMongoId, 'assignment organization');
        await client.query('DELETE FROM membership_branch_assignments WHERE membership_id = $1', [membershipId]);
        for (const legacyBranchId of row.branchLegacyMongoIds) {
          await client.query(
            `INSERT INTO membership_branch_assignments (membership_id, branch_id, organization_id)
             VALUES ($1, $2, $3)`,
            [membershipId, requireId(branchIds, legacyBranchId, 'assignment branch'), organizationId],
          );
        }
      }

      const moduleIdsByKey: IdMap = new Map();
      for (const row of snapshot.moduleDefinitions) {
        const postgresId = await upsertLegacyRow(client, 'module_definitions', row.legacyMongoId, {
          key: row.key,
          display_name: row.displayName,
          description: row.description,
          category: row.category,
          commercial_type: row.commercialType,
          status: row.status,
          version: row.version,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        });
        moduleIdsByKey.set(row.key, postgresId);
      }

      const planIds: IdMap = new Map();
      for (const row of snapshot.plans) {
        planIds.set(row.legacyMongoId, await upsertLegacyRow(client, 'plans', row.legacyMongoId, {
          key: row.key,
          name: row.name,
          description: row.description,
          status: row.status,
          available: row.available,
          version: row.version,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        }));
      }
      for (const row of snapshot.plans) {
        const planId = requireId(planIds, row.legacyMongoId, 'plan');
        await client.query('DELETE FROM plan_modules WHERE plan_id = $1', [planId]);
        await client.query('DELETE FROM plan_limits WHERE plan_id = $1', [planId]);
        for (const moduleKey of row.moduleKeys) {
          await client.query(
            'INSERT INTO plan_modules (plan_id, module_definition_id) VALUES ($1, $2)',
            [planId, requireId(moduleIdsByKey, moduleKey, 'plan module')],
          );
        }
        for (const limit of row.limits) {
          await client.query(
            'INSERT INTO plan_limits (plan_id, limit_key, value) VALUES ($1, $2, $3)',
            [planId, limit.key, limit.value],
          );
        }
      }

      const addOnIds: IdMap = new Map();
      for (const row of snapshot.addOns) {
        addOnIds.set(row.legacyMongoId, await upsertLegacyRow(client, 'add_ons', row.legacyMongoId, {
          key: row.key,
          name: row.name,
          description: row.description,
          status: row.status,
          available: row.available,
          version: row.version,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        }));
      }
      for (const row of snapshot.addOns) {
        const addOnId = requireId(addOnIds, row.legacyMongoId, 'add-on');
        await client.query('DELETE FROM add_on_modules WHERE add_on_id = $1', [addOnId]);
        await client.query('DELETE FROM add_on_limit_adjustments WHERE add_on_id = $1', [addOnId]);
        for (const moduleKey of row.moduleKeys) {
          await client.query(
            'INSERT INTO add_on_modules (add_on_id, module_definition_id) VALUES ($1, $2)',
            [addOnId, requireId(moduleIdsByKey, moduleKey, 'add-on module')],
          );
        }
        for (const adjustment of row.limitAdjustments) {
          await client.query(
            `INSERT INTO add_on_limit_adjustments (add_on_id, limit_key, mode, value)
             VALUES ($1, $2, $3, $4)`,
            [addOnId, adjustment.key, adjustment.mode, adjustment.value],
          );
        }
      }

      const subscriptionIds: IdMap = new Map();
      for (const row of snapshot.subscriptions) {
        subscriptionIds.set(row.legacyMongoId, await upsertLegacyRow(client, 'subscriptions', row.legacyMongoId, {
          organization_id: requireId(organizationIds, row.organizationLegacyMongoId, 'subscription organization'),
          plan_id: row.planLegacyMongoId ? requireId(planIds, row.planLegacyMongoId, 'subscription plan') : null,
          status: row.status,
          source: row.source,
          starts_at: row.startsAt,
          current_period_ends_at: row.currentPeriodEndsAt,
          billing_cycle: row.billingCycle,
          suspended_at: row.suspendedAt,
          cancelled_at: row.cancelledAt,
          created_by_user_id: row.createdByUserLegacyMongoId
            ? requireId(userIds, row.createdByUserLegacyMongoId, 'subscription creator') : null,
          updated_by_user_id: row.updatedByUserLegacyMongoId
            ? requireId(userIds, row.updatedByUserLegacyMongoId, 'subscription updater') : null,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        }));
      }
      for (const row of snapshot.subscriptions) {
        const subscriptionId = requireId(subscriptionIds, row.legacyMongoId, 'subscription');
        await client.query('DELETE FROM subscription_add_ons WHERE subscription_id = $1', [subscriptionId]);
        for (const addOn of row.addOns) {
          await client.query(
            `INSERT INTO subscription_add_ons (subscription_id, add_on_id, starts_at, ends_at)
             VALUES ($1, $2, $3, $4)`,
            [subscriptionId, requireId(addOnIds, addOn.addOnLegacyMongoId, 'subscription add-on'),
              addOn.startsAt, addOn.endsAt],
          );
        }
      }

      for (const row of snapshot.entitlements) {
        await upsertLegacyRow(client, 'entitlement_overrides', row.legacyMongoId, {
          organization_id: requireId(organizationIds, row.organizationLegacyMongoId, 'entitlement organization'),
          module_definition_id: requireId(moduleIdsByKey, row.moduleKey, 'entitlement module'),
          effect: row.effect,
          status: row.status,
          source: row.source,
          reason: row.reason,
          valid_from: row.validFrom,
          valid_until: row.validUntil,
          actor_user_id: requireId(userIds, row.actorUserLegacyMongoId, 'entitlement actor'),
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        });
      }
    });
  }
}
