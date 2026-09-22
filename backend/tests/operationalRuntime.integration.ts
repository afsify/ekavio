import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { initializeRuntimeConfig } from '../src/config/env.js';
import { Queue } from '../src/models/Queue.js';
import { PostgresAccountRepository } from '../src/postgres/accountRepository.js';
import { PostgresCommercialRepository } from '../src/postgres/commercialRepository.js';
import { PostgresDatabase } from '../src/postgres/database.js';
import { migrate } from '../src/postgres/migrations.js';
import { PostgresSessionRepository } from '../src/postgres/sessionRepository.js';
import { runtimePostgresDatabase } from '../src/persistence/runtimePersistence.js';

// Integration assertions intentionally traverse heterogeneous JSON route payloads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ApiResult { status: number; body: any }

test('V2-06B2 Express runtime is PostgreSQL-only, isolated, concurrent, and idempotent', async (context) => {
  const postgresAdminUrl = process.env.POSTGRES_TEST_URL;
  const mongoAdminUrl = process.env.MONGO_TEST_URL;
  assert.ok(postgresAdminUrl, 'POSTGRES_TEST_URL is required');
  assert.ok(mongoAdminUrl, 'MONGO_TEST_URL is required');
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(new URL(postgresAdminUrl).hostname));
  assert.ok(['localhost', '127.0.0.1', 'mongo'].includes(new URL(mongoAdminUrl).hostname));

  const suffix = randomUUID().replaceAll('-', '');
  const databaseName = `ekavio_v206b2_${suffix}`;
  const admin = new PostgresDatabase(postgresAdminUrl);
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const databaseUrl = new URL(postgresAdminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const database = new PostgresDatabase(databaseUrl.toString());
  const mongoUrl = new URL(mongoAdminUrl);
  mongoUrl.pathname = `/ekavio_v206b2_${suffix}`;
  await mongoose.connect(mongoUrl.toString(), { serverSelectionTimeoutMS: 10_000 });
  await migrate(database);

  const jwtSecret = 'v2-06b2-api-test-secret';
  const config = initializeRuntimeConfig({
    NODE_ENV: 'test',
    PORT: '5000',
    MONGO_URI: mongoUrl.toString(),
    DATABASE_URL: databaseUrl.toString(),
    JWT_SECRET: jwtSecret,
    REFRESH_TOKEN_SECRET: 'v2-06b2-refresh-test-secret',
    HTTP_ALLOWED_ORIGINS: 'http://localhost:5173',
    SOCKET_ALLOWED_ORIGINS: 'http://localhost:5173',
  });
  const server = http.createServer(createApp({ config }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}/api`;

  context.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await Promise.allSettled([runtimePostgresDatabase.close(), database.close()]);
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]);
    await admin.query(`DROP DATABASE "${databaseName}"`);
    await admin.close();
  });

  const accounts = new PostgresAccountRepository(database);
  const register = async (name: string, phone: string) => {
    const result = await accounts.registerAdmin({
      orgName: name, orgType: 'clinic', userName: `${name} Owner`, phone, passwordHash: 'test-hash',
    });
    return {
      organizationId: String((result.organization as { id: string }).id),
      branchId: String((result.branch as { id: string }).id),
      userId: String(result.user.id),
    };
  };
  const organizationA = await register('Runtime A', 'runtime-a');
  const organizationB = await register('Runtime B', 'runtime-b');
  await database.query('UPDATE branches SET timezone = $1 WHERE id = ANY($2::uuid[])', [
    'Asia/Kolkata', [organizationA.branchId, organizationB.branchId],
  ]);
  const branchA2 = (await database.query<{ id: string }>(`
    INSERT INTO branches (organization_id, name, code, status, timezone, created_at, updated_at)
    VALUES ($1, 'A Second', 'second', 'active', 'Asia/Kolkata', NOW(), NOW()) RETURNING id
  `, [organizationA.organizationId])).rows[0]!.id;
  const membershipA = (await database.query<{ id: string }>(
    'SELECT id FROM memberships WHERE organization_id = $1 AND user_id = $2',
    [organizationA.organizationId, organizationA.userId],
  )).rows[0]!.id;
  const membershipB = (await database.query<{ id: string }>(
    'SELECT id FROM memberships WHERE organization_id = $1 AND user_id = $2',
    [organizationB.organizationId, organizationB.userId],
  )).rows[0]!.id;
  await database.query(`
    INSERT INTO membership_branch_assignments (membership_id, branch_id, organization_id)
    VALUES ($1, $2, $3)
  `, [membershipA, branchA2, organizationA.organizationId]);

  const commercial = new PostgresCommercialRepository(database);
  await commercial.reconcileCatalogue();
  await commercial.upsertEntitlement(organizationA.organizationId, organizationA.userId, 'queue', {
    effect: 'grant', status: 'active', source: 'pilot', reason: 'B2 API fixture',
  });
  await commercial.upsertEntitlement(organizationB.organizationId, organizationB.userId, 'queue', {
    effect: 'grant', status: 'active', source: 'pilot', reason: 'B2 API fixture',
  });

  const sessions = new PostgresSessionRepository(database);
  const createToken = async (identity: typeof organizationA) => {
    const sessionId = randomUUID().replaceAll('-', '');
    await sessions.create({
      sessionId,
      userId: identity.userId,
      refreshTokenHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 3_600_000),
      lastUsedAt: new Date(),
      revokedAt: null,
    });
    return jwt.sign({ id: identity.userId, tenantId: identity.organizationId, sessionId }, jwtSecret);
  };
  const tokenA = await createToken(organizationA);
  const tokenB = await createToken(organizationB);
  const request = async (
    path: string,
    options: { method?: string; token?: string; organizationId?: string; branchId?: string; body?: unknown } = {},
  ): Promise<ApiResult> => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        authorization: `Bearer ${options.token ?? tokenA}`,
        'content-type': 'application/json',
        'x-tenant-id': options.organizationId ?? organizationA.organizationId,
        'x-branch-id': options.branchId ?? organizationA.branchId,
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };

  const mongoQueueBefore = await Queue.countDocuments({});
  const customerA = await request('/customers', { method: 'POST', body: { name: 'Alice', phone: '+919876543210' } });
  assert.equal(customerA.status, 201, JSON.stringify(customerA.body));
  const duplicatePhone = await request('/customers', { method: 'POST', body: { name: 'Alice Family', phone: '+919876543210' } });
  assert.equal(duplicatePhone.status, 201);
  assert.notEqual(customerA.body.data.id, duplicatePhone.body.data.id);
  const customerSearch = await request('/customers?search=9876543210');
  assert.equal(customerSearch.body.pagination.total, 2);

  const serviceA = await request('/services', { method: 'POST', body: {
    name: 'Consultation', durationMinutes: 30, priceMinor: '2500', currency: 'INR',
  } });
  assert.equal(serviceA.status, 201, JSON.stringify(serviceA.body));
  assert.equal((await request('/services', { branchId: branchA2 })).body.data.length, 0);
  assert.equal((await request(`/services/${serviceA.body.data.id}/providers`, { method: 'PUT', body: {
    membershipId: membershipA, active: true,
  } })).status, 204);

  const queueCreates = await Promise.all(Array.from({ length: 12 }, (_, index) => request('/queue', {
    method: 'POST', body: {
      customerId: customerA.body.data.id,
      serviceId: serviceA.body.data.id,
      idempotencyKey: `api-concurrent-${index}`,
    },
  })));
  assert.equal(queueCreates.every(({ status }) => status === 201), true, JSON.stringify(queueCreates));
  assert.deepEqual(
    queueCreates.map(({ body }) => Number(body.data.tokenNumber)).sort((a, b) => a - b),
    Array.from({ length: 12 }, (_, index) => index + 1),
  );
  const repeatedQueueCreate = await request('/queue', {
    method: 'POST', body: {
      customerId: customerA.body.data.id,
      serviceId: serviceA.body.data.id,
      idempotencyKey: 'api-concurrent-0',
    },
  });
  assert.equal(repeatedQueueCreate.status, 200);
  assert.equal(repeatedQueueCreate.body.data.id, queueCreates[0]!.body.data.id);
  const queueA1 = await request('/queue?limit=5&page=1');
  assert.equal(queueA1.body.pagination.total, 12);
  assert.equal(queueA1.body.data.length, 5);
  assert.equal((await request('/queue', { branchId: branchA2 })).body.pagination.total, 0);
  assert.equal((await request('/queue', {
    token: tokenB, organizationId: organizationB.organizationId, branchId: organizationB.branchId,
  })).body.pagination.total, 0);

  const firstToken = queueCreates[0]!.body.data;
  assert.equal((await request(`/queue/${firstToken.id}/status`, { method: 'PATCH', body: {
    status: 'serving', expectedVersion: firstToken.version,
  } })).status, 200);
  assert.equal((await request(`/queue/${firstToken.id}/status`, { method: 'PATCH', body: {
    status: 'cancelled', expectedVersion: firstToken.version,
  } })).status, 409);
  assert.equal((await request(`/queue/${queueCreates[1]!.body.data.id}/status`, { method: 'PATCH', body: {
    status: 'completed', expectedVersion: 1,
  } })).status, 400);

  const appointment = await request('/appointments', { method: 'POST', body: {
    customerId: customerA.body.data.id,
    serviceId: serviceA.body.data.id,
    providerMembershipId: membershipA,
    localStart: '2026-09-22T09:00:00',
    idempotencyKey: 'appointment-a',
  } });
  assert.equal(appointment.status, 201, JSON.stringify(appointment.body));
  assert.equal((await request('/appointments', { method: 'POST', body: {
    customerId: duplicatePhone.body.data.id,
    serviceId: serviceA.body.data.id,
    providerMembershipId: membershipA,
    localStart: '2026-09-22T09:15:00',
    idempotencyKey: 'appointment-overlap',
  } })).status, 409);
  assert.equal((await request('/appointments?date=2026-09-22')).body.pagination.total, 1);
  const checkedIn = await request(`/appointments/${appointment.body.data.id}/check-in`, { method: 'POST', body: { idempotencyKey: 'checkin-a' } });
  const checkedInAgain = await request(`/appointments/${appointment.body.data.id}/check-in`, { method: 'POST', body: { idempotencyKey: 'checkin-a' } });
  assert.equal(checkedIn.status, 200);
  assert.equal(checkedIn.body.data.created, true);
  assert.equal(checkedInAgain.body.data.created, false);
  assert.equal(checkedInAgain.body.data.tokenId, checkedIn.body.data.tokenId);

  const foreignQueue = await request('/queue', { method: 'POST', body: {
    customerId: customerA.body.data.id,
    serviceId: serviceA.body.data.id,
    idempotencyKey: 'foreign-b',
  }, token: tokenB, organizationId: organizationB.organizationId, branchId: organizationB.branchId });
  assert.equal(foreignQueue.status, 400);
  assert.equal((await request('/appointments', { method: 'POST', body: {
    customerId: customerA.body.data.id,
    serviceId: serviceA.body.data.id,
    providerMembershipId: membershipB,
    localStart: '2026-09-22T11:00:00',
  } })).status, 400);

  await database.query("UPDATE memberships SET role = 'hr' WHERE id = $1", [membershipA]);
  assert.equal((await request('/queue', { method: 'POST', body: {
    customerId: customerA.body.data.id, serviceId: serviceA.body.data.id,
  } })).status, 403);
  await database.query("UPDATE memberships SET role = 'owner' WHERE id = $1", [membershipA]);
  await database.query("UPDATE entitlement_overrides SET status = 'inactive' WHERE organization_id = $1", [organizationA.organizationId]);
  const denied = await request('/queue');
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, 'ENTITLEMENT_REQUIRED');
  await database.query("UPDATE entitlement_overrides SET status = 'active' WHERE organization_id = $1", [organizationA.organizationId]);

  assert.equal(await Queue.countDocuments({}), mongoQueueBefore, 'PostgreSQL runtime must not write Mongo Queue');
  assert.equal((await database.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM queue_tokens WHERE legacy_mongo_id IS NULL',
  )).rows[0]!.count, '13');
});
