import type {
  CommercialSource,
  EffectiveLimitMap,
  LimitKey,
  ModuleKey,
  SubscriptionStatus,
} from '../commercial/catalogue.js';
import { emptyEffectiveLimits, limitKeys, moduleKeys } from '../commercial/catalogue.js';

export interface ModuleDefinitionRecord {
  key: ModuleKey;
  displayName: string;
  description: string;
  category: string;
  commercialType: 'core' | 'purchasable';
  status: 'active' | 'inactive';
}

export interface LimitGrantRecord {
  key: LimitKey;
  value: number;
}

export interface LimitAdjustmentRecord extends LimitGrantRecord {
  mode: 'add' | 'override';
}

export interface PlanGrantRecord {
  key: string;
  name: string;
  status: 'active' | 'inactive';
  moduleKeys: ModuleKey[];
  limits: LimitGrantRecord[];
}

export interface AddOnGrantRecord {
  id: string;
  key: string;
  name: string;
  status: 'active' | 'inactive';
  moduleKeys: ModuleKey[];
  limitAdjustments: LimitAdjustmentRecord[];
}

export interface SubscriptionAddOnRecord {
  addOn: AddOnGrantRecord;
  startsAt?: Date;
  endsAt?: Date;
}

export interface CommercialSubscriptionRecord {
  id: string;
  status: SubscriptionStatus;
  source: CommercialSource;
  startsAt: Date;
  currentPeriodEndsAt?: Date;
  plan?: PlanGrantRecord;
  addOns: SubscriptionAddOnRecord[];
}

export interface EntitlementOverrideRecord {
  moduleKey: ModuleKey;
  effect: 'grant' | 'revoke';
  status: 'active' | 'inactive';
  source: CommercialSource;
  validFrom?: Date;
  validUntil?: Date;
}

export interface EntitlementSnapshot {
  modules: ModuleDefinitionRecord[];
  subscription: CommercialSubscriptionRecord | null;
  overrides: EntitlementOverrideRecord[];
}

export interface EntitlementRepository {
  loadSnapshot(organizationId: string): Promise<EntitlementSnapshot>;
}

export interface EffectiveModule {
  key: ModuleKey;
  displayName: string;
  description: string;
  category: string;
  commercialType: 'core' | 'purchasable';
  enabled: boolean;
  sources: string[];
}

export interface EffectiveEntitlements {
  organizationId: string;
  subscription: null | {
    status: SubscriptionStatus | 'expired' | 'pending';
    source: CommercialSource;
    plan: null | { key: string; name: string };
    addOns: Array<{ key: string; name: string; startsAt?: string; endsAt?: string }>;
    startsAt: string;
    currentPeriodEndsAt?: string;
  };
  modules: EffectiveModule[];
  limits: EffectiveLimitMap;
}

const isEffectiveWindow = (
  now: Date,
  startsAt?: Date,
  endsAt?: Date,
): boolean => (!startsAt || startsAt <= now) && (!endsAt || endsAt > now);

const effectiveSubscriptionStatus = (
  subscription: CommercialSubscriptionRecord,
  now: Date,
): SubscriptionStatus | 'expired' | 'pending' => {
  if (subscription.startsAt > now) return 'pending';
  if (
    subscription.currentPeriodEndsAt &&
    subscription.currentPeriodEndsAt <= now &&
    (subscription.status === 'active' || subscription.status === 'trialing')
  ) {
    return 'expired';
  }
  return subscription.status;
};

const applyPlanLimits = (
  limits: EffectiveLimitMap,
  grants: readonly LimitGrantRecord[],
): void => {
  for (const key of limitKeys) {
    const values = grants.filter((grant) => grant.key === key).map((grant) => grant.value);
    if (values.length > 0) limits[key] = Math.max(...values);
  }
};

const applyAddOnLimits = (
  limits: EffectiveLimitMap,
  addOns: readonly AddOnGrantRecord[],
): void => {
  for (const key of limitKeys) {
    const adjustments = addOns.flatMap((addOn) =>
      addOn.limitAdjustments.filter((adjustment) => adjustment.key === key),
    );
    const overrides = adjustments
      .filter((adjustment) => adjustment.mode === 'override')
      .map((adjustment) => adjustment.value);
    const additions = adjustments
      .filter((adjustment) => adjustment.mode === 'add')
      .reduce((total, adjustment) => total + adjustment.value, 0);
    const base = limits[key];
    const overriddenBase = overrides.length > 0
      ? Math.max(base ?? 0, ...overrides)
      : base;
    if (overriddenBase !== null || additions > 0) {
      limits[key] = (overriddenBase ?? 0) + additions;
    }
  }
};

export const calculateEffectiveEntitlements = (
  organizationId: string,
  snapshot: EntitlementSnapshot,
  now: Date,
): EffectiveEntitlements => {
  const moduleSources = new Map<ModuleKey, Set<string>>(
    moduleKeys.map((key) => [key, new Set<string>()]),
  );
  const revokedModules = new Set<ModuleKey>();
  const limits = emptyEffectiveLimits();
  const subscription = snapshot.subscription;
  const status = subscription ? effectiveSubscriptionStatus(subscription, now) : null;
  const subscriptionIsActive = status === 'active' || status === 'trialing';
  const activeAddOns = subscriptionIsActive && subscription
    ? subscription.addOns
        .filter(({ addOn, startsAt, endsAt }) =>
          addOn.status === 'active' && isEffectiveWindow(now, startsAt, endsAt),
        )
        .map(({ addOn }) => addOn)
        .sort((left, right) => left.key.localeCompare(right.key))
    : [];

  if (subscriptionIsActive && subscription?.plan?.status === 'active') {
    for (const moduleKey of subscription.plan.moduleKeys) {
      moduleSources.get(moduleKey)?.add(`plan:${subscription.plan.key}`);
    }
    applyPlanLimits(limits, subscription.plan.limits);
  }

  for (const addOn of activeAddOns) {
    for (const moduleKey of addOn.moduleKeys) {
      moduleSources.get(moduleKey)?.add(`add-on:${addOn.key}`);
    }
  }
  applyAddOnLimits(limits, activeAddOns);

  for (const override of snapshot.overrides) {
    if (
      override.status !== 'active' ||
      !isEffectiveWindow(now, override.validFrom, override.validUntil)
    ) {
      continue;
    }
    if (override.effect === 'revoke') {
      revokedModules.add(override.moduleKey);
    } else {
      moduleSources.get(override.moduleKey)?.add(`override:${override.source}`);
    }
  }

  const definitions = new Map(snapshot.modules.map((module) => [module.key, module]));
  const modules = moduleKeys.map((key): EffectiveModule => {
    const definition = definitions.get(key);
    const sources = [...(moduleSources.get(key) ?? [])].sort();
    const enabled = definition?.status === 'active' && sources.length > 0 && !revokedModules.has(key);
    return {
      key,
      displayName: definition?.displayName ?? key,
      description: definition?.description ?? '',
      category: definition?.category ?? 'unavailable',
      commercialType: definition?.commercialType ?? 'purchasable',
      enabled,
      sources: revokedModules.has(key) ? ['override:revoke'] : sources,
    };
  });

  return {
    organizationId,
    subscription: subscription
      ? {
          status: status!,
          source: subscription.source,
          plan: subscription.plan
            ? { key: subscription.plan.key, name: subscription.plan.name }
            : null,
          addOns: subscription.addOns.map(({ addOn, startsAt, endsAt }) => ({
            key: addOn.key,
            name: addOn.name,
            ...(startsAt ? { startsAt: startsAt.toISOString() } : {}),
            ...(endsAt ? { endsAt: endsAt.toISOString() } : {}),
          })),
          startsAt: subscription.startsAt.toISOString(),
          ...(subscription.currentPeriodEndsAt
            ? { currentPeriodEndsAt: subscription.currentPeriodEndsAt.toISOString() }
            : {}),
        }
      : null,
    modules,
    limits,
  };
};

export const createEntitlementService = (
  repository: EntitlementRepository,
  now: () => Date = () => new Date(),
) => ({
  async getEffective(organizationId: string): Promise<EffectiveEntitlements> {
    return calculateEffectiveEntitlements(
      organizationId,
      await repository.loadSnapshot(organizationId),
      now(),
    );
  },
});
