import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';
import express from 'express';
import type { Server } from 'node:http';
import { createApp, createAuthRateLimiter } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import {
  closeSocket,
  isSocketOriginAllowed,
  setupSocket,
} from '../src/config/socket.js';

const localConfig = loadConfig({
  NODE_ENV: 'test',
  PORT: '5000',
  MONGO_URI: 'mongodb://localhost:27017/not-used',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/not-used',
  JWT_SECRET: 'test-jwt-secret',
  REFRESH_TOKEN_SECRET: 'test-refresh-secret',
  HTTP_ALLOWED_ORIGINS: 'http://localhost:5173',
  SOCKET_ALLOWED_ORIGINS: 'http://localhost:5173',
  TRUST_PROXY_HOPS: '0',
});

const hostedConfig = loadConfig({
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

const listen = async (context: TestContext, app: express.Express): Promise<string> => {
  const server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  context.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
};

test('development CORS allows only its exact configured origin with credentials', async (context) => {
  const app = createApp({
    config: localConfig,
    isReady: async () => ({ mongodb: true, postgresql: true }),
  });
  const baseUrl = await listen(context, app);
  const response = await fetch(`${baseUrl}/health/live`, {
    headers: { Origin: 'http://localhost:5173' },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
});

test('hosted CORS supports credentialed preflight and rejects an unapproved origin', async (context) => {
  const app = createApp({
    config: hostedConfig,
    isReady: async () => ({ mongodb: true, postgresql: true }),
  });
  assert.equal(app.get('trust proxy'), 1);
  const baseUrl = await listen(context, app);

  const preflight = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://app.example.test',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://app.example.test');
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');

  const rejected = await fetch(`${baseUrl}/health/live`, {
    headers: { Origin: 'https://evil.example.test' },
  });
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);
});

test('Socket.IO origin policy is exact while retaining non-browser client support', () => {
  assert.equal(isSocketOriginAllowed('https://app.example.test', hostedConfig.socketAllowedOrigins), true);
  assert.equal(isSocketOriginAllowed('https://evil.example.test', hostedConfig.socketAllowedOrigins), false);
  assert.equal(isSocketOriginAllowed(undefined, hostedConfig.socketAllowedOrigins), true);
});

test('Socket.IO owns and awaits HTTP shutdown, and repeated close is safe', async () => {
  const server = http.createServer((_request, response) => response.end('ok'));
  setupSocket(server, hostedConfig);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  assert.equal(server.listening, true);

  await closeSocket();
  assert.equal(server.listening, false);
  await closeSocket();
});

test('sensitive authentication endpoints have a bounded single-process rate limit', async (context) => {
  const app = express();
  app.use('/api/auth', createAuthRateLimiter());
  app.post('/api/auth/login', (_request, response) => response.sendStatus(204));
  app.get('/api/auth/status', (_request, response) => response.sendStatus(204));
  const baseUrl = await listen(context, app);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST' });
    assert.equal(response.status, 204);
  }
  const limited = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST' });
  assert.equal(limited.status, 429);
  const nonSensitive = await fetch(`${baseUrl}/api/auth/status`);
  assert.equal(nonSensitive.status, 204);
});
