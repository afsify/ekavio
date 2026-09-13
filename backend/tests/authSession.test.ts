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
import { permissionsForRole } from '../src/services/authorizationPolicy.js';

initializeRuntimeConfig({
  NODE_ENV: 'test',
  PORT: '5000',
  MONGO_URI: 'mongodb://localhost:27017/not-used-by-auth-session-tests',
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
  const activeModules = ['queue'];
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
    activeModules,
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
      activeModules,
      tenant: { activeModules },
    },
    assignments,
    activeModules,
    theme: { mode: 'dark', primaryColor: '#4F46E5' },
  };
};

const createHarness = ({
  users = [primaryUser],
  now,
}: {
  users?: IdentityUser[];
  now?: () => Date;
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
    async buildContext(user) {
      return buildContext(user);
    },
  };
  const service = createAuthService({
    identities,
    sessions,
    verifyPassword: async (password, passwordHash) => password === passwordHash,
    signAccessToken: (authContext, sessionId) => `access.${authContext.userId}.${sessionId}`,
  });

  return { repository, service };
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
    jwtSecret: 'not-used-by-cookie-test',
    refreshTokenSecret: 'not-used-by-cookie-test',
    httpAllowedOrigins: ['https://app.example.test'],
    socketAllowedOrigins: ['https://app.example.test'],
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
