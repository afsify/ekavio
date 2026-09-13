import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';
import type { Server } from 'node:http';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';

const testConfig = loadConfig({
  NODE_ENV: 'test',
  PORT: '5000',
  MONGO_URI: 'mongodb://localhost:27017/unused-by-health-tests',
  JWT_SECRET: 'test-jwt-secret',
  REFRESH_TOKEN_SECRET: 'test-refresh-secret',
  HTTP_ALLOWED_ORIGINS: 'http://localhost:5173',
  SOCKET_ALLOWED_ORIGINS: 'http://localhost:5173',
});

const startTestServer = async (
  context: TestContext,
  isReady: () => boolean,
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

test('liveness succeeds when MongoDB is unavailable', async (context) => {
  const baseUrl = await startTestServer(context, () => false);
  const response = await fetch(`${baseUrl}/health/live`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('readiness reports unavailable MongoDB', async (context) => {
  const baseUrl = await startTestServer(context, () => false);
  const response = await fetch(`${baseUrl}/health/ready`);

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    status: 'not_ready',
    dependencies: { mongodb: 'not_ready' },
  });
});

test('readiness succeeds when MongoDB is connected', async (context) => {
  const baseUrl = await startTestServer(context, () => true);
  const response = await fetch(`${baseUrl}/health/ready`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: 'ready',
    dependencies: { mongodb: 'ready' },
  });
});
