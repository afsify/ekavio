import type { ModuleKey, SubscriptionStatus } from '../commercial/catalogue.js';
import { addOnKeyByModule, isModuleKey, moduleKeys, PLAN_KEYS } from '../commercial/catalogue.js';
import { AddOn } from '../models/AddOn.js';
import { Organization } from '../models/Organization.js';
import { Plan } from '../models/Plan.js';
import { Subscription } from '../models/Subscription.js';
import { AppError } from '../utils/AppError.js';

const legacyModuleAliases: Readonly<Record<string, ModuleKey>> = {
  khata: 'ledger',
  'digital-khata': 'ledger',
};

export const canonicalizeLegacyModule = (value: string): ModuleKey | null => {
  const normalized = value.trim().toLowerCase();
  if (isModuleKey(normalized)) return normalized;
  return legacyModuleAliases[normalized] ?? null;
};

export interface LegacyCommercialOrganization {
  id: string;
  activeModules: string[];
  subscriptionStatus: 'active' | 'inactive' | 'suspended';
  billingCycle?: 'monthly' | 'yearly';
  nextBillingDate?: Date;
  createdAt?: Date;
}

export interface ImportedSubscriptionRecord {
  organizationId: string;
  planId: string;
  addOnIds: string[];
  status: SubscriptionStatus;
  startsAt: Date;
  currentPeriodEndsAt?: Date;
  billingCycle?: 'monthly' | 'yearly';
}

export interface EntitlementBackfillCatalogue {
  legacyPlanId: string;
  addOnIdByModule: ReadonlyMap<ModuleKey, string>;
}

export interface EntitlementBackfillRepository {
  listLegacyOrganizations(): Promise<LegacyCommercialOrganization[]>;
  loadCatalogue(): Promise<EntitlementBackfillCatalogue | null>;
  findSubscriptionSource(organizationId: string): Promise<string | null>;
  upsertImportedSubscription(record: ImportedSubscriptionRecord): Promise<boolean>;
}

export interface EntitlementBackfillResult {
  organizationsScanned: number;
  subscriptionsPlanned: number;
  subscriptionsCreated: number;
  subscriptionsUpdated: number;
  existingSubscriptionsSkipped: number;
  unknownModules: Array<{ organizationId: string; module: string }>;
  ambiguousOrganizations: Array<{ organizationId: string; reason: string }>;
  dryRun: boolean;
}

interface PlannedImport {
  record: ImportedSubscriptionRecord;
  existingSource: string | null;
}

export const createEntitlementBackfill = (
  repository: EntitlementBackfillRepository,
  now: () => Date = () => new Date(),
) => async ({ apply = false }: { apply?: boolean } = {}): Promise<EntitlementBackfillResult> => {
  const [organizations, catalogue] = await Promise.all([
    repository.listLegacyOrganizations(),
    repository.loadCatalogue(),
  ]);
  if (!catalogue || moduleKeys.some((key) => !catalogue.addOnIdByModule.has(key))) {
    throw new AppError(
      'Commercial catalogue is incomplete; run entitlements:catalogue before backfill',
      409,
    );
  }

  const unknownModules: EntitlementBackfillResult['unknownModules'] = [];
  const ambiguousOrganizations: EntitlementBackfillResult['ambiguousOrganizations'] = [];
  const planned: PlannedImport[] = [];

  for (const organization of organizations) {
    const canonicalModules = new Set<ModuleKey>();
    for (const legacyModule of organization.activeModules) {
      const canonical = canonicalizeLegacyModule(legacyModule);
      if (canonical) canonicalModules.add(canonical);
      else unknownModules.push({ organizationId: organization.id, module: legacyModule });
    }

    if (
      organization.subscriptionStatus === 'active' &&
      organization.nextBillingDate &&
      organization.nextBillingDate <= now()
    ) {
      ambiguousOrganizations.push({
        organizationId: organization.id,
        reason: 'legacy status is active but nextBillingDate has already passed',
      });
    }

    planned.push({
      existingSource: await repository.findSubscriptionSource(organization.id),
      record: {
        organizationId: organization.id,
        planId: catalogue.legacyPlanId,
        addOnIds: [...canonicalModules]
          .sort()
          .map((moduleKey) => catalogue.addOnIdByModule.get(moduleKey)!),
        status: organization.subscriptionStatus,
        startsAt: organization.createdAt ?? now(),
        ...(organization.nextBillingDate
          ? { currentPeriodEndsAt: organization.nextBillingDate }
          : {}),
        ...(organization.billingCycle ? { billingCycle: organization.billingCycle } : {}),
      },
    });
  }

  if (apply && (unknownModules.length > 0 || ambiguousOrganizations.length > 0)) {
    throw new AppError(
      'Ambiguous legacy commercial data found; backfill stopped before writes',
      409,
    );
  }

  let subscriptionsCreated = 0;
  let subscriptionsUpdated = 0;
  let existingSubscriptionsSkipped = 0;
  for (const entry of planned) {
    if (entry.existingSource && entry.existingSource !== 'import') {
      existingSubscriptionsSkipped += 1;
      continue;
    }
    if (!apply) continue;
    const created = await repository.upsertImportedSubscription(entry.record);
    if (created) subscriptionsCreated += 1;
    else subscriptionsUpdated += 1;
  }

  return {
    organizationsScanned: organizations.length,
    subscriptionsPlanned: planned.length,
    subscriptionsCreated,
    subscriptionsUpdated,
    existingSubscriptionsSkipped,
    unknownModules,
    ambiguousOrganizations,
    dryRun: !apply,
  };
};

export const mongooseEntitlementBackfillRepository: EntitlementBackfillRepository = {
  async listLegacyOrganizations() {
    const organizations = await Organization.find().lean();
    return organizations.map((organization) => ({
      id: String(organization._id),
      activeModules: [...(organization.activeModules ?? [])],
      subscriptionStatus: organization.subscriptionStatus,
      ...(organization.billingCycle ? { billingCycle: organization.billingCycle } : {}),
      ...(organization.nextBillingDate ? { nextBillingDate: organization.nextBillingDate } : {}),
      ...(organization.createdAt ? { createdAt: organization.createdAt } : {}),
    }));
  },

  async loadCatalogue() {
    const [plan, addOns] = await Promise.all([
      Plan.findOne({ key: PLAN_KEYS.LEGACY_IMPORT }).lean(),
      AddOn.find({ key: { $in: Object.values(addOnKeyByModule) } }).lean(),
    ]);
    if (!plan) return null;
    const addOnByKey = new Map(addOns.map((addOn) => [addOn.key, String(addOn._id)]));
    return {
      legacyPlanId: String(plan._id),
      addOnIdByModule: new Map(
        moduleKeys.flatMap((moduleKey) => {
          const addOnId = addOnByKey.get(addOnKeyByModule[moduleKey]);
          return addOnId ? [[moduleKey, addOnId] as const] : [];
        }),
      ),
    };
  },

  async findSubscriptionSource(organizationId) {
    const subscription = await Subscription.findOne({ organizationId }).select('source').lean();
    return subscription?.source ?? null;
  },

  async upsertImportedSubscription(record) {
    const unsetValues: Record<string, 1> = {};
    if (!record.currentPeriodEndsAt) unsetValues.currentPeriodEndsAt = 1;
    if (!record.billingCycle) unsetValues.billingCycle = 1;
    const result = await Subscription.updateOne(
      { organizationId: record.organizationId },
      {
        $set: {
          planId: record.planId,
          addOns: record.addOnIds.map((addOnId) => ({ addOnId })),
          status: record.status,
          source: 'import',
          startsAt: record.startsAt,
          ...(record.currentPeriodEndsAt
            ? { currentPeriodEndsAt: record.currentPeriodEndsAt }
            : {}),
          ...(record.billingCycle ? { billingCycle: record.billingCycle } : {}),
        },
        ...(Object.keys(unsetValues).length > 0 ? { $unset: unsetValues } : {}),
      },
      { upsert: true, runValidators: true },
    );
    return result.upsertedCount === 1;
  },
};

export const runEntitlementBackfill = createEntitlementBackfill(
  mongooseEntitlementBackfillRepository,
);
