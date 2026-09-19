import assert from 'node:assert/strict';
import test from 'node:test';
import { canTransitionAppointment } from '../src/domains/appointments/repository.js';
import {
  branchLocalDateTimeToInstant,
  instantToBranchLocalDateTime,
} from '../src/domains/appointments/timezone.js';
import { normalizeCustomerName, normalizePhone } from '../src/domains/customers/normalization.js';
import { buildOperationalMigrationPlan } from '../src/domains/queue/migrationPlan.js';
import type {
  OperationalLegacySnapshot,
  OperationalMigrationMapping,
} from '../src/domains/queue/migrationTypes.js';
import { canTransitionQueueToken } from '../src/domains/queue/repository.js';
import { normalizeServiceName } from '../src/domains/services/normalization.js';
import { runtimePersistence } from '../src/persistence/runtimePersistence.js';

const at = new Date('2026-09-17T04:30:00.000Z');
const organizationId = '10000000-0000-4000-8000-000000000001';
const branchId = '20000000-0000-4000-8000-000000000001';
const legacyOrganizationId = '100000000000000000000001';

const mapping = (): OperationalMigrationMapping => ({
  version: 1,
  organizations: [{
    legacyOrganizationId,
    organizationId,
    branchId,
    timezone: 'Asia/Kolkata',
    defaultCallingCode: '+91',
    defaultServiceDurationMinutes: 30,
    customerGroups: {},
    serviceResolutions: {},
    sessionPolicy: { mode: 'created-at-local-date', laneKey: 'default', status: 'closed' },
    queueSessionOverrides: {},
  }],
});

const queueRow = (overrides: Partial<OperationalLegacySnapshot['queue'][number]> = {}) => ({
  id: '200000000000000000000001', legacyOrganizationId, tokenLabel: '#1',
  customerName: '  Alice   Joseph ', phone: '09876543210', serviceType: ' Consultation ',
  status: 'waiting', createdAt: at, updatedAt: at, ...overrides,
});

test('customer and service normalization is deterministic without imposing phone uniqueness', () => {
  assert.deepEqual(normalizeCustomerName('  A\u00a0 B  '), { display: 'A B', key: 'a b' });
  assert.equal(normalizePhone('00 91-98765 43210'), '+919876543210');
  assert.equal(normalizePhone('09876543210', { defaultCallingCode: '+91' }), '+919876543210');
  assert.throws(() => normalizePhone('09876543210'), /reviewed default calling code/);
  assert.deepEqual(normalizeServiceName('  Hair   Cut '), { display: 'Hair Cut', key: 'hair cut' });
});

test('branch-local time conversion persists an instant and rejects DST gaps and ambiguity', () => {
  const instant = branchLocalDateTimeToInstant('2026-09-17T10:00:00', 'Asia/Kolkata');
  assert.equal(instant.toISOString(), '2026-09-17T04:30:00.000Z');
  assert.equal(instantToBranchLocalDateTime(instant, 'Asia/Kolkata'), '2026-09-17T10:00:00');
  assert.throws(
    () => branchLocalDateTimeToInstant('2026-03-08T02:30:00', 'America/New_York'),
    /does not exist/,
  );
  assert.throws(
    () => branchLocalDateTimeToInstant('2026-11-01T01:30:00', 'America/New_York'),
    /ambiguous/,
  );
  assert.throws(() => branchLocalDateTimeToInstant('2026-02-30T10:00', 'Asia/Kolkata'), /invalid calendar/);
  assert.throws(() => branchLocalDateTimeToInstant('2026-01-01T10:00', 'Mars/Olympus'), /Invalid IANA/);
});

test('appointment and Queue transitions are explicit and terminal states remain terminal', () => {
  assert.equal(canTransitionAppointment('scheduled', 'confirmed'), true);
  assert.equal(canTransitionAppointment('scheduled', 'completed'), false);
  assert.equal(canTransitionAppointment('completed', 'cancelled'), false);
  assert.equal(canTransitionQueueToken('waiting', 'serving'), true);
  assert.equal(canTransitionQueueToken('waiting', 'completed'), false);
  assert.equal(canTransitionQueueToken('completed', 'waiting'), false);
});

test('migration planning detects ambiguous customers, service collisions, and duplicate session labels', () => {
  const snapshot: OperationalLegacySnapshot = {
    queue: [
      queueRow(),
      queueRow({
        id: '200000000000000000000002', customerName: 'Bob',
        serviceType: 'consultation', tokenLabel: '#1',
      }),
    ],
    ledgerCustomers: [],
  };
  const plan = buildOperationalMigrationPlan(snapshot, mapping());
  assert.ok(plan.issues.some(({ code }) => code === 'ambiguous_customer'));
  assert.ok(plan.issues.some(({ code }) => code === 'service_collision'));
  assert.ok(plan.issues.some(({ code }) => code === 'duplicate_session_token'));
});

test('Mongo remains the source-controlled Queue runtime authority in B1', () => {
  assert.equal(runtimePersistence.operationalAuthority, 'mongodb');
});
