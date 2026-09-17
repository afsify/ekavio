import type { PostgresIdMappingRepository } from '../postgres/idMappingRepository.js';
import {
  asPostgresOrganizationId,
  asPostgresUserId,
  type LegacyMongoOrganizationId,
  type LegacyMongoUserId,
} from './identifiers.js';

/** Identity translation for Mongo operational/audit storage only. */
export class PostgresMongoLegacyIdentityBridge {
  public constructor(private readonly mappings: PostgresIdMappingRepository) {}

  public organizationToLegacy(organizationId: string): Promise<LegacyMongoOrganizationId> {
    return this.mappings.organizationToLegacy(asPostgresOrganizationId(organizationId));
  }

  public userToLegacy(userId: string): Promise<LegacyMongoUserId> {
    return this.mappings.userToLegacy(asPostgresUserId(userId));
  }
}
