import { getMigrationStatus } from './migrations.js';
import type { PostgresDatabase } from './database.js';
import type { SharedCoreSnapshot, ShadowSourceRepository } from './sharedCoreTypes.js';
import { validateShadowSnapshot } from './shadowValidation.js';
import { verifyShadowState } from './verification.js';
import { PostgresIdMappingRepository } from './idMappingRepository.js';
import { PostgresCommercialRepository } from './commercialRepository.js';
import {
  calculateEffectiveEntitlements,
  createEntitlementService,
  type EntitlementSnapshot,
} from '../services/entitlementService.js';
import type { LimitKey, ModuleKey } from '../commercial/catalogue.js';
import { asLegacyMongoOrganizationId } from '../persistence/identifiers.js';
import { isCommercialAuthorityActivated } from './commercialAuthority.js';

export interface CommercialPreflightReport {
  ready: boolean;
  blockerCount: number;
  blockers: string[];
  authorityAlreadyActivated: boolean;
  checked: {
    moduleDefinitions: number;
    plans: number;
    planModules: number;
    planLimits: number;
    addOns: number;
    addOnModules: number;
    addOnLimitAdjustments: number;
    subscriptions: number;
    subscriptionAddOns: number;
    entitlementOverrides: number;
    organizationsEvaluated: number;
  };
}

const commercialVerificationMismatch = (mismatch: string): boolean =>
  /^(module|plan|add-on|subscription|entitlement)( |:)/.test(mismatch);

const sourceSnapshotForOrganization = (
  snapshot: SharedCoreSnapshot,
  organizationLegacyMongoId: string,
): EntitlementSnapshot => {
  const planById = new Map(snapshot.plans.map((plan) => [plan.legacyMongoId, plan]));
  const addOnById = new Map(snapshot.addOns.map((addOn) => [addOn.legacyMongoId, addOn]));
  const sourceSubscription = snapshot.subscriptions.find(
    (subscription) => subscription.organizationLegacyMongoId === organizationLegacyMongoId,
  );
  const sourcePlan = sourceSubscription?.planLegacyMongoId
    ? planById.get(sourceSubscription.planLegacyMongoId)
    : undefined;
  return {
    modules: snapshot.moduleDefinitions.map((module) => ({
      key: module.key as ModuleKey,
      displayName: module.displayName,
      description: module.description,
      category: module.category,
      commercialType: module.commercialType,
      status: module.status,
    })),
    subscription: sourceSubscription
      ? {
          id: sourceSubscription.legacyMongoId,
          status: sourceSubscription.status,
          source: sourceSubscription.source,
          startsAt: sourceSubscription.startsAt,
          ...(sourceSubscription.currentPeriodEndsAt
            ? { currentPeriodEndsAt: sourceSubscription.currentPeriodEndsAt }
            : {}),
          ...(sourcePlan
            ? {
                plan: {
                  key: sourcePlan.key,
                  name: sourcePlan.name,
                  status: sourcePlan.status,
                  moduleKeys: sourcePlan.moduleKeys as ModuleKey[],
                  limits: sourcePlan.limits.map((limit) => ({
                    key: limit.key as LimitKey,
                    value: limit.value,
                  })),
                },
              }
            : {}),
          addOns: sourceSubscription.addOns.flatMap((assignment) => {
            const addOn = addOnById.get(assignment.addOnLegacyMongoId);
            return addOn
              ? [{
                  addOn: {
                    id: addOn.legacyMongoId,
                    key: addOn.key,
                    name: addOn.name,
                    status: addOn.status,
                    moduleKeys: addOn.moduleKeys as ModuleKey[],
                    limitAdjustments: addOn.limitAdjustments.map((adjustment) => ({
                      key: adjustment.key as LimitKey,
                      mode: adjustment.mode,
                      value: adjustment.value,
                    })),
                  },
                  ...(assignment.startsAt ? { startsAt: assignment.startsAt } : {}),
                  ...(assignment.endsAt ? { endsAt: assignment.endsAt } : {}),
                }]
              : [];
          }),
        }
      : null,
    overrides: snapshot.entitlements
      .filter((entitlement) => entitlement.organizationLegacyMongoId === organizationLegacyMongoId)
      .map((entitlement) => ({
        moduleKey: entitlement.moduleKey as ModuleKey,
        effect: entitlement.effect,
        status: entitlement.status,
        source: entitlement.source,
        ...(entitlement.validFrom ? { validFrom: entitlement.validFrom } : {}),
        ...(entitlement.validUntil ? { validUntil: entitlement.validUntil } : {}),
      })),
  };
};

const normalizedEffective = (value: Awaited<ReturnType<ReturnType<typeof createEntitlementService>['getEffective']>>) => ({
  ...value,
  organizationId: '__organization__',
  subscription: value.subscription
    ? {
        ...value.subscription,
        addOns: [...value.subscription.addOns].sort((left, right) => left.key.localeCompare(right.key)),
      }
    : null,
});

export const runCommercialPreflight = async ({
  source,
  database,
  now = new Date(),
}: {
  source: ShadowSourceRepository;
  database: PostgresDatabase;
  now?: Date;
}): Promise<CommercialPreflightReport> => {
  const blockers: string[] = [];
  let snapshot: SharedCoreSnapshot;
  try {
    snapshot = await source.load();
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`Mongo commercial snapshot could not be loaded: ${detail}`, { cause: error });
  }

  const sourceIssues = validateShadowSnapshot(snapshot);
  blockers.push(...sourceIssues.map((issue) => `Source relationship: ${issue}`));

  try {
    const migrations = await getMigrationStatus(database);
    blockers.push(...migrations
      .filter(({ state }) => state !== 'applied')
      .map(({ name }) => `SQL migration is not applied: ${name}`));
  } catch (error) {
    blockers.push(`SQL migration status: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  try {
    const verification = await verifyShadowState(snapshot, database);
    blockers.push(...verification.mismatches
      .filter(commercialVerificationMismatch)
      .map((mismatch) => `Commercial parity: ${mismatch}`));
  } catch (error) {
    blockers.push(`Commercial reconciliation: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  try {
    const duplicateSubscriptions = await database.query<{ organization_id: string }>(`
      SELECT organization_id FROM subscriptions GROUP BY organization_id HAVING COUNT(*) > 1
    `);
    blockers.push(...duplicateSubscriptions.rows.map(
      ({ organization_id }) => `PostgreSQL organization ${organization_id} has duplicate subscriptions`,
    ));
  } catch (error) {
    blockers.push(`Subscription uniqueness check: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  if (sourceIssues.length === 0) {
    const mappings = new PostgresIdMappingRepository(database);
    const postgresEntitlements = createEntitlementService(new PostgresCommercialRepository(database), () => now);
    for (const organization of snapshot.organizations) {
      try {
        const canonicalOrganizationId = await mappings.organizationToPostgres(
          asLegacyMongoOrganizationId(organization.legacyMongoId),
        );
        const mongoEffective = calculateEffectiveEntitlements(
          organization.legacyMongoId,
          sourceSnapshotForOrganization(snapshot, organization.legacyMongoId),
          now,
        );
        const postgresEffective = await postgresEntitlements.getEffective(canonicalOrganizationId);
        if (JSON.stringify(normalizedEffective(mongoEffective)) !== JSON.stringify(normalizedEffective(postgresEffective))) {
          blockers.push(`Effective commercial state mismatch for organization ${organization.legacyMongoId}`);
        }
      } catch (error) {
        blockers.push(
          `Commercial organization ${organization.legacyMongoId}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
  }

  let authorityAlreadyActivated = false;
  try {
    authorityAlreadyActivated = await isCommercialAuthorityActivated(database);
  } catch (error) {
    blockers.push(`Commercial authority marker: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  const uniqueBlockers = [...new Set(blockers)].sort();
  return {
    ready: uniqueBlockers.length === 0,
    blockerCount: uniqueBlockers.length,
    blockers: uniqueBlockers,
    authorityAlreadyActivated,
    checked: {
      moduleDefinitions: snapshot.moduleDefinitions.length,
      plans: snapshot.plans.length,
      planModules: snapshot.plans.reduce((total, plan) => total + plan.moduleKeys.length, 0),
      planLimits: snapshot.plans.reduce((total, plan) => total + plan.limits.length, 0),
      addOns: snapshot.addOns.length,
      addOnModules: snapshot.addOns.reduce((total, addOn) => total + addOn.moduleKeys.length, 0),
      addOnLimitAdjustments: snapshot.addOns.reduce(
        (total, addOn) => total + addOn.limitAdjustments.length,
        0,
      ),
      subscriptions: snapshot.subscriptions.length,
      subscriptionAddOns: snapshot.subscriptions.reduce(
        (total, subscription) => total + subscription.addOns.length,
        0,
      ),
      entitlementOverrides: snapshot.entitlements.length,
      organizationsEvaluated: snapshot.organizations.length,
    },
  };
};
