import type { EffectiveEntitlements } from '../services/entitlementService.js';
import type { PostgresIdMappingRepository } from '../postgres/idMappingRepository.js';
import {
  asPostgresOrganizationId,
  asPostgresUserId,
  type LegacyMongoOrganizationId,
  type LegacyMongoUserId,
} from './identifiers.js';

export interface CommercialEntitlementReader {
  getEffective(organizationId: string): Promise<EffectiveEntitlements>;
}

export interface CommercialIdentityBridge extends CommercialEntitlementReader {
  organizationToLegacy(organizationId: string): Promise<LegacyMongoOrganizationId>;
  userToLegacy(userId: string): Promise<LegacyMongoUserId>;
}

/**
 * Commercial state remains in MongoDB during V2-05C. Every runtime lookup is
 * translated from an authorized PostgreSQL UUID through the entity-specific
 * compatibility mapping before the Mongo repository is called.
 */
export class PostgresMongoCommercialIdentityBridge implements CommercialIdentityBridge {
  public constructor(
    private readonly mappings: PostgresIdMappingRepository,
    private readonly mongoEntitlements: CommercialEntitlementReader,
  ) {}

  public organizationToLegacy(organizationId: string): Promise<LegacyMongoOrganizationId> {
    return this.mappings.organizationToLegacy(asPostgresOrganizationId(organizationId));
  }

  public userToLegacy(userId: string): Promise<LegacyMongoUserId> {
    return this.mappings.userToLegacy(asPostgresUserId(userId));
  }

  public async getEffective(organizationId: string): Promise<EffectiveEntitlements> {
    const legacyOrganizationId = await this.organizationToLegacy(organizationId);
    const effective = await this.mongoEntitlements.getEffective(legacyOrganizationId);
    return { ...effective, organizationId };
  }
}
