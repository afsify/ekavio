import { getMigrationStatus } from './migrations.js';
import type { PostgresDatabase } from './database.js';
import type { SharedCoreSnapshot, ShadowSourceRepository } from './sharedCoreTypes.js';
import { validateShadowSnapshot } from './shadowValidation.js';
import { verifyShadowState } from './verification.js';
import { PostgresIdMappingRepository } from './idMappingRepository.js';
import { PostgresIdentityRepository } from './identityRepository.js';
import { PostgresAuthorizationContextRepository } from './authorizationContextRepository.js';
import {
  asLegacyMongoBranchId,
  asLegacyMongoMembershipId,
  asLegacyMongoOrganizationId,
  asLegacyMongoUserId,
} from '../persistence/identifiers.js';

export interface CutoverPreflightReport {
  ready: boolean;
  blockerCount: number;
  blockers: string[];
  checked: {
    users: number;
    organizations: number;
    branches: number;
    activeMemberships: number;
    activeBranchAssignments: number;
    platformOperators: number;
    postgresSessionRows: number;
  };
}

const pushError = (blockers: string[], label: string, error: unknown): void => {
  const detail = error instanceof Error ? error.message : 'unknown error';
  blockers.push(`${label}: ${detail}`);
};

export const runCutoverPreflight = async ({
  source,
  database,
}: {
  source: ShadowSourceRepository;
  database: PostgresDatabase;
}): Promise<CutoverPreflightReport> => {
  const blockers: string[] = [];
  let snapshot: SharedCoreSnapshot;
  try {
    snapshot = await source.load();
  } catch (error) {
    pushError(blockers, 'Mongo shared-core snapshot could not be loaded', error);
    return {
      ready: false,
      blockerCount: blockers.length,
      blockers,
      checked: {
        users: 0,
        organizations: 0,
        branches: 0,
        activeMemberships: 0,
        activeBranchAssignments: 0,
        platformOperators: 0,
        postgresSessionRows: 0,
      },
    };
  }

  try {
    const migrations = await getMigrationStatus(database);
    for (const migration of migrations) {
      if (migration.state !== 'applied') blockers.push(`SQL migration is not applied: ${migration.name}`);
    }
  } catch (error) {
    pushError(blockers, 'SQL migration status could not be verified', error);
  }

  blockers.push(...validateShadowSnapshot(snapshot).map((issue) => `Source relationship: ${issue}`));

  let sessionRows = 0;
  try {
    const verification = await verifyShadowState(snapshot, database);
    blockers.push(...verification.mismatches.map((mismatch) => `Shadow mismatch: ${mismatch}`));
    sessionRows = verification.sessionRowsCopied;
  } catch (error) {
    pushError(blockers, 'Shadow reconciliation could not be completed', error);
  }

  const mappings = new PostgresIdMappingRepository(database);
  const authz = new PostgresAuthorizationContextRepository(database);
  const identities = new PostgresIdentityRepository(database, {
    // buildContext is not called here because commercial authority deliberately remains MongoDB.
    getEffective: async () => { throw new Error('Commercial evaluation is outside identity preflight'); },
  });

  for (const user of snapshot.users) {
    try {
      const legacyId = asLegacyMongoUserId(user.legacyMongoId);
      const postgresId = await mappings.userToPostgres(legacyId);
      if (await mappings.userToLegacy(postgresId) !== legacyId) {
        blockers.push(`User ${user.legacyMongoId}: mapping is not reversible`);
      }
      const identity = await identities.findById(postgresId);
      if (!identity || identity.phone !== user.phone || identity.platformOperator !== (user.platformRole === 'operator')) {
        blockers.push(`User ${user.legacyMongoId}: PostgreSQL identity projection mismatch`);
      }
      if ((await authz.isPlatformOperator(postgresId)) !== (user.platformRole === 'operator')) {
        blockers.push(`User ${user.legacyMongoId}: platform operator projection mismatch`);
      }
    } catch (error) {
      pushError(blockers, `User ${user.legacyMongoId}`, error);
    }
  }

  for (const organization of snapshot.organizations) {
    try {
      const legacyId = asLegacyMongoOrganizationId(organization.legacyMongoId);
      const postgresId = await mappings.organizationToPostgres(legacyId);
      if (await mappings.organizationToLegacy(postgresId) !== legacyId) {
        blockers.push(`Organization ${organization.legacyMongoId}: mapping is not reversible`);
      }
      if (!(await authz.organizationExists(postgresId))) {
        blockers.push(`Organization ${organization.legacyMongoId}: PostgreSQL repository cannot resolve it`);
      }
    } catch (error) {
      pushError(blockers, `Organization ${organization.legacyMongoId}`, error);
    }
  }

  const postgresBranchByLegacy = new Map<string, string>();
  for (const branch of snapshot.branches) {
    try {
      const legacyId = asLegacyMongoBranchId(branch.legacyMongoId);
      const postgresId = await mappings.branchToPostgres(legacyId);
      postgresBranchByLegacy.set(branch.legacyMongoId, postgresId);
      if (await mappings.branchToLegacy(postgresId) !== legacyId) {
        blockers.push(`Branch ${branch.legacyMongoId}: mapping is not reversible`);
      }
      const projected = await authz.findBranch(postgresId);
      if (!projected || projected.status !== branch.status) {
        blockers.push(`Branch ${branch.legacyMongoId}: PostgreSQL branch projection mismatch`);
      }
    } catch (error) {
      pushError(blockers, `Branch ${branch.legacyMongoId}`, error);
    }
  }

  const activeMemberships = snapshot.memberships.filter((membership) => membership.status === 'active');
  const usersByLegacy = new Map(snapshot.users.map((user) => [user.legacyMongoId, user]));
  for (const membership of activeMemberships) {
    try {
      const membershipId = await mappings.membershipToPostgres(
        asLegacyMongoMembershipId(membership.legacyMongoId),
      );
      if (await mappings.membershipToLegacy(membershipId) !== membership.legacyMongoId) {
        blockers.push(`Membership ${membership.legacyMongoId}: mapping is not reversible`);
      }
      const userId = await mappings.userToPostgres(asLegacyMongoUserId(membership.userLegacyMongoId));
      const organizationId = await mappings.organizationToPostgres(
        asLegacyMongoOrganizationId(membership.organizationLegacyMongoId),
      );
      const projected = await authz.findActiveMembership(userId, organizationId);
      if (!projected || projected.id !== membershipId || projected.role !== membership.role) {
        blockers.push(`Membership ${membership.legacyMongoId}: PostgreSQL authorization projection mismatch`);
      } else {
        const expectedBranches = membership.branchLegacyMongoIds
          .map((legacyId) => postgresBranchByLegacy.get(legacyId))
          .filter((id): id is string => Boolean(id))
          .sort();
        if (JSON.stringify([...projected.branchIds].sort()) !== JSON.stringify(expectedBranches)) {
          blockers.push(`Membership ${membership.legacyMongoId}: branch assignment mismatch`);
        }
      }
      if (!usersByLegacy.get(membership.userLegacyMongoId)?.passwordHash) {
        blockers.push(`User ${membership.userLegacyMongoId}: active identity has no password hash`);
      }
    } catch (error) {
      pushError(blockers, `Membership ${membership.legacyMongoId}`, error);
    }
  }

  const sourcePhoneCounts = new Map<string, number>();
  for (const user of snapshot.users) {
    sourcePhoneCounts.set(user.phone, (sourcePhoneCounts.get(user.phone) ?? 0) + 1);
  }
  for (const [phone, count] of sourcePhoneCounts) {
    try {
      const projectedCount = (await identities.findByPhone(phone)).length;
      if (projectedCount !== Math.min(count, 2)) {
        blockers.push(`Phone identity group count mismatch (${count} source, ${projectedCount} target)`);
      }
    } catch (error) {
      pushError(blockers, 'Phone ambiguity check failed', error);
    }
  }

  const checked = {
    users: snapshot.users.length,
    organizations: snapshot.organizations.length,
    branches: snapshot.branches.length,
    activeMemberships: activeMemberships.length,
    activeBranchAssignments: activeMemberships.reduce(
      (total, membership) => total + membership.branchLegacyMongoIds.length,
      0,
    ),
    platformOperators: snapshot.users.filter((user) => user.platformRole === 'operator').length,
    postgresSessionRows: sessionRows,
  };
  const uniqueBlockers = [...new Set(blockers)].sort();
  return {
    ready: uniqueBlockers.length === 0,
    blockerCount: uniqueBlockers.length,
    blockers: uniqueBlockers,
    checked,
  };
};
