import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';
import express from 'express';
import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { createAuthHandlers } from '../src/controllers/authController.js';
import { initializeRuntimeConfig } from '../src/config/env.js';
import type { RuntimeConfig } from '../src/config/env.js';
import {
  createAuthService,
  type AuthContext,
  type AuthService,
  type AuthServiceDependencies,
  type IdentityRepository,
  type IdentityUser,
} from '../src/services/authService.js';
import {
  createRefreshSessionManager,
  REFRESH_SESSION_MAX_AGE_MS,
  type CreateSessionRecord,
  type SessionRecord,
  type SessionRepository,
} from '../src/services/sessionService.js';
import { AppError } from '../src/utils/AppError.js';
import { setRefreshCookie } from '../src/utils/authCookies.js';
import { createPasswordChange } from '../src/services/accountPersistence.js';
import { permissionsForRole } from '../src/services/authorizationPolicy.js';
import { MODULES, emptyEffectiveLimits } from '../src/commercial/catalogue.js';
import type { EffectiveEntitlements } from '../src/services/entitlementService.js';

initializeRuntimeConfig({
  NODE_ENV: 'test',
  PORT: '5000',
  MONGO_URI: 'mongodb://localhost:27017/not-used-by-auth-session-tests',
  DATABASE_URL: 'postgresql://ekavio:test-only@localhost:5432/not-used-by-auth-session-tests',
  JWT_SECRET: 'auth-session-test-jwt-secret',
  REFRESH_TOKEN_SECRET: 'auth-session-test-refresh-secret',
  HTTP_ALLOWED_ORIGINS: 'http://localhost:5173',
  SOCKET_ALLOWED_ORIGINS: 'http://localhost:5173',
});

class MemorySessionRepository implements SessionRepository {
  readonly records = new Map<string, CreateSessionRecord>();

  async create(record: CreateSessionRecord): Promise<void> {
    this.records.set(record.sessionId, { ...record });
  }

  async findBySessionId(sessionId: string): Promise<SessionRecord | null> {
    const record = this.records.get(sessionId);
    if (!record) return null;

    return {
      sessionId: record.sessionId,
      userId: record.userId,
      refreshTokenHash: record.refreshTokenHash,
      expiresAt: record.expiresAt,
      lastUsedAt: record.lastUsedAt,
      revokedAt: record.revokedAt,
    };
  }

  async rotate(
    sessionId: string,
    previousHash: string,
    nextHash: string,
    now: Date,
    expiresAt: Date,
  ): Promise<boolean> {
    const record = this.records.get(sessionId);
    if (
      !record ||
      record.refreshTokenHash !== previousHash ||
      record.revokedAt !== null ||
      record.expiresAt.getTime() <= now.getTime()
    ) {
      return false;
    }

    record.refreshTokenHash = nextHash;
    record.lastUsedAt = now;
    record.expiresAt = expiresAt;
    return true;
  }

  async revoke(
    sessionId: string,
    refreshTokenHash: string,
    revokedAt: Date,
  ): Promise<void> {
    const record = this.records.get(sessionId);
    if (record?.refreshTokenHash === refreshTokenHash && record.revokedAt === null) {
      record.revokedAt = revokedAt;
    }
  }

  async revokeAllForUser(userId: string, revokedAt: Date): Promise<void> {
    for (const record of this.records.values()) {
      if (record.userId === userId && record.revokedAt === null) {
        record.revokedAt = revokedAt;
      }
    }
  }
}

const primaryUser: IdentityUser = {
  id: 'user-1',
  tenantId: 'tenant-1',
  role: 'admin',
  name: 'Test Admin',
  phone: '+15550001111',
  passwordHash: 'correct-password',
  assignments: [{ tenantId: 'tenant-2', role: 'staff' }],
};

const buildContext = (user: IdentityUser): AuthContext => {
  const assignments = user.assignments.map((assignment) => ({
    ...assignment,
    orgName: assignment.tenantId === 'tenant-2' ? 'Second Tenant' : undefined,
  }));
  const entitlements: EffectiveEntitlements = {
    organizationId: user.tenantId,
    subscription: null,
    modules: [{
      key: MODULES.QUEUE,
      displayName: 'Queue',
      description: 'Queue access',
      category: 'customer-experience',
      commercialType: 'core',
      enabled: true,
      sources: ['test'],
    }],
    limits: emptyEffectiveLimits(),
  };
  const role = user.role === 'admin' ? 'admin' as const : 'staff' as const;
  const permissions = permissionsForRole(role);
  const memberships = [{
    id: 'membership-1',
    organizationId: user.tenantId,
    tenantId: user.tenantId,
    orgName: 'Primary Tenant',
    role,
    status: 'active' as const,
    branchIds: ['branch-1'],
    branches: [{ id: 'branch-1', name: 'Main', code: 'main' }],
  }];

  return {
    userId: user.id,
    tenantId: user.tenantId,
    organizationId: user.tenantId,
    membershipId: 'membership-1',
    branchId: 'branch-1',
    role,
    permissions,
    platformOperator: false,
    memberships,
    user: {
      id: user.id,
      tenantId: user.tenantId,
      organizationId: user.tenantId,
      membershipId: 'membership-1',
      branchId: 'branch-1',
      role,
      permissions,
      ...(user.name ? { name: user.name } : {}),
      phone: user.phone,
      assignments,
      memberships,
    },
    assignments,
    entitlements,
    theme: { mode: 'dark', primaryColor: '#4F46E5' },
  };
};

const createHarness = ({
  users = [primaryUser],
  now,
  prepareAuthorization,
  signAccessToken,
}: {
  users?: IdentityUser[];
  now?: () => Date;
  prepareAuthorization?: AuthServiceDependencies['prepareAuthorization'];
  signAccessToken?: AuthServiceDependencies['signAccessToken'];
} = {}) => {
  const repository = new MemorySessionRepository();
  const sessions = createRefreshSessionManager({
    repository,
    getHashSecret: () => 'test-only-hash-secret',
    ...(now ? { now } : {}),
  });
  const identities: IdentityRepository = {
    async findByPhone(phone) {
      return users.filter((user) => user.phone === phone);
    },
    async findById(userId) {
      return users.find((user) => user.id === userId) ?? null;
    },
    async buildContext(user, selection) {
      return buildContext({
        ...user,
        tenantId: selection?.organizationId ?? user.tenantId,
      });
    },
  };
  const service = createAuthService({
    identities,
    sessions,
    verifyPassword: async (password, passwordHash) => password === passwordHash,
    signAccessToken: signAccessToken ?? ((authContext, sessionId) => `access.${authContext.userId}.${sessionId}`),
    ...(prepareAuthorization ? { prepareAuthorization } : {}),
  });

  return { repository, service, sessions, identities };
};

const login = (service: AuthService) =>
  service.login({ phone: ` ${primaryUser.phone} `, password: primaryUser.passwordHash });

const startAuthServer = async (
  context: TestContext,
  service: AuthService,
): Promise<string> => {
  const app = express();
  const handlers = createAuthHandlers(service);
  app.use(express.json());
  app.post('/api/auth/login', handlers.login);
  app.post('/api/auth/refresh', handlers.refresh);
  app.post('/api/auth/logout', handlers.logout);
  app.use(
    (
      error: Error & { statusCode?: number },
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      response.status(error.statusCode ?? 500).json({ message: error.message });
    },
  );

  const server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  context.after(
    () => new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  );

  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
};

const postLogin = (baseUrl: string) =>
  fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: primaryUser.phone, password: primaryUser.passwordHash }),
  });

const requestCookie = (setCookieHeader: string): string => {
  const cookie = setCookieHeader.split(';')[0];
  assert.ok(cookie);
  return cookie;
};

test('successful login creates a server session containing only a credential hash', async () => {
  const { repository, service } = createHarness();
  const result = await login(service);
  const records = [...repository.records.values()];

  assert.equal(records.length, 1);
  assert.equal(records[0]?.userId, primaryUser.id);
  assert.notEqual(records[0]?.refreshTokenHash, result.refreshCredential);
  assert.equal(JSON.stringify(records).includes(result.refreshCredential), false);
});

test('login sets an HttpOnly refresh cookie and omits the credential from JSON', async (context) => {
  const { service } = createHarness();
  const baseUrl = await startAuthServer(context, service);
  const response = await postLogin(baseUrl);
  const setCookie = response.headers.get('set-cookie');
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.ok(setCookie);
  assert.match(setCookie, /^ekavio_refresh=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Path=\/api\/auth/i);
  assert.match(setCookie, /Max-Age=604800/i);
  assert.doesNotMatch(JSON.stringify(body), /refreshCredential|refreshToken|ekavio_refresh/i);
});

test('production refresh cookies enforce Secure, HttpOnly, SameSite, path, and lifetime', () => {
  let capturedOptions: CookieOptions | undefined;
  const fakeResponse = {
    cookie(_name: string, _value: string, options: CookieOptions) {
      capturedOptions = options;
      return fakeResponse;
    },
  };
  const productionConfig: RuntimeConfig = {
    nodeEnv: 'production',
    port: 5000,
    mongoUri: 'mongodb://not-used',
    databaseUrl: 'postgresql://not-used:not-used@localhost:5432/not-used',
    jwtSecret: 'not-used-by-cookie-test',
    refreshTokenSecret: 'not-used-by-cookie-test',
    httpAllowedOrigins: ['https://app.example.test'],
    socketAllowedOrigins: ['https://app.example.test'],
    trustProxyHops: 1,
  };

  setRefreshCookie(fakeResponse as unknown as Response, 'opaque-test-value', productionConfig);

  assert.equal(capturedOptions?.secure, true);
  assert.equal(capturedOptions?.httpOnly, true);
  assert.equal(capturedOptions?.sameSite, 'lax');
  assert.equal(capturedOptions?.path, '/api/auth');
  assert.equal(capturedOptions?.maxAge, REFRESH_SESSION_MAX_AGE_MS);
});

test('valid cookie refresh rotates the credential and rejects reuse of the previous value', async (context) => {
  const { service } = createHarness();
  const baseUrl = await startAuthServer(context, service);
  const loginResponse = await postLogin(baseUrl);
  const loginSetCookie = loginResponse.headers.get('set-cookie');
  assert.ok(loginSetCookie);
  const previousCookie = requestCookie(loginSetCookie);

  const refreshResponse = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: { cookie: previousCookie },
  });
  const refreshSetCookie = refreshResponse.headers.get('set-cookie');
  const refreshBody = await refreshResponse.json();

  assert.equal(refreshResponse.status, 200);
  assert.ok(refreshSetCookie);
  assert.notEqual(requestCookie(refreshSetCookie), previousCookie);
  assert.equal(typeof (refreshBody as { accessToken?: unknown }).accessToken, 'string');

  const reusedResponse = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: { cookie: previousCookie },
  });
  assert.equal(reusedResponse.status, 401);
});

test('concurrent refresh rotation has exactly one winner', async () => {
  const { service } = createHarness();
  const result = await login(service);

  const attempts = await Promise.allSettled([
    service.refresh(result.refreshCredential),
    service.refresh(result.refreshCredential),
  ]);

  assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter((attempt) => attempt.status === 'rejected').length, 1);
});

test('tenant switching recomputes effective entitlements for the selected organization', async () => {
  const { service } = createHarness();
  const loginResult = await login(service);
  assert.equal(loginResult.response.entitlements.organizationId, 'tenant-1');

  const switched = await service.refresh(loginResult.refreshCredential, {
    organizationId: 'tenant-2',
  });
  assert.equal(switched.response.organizationId, 'tenant-2');
  assert.equal(switched.response.entitlements.organizationId, 'tenant-2');
  assert.notEqual(
    switched.response.entitlements.organizationId,
    loginResult.response.entitlements.organizationId,
  );
});

test('revoked sessions cannot refresh', async () => {
  const { service } = createHarness();
  const result = await login(service);

  await service.logout(result.refreshCredential);

  await assert.rejects(
    () => service.refresh(result.refreshCredential),
    (error: unknown) => error instanceof AppError && error.statusCode === 401,
  );
});

test('logout revokes the session, clears the cookie, and remains idempotent', async (context) => {
  const { repository, service } = createHarness();
  const baseUrl = await startAuthServer(context, service);
  const loginResponse = await postLogin(baseUrl);
  const loginSetCookie = loginResponse.headers.get('set-cookie');
  assert.ok(loginSetCookie);
  const cookie = requestCookie(loginSetCookie);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { cookie },
    });
    const setCookie = response.headers.get('set-cookie');

    assert.equal(response.status, 200);
    assert.ok(setCookie);
    assert.match(setCookie, /^ekavio_refresh=;/);
    assert.match(setCookie, /Expires=Thu, 01 Jan 1970/i);
  }

  assert.ok([...repository.records.values()][0]?.revokedAt instanceof Date);
});

test('expired sessions cannot refresh', async () => {
  let currentTime = new Date('2026-01-01T00:00:00.000Z');
  const { service } = createHarness({ now: () => new Date(currentTime) });
  const result = await login(service);

  currentTime = new Date(currentTime.getTime() + REFRESH_SESSION_MAX_AGE_MS);

  await assert.rejects(
    () => service.refresh(result.refreshCredential),
    (error: unknown) => error instanceof AppError && error.statusCode === 401,
  );
});

test('duplicate-phone login ambiguity is rejected before a session is created', async () => {
  const duplicateUser: IdentityUser = { ...primaryUser, id: 'user-2', tenantId: 'tenant-3' };
  const { repository, service } = createHarness({ users: [primaryUser, duplicateUser] });

  await assert.rejects(
    () => login(service),
    (error: unknown) =>
      error instanceof AppError &&
      error.statusCode === 409 &&
      /migration is required/i.test(error.message),
  );
  assert.equal(repository.records.size, 0);
});

test('hosted sibling-domain session flow keeps production cookie security through login, refresh, and logout', async (context) => {
  initializeRuntimeConfig({
    NODE_ENV: 'production',
    PORT: '5000',
    MONGO_URI: 'mongodb+srv://user:password@mongo.example.test/ekavio',
    DATABASE_URL: 'postgresql://user:password@pg.example.test/ekavio?sslmode=verify-full',
    JWT_SECRET: 'hosted-jwt-secret-with-at-least-32-characters',
    REFRESH_TOKEN_SECRET: 'hosted-refresh-secret-with-at-least-32-characters',
    HTTP_ALLOWED_ORIGINS: 'https://app.example.test',
    SOCKET_ALLOWED_ORIGINS: 'https://app.example.test',
    TRUST_PROXY_HOPS: '1',
  });
  const { service } = createHarness();
  const baseUrl = await startAuthServer(context, service);

  const loginResponse = await postLogin(baseUrl);
  const loginCookie = loginResponse.headers.get('set-cookie');
  assert.equal(loginResponse.status, 200);
  assert.ok(loginCookie);
  assert.match(loginCookie, /Secure/i);
  assert.match(loginCookie, /HttpOnly/i);
  assert.match(loginCookie, /SameSite=Lax/i);
  assert.match(loginCookie, /Path=\/api\/auth/i);

  const refreshResponse = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: { cookie: requestCookie(loginCookie) },
  });
  const refreshCookie = refreshResponse.headers.get('set-cookie');
  assert.equal(refreshResponse.status, 200);
  assert.ok(refreshCookie);
  assert.match(refreshCookie, /Secure/i);

  const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { cookie: requestCookie(refreshCookie) },
  });
  const clearedCookie = logoutResponse.headers.get('set-cookie');
  assert.equal(logoutResponse.status, 200);
  assert.ok(clearedCookie);
  assert.match(clearedCookie, /Expires=Thu, 01 Jan 1970/i);
  assert.match(clearedCookie, /Secure/i);
  assert.match(clearedCookie, /HttpOnly/i);
  assert.match(clearedCookie, /SameSite=Lax/i);

  const revokedRefresh = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: { cookie: requestCookie(refreshCookie) },
  });
  assert.equal(revokedRefresh.status, 401);
});

// S1 recovery regressions: real handlers/services, synthetic in-memory storage.
// No database initialization or hosted request is involved.
const unauthorized = (error: unknown) => error instanceof AppError && error.statusCode === 401;

for (const stage of ['identity', 'authorization', 'context', 'signing'] as const) {
  test(`S1 ${stage} failure does not consume a credential; retry succeeds`, async () => {
    let unavailable = false;
    const harness = createHarness({
      prepareAuthorization: async () => { if (unavailable && stage === 'authorization') throw new Error('synthetic authorization unavailable'); },
      signAccessToken: (context, sessionId) => {
        if (unavailable && stage === 'signing') throw new Error('synthetic signer unavailable');
        return `access.${context.userId}.${sessionId}`;
      },
    });
    const originalFind = harness.identities.findById;
    const originalContext = harness.identities.buildContext;
    harness.identities.findById = async id => {
      if (unavailable && stage === 'identity') throw new Error('synthetic identity unavailable');
      return originalFind(id);
    };
    harness.identities.buildContext = async (user, selection) => {
      if (unavailable && stage === 'context') throw new Error('synthetic context unavailable');
      return originalContext(user, selection);
    };
    const initial = await login(harness.service);
    const before = structuredClone([...harness.repository.records.values()]);
    unavailable = true;
    await assert.rejects(harness.service.refresh(initial.refreshCredential), /synthetic .* unavailable/);
    assert.deepEqual([...harness.repository.records.values()], before, 'failed preparation must not rotate, extend or revoke');
    unavailable = false;
    const recovered = await harness.service.refresh(initial.refreshCredential);
    assert.notEqual(recovered.refreshCredential, initial.refreshCredential);
    assert.equal(recovered.response.organizationId, primaryUser.tenantId);
    await assert.rejects(harness.service.refresh(initial.refreshCredential), unauthorized);
  });
}

for (const kind of ['plain error', 'explicit 503'] as const) {
  test(`S1 HTTP ${kind} preserves cookie and valid session, redacts failure, then recovers`, async context => {
    const { identities, service } = createHarness();
    const initial = await login(service);
    const originalFind = identities.findById;
    const logs: unknown[][] = [];
    for (const method of ['log', 'warn', 'error'] as const) context.mock.method(console, method, (...args: unknown[]) => { logs.push(args); });
    identities.findById = async () => {
      if (kind === 'explicit 503') throw new AppError('Authentication unavailable', 503);
      throw new Error(`synthetic dependency failure ${initial.refreshCredential}`);
    };
    const baseUrl = await startAuthServer(context, service);
    const response = await fetch(`${baseUrl}/api/auth/refresh`, { method: 'POST', headers: { cookie: `ekavio_refresh=${initial.refreshCredential}` } });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('set-cookie'), null, '503 must not delete the browser credential');
    const body = await response.text();
    assert.doesNotMatch(body, /refreshCredential|refreshToken|ekavio_refresh|synthetic dependency/i);
    assert.equal(body.includes(initial.refreshCredential), false);
    assert.equal(JSON.stringify(logs).includes(initial.refreshCredential), false);
    identities.findById = originalFind;
    const retry = await fetch(`${baseUrl}/api/auth/refresh`, { method: 'POST', headers: { cookie: `ekavio_refresh=${initial.refreshCredential}` } });
    assert.equal(retry.status, 200);
    const rotated = retry.headers.get('set-cookie');
    assert.ok(rotated); assert.notEqual(requestCookie(rotated), `ekavio_refresh=${initial.refreshCredential}`);
    assert.doesNotMatch(await retry.text(), /refreshCredential|refreshToken|ekavio_refresh/i);
  });
}

for (const selection of [{ organizationId: 'foreign-tenant' }, { branchId: 'foreign-branch' }]) {
  test(`S1 unauthorized ${Object.keys(selection)[0]} denies access without consuming valid credential`, async context => {
    const { identities, service, repository } = createHarness();
    const original = identities.buildContext;
    identities.buildContext = async (user, selected) => {
      if (selected?.organizationId === 'foreign-tenant' || selected?.branchId === 'foreign-branch') throw new AppError('Access denied to this context', 403);
      return original(user, selected);
    };
    const initial = await login(service);
    const before = structuredClone([...repository.records.values()]);
    const baseUrl = await startAuthServer(context, service);
    const response = await fetch(`${baseUrl}/api/auth/refresh`, { method: 'POST', headers: {
      cookie: `ekavio_refresh=${initial.refreshCredential}`,
      ...('organizationId' in selection ? { 'x-tenant-id': selection.organizationId } : { 'x-branch-id': selection.branchId }),
    } });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal('accessToken' in await response.json() as object, false);
    assert.deepEqual([...repository.records.values()], before);
    assert.equal((await service.refresh(initial.refreshCredential)).response.organizationId, primaryUser.tenantId);
  });
}

test('S1 malformed and wrong-secret credentials fail before identity/context work', async () => {
  const { identities, service } = createHarness();
  const initial = await login(service);
  identities.findById = async () => assert.fail('invalid credential must not reach identity preparation');
  for (const invalid of ['', 'invalid', `${initial.refreshCredential.split('.')[0]}.${'x'.repeat(43)}`]) {
    await assert.rejects(service.refresh(invalid), unauthorized);
  }
});

test('S1 genuine unauthorized HTTP refresh still clears its cookie', async context => {
  const { service } = createHarness();
  const baseUrl = await startAuthServer(context, service);
  const response = await fetch(`${baseUrl}/api/auth/refresh`, { method: 'POST', headers: { cookie: 'ekavio_refresh=invalid' } });
  assert.equal(response.status, 401);
  assert.match(response.headers.get('set-cookie') ?? '', /^ekavio_refresh=;.*Expires=Thu, 01 Jan 1970/i);
});

for (const invalidation of ['revoke', 'expire'] as const) {
  test(`S1 ${invalidation} during preparation is rechecked before rotation/response`, async () => {
    let currentTime = new Date('2026-01-01T00:00:00Z');
    const { identities, service, sessions } = createHarness({ now: () => new Date(currentTime) });
    const initial = await login(service);
    const original = identities.buildContext;
    identities.buildContext = async (user, selection) => {
      const context = await original(user, selection);
      if (invalidation === 'revoke') await sessions.revokeAllForUser(primaryUser.id);
      else currentTime = new Date(currentTime.getTime() + REFRESH_SESSION_MAX_AGE_MS);
      return context;
    };
    await assert.rejects(service.refresh(initial.refreshCredential), unauthorized);
  });
}

test('S1 CAS rejects revocation between final validation and atomic update', async () => {
  const { service, repository } = createHarness();
  const initial = await login(service);
  const rotate = repository.rotate.bind(repository);
  repository.rotate = async (...args) => {
    await repository.revokeAllForUser(primaryUser.id, new Date());
    return rotate(...args);
  };
  await assert.rejects(service.refresh(initial.refreshCredential), unauthorized);
});

test('S1 repository outage before rotation leaves original credential recoverable', async () => {
  const { service, repository } = createHarness();
  const initial = await login(service);
  const before = structuredClone([...repository.records.values()]);
  const rotate = repository.rotate.bind(repository);
  repository.rotate = async () => { throw new Error('synthetic database unavailable before commit'); };
  await assert.rejects(service.refresh(initial.refreshCredential), /synthetic database unavailable/);
  assert.deepEqual([...repository.records.values()], before);
  repository.rotate = rotate;
  assert.ok((await service.refresh(initial.refreshCredential)).response.accessToken);
});

test('S1 response-loss limitation: a committed rotation never makes the old credential reusable', async () => {
  const { service } = createHarness();
  const initial = await login(service);
  await service.refresh(initial.refreshCredential); // Deliberately discard the response, as if it was lost.
  await assert.rejects(service.refresh(initial.refreshCredential), unauthorized);
});

test('S1 missing HTTP refresh cookie rejects without identity lookup or token issuance', async context => {
  const { identities, service } = createHarness();
  identities.findById = async () => assert.fail('missing cookie must not reach identity preparation');
  const baseUrl = await startAuthServer(context, service);
  const response = await fetch(`${baseUrl}/api/auth/refresh`, { method: 'POST' });
  assert.equal(response.status, 401);
  assert.match(response.headers.get('set-cookie') ?? '', /^ekavio_refresh=;.*Expires=Thu, 01 Jan 1970/i);
  assert.equal('accessToken' in (await response.json() as object), false);
});

test('S1 competing rotation during context preparation prevents stale response issuance', async () => {
  const { identities, service, sessions } = createHarness();
  const initial = await login(service);
  const original = identities.buildContext;
  let winnerCredential = '';
  identities.buildContext = async (user, selection) => {
    const context = await original(user, selection);
    winnerCredential = (await sessions.rotate(initial.refreshCredential)).refreshCredential;
    return context;
  };
  await assert.rejects(service.refresh(initial.refreshCredential), unauthorized);
  assert.ok(winnerCredential);
  identities.buildContext = original;
  assert.equal((await service.refresh(winnerCredential)).response.userId, primaryUser.id);
});

test('S1 password change revokes old sessions while normal reauthentication remains available', async () => {
  const user = structuredClone(primaryUser);
  const { service, sessions } = createHarness({ users: [user] });
  const first = await login(service);
  const second = await login(service);
  const changePassword = createPasswordChange({
    repository: {
      findPasswordHash: async () => user.passwordHash,
      replacePasswordHashAndRevokeSessions: async (userId, nextHash, expectedHash) => {
        if (userId !== user.id || user.passwordHash !== expectedHash) return false;
        user.passwordHash = nextHash;
        await sessions.revokeAllForUser(userId);
        return true;
      },
    },
    verifyPassword: async (password, hash) => password === hash,
    hashPassword: async password => password, // Synthetic identity adapter only.
  });
  await assert.rejects(changePassword(user.id, 'incorrect-old-password', 'replacement-password'), { statusCode: 400 });
  assert.equal((await sessions.validate(first.refreshCredential)).userId, user.id);
  await changePassword(user.id, primaryUser.passwordHash, 'replacement-password');
  for (const old of [first, second]) await assert.rejects(service.refresh(old.refreshCredential), unauthorized);
  await assert.rejects(login(service), unauthorized);
  const signedIn = await service.login({ phone: user.phone, password: 'replacement-password' });
  assert.equal((await service.refresh(signedIn.refreshCredential)).response.userId, user.id);
});
