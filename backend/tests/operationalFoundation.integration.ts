import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PostgresAppointmentRepository } from '../src/domains/appointments/repository.js';
import { branchLocalDateTimeToInstant } from '../src/domains/appointments/timezone.js';
import { PostgresCustomerRepository } from '../src/domains/customers/repository.js';
import { PostgresQueueRepository } from '../src/domains/queue/repository.js';
import { PostgresServiceRepository } from '../src/domains/services/repository.js';
import { PostgresDatabase } from '../src/postgres/database.js';
import { migrate } from '../src/postgres/migrations.js';

const ids = {
  organizationA: '10000000-0000-4000-8000-000000000001',
  organizationB: '10000000-0000-4000-8000-000000000002',
  branchA: '20000000-0000-4000-8000-000000000001',
  branchA2: '20000000-0000-4000-8000-000000000002',
  branchB: '20000000-0000-4000-8000-000000000003',
  userA: '30000000-0000-4000-8000-000000000001',
  userInactive: '30000000-0000-4000-8000-000000000002',
  userB: '30000000-0000-4000-8000-000000000003',
  membershipA: '40000000-0000-4000-8000-000000000001',
  membershipInactive: '40000000-0000-4000-8000-000000000002',
  membershipB: '40000000-0000-4000-8000-000000000003',
} as const;

test('V2-06B1 operational PostgreSQL foundation enforces domain and concurrency invariants', async (context) => {
  const adminUrl = process.env.POSTGRES_TEST_URL;
  assert.ok(adminUrl, 'POSTGRES_TEST_URL is required');
  const parsed = new URL(adminUrl);
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(parsed.hostname) && parsed.pathname === '/postgres');
  const databaseName = `ekavio_v206b1_${randomUUID().replaceAll('-', '')}`;
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

  await migrate(database);
  const at = new Date('2026-09-17T00:00:00.000Z');
  await database.query(`
    INSERT INTO users (id, name, phone, created_at, updated_at) VALUES
      ($1, 'Active Provider', '+910000000001', $4, $4),
      ($2, 'Inactive Provider', '+910000000002', $4, $4),
      ($3, 'Foreign Provider', '+910000000003', $4, $4)
  `, [ids.userA, ids.userInactive, ids.userB, at]);
  await database.query(`
    INSERT INTO organizations (
      id, name, type, theme_mode, theme_primary_color, created_at, updated_at
    ) VALUES
      ($1, 'Alpha', 'clinic', 'light', '#111111', $3, $3),
      ($2, 'Beta', 'clinic', 'light', '#222222', $3, $3)
  `, [ids.organizationA, ids.organizationB, at]);
  await database.query(`
    INSERT INTO branches (
      id, organization_id, name, code, status, timezone, created_at, updated_at
    ) VALUES
      ($1, $4, 'Alpha Main', 'main', 'active', 'Asia/Kolkata', $6, $6),
      ($2, $4, 'Alpha North', 'north', 'active', NULL, $6, $6),
      ($3, $5, 'Beta Main', 'main', 'active', 'Asia/Kolkata', $6, $6)
  `, [ids.branchA, ids.branchA2, ids.branchB, ids.organizationA, ids.organizationB, at]);
  await database.query(`
    INSERT INTO memberships (
      id, user_id, organization_id, role, status, created_at, updated_at
    ) VALUES
      ($1, $4, $7, 'staff', 'active', $9, $9),
      ($2, $5, $7, 'staff', 'inactive', $9, $9),
      ($3, $6, $8, 'staff', 'active', $9, $9)
  `, [
    ids.membershipA, ids.membershipInactive, ids.membershipB,
    ids.userA, ids.userInactive, ids.userB, ids.organizationA, ids.organizationB, at,
  ]);
  await database.query(`
    INSERT INTO membership_branch_assignments (membership_id, branch_id, organization_id) VALUES
      ($1, $4, $6), ($2, $4, $6), ($3, $5, $7)
  `, [
    ids.membershipA, ids.membershipInactive, ids.membershipB,
    ids.branchA, ids.branchB, ids.organizationA, ids.organizationB,
  ]);

  const customers = new PostgresCustomerRepository(database);
  const services = new PostgresServiceRepository(database);
  const appointments = new PostgresAppointmentRepository(database);
  const queue = new PostgresQueueRepository(database);

  const customerA = await customers.create({
    organizationId: ids.organizationA, name: 'Alice', phone: '9876543210',
    phonePolicy: { defaultCallingCode: '+91' }, homeBranchId: ids.branchA,
  });
  const customerDuplicatePhone = await customers.create({
    organizationId: ids.organizationA, name: 'Alice Family', phone: '+919876543210',
  });
  assert.notEqual(customerA.id, customerDuplicatePhone.id, 'phone equality must not merge customers');
  assert.equal(customerA.normalized_phone, customerDuplicatePhone.normalized_phone);
  await customers.merge({
    organizationId: ids.organizationA,
    sourceCustomerId: customerDuplicatePhone.id,
    targetCustomerId: customerA.id,
  });
  const mergedCustomer = await database.query<{ status: string; merged_into_customer_id: string | null }>(`
    SELECT status, merged_into_customer_id FROM customers WHERE id = $1
  `, [customerDuplicatePhone.id]);
  assert.deepEqual(mergedCustomer.rows[0], { status: 'merged', merged_into_customer_id: customerA.id });
  const customerB = await customers.create({
    organizationId: ids.organizationB, name: 'Foreign', phone: '+919111111111',
    homeBranchId: ids.branchB,
  });
  await assert.rejects(customers.create({
    organizationId: ids.organizationA, name: 'Cross branch', phone: '+919222222222',
    homeBranchId: ids.branchB,
  }));
  await assert.rejects(customers.merge({
    organizationId: ids.organizationA,
    sourceCustomerId: customerA.id,
    targetCustomerId: customerB.id,
  }), /Both customers/);

  const service = await services.create({
    organizationId: ids.organizationA,
    name: 'Consultation', durationMinutes: 30, priceMinor: 12345n, currency: 'inr',
  });
  assert.equal(service.price_minor, '12345');
  assert.equal(service.currency, 'INR');
  await services.setBranchAvailability({
    organizationId: ids.organizationA, serviceId: service.id, branchId: ids.branchA, active: true,
  });
  await assert.rejects(services.setBranchAvailability({
    organizationId: ids.organizationA, serviceId: service.id, branchId: ids.branchB, active: true,
  }));
  await assert.rejects(services.setBranchAvailability({
    organizationId: ids.organizationB, serviceId: service.id, branchId: ids.branchA, active: false,
  }), /scope conflict/);
  await services.assignProvider({
    organizationId: ids.organizationA, membershipId: ids.membershipA,
    serviceId: service.id, branchId: ids.branchA, active: true,
  });
  await assert.rejects(services.assignProvider({
    organizationId: ids.organizationA, membershipId: ids.membershipInactive,
    serviceId: service.id, branchId: ids.branchA, active: true,
  }), /active provider assignment/);

  const appointment = await appointments.create({
    organizationId: ids.organizationA, branchId: ids.branchA, customerId: customerA.id,
    serviceId: service.id, providerMembershipId: ids.membershipA,
    startsAt: branchLocalDateTimeToInstant('2026-09-18T09:00:00', 'Asia/Kolkata'),
    endsAt: branchLocalDateTimeToInstant('2026-09-18T09:30:00', 'Asia/Kolkata'),
    actorMembershipId: ids.membershipA,
  });
  const confirmed = await appointments.transition({
    organizationId: ids.organizationA, branchId: ids.branchA, appointmentId: appointment.id,
    toStatus: 'confirmed', expectedVersion: 1, actorMembershipId: ids.membershipA,
  });
  assert.equal(confirmed.version, 2);
  await assert.rejects(appointments.transition({
    organizationId: ids.organizationA, branchId: ids.branchA, appointmentId: appointment.id,
    toStatus: 'cancelled', expectedVersion: 1, actorMembershipId: ids.membershipA,
  }), /version conflict/);
  await assert.rejects(appointments.transition({
    organizationId: ids.organizationA, branchId: ids.branchA2, appointmentId: appointment.id,
    toStatus: 'cancelled', expectedVersion: 2, actorMembershipId: ids.membershipA,
  }), /active branch context/);
  await assert.rejects(database.query(
    "UPDATE appointment_status_events SET reason = 'tampered' WHERE appointment_id = $1",
    [appointment.id],
  ), /append-only/);

  const overlapInputs = [0, 1].map(() => appointments.create({
    organizationId: ids.organizationA, branchId: ids.branchA, customerId: customerA.id,
    serviceId: service.id, providerMembershipId: ids.membershipA,
    startsAt: branchLocalDateTimeToInstant('2026-09-18T11:00:00', 'Asia/Kolkata'),
    endsAt: branchLocalDateTimeToInstant('2026-09-18T11:30:00', 'Asia/Kolkata'),
    actorMembershipId: ids.membershipA,
  }));
  const overlapResults = await Promise.allSettled(overlapInputs);
  assert.equal(overlapResults.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(overlapResults.filter(({ status }) => status === 'rejected').length, 1);

  const session = await queue.openSession({
    organizationId: ids.organizationA, branchId: ids.branchA,
    localBusinessDate: '2026-09-18', laneKey: 'default',
  });
  const repeatedSession = await queue.openSession({
    organizationId: ids.organizationA, branchId: ids.branchA,
    localBusinessDate: '2026-09-18', laneKey: 'default',
  });
  assert.equal(repeatedSession.id, session.id);
  await assert.rejects(queue.openSession({
    organizationId: ids.organizationA, branchId: ids.branchA2,
    localBusinessDate: '2026-09-18', laneKey: 'default',
  }), /reviewed IANA timezone/);
  const concurrent = await Promise.all(Array.from({ length: 24 }, (_, index) => queue.createToken({
    organizationId: ids.organizationA, branchId: ids.branchA, sessionId: session.id,
    customerId: customerA.id, serviceId: service.id,
    idempotencyKey: `parallel-${index}`, actorMembershipId: ids.membershipA,
  })));
  assert.deepEqual(
    concurrent.map(({ token_number }) => Number(token_number)).sort((a, b) => a - b),
    Array.from({ length: 24 }, (_, index) => index + 1),
  );
  assert.equal(new Set(concurrent.map(({ token_number }) => token_number)).size, 24);
  const idempotentRetry = await queue.createToken({
    organizationId: ids.organizationA, branchId: ids.branchA, sessionId: session.id,
    customerId: customerA.id, serviceId: service.id,
    idempotencyKey: 'parallel-0', actorMembershipId: ids.membershipA,
  });
  assert.equal(idempotentRetry.id, concurrent[0]!.id);
  await assert.rejects(queue.createToken({
    organizationId: ids.organizationA, branchId: ids.branchA, sessionId: session.id,
    customerId: customerA.id, serviceId: service.id, providerMembershipId: ids.membershipA,
    idempotencyKey: 'parallel-0', actorMembershipId: ids.membershipA,
  }), /different queue operation/);
  const serving = await queue.transition({
    organizationId: ids.organizationA, branchId: ids.branchA, tokenId: concurrent[0]!.id,
    toStatus: 'serving', expectedVersion: 1, actorMembershipId: ids.membershipA,
  });
  assert.equal(serving.version, 2);
  await assert.rejects(queue.transition({
    organizationId: ids.organizationA, branchId: ids.branchA, tokenId: concurrent[1]!.id,
    toStatus: 'completed', expectedVersion: 1, actorMembershipId: ids.membershipA,
  }), /Invalid queue transition/);
  await assert.rejects(queue.transition({
    organizationId: ids.organizationA, branchId: ids.branchA2, tokenId: concurrent[1]!.id,
    toStatus: 'cancelled', expectedVersion: 1, actorMembershipId: ids.membershipA,
  }), /active branch context/);
  await assert.rejects(database.query(
    "DELETE FROM queue_status_events WHERE queue_token_id = $1",
    [concurrent[0]!.id],
  ), /append-only/);

  const checkInAppointment = await appointments.create({
    organizationId: ids.organizationA, branchId: ids.branchA, customerId: customerA.id,
    serviceId: service.id, providerMembershipId: ids.membershipA,
    startsAt: branchLocalDateTimeToInstant('2026-09-18T14:00:00', 'Asia/Kolkata'),
    endsAt: branchLocalDateTimeToInstant('2026-09-18T14:30:00', 'Asia/Kolkata'),
    actorMembershipId: ids.membershipA,
  });
  const checkedIn = await queue.checkInAppointment({
    organizationId: ids.organizationA, branchId: ids.branchA, sessionId: session.id,
    appointmentId: checkInAppointment.id, idempotencyKey: 'checkin-1',
    actorMembershipId: ids.membershipA,
  });
  const retry = await queue.checkInAppointment({
    organizationId: ids.organizationA, branchId: ids.branchA, sessionId: session.id,
    appointmentId: checkInAppointment.id, idempotencyKey: 'checkin-1',
    actorMembershipId: ids.membershipA,
  });
  assert.equal(retry.id, checkedIn.id);
  const appointmentTokens = await database.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM queue_tokens WHERE appointment_id = $1',
    [checkInAppointment.id],
  );
  assert.equal(appointmentTokens.rows[0]!.count, '1');
  await assert.rejects(queue.createToken({
    organizationId: ids.organizationA, branchId: ids.branchB, sessionId: session.id,
    customerId: customerA.id, serviceId: service.id,
    actorMembershipId: ids.membershipA,
  }), /session not found/);
  await database.query(
    "UPDATE memberships SET status = 'revoked', updated_at = NOW() WHERE id = $1",
    [ids.membershipA],
  );
  const deactivated = await database.query<{ active: boolean }>(`
    SELECT active FROM provider_service_assignments
    WHERE membership_id = $1 AND service_id = $2 AND branch_id = $3
  `, [ids.membershipA, service.id, ids.branchA]);
  assert.equal(deactivated.rows[0]!.active, false);
  await assert.rejects(services.assignProvider({
    organizationId: ids.organizationA, membershipId: ids.membershipA,
    serviceId: service.id, branchId: ids.branchA, active: true,
  }), /active provider assignment/);
});
