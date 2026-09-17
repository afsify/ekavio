import { AddOn } from '../models/AddOn.js';
import { Entitlement } from '../models/Entitlement.js';
import { ModuleDefinition } from '../models/ModuleDefinition.js';
import { Plan } from '../models/Plan.js';
import { Subscription } from '../models/Subscription.js';
import type { LimitKey, ModuleKey } from '../commercial/catalogue.js';
import type {
  CommercialSubscriptionRecord,
  EntitlementRepository,
} from '../services/entitlementService.js';

/**
 * Legacy Mongo commercial reader for migration parity only. Runtime composition
 * must never import this module after V2-05D.
 */
export const legacyMongoEntitlementRepository: EntitlementRepository = {
  async loadSnapshot(organizationId) {
    const [moduleDocuments, subscriptionDocument, overrideDocuments] = await Promise.all([
      ModuleDefinition.find().sort({ key: 1 }).lean(),
      Subscription.findOne({ organizationId }).lean(),
      Entitlement.find({ organizationId }).lean(),
    ]);

    let subscription: CommercialSubscriptionRecord | null = null;
    if (subscriptionDocument) {
      const addOnIds = subscriptionDocument.addOns.map((assignment) => assignment.addOnId);
      const [planDocument, addOnDocuments] = await Promise.all([
        subscriptionDocument.planId
          ? Plan.findById(subscriptionDocument.planId).lean()
          : Promise.resolve(null),
        AddOn.find({ _id: { $in: addOnIds } }).lean(),
      ]);
      const addOnById = new Map(addOnDocuments.map((addOn) => [String(addOn._id), addOn]));

      subscription = {
        id: String(subscriptionDocument._id),
        status: subscriptionDocument.status,
        source: subscriptionDocument.source,
        startsAt: subscriptionDocument.startsAt,
        ...(subscriptionDocument.currentPeriodEndsAt
          ? { currentPeriodEndsAt: subscriptionDocument.currentPeriodEndsAt }
          : {}),
        ...(planDocument
          ? {
              plan: {
                key: planDocument.key,
                name: planDocument.name,
                status: planDocument.status,
                moduleKeys: [...planDocument.moduleKeys] as ModuleKey[],
                limits: planDocument.limits.map((limit) => ({
                  key: limit.key as LimitKey,
                  value: limit.value,
                })),
              },
            }
          : {}),
        addOns: subscriptionDocument.addOns.flatMap((assignment) => {
          const addOn = addOnById.get(String(assignment.addOnId));
          if (!addOn) return [];
          return [{
            addOn: {
              id: String(addOn._id),
              key: addOn.key,
              name: addOn.name,
              status: addOn.status,
              moduleKeys: [...addOn.moduleKeys] as ModuleKey[],
              limitAdjustments: addOn.limitAdjustments.map((adjustment) => ({
                key: adjustment.key as LimitKey,
                mode: adjustment.mode,
                value: adjustment.value,
              })),
            },
            ...(assignment.startsAt ? { startsAt: assignment.startsAt } : {}),
            ...(assignment.endsAt ? { endsAt: assignment.endsAt } : {}),
          }];
        }),
      };
    }

    return {
      modules: moduleDocuments.map((module) => ({
        key: module.key as ModuleKey,
        displayName: module.displayName,
        description: module.description,
        category: module.category,
        commercialType: module.commercialType,
        status: module.status,
      })),
      subscription,
      overrides: overrideDocuments.map((override) => ({
        moduleKey: override.moduleKey as ModuleKey,
        effect: override.effect,
        status: override.status,
        source: override.source,
        ...(override.validFrom ? { validFrom: override.validFrom } : {}),
        ...(override.validUntil ? { validUntil: override.validUntil } : {}),
      })),
    };
  },
};
