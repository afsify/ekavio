import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import mongoose from 'mongoose';
import { initialModuleCatalogue, MODULES } from '../src/commercial/catalogue.js';
import { Entitlement } from '../src/models/Entitlement.js';
import { Subscription } from '../src/models/Subscription.js';
import {
  asLegacyMongoOrganizationId,
  asLegacyMongoUserId,
} from '../src/persistence/identifiers.js';
import { PostgresCommercialRepository } from '../src/postgres/commercialRepository.js';
import { runCommercialPreflight } from '../src/postgres/commercialPreflight.js';
import { PostgresDatabase } from '../src/postgres/database.js';
import { PostgresIdMappingRepository } from '../src/postgres/idMappingRepository.js';
import { PostgresIdentityRepository } from '../src/postgres/identityRepository.js';
import { migrate } from '../src/postgres/migrations.js';
import { PostgresSharedCoreRepository } from '../src/postgres/sharedCoreRepository.js';
import type { SharedCoreSnapshot, ShadowSourceRepository } from '../src/postgres/sharedCoreTypes.js';
import { createCommercialAdministrationService } from '../src/services/commercialAdministrationService.js';
import { createEntitlementService } from '../src/services/entitlementService.js';

const at = new Date('2026-09-15T06:00:00.000Z');
const before = new Date('2026-09-15T05:00:00.000Z');
const after = new Date('2026-09-15T07:00:00.000Z');
const legacy = {
  userA: '110000000000000000000001',
  userB: '110000000000000000000002',
  organizationA: '120000000000000000000001',
  organizationB: '120000000000000000000002',
  branchA: '130000000000000000000001',
  branchB: '130000000000000000000002',
  membershipA: '140000000000000000000001',
  membershipAB: '140000000000000000000002',
  membershipB: '140000000000000000000003',
  plan: '150000000000000000000001',
  inventoryAddOn: '160000000000000000000001',
  capacityAddOn: '160000000000000000000002',
  subscriptionA: '170000000000000000000001',
  entitlementA: '180000000000000000000001',
} as const;

const moduleLegacyId = (index: number): string => `19000000000000000000000${index}`;

const fixture = (): SharedCoreSnapshot => ({
  users: [
    { legacyMongoId: legacy.userA, legacyTenantMongoId: legacy.organizationA, name: 'Operator A',
      phone: 'commercial-operator-a', passwordHash: '$2b$12$commercial-integration-a',
      platformRole: 'operator', createdAt: at, updatedAt: at },
    { legacyMongoId: legacy.userB, legacyTenantMongoId: legacy.organizationB, name: 'Owner B',
      phone: 'commercial-owner-b', passwordHash: '$2b$12$commercial-integration-b',
      platformRole: null, createdAt: at, updatedAt: at },
  ],
  parentOrganizations: [],
  organizations: [
    { legacyMongoId: legacy.organizationA, parentOrganizationLegacyMongoId: null,
      name: 'Commercial A', type: 'shop', themeMode: 'light', themePrimaryColor: '#111111',
      createdAt: at, updatedAt: at },
    { legacyMongoId: legacy.organizationB, parentOrganizationLegacyMongoId: null,
      name: 'Commercial B', type: 'clinic', themeMode: 'dark', themePrimaryColor: '#222222',
      createdAt: at, updatedAt: at },
  ],
  branches: [
    { legacyMongoId: legacy.branchA, organizationLegacyMongoId: legacy.organizationA,
      name: 'A Main', code: 'main', status: 'active', createdAt: at, updatedAt: at },
    { legacyMongoId: legacy.branchB, organizationLegacyMongoId: legacy.organizationB,
      name: 'B Main', code: 'main', status: 'active', createdAt: at, updatedAt: at },
  ],
  memberships: [
    { legacyMongoId: legacy.membershipA, userLegacyMongoId: legacy.userA,
      organizationLegacyMongoId: legacy.organizationA, role: 'owner', status: 'active',
      branchLegacyMongoIds: [legacy.branchA], createdAt: at, updatedAt: at },
    { legacyMongoId: legacy.membershipAB, userLegacyMongoId: legacy.userA,
      organizationLegacyMongoId: legacy.organizationB, role: 'staff', status: 'active',
      branchLegacyMongoIds: [legacy.branchB], createdAt: at, updatedAt: at },
    { legacyMongoId: legacy.membershipB, userLegacyMongoId: legacy.userB,
      organizationLegacyMongoId: legacy.organizationB, role: 'owner', status: 'active',
      branchLegacyMongoIds: [legacy.branchB], createdAt: at, updatedAt: at },
  ],
  moduleDefinitions: initialModuleCatalogue.map((module, index) => ({
    legacyMongoId: moduleLegacyId(index + 1), key: module.key,
    displayName: module.displayName, description: module.description, category: module.category,
    commercialType: module.commercialType, status: module.status, version: module.version,
    createdAt: at, updatedAt: at,
  })),
  plans: [{
    legacyMongoId: legacy.plan, key: 'pilot-core', name: 'Pilot Core', description: 'Pilot fixture',
    status: 'active', available: true, moduleKeys: [MODULES.QUEUE],
    limits: [{ key: 'staff', value: 5 }, { key: 'storageMb', value: 250 }],
    version: 1, createdAt: at, updatedAt: at,
  }],
  addOns: [
    { legacyMongoId: legacy.inventoryAddOn, key: 'module-inventory', name: 'Inventory Module',
      description: 'Inventory fixture', status: 'active', available: true,
      moduleKeys: [MODULES.INVENTORY],
      limitAdjustments: [{ key: 'staff', mode: 'override', value: 10 }],
      version: 1, createdAt: at, updatedAt: at },
    { legacyMongoId: legacy.capacityAddOn, key: 'capacity-pack', name: 'Capacity Pack',
      description: 'Capacity fixture', status: 'active', available: true,
      moduleKeys: [], limitAdjustments: [{ key: 'staff', mode: 'add', value: 3 }],
      version: 1, createdAt: at, updatedAt: at },
  ],
  subscriptions: [{
    legacyMongoId: legacy.subscriptionA, organizationLegacyMongoId: legacy.organizationA,
    planLegacyMongoId: legacy.plan,
    addOns: [
      { addOnLegacyMongoId: legacy.inventoryAddOn, startsAt: before, endsAt: null },
      { addOnLegacyMongoId: legacy.capacityAddOn, startsAt: before, endsAt: null },
    ],
    status: 'active', source: 'pilot', startsAt: before, currentPeriodEndsAt: after,
    billingCycle: 'monthly', suspendedAt: null, cancelledAt: null,
    createdByUserLegacyMongoId: legacy.userA, updatedByUserLegacyMongoId: legacy.userA,
    createdAt: at, updatedAt: at,
  }],
  entitlements: [{
    legacyMongoId: legacy.entitlementA, organizationLegacyMongoId: legacy.organizationA,
    moduleKey: MODULES.LEDGER, effect: 'grant', status: 'active', source: 'pilot',
    reason: 'Commercial parity fixture', validFrom: before, validUntil: after,
    actorUserLegacyMongoId: legacy.userA, createdAt: at, updatedAt: at,
  }],
});

class MemorySource implements ShadowSourceRepository {
  public constructor(private readonly value: SharedCoreSnapshot) {}
  public async load() { return this.value; }
}

const enabled = (state: Awaited<ReturnType<ReturnType<typeof createEntitlementService>['getEffective']>>) =>
  state.modules.filter((module) => module.enabled).map((module) => module.key).sort();

test('V2-05D PostgreSQL commercial parity, authority, and two-organization isolation', async (context) => {
  const postgresAdminUrl = process.env.POSTGRES_TEST_URL;
  const mongoAdminUrl = process.env.MONGO_TEST_URL;
  assert.ok(postgresAdminUrl, 'POSTGRES_TEST_URL is required');
  assert.ok(mongoAdminUrl, 'MONGO_TEST_URL is required');
  const postgresHost = new URL(postgresAdminUrl).hostname;
  const mongoHost = new URL(mongoAdminUrl).hostname;
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(postgresHost));
  assert.ok(['localhost', '127.0.0.1', 'mongo'].includes(mongoHost));

  const suffix = randomUUID().replaceAll('-', '');
  const databaseName = `ekavio_v205d_${suffix}`;
  const admin = new PostgresDatabase(postgresAdminUrl);
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const databaseUrl = new URL(postgresAdminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const database = new PostgresDatabase(databaseUrl.toString());
  const mongoUrl = new URL(mongoAdminUrl);
  mongoUrl.pathname = `/ekavio_v205d_${suffix}`;
  await mongoose.connect(mongoUrl.toString(), { serverSelectionTimeoutMS: 10_000 });

  context.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await database.close();
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]);
    await admin.query(`DROP DATABASE "${databaseName}"`);
    await admin.close();
  });

  await migrate(database);
  const source = new MemorySource(fixture());
  await new PostgresSharedCoreRepository(database).apply(fixture());
  const repository = new PostgresCommercialRepository(database);
  const entitlements = createEntitlementService(repository, () => at);
  const administration = createCommercialAdministrationService(repository, entitlements);
  const mappings = new PostgresIdMappingRepository(database);
  const organizationA = await mappings.organizationToPostgres(
    asLegacyMongoOrganizationId(legacy.organizationA),
  );
  const organizationB = await mappings.organizationToPostgres(
    asLegacyMongoOrganizationId(legacy.organizationB),
  );
  const userA = await mappings.userToPostgres(asLegacyMongoUserId(legacy.userA));

  await context.test('commercial preflight proves raw and effective parity without writes', async () => {
    const beforeCounts = await database.query<{ state: string }>(`
      SELECT concat_ws(':',
        (SELECT COUNT(*) FROM module_definitions), (SELECT COUNT(*) FROM plans),
        (SELECT COUNT(*) FROM add_ons), (SELECT COUNT(*) FROM subscriptions),
        (SELECT COUNT(*) FROM entitlement_overrides),
        (SELECT COUNT(*) FROM commercial_runtime_authority)) AS state
    `);
    const report = await runCommercialPreflight({ source, database, now: at });
    const afterCounts = await database.query<{ state: string }>(`
      SELECT concat_ws(':',
        (SELECT COUNT(*) FROM module_definitions), (SELECT COUNT(*) FROM plans),
        (SELECT COUNT(*) FROM add_ons), (SELECT COUNT(*) FROM subscriptions),
        (SELECT COUNT(*) FROM entitlement_overrides),
        (SELECT COUNT(*) FROM commercial_runtime_authority)) AS state
    `);
    assert.equal(report.ready, true, report.blockers.join('\n'));
    assert.equal(report.checked.organizationsEvaluated, 2);
    assert.equal(beforeCounts.rows[0]?.state, afterCounts.rows[0]?.state);
  });

  await context.test('plan, active add-ons, explicit grant, catalogue, and limits are PostgreSQL-backed', async () => {
    const stateA = await entitlements.getEffective(organizationA);
    const stateB = await entitlements.getEffective(organizationB);
    assert.deepEqual(enabled(stateA), ['inventory', 'ledger', 'queue']);
    assert.deepEqual(enabled(stateB), []);
    assert.equal(stateA.limits.staff, 13);
    assert.equal(stateA.limits.storageMb, 250);
    assert.equal(stateA.organizationId, organizationA);
    const catalogue = await repository.getPublicCatalogue();
    assert.ok(catalogue.modules.some(({ key }) => key === MODULES.ATTENDANCE));
    assert.ok(catalogue.plans.some(({ key }) => key === 'pilot-core'));
    assert.ok(catalogue.addOns.some(({ key }) => key === 'capacity-pack'));
  });

  await context.test('operator subscription mutation is transactional, PG-only, and tenant-isolated', async () => {
    await administration.updateSubscription(organizationB, userA, {
      planKey: 'pilot-core', addOns: [], status: 'active', source: 'manual',
      startsAt: before.toISOString(), currentPeriodEndsAt: after.toISOString(),
      billingCycle: 'monthly',
    });
    assert.deepEqual(enabled(await entitlements.getEffective(organizationB)), ['queue']);
    assert.deepEqual(enabled(await entitlements.getEffective(organizationA)), ['inventory', 'ledger', 'queue']);
    assert.equal(await Subscription.countDocuments({}), 0);
    const row = await database.query<{ status: string }>(
      'SELECT status FROM subscriptions WHERE organization_id = $1', [organizationB],
    );
    assert.equal(row.rows[0]?.status, 'active');
  });

  await context.test('explicit grant and revocation precedence remain organization-scoped and PG-only', async () => {
    await administration.upsertEntitlement(organizationB, userA, MODULES.ATTENDANCE, {
      effect: 'grant', status: 'active', source: 'support', reason: 'B attendance pilot',
    });
    await administration.upsertEntitlement(organizationA, userA, MODULES.QUEUE, {
      effect: 'revoke', status: 'active', source: 'support', reason: 'A queue revocation',
    });
    assert.deepEqual(enabled(await entitlements.getEffective(organizationA)), ['inventory', 'ledger']);
    assert.deepEqual(enabled(await entitlements.getEffective(organizationB)), ['attendance', 'queue']);
    assert.equal(await Entitlement.countDocuments({}), 0);
  });

  await context.test('inactive and expired add-ons fail closed without affecting another organization', async () => {
    await database.query("UPDATE add_ons SET status = 'inactive' WHERE key = 'module-inventory'");
    assert.equal(enabled(await entitlements.getEffective(organizationA)).includes('inventory'), false);
    await database.query("UPDATE add_ons SET status = 'active' WHERE key = 'module-inventory'");
    await administration.updateSubscription(organizationA, userA, {
      planKey: 'pilot-core', status: 'active', source: 'pilot',
      startsAt: before.toISOString(), currentPeriodEndsAt: after.toISOString(),
      addOns: [{ key: 'module-inventory', startsAt: before.toISOString(), endsAt: before.toISOString() }],
    }).then(
      () => assert.fail('invalid equal window should fail'),
      () => undefined,
    );
    await administration.updateSubscription(organizationA, userA, {
      planKey: 'pilot-core', status: 'active', source: 'pilot',
      startsAt: before.toISOString(), currentPeriodEndsAt: after.toISOString(),
      addOns: [{
        key: 'module-inventory',
        startsAt: new Date('2026-09-15T03:00:00.000Z').toISOString(),
        endsAt: new Date('2026-09-15T04:00:00.000Z').toISOString(),
      }],
    });
    assert.equal(enabled(await entitlements.getEffective(organizationA)).includes('inventory'), false);
    assert.deepEqual(enabled(await entitlements.getEffective(organizationB)), ['attendance', 'queue']);
  });

  await context.test('expired overrides and suspended/cancelled subscriptions fail closed at request time', async () => {
    await administration.upsertEntitlement(organizationA, userA, MODULES.LEDGER, {
      effect: 'grant', status: 'active', source: 'pilot', reason: 'Expired ledger pilot',
      validFrom: new Date('2026-09-15T03:00:00.000Z').toISOString(),
      validUntil: new Date('2026-09-15T04:00:00.000Z').toISOString(),
    });
    assert.equal(enabled(await entitlements.getEffective(organizationA)).includes('ledger'), false);
    for (const status of ['suspended', 'cancelled'] as const) {
      await administration.updateSubscription(organizationA, userA, {
        planKey: 'pilot-core', addOns: [], status, source: 'manual',
        startsAt: before.toISOString(), currentPeriodEndsAt: after.toISOString(),
      });
      assert.equal(enabled(await entitlements.getEffective(organizationA)).includes('queue'), false);
      assert.deepEqual(enabled(await entitlements.getEffective(organizationB)), ['attendance', 'queue']);
    }
  });

  await context.test('tenant switching recomputes PostgreSQL entitlements for the selected organization', async () => {
    const identities = new PostgresIdentityRepository(database, entitlements);
    const identity = await identities.findById(userA);
    assert.ok(identity);
    const contextA = await identities.buildContext(identity, { organizationId: organizationA });
    const contextB = await identities.buildContext(identity, { organizationId: organizationB });
    assert.equal(contextA.entitlements.organizationId, organizationA);
    assert.equal(contextB.entitlements.organizationId, organizationB);
    assert.equal(enabled(contextA.entitlements).includes('queue'), false);
    assert.deepEqual(enabled(contextB.entitlements), ['attendance', 'queue']);
  });

  await context.test('PostgreSQL catalogue reconciliation is idempotent and does not rewrite subscriptions', async () => {
    const beforeSubscriptions = await database.query<{ id: string; organization_id: string }>(
      'SELECT id, organization_id FROM subscriptions ORDER BY organization_id',
    );
    const first = await repository.reconcileCatalogue();
    const second = await repository.reconcileCatalogue();
    const afterSubscriptions = await database.query<{ id: string; organization_id: string }>(
      'SELECT id, organization_id FROM subscriptions ORDER BY organization_id',
    );
    assert.deepEqual(first, { modules: 4, plans: 2, addOns: 4 });
    assert.deepEqual(second, first);
    assert.deepEqual(afterSubscriptions.rows, beforeSubscriptions.rows);
  });

  assert.equal(await Subscription.countDocuments({}), 0);
  assert.equal(await Entitlement.countDocuments({}), 0);
});
