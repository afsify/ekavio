import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createCommercialAdministrationService } from '../src/services/commercialAdministrationService.js';
import type { EffectiveEntitlements } from '../src/services/entitlementService.js';

const emptyEffective = (organizationId: string): EffectiveEntitlements => ({
  organizationId,
  subscription: null,
  modules: [],
  limits: { staff: null, branches: null, storageMb: null, documents: null, automationRuns: null },
});

test('runtime commercial composition is PostgreSQL and imports no Mongo commercial model', async () => {
  const files = await Promise.all([
    '../src/persistence/runtimePersistence.ts',
    '../src/services/entitlementService.ts',
    '../src/services/commercialAdministrationService.ts',
    '../src/services/commercialCatalogueService.ts',
    '../src/controllers/billingController.ts',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  const source = files.join('\n');
  assert.match(files[0]!, /commercialAuthority: 'postgresql'/);
  assert.match(files[0]!, /new PostgresCommercialRepository/);
  for (const model of ['ModuleDefinition', 'Plan', 'AddOn', 'Subscription', 'Entitlement']) {
    assert.equal(source.includes(`models/${model}`), false, model);
  }
  assert.doesNotMatch(source, /PostgresMongoCommercialIdentityBridge|organizationToLegacy/);
});

test('catalogue bootstrap is PostgreSQL-only and legacy Mongo reconciliation is explicit', async () => {
  const runtimeScript = await readFile(
    new URL('../src/scripts/bootstrapCommercialCatalogue.ts', import.meta.url),
    'utf8',
  );
  const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  assert.match(runtimeScript, /runtimePersistence\.commercial\.reconcileCatalogue/);
  assert.doesNotMatch(runtimeScript, /connectDB|mongoose|models\//);
  assert.match(packageJson, /entitlements:catalogue:mongo-legacy/);
});

test('commercial administration writes once through its repository and then rehydrates', async () => {
  const writes: string[] = [];
  const reads: string[] = [];
  const service = createCommercialAdministrationService({
    async updateSubscription(organizationId) { writes.push(`subscription:${organizationId}`); },
    async upsertEntitlement(organizationId, _actorUserId, moduleKey) {
      writes.push(`entitlement:${organizationId}:${moduleKey}`);
    },
  }, {
    async getEffective(organizationId) {
      reads.push(organizationId);
      return emptyEffective(organizationId);
    },
  });
  await service.updateSubscription('organization-a', 'operator', {
    planKey: null, addOns: [], status: 'active', source: 'manual',
  });
  await service.upsertEntitlement('organization-b', 'operator', 'queue', {
    effect: 'grant', status: 'active', source: 'manual', reason: 'pilot',
  });
  assert.deepEqual(writes, ['subscription:organization-a', 'entitlement:organization-b:queue']);
  assert.deepEqual(reads, ['organization-a', 'organization-b']);
});

test('normal post-cutover shadow apply contains a durable refusal guard and explicit recovery flag', async () => {
  const [repository, script] = await Promise.all([
    readFile(new URL('../src/postgres/sharedCoreRepository.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/scripts/postgresShadow.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(repository, /isCommercialAuthorityActivated/);
  assert.match(repository, /Shadow apply refused/);
  assert.match(script, /--recover-commercial-authority/);
  assert.match(script, /allowCommercialRecovery/);
});
