import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MODULES,
  initialModuleCatalogue,
  isModuleKey,
  moduleKeys,
  type LimitKey,
  type ModuleKey,
} from '../src/commercial/catalogue.js';
import {
  calculateEffectiveEntitlements,
  createEntitlementService,
  type AddOnGrantRecord,
  type CommercialSubscriptionRecord,
  type EntitlementRepository,
  type EntitlementSnapshot,
} from '../src/services/entitlementService.js';
import {
  canonicalizeLegacyModule,
  createEntitlementBackfill,
  type EntitlementBackfillCatalogue,
  type EntitlementBackfillRepository,
  type ImportedSubscriptionRecord,
  type LegacyCommercialOrganization,
} from '../src/services/entitlementBackfillService.js';
import { AppError } from '../src/utils/AppError.js';
import {
  updateSubscriptionSchema,
  upsertEntitlementSchema,
} from '../src/schemas/billingSchemas.js';

const now = new Date('2026-09-14T12:00:00.000Z');
const moduleDefinitions = initialModuleCatalogue.map((module) => ({ ...module }));

const plan = {
  key: 'test-plan',
  name: 'Test Plan',
  status: 'active' as const,
  moduleKeys: [MODULES.QUEUE],
  limits: [{ key: 'staff' as LimitKey, value: 5 }],
};

const addOn = (
  id: string,
  key: string,
  moduleKey: ModuleKey,
  limitAdjustments: AddOnGrantRecord['limitAdjustments'] = [],
): AddOnGrantRecord => ({
  id,
  key,
  name: key,
  status: 'active',
  moduleKeys: [moduleKey],
  limitAdjustments,
});

const subscription = (
  values: Partial<CommercialSubscriptionRecord> = {},
): CommercialSubscriptionRecord => ({
  id: 'subscription-a',
  status: 'active',
  source: 'manual',
  startsAt: new Date('2026-09-01T00:00:00.000Z'),
  plan,
  addOns: [],
  ...values,
});

const snapshot = (values: Partial<EntitlementSnapshot> = {}): EntitlementSnapshot => ({
  modules: moduleDefinitions,
  subscription: subscription(),
  overrides: [],
  ...values,
});

const isEnabled = (
  result: ReturnType<typeof calculateEffectiveEntitlements>,
  moduleKey: ModuleKey,
) => result.modules.find((module) => module.key === moduleKey)?.enabled === true;

test('canonical module catalogue contains unique operational IDs', () => {
  assert.deepEqual(moduleKeys, ['ledger', 'inventory', 'attendance', 'queue']);
  assert.equal(new Set(moduleKeys).size, moduleKeys.length);
  assert.equal(new Set(initialModuleCatalogue.map((module) => module.key)).size, moduleKeys.length);
});

test('legacy ledger names are migration aliases only', () => {
  assert.equal(isModuleKey('khata'), false);
  assert.equal(isModuleKey('digital-khata'), false);
  assert.equal(canonicalizeLegacyModule('khata'), MODULES.LEDGER);
  assert.equal(canonicalizeLegacyModule('digital-khata'), MODULES.LEDGER);
});

test('commercial validity windows compare ISO timestamps as instants', () => {
  const laterInstantWithEarlierClockText = {
    key: 'module-ledger',
    startsAt: '2026-09-14T12:00:00+05:30',
    endsAt: '2026-09-14T07:00:00Z',
  };
  assert.equal(updateSubscriptionSchema.safeParse({
    planKey: null,
    addOns: [laterInstantWithEarlierClockText],
    status: 'active',
    source: 'manual',
  }).success, true);
  assert.equal(upsertEntitlementSchema.safeParse({
    effect: 'grant',
    status: 'active',
    source: 'manual',
    reason: 'Timezone-aware validation',
    validFrom: laterInstantWithEarlierClockText.startsAt,
    validUntil: laterInstantWithEarlierClockText.endsAt,
  }).success, true);

  assert.equal(updateSubscriptionSchema.safeParse({
    planKey: null,
    addOns: [{
      key: 'module-ledger',
      startsAt: '2026-09-14T12:00:00+05:30',
      endsAt: '2026-09-14T06:00:00Z',
    }],
    status: 'active',
  }).success, false);
});

test('an active plan grants its canonical modules', () => {
  const result = calculateEffectiveEntitlements('org-a', snapshot(), now);
  assert.equal(isEnabled(result, MODULES.QUEUE), true);
  assert.deepEqual(
    result.modules.find((module) => module.key === MODULES.QUEUE)?.sources,
    ['plan:test-plan'],
  );
});

test('inactive, suspended, cancelled, and expired subscriptions grant no paid modules', () => {
  for (const status of ['inactive', 'suspended', 'cancelled'] as const) {
    const result = calculateEffectiveEntitlements(
      'org-a',
      snapshot({ subscription: subscription({ status }) }),
      now,
    );
    assert.equal(isEnabled(result, MODULES.QUEUE), false);
  }
  const expired = calculateEffectiveEntitlements(
    'org-a',
    snapshot({
      subscription: subscription({ currentPeriodEndsAt: new Date('2026-09-14T11:59:59.000Z') }),
    }),
    now,
  );
  assert.equal(expired.subscription?.status, 'expired');
  assert.equal(isEnabled(expired, MODULES.QUEUE), false);
});

test('an active add-on grants its module', () => {
  const inventoryAddOn = addOn('addon-inventory', 'module-inventory', MODULES.INVENTORY);
  const result = calculateEffectiveEntitlements(
    'org-a',
    snapshot({ subscription: subscription({ addOns: [{ addOn: inventoryAddOn }] }) }),
    now,
  );
  assert.equal(isEnabled(result, MODULES.INVENTORY), true);
});

test('expired add-ons and expired explicit grants do not grant access', () => {
  const attendanceAddOn = addOn('addon-attendance', 'module-attendance', MODULES.ATTENDANCE);
  const result = calculateEffectiveEntitlements(
    'org-a',
    snapshot({
      subscription: subscription({
        plan: undefined,
        addOns: [{ addOn: attendanceAddOn, endsAt: new Date('2026-09-14T11:00:00.000Z') }],
      }),
      overrides: [{
        moduleKey: MODULES.LEDGER,
        effect: 'grant',
        status: 'active',
        source: 'pilot',
        validUntil: new Date('2026-09-14T11:00:00.000Z'),
      }],
    }),
    now,
  );
  assert.equal(isEnabled(result, MODULES.ATTENDANCE), false);
  assert.equal(isEnabled(result, MODULES.LEDGER), false);
});

test('a valid explicit grant works without an active subscription', () => {
  const result = calculateEffectiveEntitlements(
    'org-a',
    snapshot({
      subscription: null,
      overrides: [{
        moduleKey: MODULES.LEDGER,
        effect: 'grant',
        status: 'active',
        source: 'pilot',
      }],
    }),
    now,
  );
  assert.equal(isEnabled(result, MODULES.LEDGER), true);
});

test('an explicit revocation overrides plan, add-on, and explicit grants', () => {
  const result = calculateEffectiveEntitlements(
    'org-a',
    snapshot({
      overrides: [
        { moduleKey: MODULES.QUEUE, effect: 'grant', status: 'active', source: 'support' },
        { moduleKey: MODULES.QUEUE, effect: 'revoke', status: 'active', source: 'manual' },
      ],
    }),
    now,
  );
  assert.equal(isEnabled(result, MODULES.QUEUE), false);
  assert.deepEqual(
    result.modules.find((module) => module.key === MODULES.QUEUE)?.sources,
    ['override:revoke'],
  );
});

test('effective limits are deterministic regardless of add-on order', () => {
  const first = addOn('a', 'a-addon', MODULES.INVENTORY, [
    { key: 'staff', mode: 'add', value: 2 },
    { key: 'storageMb', mode: 'override', value: 500 },
  ]);
  const second = addOn('b', 'b-addon', MODULES.LEDGER, [
    { key: 'staff', mode: 'override', value: 10 },
    { key: 'staff', mode: 'add', value: 3 },
  ]);
  const evaluate = (addOns: AddOnGrantRecord[]) => calculateEffectiveEntitlements(
    'org-a',
    snapshot({ subscription: subscription({ addOns: addOns.map((item) => ({ addOn: item })) }) }),
    now,
  ).limits;
  assert.deepEqual(evaluate([first, second]), evaluate([second, first]));
  assert.equal(evaluate([first, second]).staff, 15);
  assert.equal(evaluate([first, second]).storageMb, 500);
});

test('organization-scoped repositories cannot mix commercial state', async () => {
  const snapshots = new Map<string, EntitlementSnapshot>([
    ['org-a', snapshot()],
    ['org-b', snapshot({ subscription: null, overrides: [] })],
  ]);
  const repository: EntitlementRepository = {
    async loadSnapshot(organizationId) {
      return snapshots.get(organizationId)!;
    },
  };
  const service = createEntitlementService(repository, () => now);
  assert.equal(isEnabled(await service.getEffective('org-a'), MODULES.QUEUE), true);
  assert.equal(isEnabled(await service.getEffective('org-b'), MODULES.QUEUE), false);
});

class MemoryBackfillRepository implements EntitlementBackfillRepository {
  organizations: LegacyCommercialOrganization[] = [];
  subscriptions = new Map<string, ImportedSubscriptionRecord & { source: string }>();
  writes = 0;
  catalogue: EntitlementBackfillCatalogue = {
    legacyPlanId: 'legacy-plan',
    addOnIdByModule: new Map(moduleKeys.map((module) => [module, `addon:${module}`])),
  };

  async listLegacyOrganizations() { return this.organizations; }
  async loadCatalogue() { return this.catalogue; }
  async findSubscriptionSource(organizationId: string) {
    return this.subscriptions.get(organizationId)?.source ?? null;
  }
  async upsertImportedSubscription(record: ImportedSubscriptionRecord) {
    this.writes += 1;
    const created = !this.subscriptions.has(record.organizationId);
    this.subscriptions.set(record.organizationId, { ...record, source: 'import' });
    return created;
  }
}

const legacyOrganization = (
  values: Partial<LegacyCommercialOrganization> = {},
): LegacyCommercialOrganization => ({
  id: 'org-a',
  activeModules: ['queue', 'inventory'],
  subscriptionStatus: 'active',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  ...values,
});

test('legacy module migration preserves valid active access', async () => {
  const repository = new MemoryBackfillRepository();
  repository.organizations = [legacyOrganization()];
  await createEntitlementBackfill(repository, () => now)({ apply: true });
  assert.deepEqual(repository.subscriptions.get('org-a')?.addOnIds, [
    'addon:inventory',
    'addon:queue',
  ]);
  assert.equal(repository.subscriptions.get('org-a')?.status, 'active');
});

test('legacy khata aliases migrate to one ledger entitlement', async () => {
  const repository = new MemoryBackfillRepository();
  repository.organizations = [legacyOrganization({ activeModules: ['khata', 'digital-khata'] })];
  await createEntitlementBackfill(repository, () => now)({ apply: true });
  assert.deepEqual(repository.subscriptions.get('org-a')?.addOnIds, ['addon:ledger']);
});

test('entitlement migration is idempotent and does not duplicate subscriptions', async () => {
  const repository = new MemoryBackfillRepository();
  repository.organizations = [legacyOrganization()];
  const backfill = createEntitlementBackfill(repository, () => now);
  assert.equal((await backfill({ apply: true })).subscriptionsCreated, 1);
  assert.equal((await backfill({ apply: true })).subscriptionsCreated, 0);
  assert.equal(repository.subscriptions.size, 1);
});

test('unknown legacy module IDs are reported and apply stops before writes', async () => {
  const repository = new MemoryBackfillRepository();
  repository.organizations = [legacyOrganization({ activeModules: ['queue', 'mystery-module'] })];
  const backfill = createEntitlementBackfill(repository, () => now);
  const preview = await backfill();
  assert.deepEqual(preview.unknownModules, [{ organizationId: 'org-a', module: 'mystery-module' }]);
  await assert.rejects(
    () => backfill({ apply: true }),
    (error: unknown) => error instanceof AppError && error.statusCode === 409,
  );
  assert.equal(repository.writes, 0);
});

test('suspended legacy organizations stay suspended after migration', async () => {
  const repository = new MemoryBackfillRepository();
  repository.organizations = [legacyOrganization({ subscriptionStatus: 'suspended' })];
  await createEntitlementBackfill(repository, () => now)({ apply: true });
  assert.equal(repository.subscriptions.get('org-a')?.status, 'suspended');
});
