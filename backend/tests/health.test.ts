import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import type { Server } from 'node:http';
import { createApp, sanitizeMongoInputs } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';

const testConfig = loadConfig({
  NODE_ENV: 'test',
  PORT: '5000',
  DATABASE_URL: 'postgresql://ekavio:test-only@localhost:5432/unused-by-health-tests',
  JWT_SECRET: 'test-jwt-secret',
  REFRESH_TOKEN_SECRET: 'test-refresh-secret',
  HTTP_ALLOWED_ORIGINS: 'http://localhost:5173',
  SOCKET_ALLOWED_ORIGINS: 'http://localhost:5173',
});

const startTestServer = async (
  context: TestContext,
  isReady: () => Promise<{ postgresql: boolean }>,
): Promise<string> => {
  const app = createApp({ config: testConfig, isReady });
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

test('Mongo input sanitization supports the Express 5 read-only query getter', () => {
  const request = {
    body: { safe: 'body', $where: 'unsafe' },
    params: {},
    headers: {},
    get query() {
      return { safe: 'query', $where: 'unsafe' };
    },
  } as unknown as Request;
  let continued = false;

  sanitizeMongoInputs(
    request,
    {} as Response,
    (() => { continued = true; }) as NextFunction,
  );

  assert.equal(continued, true);
  assert.deepEqual(request.body, { safe: 'body' });
  assert.deepEqual(request.query, { safe: 'query' });
});

test('liveness does not depend on PostgreSQL readiness', async (context) => {
  const baseUrl = await startTestServer(context, async () => ({ postgresql: false }));
  const response = await fetch(`${baseUrl}/health/live`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('readiness succeeds when PostgreSQL is connected without a Mongo dependency', async (context) => {
  const baseUrl = await startTestServer(context, async () => ({ postgresql: true }));
  const response = await fetch(`${baseUrl}/health/ready`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: 'ready',
    dependencies: { postgresql: 'ready' },
  });
});

test('readiness reports unavailable PostgreSQL', async (context) => {
  const baseUrl = await startTestServer(context, async () => ({ postgresql: false }));
  const response = await fetch(`${baseUrl}/health/ready`);

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    status: 'not_ready',
    dependencies: { postgresql: 'not_ready' },
  });
});
