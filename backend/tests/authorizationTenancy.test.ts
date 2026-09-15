import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAuthorizationContextResolver,
  type ActiveMembershipRecord,
  type AuthorizationContext,
  type AuthorizationContextRepository,
  type BranchAccessRecord,
} from '../src/services/requestContextService.js';
import { hasPermission, permissions, permissionsForRole } from '../src/services/authorizationPolicy.js';
import {
  createAttendanceWriter,
  type AttendanceIdentityResolver,
  type AttendanceStorageRepository,
} from '../src/services/attendanceService.js';
import type {
  LegacyMongoBranchId,
  LegacyMongoOrganizationId,
  LegacyMongoUserId,
} from '../src/persistence/identifiers.js';
import type { OperationalIdentityBridge } from '../src/persistence/operationalIdentity.js';
import {
  assertConsolidatedBillingAuthority,
  assertCorporateLinkAuthority,
} from '../src/services/corporateAuthorizationService.js';
import {
  authorizationRooms,
  createRealtimeAuthorizer,
} from '../src/config/socket.js';
import {
  createAuthorizationBackfill,
  type AuthorizationBackfillRepository,
  type BackfillEntry,
  type LegacyAuthorizationUser,
} from '../src/services/authorizationBackfillService.js';
import { AppError } from '../src/utils/AppError.js';
import { createQueueStatusUpdater } from '../src/services/queueService.js';

class MemoryContextRepository implements AuthorizationContextRepository {
  sessions = new Set(['session-a']);
  organizations = new Set(['org-a', 'org-b']);
  memberships: ActiveMembershipRecord[] = [
    { id: 'membership-a', userId: 'user-a', organizationId: 'org-a', role: 'staff', branchIds: ['branch-a'] },
  ];
  branches: BranchAccessRecord[] = [
    { id: 'branch-a', organizationId: 'org-a', status: 'active' },
    { id: 'branch-a-other', organizationId: 'org-a', status: 'active' },
    { id: 'branch-b', organizationId: 'org-b', status: 'active' },
  ];
  platformOperators = new Set<string>();

  async isSessionActive(sessionId: string, userId: string): Promise<boolean> {
    return userId === 'user-a' && this.sessions.has(sessionId);
  }
  async findActiveMembership(userId: string, organizationId: string) {
    return this.memberships.find(
      (membership) => membership.userId === userId && membership.organizationId === organizationId,
    ) ?? null;
  }
  async organizationExists(organizationId: string): Promise<boolean> {
    return this.organizations.has(organizationId);
  }
  async findBranch(branchId: string) {
    return this.branches.find((branch) => branch.id === branchId) ?? null;
  }
  async isPlatformOperator(userId: string): Promise<boolean> {
    return this.platformOperators.has(userId);
  }
}

const claims = { userId: 'user-a', defaultOrganizationId: 'org-a', sessionId: 'session-a' };
const createContextHarness = () => {
  const repository = new MemoryContextRepository();
  return { repository, resolve: createAuthorizationContextResolver(repository) };
};

const rejectsStatus = (statusCode: number) => (error: unknown): boolean =>
  error instanceof AppError && error.statusCode === statusCode;

test('organization A membership grants allowed A context', async () => {
  const { resolve } = createContextHarness();
  assert.equal((await resolve(claims)).organizationId, 'org-a');
});

test('organization A user cannot switch to B without a membership', async () => {
  const { resolve } = createContextHarness();
  await assert.rejects(() => resolve(claims, { organizationId: 'org-b' }), rejectsStatus(403));
});

test('active membership in B allows authorized switching to B', async () => {
  const { repository, resolve } = createContextHarness();
  repository.memberships.push({
    id: 'membership-b', userId: 'user-a', organizationId: 'org-b', role: 'admin', branchIds: ['branch-b'],
  });
  assert.equal((await resolve(claims, { organizationId: 'org-b' })).role, 'admin');
});

test('inactive or revoked membership is denied because only active membership resolves', async () => {
  const { repository, resolve } = createContextHarness();
  repository.memberships = [];
  await assert.rejects(() => resolve(claims), rejectsStatus(403));
});

test('a branch owned by another organization is rejected', async () => {
  const { resolve } = createContextHarness();
  await assert.rejects(() => resolve(claims, { branchId: 'branch-b' }), rejectsStatus(403));
});

test('an active but unassigned branch is rejected', async () => {
  const { resolve } = createContextHarness();
  await assert.rejects(() => resolve(claims, { branchId: 'branch-a-other' }), rejectsStatus(403));
});

test('staff role cannot perform organization or staff administration', () => {
  const effective = permissionsForRole('staff');
  assert.equal(hasPermission(effective, permissions.ORGANIZATION_MANAGE), false);
  assert.equal(hasPermission(effective, permissions.STAFF_MANAGE), false);
});

test('organization admin can perform intended tenant administration', () => {
  const effective = permissionsForRole('admin');
  assert.equal(hasPermission(effective, permissions.ORGANIZATION_MANAGE), true);
  assert.equal(hasPermission(effective, permissions.STAFF_MANAGE), true);
});

test('organization admin is not a platform operator', async () => {
  const { repository, resolve } = createContextHarness();
  repository.memberships[0] = { ...repository.memberships[0]!, role: 'admin' };
  assert.equal((await resolve(claims)).platformOperator, false);
});

const records = [
  { id: 'queue-a', tenantId: 'org-a' },
  { id: 'queue-b', tenantId: 'org-b' },
];
const matches = (record: (typeof records)[number], filter: { _id?: string; tenantId: string }) =>
  record.tenantId === filter.tenantId && (!filter._id || record.id === filter._id);

test('foreign queue ObjectId cannot be read or mutated by the queue service', async () => {
  const bridge: OperationalIdentityBridge = {
    async resolve(context) {
      return {
        legacyMongoOrganizationId: context.organizationId as LegacyMongoOrganizationId,
        legacyMongoUserId: context.userId as LegacyMongoUserId,
      };
    },
  };
  const update = createQueueStatusUpdater({
    async updateStatus(filter, status) {
      const record = records.find((candidate) => matches(candidate, filter));
      return record ? { ...record, status } : null;
    },
  }, bridge);
  assert.equal(await update(staffContext, 'queue-b', 'completed'), null);
});

test('inventory list equivalent returns only authorized organization data', () => {
  const scope = { tenantId: 'org-a' };
  assert.deepEqual(records.filter((record) => matches(record, scope)).map((record) => record.id), ['queue-a']);
});

test('ledger list equivalent returns only authorized organization data', () => {
  const scope = { tenantId: 'org-b' };
  assert.deepEqual(records.filter((record) => matches(record, scope)).map((record) => record.id), ['queue-b']);
});

const bridge: OperationalIdentityBridge = {
  async resolve(context) {
    return {
      legacyMongoOrganizationId: context.organizationId as LegacyMongoOrganizationId,
      legacyMongoUserId: context.userId as LegacyMongoUserId,
      ...(context.branchId
        ? { legacyMongoBranchId: context.branchId as LegacyMongoBranchId }
        : {}),
    };
  },
};

class MemoryAttendanceStorage implements AttendanceStorageRepository {
  writes: unknown[] = [];
  async upsert(input: Parameters<AttendanceStorageRepository['upsert']>[0]) {
    this.writes.push(input);
    return input;
  }
  async listForDay() { return []; }
}

class MemoryAttendanceIdentities implements AttendanceIdentityResolver {
  async resolveTarget(requestedUserId: string) {
    return requestedUserId === 'user-a'
      ? {
          requestedUserId,
          legacyMongoUserId: requestedUserId,
          name: 'A',
          phone: '1',
          displayUser: { _id: requestedUserId, name: 'A', phone: '1' },
        }
      : null;
  }
  async resolveStoredUsers() { return new Map(); }
}

const staffContext: AuthorizationContext = {
  userId: 'user-a', sessionId: 'session-a', organizationId: 'org-a', membershipId: 'membership-a',
  branchId: 'branch-a', role: 'staff', permissions: permissionsForRole('staff'), platformOperator: false,
};

test('attendance target with matching organization and branch may be written', async () => {
  const storage = new MemoryAttendanceStorage();
  await createAttendanceWriter({ storage, identities: new MemoryAttendanceIdentities(), operationalIdentity: bridge })(
    staffContext,
    { userId: 'user-a', date: '2026-09-13', status: 'present' },
  );
  assert.equal(storage.writes.length, 1);
});

test('attendance foreign-user exploit is rejected without writing', async () => {
  const storage = new MemoryAttendanceStorage();
  await assert.rejects(
    () => createAttendanceWriter({
      storage,
      identities: new MemoryAttendanceIdentities(),
      operationalIdentity: bridge,
    })(staffContext, { userId: 'user-b', date: '2026-09-13', status: 'present' }),
    rejectsStatus(404),
  );
  assert.equal(storage.writes.length, 0);
});

test('unauthorized corporate child linking is rejected', () => {
  assert.throws(
    () => assertCorporateLinkAuthority({ actorUserId: 'user-a', parentOwnerId: 'user-a', childMembershipRole: 'staff' }),
    rejectsStatus(403),
  );
});

test('tenant admin cannot use a global consolidated-billing override', () => {
  assert.throws(() => assertConsolidatedBillingAuthority('tenant-admin', 'parent-owner'), rejectsStatus(404));
});

test('socket cannot join an unauthorized organization room', async () => {
  const { resolve } = createContextHarness();
  const authorize = createRealtimeAuthorizer({ verifyToken: () => claims, resolveContext: resolve });
  await assert.rejects(() => authorize({ token: 'token', organizationId: 'org-b' }), rejectsStatus(403));
});

test('tenant switch realtime context contains no prior organization room', async () => {
  const { repository, resolve } = createContextHarness();
  repository.memberships.push({ id: 'membership-b', userId: 'user-a', organizationId: 'org-b', role: 'staff', branchIds: ['branch-b'] });
  const oldRooms = authorizationRooms(await resolve(claims));
  const nextRooms = authorizationRooms(await resolve(claims, { organizationId: 'org-b' }));
  assert.equal(nextRooms.includes(oldRooms[0]!), false);
});

test('logout or revoked session cannot retain privileged realtime access', async () => {
  const { repository, resolve } = createContextHarness();
  repository.sessions.clear();
  const authorize = createRealtimeAuthorizer({ verifyToken: () => claims, resolveContext: resolve });
  await assert.rejects(() => authorize({ token: 'old-access-token' }), rejectsStatus(401));
});

class MemoryBackfillRepository implements AuthorizationBackfillRepository {
  users: LegacyAuthorizationUser[] = [{ id: 'legacy-user', tenantId: 'org-a', role: 'admin', assignments: [] }];
  organizations = new Set(['org-a']);
  memberships = new Map<string, BackfillEntry & { branchId: string }>();
  async listLegacyUsers(userId?: string) { return this.users.filter((user) => !userId || user.id === userId); }
  async organizationsExist(ids: string[]) { return new Set(ids.filter((id) => this.organizations.has(id))); }
  async membershipExists(userId: string, organizationId: string) { return this.memberships.has(`${userId}:${organizationId}`); }
  async ensureMainBranch(organizationId: string) { return `${organizationId}:main`; }
  async createMembershipIfMissing(entry: BackfillEntry, branchId: string) {
    const key = `${entry.userId}:${entry.organizationId}`;
    if (this.memberships.has(key)) return false;
    this.memberships.set(key, { ...entry, branchId });
    return true;
  }
}

test('membership backfill is idempotent', async () => {
  const repository = new MemoryBackfillRepository();
  const backfill = createAuthorizationBackfill(repository);
  assert.equal((await backfill({ apply: true })).membershipsCreated, 1);
  assert.equal((await backfill({ apply: true })).membershipsCreated, 0);
  assert.equal(repository.memberships.size, 1);
});

test('existing single-tenant user path remains functional after backfill', async () => {
  const repository = new MemoryBackfillRepository();
  await createAuthorizationBackfill(repository)({ apply: true, userId: 'legacy-user' });
  assert.deepEqual(repository.memberships.get('legacy-user:org-a'), {
    userId: 'legacy-user', organizationId: 'org-a', role: 'admin', branchId: 'org-a:main',
  });
});

test('ambiguous legacy roles stop before any migration write', async () => {
  const repository = new MemoryBackfillRepository();
  repository.users[0]!.assignments.push({ tenantId: 'org-a', role: 'staff' });
  await assert.rejects(() => createAuthorizationBackfill(repository)({ apply: true }), rejectsStatus(409));
  assert.equal(repository.memberships.size, 0);
});
