import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PostgresDatabase } from '../src/postgres/database.js';
import { getMigrationStatus, migrate } from '../src/postgres/migrations.js';
import { PostgresSharedCoreRepository } from '../src/postgres/sharedCoreRepository.js';
import type { SharedCoreSnapshot, ShadowSourceRepository } from '../src/postgres/sharedCoreTypes.js';
import { runShadowMigration, ShadowValidationError } from '../src/postgres/shadowMigration.js';
import { verifyShadowState } from '../src/postgres/verification.js';

const at = new Date('2026-01-02T03:04:05.000Z');
const ids = {
  organizationA: '100000000000000000000001',
  organizationB: '100000000000000000000002',
  userA: '200000000000000000000001',
  userB: '200000000000000000000002',
  branchA: '300000000000000000000001',
  branchB: '300000000000000000000002',
  membershipA: '400000000000000000000001',
  membershipB: '400000000000000000000002',
  module: '500000000000000000000001',
  plan: '600000000000000000000001',
  addOn: '700000000000000000000001',
  subscription: '800000000000000000000001',
  entitlement: '900000000000000000000001',
} as const;
const passwordHash = '$2b$12$integration-test-password-hash-never-report';

const fixture = (): SharedCoreSnapshot => ({
  users: [
    { legacyMongoId: ids.userA, legacyTenantMongoId: ids.organizationA, name: 'Owner', phone: '1001',
      passwordHash, platformRole: 'operator', createdAt: at, updatedAt: at },
    { legacyMongoId: ids.userB, legacyTenantMongoId: ids.organizationB, name: 'Staff', phone: '1002',
      passwordHash: null, platformRole: null, createdAt: at, updatedAt: at },
  ],
  parentOrganizations: [],
  organizations: [
    { legacyMongoId: ids.organizationA, parentOrganizationLegacyMongoId: null, name: 'Alpha', type: 'shop',
      themeMode: 'light', themePrimaryColor: '#111111', createdAt: at, updatedAt: at },
    { legacyMongoId: ids.organizationB, parentOrganizationLegacyMongoId: null, name: 'Beta', type: 'clinic',
      themeMode: 'dark', themePrimaryColor: '#222222', createdAt: at, updatedAt: at },
  ],
  branches: [
    { legacyMongoId: ids.branchA, organizationLegacyMongoId: ids.organizationA, name: 'Alpha Main',
      code: 'main', status: 'active', createdAt: at, updatedAt: at },
    { legacyMongoId: ids.branchB, organizationLegacyMongoId: ids.organizationB, name: 'Beta Main',
      code: 'main', status: 'inactive', createdAt: at, updatedAt: at },
  ],
  memberships: [
    { legacyMongoId: ids.membershipA, userLegacyMongoId: ids.userA,
      organizationLegacyMongoId: ids.organizationA, role: 'owner', status: 'active',
      branchLegacyMongoIds: [ids.branchA], createdAt: at, updatedAt: at },
    { legacyMongoId: ids.membershipB, userLegacyMongoId: ids.userB,
      organizationLegacyMongoId: ids.organizationB, role: 'staff', status: 'inactive',
      branchLegacyMongoIds: [ids.branchB], createdAt: at, updatedAt: at },
  ],
  moduleDefinitions: [
    { legacyMongoId: ids.module, key: 'queue', displayName: 'Queue', description: 'Queue operations',
      category: 'operations', commercialType: 'core', status: 'active', version: 1,
      createdAt: at, updatedAt: at },
  ],
  plans: [
    { legacyMongoId: ids.plan, key: 'pilot-core', name: 'Pilot', description: 'Pilot plan',
      status: 'active', available: true, moduleKeys: ['queue'], limits: [{ key: 'staff', value: 5 }],
      version: 1, createdAt: at, updatedAt: at },
  ],
  addOns: [
    { legacyMongoId: ids.addOn, key: 'module-queue', name: 'Queue add-on', description: 'Queue access',
      status: 'inactive', available: false, moduleKeys: ['queue'],
      limitAdjustments: [{ key: 'staff', mode: 'override', value: 10 }], version: 1,
      createdAt: at, updatedAt: at },
  ],
  subscriptions: [
    { legacyMongoId: ids.subscription, organizationLegacyMongoId: ids.organizationA,
      planLegacyMongoId: ids.plan,
      addOns: [{ addOnLegacyMongoId: ids.addOn, startsAt: at, endsAt: null }],
      status: 'suspended', source: 'pilot', startsAt: at, currentPeriodEndsAt: null,
      billingCycle: 'monthly', suspendedAt: at, cancelledAt: null,
      createdByUserLegacyMongoId: ids.userA, updatedByUserLegacyMongoId: ids.userA,
      createdAt: at, updatedAt: at },
  ],
  entitlements: [
    { legacyMongoId: ids.entitlement, organizationLegacyMongoId: ids.organizationA,
      moduleKey: 'queue', effect: 'revoke', status: 'inactive', source: 'support', reason: 'Test state',
      validFrom: at, validUntil: null, actorUserLegacyMongoId: ids.userA, createdAt: at, updatedAt: at },
  ],
});

class MemorySource implements ShadowSourceRepository {
  public constructor(private readonly snapshot: SharedCoreSnapshot) {}
  public async load(): Promise<SharedCoreSnapshot> { return this.snapshot; }
}

test('PostgreSQL shared-core migration, shadow copy, constraints, and verification', async (context) => {
  const adminUrl = process.env.POSTGRES_TEST_URL;
  assert.ok(adminUrl, 'POSTGRES_TEST_URL is required for disposable PostgreSQL integration tests');
  const parsedAdminUrl = new URL(adminUrl);
  assert.ok(
    ['localhost', '127.0.0.1', 'postgres'].includes(parsedAdminUrl.hostname) && parsedAdminUrl.pathname === '/postgres',
    'POSTGRES_TEST_URL must target the local postgres maintenance database',
  );
  const databaseName = `ekavio_v205a_${randomUUID().replaceAll('-', '')}`;
  const admin = new PostgresDatabase(adminUrl);
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const database = new PostgresDatabase(databaseUrl.toString());

  context.after(async () => {
    await database.close();
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]);
    await admin.query(`DROP DATABASE "${databaseName}"`);
    await admin.close();
  });

  await context.test('migrates a clean database and reruns deterministically', async () => {
    assert.deepEqual((await getMigrationStatus(database)).map(({ state }) => state), ['pending']);
    await migrate(database);
    await migrate(database);
    assert.deepEqual((await getMigrationStatus(database)).map(({ state }) => state), ['applied']);
    const history = await database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM schema_migrations');
    assert.equal(history.rows[0]?.count, '1');
  });

  const source = new MemorySource(fixture());
  const repository = new PostgresSharedCoreRepository(database);

  await context.test('dry-run performs no PostgreSQL writes', async () => {
    const before = await database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM users');
    const report = await runShadowMigration({ source });
    const after = await database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM users');
    assert.equal(report.mode, 'dry-run');
    assert.equal(report.sessionRowsCopied, 0);
    assert.equal(before.rows[0]?.count, after.rows[0]?.count);
  });

  await context.test('apply preserves state and is idempotent', async () => {
    await runShadowMigration({ source, target: repository, apply: true });
    await runShadowMigration({ source, target: repository, apply: true });
    const memberships = await database.query<{ status: string }>(
      'SELECT status FROM memberships WHERE legacy_mongo_id = $1', [ids.membershipB],
    );
    const subscriptions = await database.query<{ status: string }>(
      'SELECT status FROM subscriptions WHERE legacy_mongo_id = $1', [ids.subscription],
    );
    const entitlements = await database.query<{ effect: string; status: string }>(
      'SELECT effect, status FROM entitlement_overrides WHERE legacy_mongo_id = $1', [ids.entitlement],
    );
    assert.equal(memberships.rows[0]?.status, 'inactive');
    assert.equal(subscriptions.rows[0]?.status, 'suspended');
    assert.deepEqual(entitlements.rows[0], { effect: 'revoke', status: 'inactive' });
    assert.equal((await database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM users',
    )).rows[0]?.count, '2');
  });

  await context.test('database constraints reject duplicate mappings and cross-organization assignments', async () => {
    await assert.rejects(database.query(
      `INSERT INTO organizations
        (legacy_mongo_id, name, type, theme_mode, theme_primary_color, created_at, updated_at)
       VALUES ($1, 'Duplicate', 'shop', 'light', '#000000', $2, $2)`, [ids.organizationA, at],
    ));
    await assert.rejects(database.query(
      `INSERT INTO users (legacy_mongo_id, name, phone, created_at, updated_at)
       VALUES ($1, 'Duplicate', 'x', $2, $2)`, [ids.userA, at],
    ));
    const relation = await database.query<{ membership_id: string; branch_id: string; organization_id: string }>(`
      SELECT m.id AS membership_id, b.id AS branch_id, m.organization_id
      FROM memberships m CROSS JOIN branches b
      WHERE m.legacy_mongo_id = $1 AND b.legacy_mongo_id = $2
    `, [ids.membershipA, ids.branchB]);
    const row = relation.rows[0];
    assert.ok(row);
    await assert.rejects(database.query(
      `INSERT INTO memberships
        (legacy_mongo_id, user_id, organization_id, role, status, created_at, updated_at)
       VALUES ('aaaaaaaaaaaaaaaaaaaaaaaa',
        (SELECT id FROM users WHERE legacy_mongo_id = $1),
        (SELECT id FROM organizations WHERE legacy_mongo_id = $2), 'staff', 'active', $3, $3)`,
      [ids.userA, ids.organizationA, at],
    ));
    await assert.rejects(database.query(
      `INSERT INTO branches
        (legacy_mongo_id, organization_id, name, code, status, created_at, updated_at)
       VALUES ('bbbbbbbbbbbbbbbbbbbbbbbb',
        (SELECT id FROM organizations WHERE legacy_mongo_id = $1),
        'Duplicate main', 'main', 'active', $2, $2)`, [ids.organizationA, at],
    ));
    await assert.rejects(database.query(
      `INSERT INTO branches
        (legacy_mongo_id, organization_id, name, code, status, created_at, updated_at)
       VALUES ('cccccccccccccccccccccccc', $1, 'Missing org', 'missing', 'active', $2, $2)`,
      [randomUUID(), at],
    ));
    await assert.rejects(database.query(
      `INSERT INTO membership_branch_assignments (membership_id, branch_id, organization_id)
       VALUES ($1, $2, $3)`, [row.membership_id, row.branch_id, row.organization_id],
    ));
  });

  await context.test('commercial foreign keys and organization-scoped uniqueness are enforced', async () => {
    const modules = await database.query<{ key: string }>('SELECT key FROM module_definitions ORDER BY key');
    assert.deepEqual(modules.rows, [{ key: 'queue' }]);
    await assert.rejects(database.query(
      `INSERT INTO subscriptions
        (legacy_mongo_id, organization_id, status, source, starts_at, created_at, updated_at)
       VALUES ('dddddddddddddddddddddddd',
        (SELECT id FROM organizations WHERE legacy_mongo_id = $1),
        'active', 'manual', $2, $2, $2)`, [ids.organizationA, at],
    ));
    await assert.rejects(database.query(
      `INSERT INTO entitlement_overrides
        (legacy_mongo_id, organization_id, module_definition_id, effect, status, source,
         reason, actor_user_id, created_at, updated_at)
       VALUES ('eeeeeeeeeeeeeeeeeeeeeeee',
        (SELECT id FROM organizations WHERE legacy_mongo_id = $1),
        (SELECT id FROM module_definitions WHERE key = 'queue'),
        'grant', 'active', 'manual', 'duplicate',
        (SELECT id FROM users WHERE legacy_mongo_id = $2), $3, $3)`,
      [ids.organizationA, ids.userA, at],
    ));
  });

  await context.test('invalid references and unknown capabilities abort before target apply', async () => {
    let applyCalls = 0;
    const target = { apply: async () => { applyCalls += 1; } };
    const invalidReference = fixture();
    invalidReference.memberships[0]!.branchLegacyMongoIds = ['ffffffffffffffffffffffff'];
    await assert.rejects(
      runShadowMigration({ source: new MemorySource(invalidReference), target, apply: true }),
      ShadowValidationError,
    );
    const unknownCapability = fixture();
    unknownCapability.plans[0]!.moduleKeys = ['invented-capability'];
    await assert.rejects(
      runShadowMigration({ source: new MemorySource(unknownCapability), target, apply: true }),
      ShadowValidationError,
    );
    assert.equal(applyCalls, 0);
  });

  await context.test('verification matches, hides credentials, and detects a deliberate mismatch', async () => {
    const matched = await verifyShadowState(fixture(), database);
    assert.equal(matched.matched, true, matched.mismatches.join('\n'));
    assert.equal(matched.sessionRowsCopied, 0);
    assert.equal(JSON.stringify(matched).includes(passwordHash), false);

    await database.query("UPDATE memberships SET status = 'revoked' WHERE legacy_mongo_id = $1", [ids.membershipB]);
    const mismatched = await verifyShadowState(fixture(), database);
    assert.equal(mismatched.matched, false);
    assert.ok(mismatched.mismatches.some((message) => message.includes('status mismatch')));
    assert.equal(JSON.stringify(mismatched).includes(passwordHash), false);
    await repository.apply(fixture());
  });

  await context.test('refresh-session credentials are never copied', async () => {
    const sessions = await database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM auth_sessions');
    assert.equal(sessions.rows[0]?.count, '0');
  });
});
