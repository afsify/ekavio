import type { AuthorizationContext } from '../services/requestContextService.js';
import type { PostgresIdMappingRepository } from '../postgres/idMappingRepository.js';
import {
  asLegacyMongoBranchId,
  asLegacyMongoOrganizationId,
  asLegacyMongoUserId,
  asPostgresBranchId,
  asPostgresOrganizationId,
  asPostgresUserId,
  type LegacyMongoBranchId,
  type LegacyMongoOrganizationId,
  type LegacyMongoUserId,
  type PostgresBranchId,
  type PostgresOrganizationId,
  type PostgresUserId,
} from './identifiers.js';

export interface OperationalIdentityContext {
  legacyMongoOrganizationId: LegacyMongoOrganizationId;
  legacyMongoUserId: LegacyMongoUserId;
  legacyMongoBranchId?: LegacyMongoBranchId;
  canonicalOrganizationId?: PostgresOrganizationId;
  canonicalUserId?: PostgresUserId;
  canonicalBranchId?: PostgresBranchId;
}

export interface OperationalIdentityBridge {
  resolve(context: AuthorizationContext): Promise<OperationalIdentityContext>;
}

export const legacyOrganizationScope = (context: OperationalIdentityContext) => ({
  tenantId: context.legacyMongoOrganizationId,
});

export const legacyOrganizationResourceScope = (
  context: OperationalIdentityContext,
  resourceId: string,
) => ({
  _id: resourceId,
  tenantId: context.legacyMongoOrganizationId,
});

export const mongooseOperationalIdentityBridge: OperationalIdentityBridge = {
  async resolve(context) {
    return {
      legacyMongoOrganizationId: asLegacyMongoOrganizationId(context.organizationId),
      legacyMongoUserId: asLegacyMongoUserId(context.userId),
      ...(context.branchId
        ? { legacyMongoBranchId: asLegacyMongoBranchId(context.branchId) }
        : {}),
    };
  },
};

export class PostgresOperationalIdentityBridge implements OperationalIdentityBridge {
  public constructor(private readonly mappings: PostgresIdMappingRepository) {}

  public async resolve(context: AuthorizationContext): Promise<OperationalIdentityContext> {
    const canonicalOrganizationId = asPostgresOrganizationId(context.organizationId);
    const canonicalUserId = asPostgresUserId(context.userId);
    const canonicalBranchId = context.branchId
      ? asPostgresBranchId(context.branchId)
      : undefined;
    const [legacyMongoOrganizationId, legacyMongoUserId, legacyMongoBranchId] = await Promise.all([
      this.mappings.organizationToLegacy(canonicalOrganizationId),
      this.mappings.userToLegacy(canonicalUserId),
      canonicalBranchId ? this.mappings.branchToLegacy(canonicalBranchId) : undefined,
    ]);
    return {
      canonicalOrganizationId,
      canonicalUserId,
      legacyMongoOrganizationId,
      legacyMongoUserId,
      ...(canonicalBranchId ? { canonicalBranchId } : {}),
      ...(legacyMongoBranchId ? { legacyMongoBranchId } : {}),
    };
  }
}
