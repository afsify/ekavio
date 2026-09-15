import type { QueryResultRow } from 'pg';
import type { PostgresDatabase } from './database.js';
import {
  asLegacyMongoBranchId,
  asLegacyMongoMembershipId,
  asLegacyMongoOrganizationId,
  asLegacyMongoUserId,
  asPostgresBranchId,
  asPostgresMembershipId,
  asPostgresOrganizationId,
  asPostgresUserId,
  type LegacyMongoBranchId,
  type LegacyMongoMembershipId,
  type LegacyMongoOrganizationId,
  type LegacyMongoUserId,
  type PostgresBranchId,
  type PostgresMembershipId,
  type PostgresOrganizationId,
  type PostgresUserId,
} from '../persistence/identifiers.js';

export class IdMappingNotFoundError extends Error {
  public constructor(entity: string, direction: string) {
    super(`${entity} ${direction} mapping was not found`);
    this.name = 'IdMappingNotFoundError';
  }
}

type MappingTable = 'users' | 'organizations' | 'branches' | 'memberships';

interface IdRow extends QueryResultRow {
  id: string;
  legacy_mongo_id: string;
}

export class PostgresIdMappingRepository {
  public constructor(private readonly database: PostgresDatabase) {}

  private async byLegacy(table: MappingTable, legacyMongoId: string, entity: string): Promise<IdRow> {
    const result = await this.database.query<IdRow>(
      `SELECT id, legacy_mongo_id FROM ${table} WHERE legacy_mongo_id = $1`,
      [legacyMongoId],
    );
    const row = result.rows[0];
    if (!row) throw new IdMappingNotFoundError(entity, 'legacy-to-canonical');
    return row;
  }

  private async byCanonical(table: MappingTable, id: string, entity: string): Promise<IdRow> {
    const result = await this.database.query<IdRow>(
      `SELECT id, legacy_mongo_id FROM ${table} WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row?.legacy_mongo_id) throw new IdMappingNotFoundError(entity, 'canonical-to-legacy');
    return row;
  }

  public async userToPostgres(id: LegacyMongoUserId): Promise<PostgresUserId> {
    return asPostgresUserId((await this.byLegacy('users', asLegacyMongoUserId(id), 'User')).id);
  }

  public async userToLegacy(id: PostgresUserId): Promise<LegacyMongoUserId> {
    return asLegacyMongoUserId((await this.byCanonical('users', asPostgresUserId(id), 'User')).legacy_mongo_id);
  }

  public async organizationToPostgres(id: LegacyMongoOrganizationId): Promise<PostgresOrganizationId> {
    return asPostgresOrganizationId(
      (await this.byLegacy('organizations', asLegacyMongoOrganizationId(id), 'Organization')).id,
    );
  }

  public async organizationToLegacy(id: PostgresOrganizationId): Promise<LegacyMongoOrganizationId> {
    return asLegacyMongoOrganizationId(
      (await this.byCanonical('organizations', asPostgresOrganizationId(id), 'Organization')).legacy_mongo_id,
    );
  }

  public async branchToPostgres(id: LegacyMongoBranchId): Promise<PostgresBranchId> {
    return asPostgresBranchId((await this.byLegacy('branches', asLegacyMongoBranchId(id), 'Branch')).id);
  }

  public async branchToLegacy(id: PostgresBranchId): Promise<LegacyMongoBranchId> {
    return asLegacyMongoBranchId(
      (await this.byCanonical('branches', asPostgresBranchId(id), 'Branch')).legacy_mongo_id,
    );
  }

  public async membershipToPostgres(id: LegacyMongoMembershipId): Promise<PostgresMembershipId> {
    return asPostgresMembershipId(
      (await this.byLegacy('memberships', asLegacyMongoMembershipId(id), 'Membership')).id,
    );
  }

  public async membershipToLegacy(id: PostgresMembershipId): Promise<LegacyMongoMembershipId> {
    return asLegacyMongoMembershipId(
      (await this.byCanonical('memberships', asPostgresMembershipId(id), 'Membership')).legacy_mongo_id,
    );
  }
}
