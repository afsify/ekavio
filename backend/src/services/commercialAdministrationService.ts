import type {
  UpdateSubscriptionInput,
  UpsertEntitlementInput,
} from '../schemas/billingSchemas.js';
import type { EffectiveEntitlements } from './entitlementService.js';

export interface CommercialAdministrationRepository {
  updateSubscription(
    organizationId: string,
    actorUserId: string,
    input: UpdateSubscriptionInput,
  ): Promise<void>;
  upsertEntitlement(
    organizationId: string,
    actorUserId: string,
    moduleKey: string,
    input: UpsertEntitlementInput,
  ): Promise<void>;
}

export interface CommercialEntitlementReader {
  getEffective(organizationId: string): Promise<EffectiveEntitlements>;
}

export const createCommercialAdministrationService = (
  repository: CommercialAdministrationRepository,
  entitlements: CommercialEntitlementReader,
) => ({
  async updateSubscription(
    organizationId: string,
    actorUserId: string,
    input: UpdateSubscriptionInput,
  ): Promise<EffectiveEntitlements> {
    await repository.updateSubscription(organizationId, actorUserId, input);
    return entitlements.getEffective(organizationId);
  },

  async upsertEntitlement(
    organizationId: string,
    actorUserId: string,
    moduleKey: string,
    input: UpsertEntitlementInput,
  ): Promise<EffectiveEntitlements> {
    await repository.upsertEntitlement(organizationId, actorUserId, moduleKey, input);
    return entitlements.getEffective(organizationId);
  },
});
