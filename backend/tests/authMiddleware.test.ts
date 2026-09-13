import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';
import express from 'express';
import {
  createAuthenticate,
  type AuthenticatedRequest,
} from '../src/middlewares/authMiddleware.js';
import { permissionsForRole } from '../src/services/authorizationPolicy.js';

const authenticate = createAuthenticate({
  verifyAccessToken: () => ({
    userId: 'user-1',
    defaultOrganizationId: 'tenant-1',
    sessionId: 'session-1',
  }),
  resolveContext: async (claims) => ({
    userId: claims.userId,
    sessionId: claims.sessionId,
    organizationId: claims.defaultOrganizationId,
    membershipId: 'membership-1',
    role: 'admin',
    permissions: permissionsForRole('admin'),
    platformOperator: false,
    branchId: 'branch-1',
  }),
});

const startProtectedServer = async (context: TestContext): Promise<string> => {
  const app = express();
  app.get('/protected', authenticate, (request, response) => {
    response.json({ user: (request as AuthenticatedRequest).user });
  });
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

test('a valid access JWT path resolves live session and membership context', async (context) => {
  const baseUrl = await startProtectedServer(context);
  const response = await fetch(`${baseUrl}/protected`, {
    headers: { authorization: 'Bearer test-access-token' },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    user: {
      id: 'user-1',
      tenantId: 'tenant-1',
      role: 'admin',
      sessionId: 'session-1',
    },
  });
});

test('an unauthenticated protected request is denied', async (context) => {
  const baseUrl = await startProtectedServer(context);
  assert.equal((await fetch(`${baseUrl}/protected`)).status, 401);
});
