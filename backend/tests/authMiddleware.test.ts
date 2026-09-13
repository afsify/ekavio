import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { initializeRuntimeConfig } from '../src/config/env.js';
import {
  authenticate,
  type AuthenticatedRequest,
} from '../src/middlewares/authMiddleware.js';

const config = initializeRuntimeConfig({
  NODE_ENV: 'test',
  PORT: '5000',
  MONGO_URI: 'mongodb://localhost:27017/not-used-by-auth-middleware-tests',
  JWT_SECRET: 'auth-middleware-test-jwt-secret',
  REFRESH_TOKEN_SECRET: 'auth-middleware-test-refresh-secret',
  HTTP_ALLOWED_ORIGINS: 'http://localhost:5173',
  SOCKET_ALLOWED_ORIGINS: 'http://localhost:5173',
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

test('a valid short-lived access JWT authenticates a protected request', async (context) => {
  const baseUrl = await startProtectedServer(context);
  const token = jwt.sign(
    {
      id: 'user-1',
      tenantId: 'tenant-1',
      role: 'admin',
      sessionId: 'session-1',
    },
    config.jwtSecret,
    { expiresIn: '15m' },
  );
  const response = await fetch(`${baseUrl}/protected`, {
    headers: { authorization: `Bearer ${token}` },
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
