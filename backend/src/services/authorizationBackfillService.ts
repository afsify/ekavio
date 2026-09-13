import { Branch } from '../models/Branch.js';
import { Membership, type MembershipRole } from '../models/Membership.js';
import { Organization } from '../models/Organization.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';

export interface LegacyAuthorizationUser {
  id: string;
  tenantId: string;
  role: string;
  assignments: Array<{ tenantId: string; role: string }>;
}

export interface BackfillEntry {
  userId: string;
  organizationId: string;
  role: MembershipRole;
}

export interface AuthorizationBackfillRepository {
  listLegacyUsers(userId?: string): Promise<LegacyAuthorizationUser[]>;
  organizationsExist(organizationIds: string[]): Promise<Set<string>>;
  membershipExists(userId: string, organizationId: string): Promise<boolean>;
  ensureMainBranch(organizationId: string): Promise<string>;
  createMembershipIfMissing(entry: BackfillEntry, branchId: string): Promise<boolean>;
}

export interface BackfillResult {
  usersScanned: number;
  associationsPlanned: number;
  membershipsCreated: number;
  membershipsExisting: number;
  dryRun: boolean;
}

const supportedRoles = new Set<MembershipRole>([
  'owner',
  'admin',
  'manager',
  'hr',
  'staff',
]);

const asMembershipRole = (role: string, userId: string): MembershipRole => {
  if (!supportedRoles.has(role as MembershipRole)) {
    throw new AppError(`Unsupported legacy role for user ${userId}`, 409);
  }
  return role as MembershipRole;
};

export const planLegacyAuthorization = (
  users: readonly LegacyAuthorizationUser[],
): BackfillEntry[] => {
  const entries: BackfillEntry[] = [];

  for (const user of users) {
    const associations = new Map<string, MembershipRole>();
    const candidates = [
      { tenantId: user.tenantId, role: user.role },
      ...user.assignments,
    ];

    for (const candidate of candidates) {
      const organizationId = candidate.tenantId.trim();
      if (!organizationId) {
        throw new AppError(`Missing legacy organization for user ${user.id}`, 409);
      }

      const role = asMembershipRole(candidate.role, user.id);
      const priorRole = associations.get(organizationId);
      if (priorRole && priorRole !== role) {
        throw new AppError(
          `Ambiguous legacy roles for user ${user.id} and organization ${organizationId}`,
          409,
        );
      }
      associations.set(organizationId, role);
    }

    for (const [organizationId, role] of associations) {
      entries.push({ userId: user.id, organizationId, role });
    }
  }

  return entries;
};

export const createAuthorizationBackfill = (
  repository: AuthorizationBackfillRepository,
) => {
  return async ({
    apply = false,
    userId,
  }: { apply?: boolean; userId?: string } = {}): Promise<BackfillResult> => {
    const users = await repository.listLegacyUsers(userId);
    const entries = planLegacyAuthorization(users);
    const organizationIds = [...new Set(entries.map((entry) => entry.organizationId))];
    const existingOrganizations = await repository.organizationsExist(organizationIds);
    const missingOrganization = organizationIds.find(
      (organizationId) => !existingOrganizations.has(organizationId),
    );
    if (missingOrganization) {
      throw new AppError(
        `Legacy organization ${missingOrganization} does not exist; backfill stopped before writes`,
        409,
      );
    }

    let membershipsCreated = 0;
    let membershipsExisting = 0;

    for (const entry of entries) {
      if (await repository.membershipExists(entry.userId, entry.organizationId)) {
        membershipsExisting += 1;
        continue;
      }

      if (!apply) continue;
      const branchId = await repository.ensureMainBranch(entry.organizationId);
      const created = await repository.createMembershipIfMissing(entry, branchId);
      if (created) membershipsCreated += 1;
      else membershipsExisting += 1;
    }

    return {
      usersScanned: users.length,
      associationsPlanned: entries.length,
      membershipsCreated,
      membershipsExisting,
      dryRun: !apply,
    };
  };
};

const toLegacyUser = (user: {
  _id: unknown;
  tenantId: unknown;
  role?: string | null;
  assignments?: Array<{ tenantId: unknown; role: string }>;
}): LegacyAuthorizationUser => ({
  id: String(user._id),
  tenantId: String(user.tenantId),
  role: user.role ?? 'staff',
  assignments: (user.assignments ?? []).map((assignment) => ({
    tenantId: String(assignment.tenantId),
    role: assignment.role,
  })),
});

export const mongooseAuthorizationBackfillRepository: AuthorizationBackfillRepository = {
  async listLegacyUsers(userId) {
    const users = await User.find(userId ? { _id: userId } : {}).lean();
    return users.map(toLegacyUser);
  },

  async organizationsExist(organizationIds) {
    const organizations = await Organization.find({ _id: { $in: organizationIds } })
      .select('_id')
      .lean();
    return new Set(organizations.map((organization) => String(organization._id)));
  },

  async membershipExists(userId, organizationId) {
    return Boolean(await Membership.exists({ userId, organizationId }));
  },

  async ensureMainBranch(organizationId) {
    const branch = await Branch.findOneAndUpdate(
      { organizationId, code: 'main' },
      {
        $setOnInsert: {
          organizationId,
          name: 'Main',
          code: 'main',
          status: 'active',
        },
      },
      { upsert: true, new: true, runValidators: true },
    );
    return String(branch._id);
  },

  async createMembershipIfMissing(entry, branchId) {
    const result = await Membership.updateOne(
      { userId: entry.userId, organizationId: entry.organizationId },
      {
        $setOnInsert: {
          userId: entry.userId,
          organizationId: entry.organizationId,
          role: entry.role,
          status: 'active',
          branchIds: [branchId],
        },
      },
      { upsert: true, runValidators: true },
    );
    return result.upsertedCount === 1;
  },
};

export const runAuthorizationBackfill = createAuthorizationBackfill(
  mongooseAuthorizationBackfillRepository,
);

export const ensureLegacyAuthorizationForUser = async (userId: string): Promise<void> => {
  await runAuthorizationBackfill({ apply: true, userId });
};
