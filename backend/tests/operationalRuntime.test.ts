import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { authorizationRooms, branchRoom } from '../src/config/socket.js';
import { runtimePersistence } from '../src/persistence/runtimePersistence.js';
import { permissionsForRole, permissions } from '../src/services/authorizationPolicy.js';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('B2 production composition has PostgreSQL Queue authority with no Mongo fallback', () => {
  const composition = read('../src/persistence/runtimePersistence.ts');
  const service = read('../src/services/operationalRuntimeService.ts');
  const queueController = read('../src/controllers/queueController.ts');
  const analytics = read('../src/controllers/analyticsController.ts');
  assert.equal(runtimePersistence.operationalAuthority, 'postgresql');
  for (const source of [composition, service, queueController, analytics]) {
    assert.doesNotMatch(source, /models\/Queue|Queue\.find|Queue\.create|Queue\.countDocuments/);
  }
  assert.match(composition, /PostgresQueueRepository/);
});

test('B2 route boundaries preserve separate entitlement and Queue permissions', () => {
  for (const path of ['../src/routes/customerRoutes.ts', '../src/routes/serviceRoutes.ts', '../src/routes/appointmentRoutes.ts', '../src/routes/queueRoutes.ts']) {
    const source = read(path);
    assert.match(source, /requireEntitlement\(MODULES\.QUEUE\)/);
    assert.match(source, /permissions\.QUEUE_(READ|MANAGE)/);
  }
  assert.equal(permissionsForRole('hr').includes(permissions.QUEUE_MANAGE), false);
});

test('realtime Queue events are branch-scoped and PII-minimized', () => {
  const source = read('../src/controllers/queueController.ts');
  assert.match(source, /queue\.token\.created/);
  assert.match(source, /queue\.token\.status_changed/);
  const emitBody = source.slice(source.indexOf('const emitToken'), source.indexOf('export const createToken'));
  assert.doesNotMatch(emitBody, /phone|customer_name|notes/);
  assert.deepEqual(authorizationRooms({
    userId: 'u', sessionId: 's', organizationId: 'o', membershipId: 'm',
    branchId: 'a1', role: 'staff', permissions: [], platformOperator: false,
  }), ['organization:o', branchRoom('a1')]);
  assert.notEqual(branchRoom('a1'), branchRoom('a2'));
});

test('frontend Queue contract contains canonical UUID fields and no legacy event or free-form authority', () => {
  const page = read('../../frontend/src/pages/Queue/QueuePage.tsx');
  const hook = read('../../frontend/src/hooks/useQueue.ts');
  for (const source of [page, hook]) {
    assert.doesNotMatch(source, /queue_updated|serviceType|customTokenNumber|\b_id\b/);
  }
  assert.match(hook, /customerId/);
  assert.match(hook, /serviceId/);
  assert.match(hook, /expectedVersion/);
});

test('post-cutover shadow apply has a durable authority latch and explicit recovery mode', () => {
  const migration = read('../src/domains/queue/migration.ts');
  const script = read('../src/scripts/operationalQueueShadow.ts');
  assert.match(migration, /isOperationalAuthorityActivated/);
  assert.match(migration, /allowOperationalRecovery/);
  assert.match(script, /--recover-operational-authority/);
});
