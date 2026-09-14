import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config/env.js';

const validEnvironment = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'test',
  PORT: '5100',
  MONGO_URI: 'mongodb://localhost:27017/ekavio-test',
  DATABASE_URL: 'postgresql://ekavio:test-only@localhost:5432/ekavio-test',
  JWT_SECRET: 'test-jwt-secret',
  REFRESH_TOKEN_SECRET: 'test-refresh-secret',
  HTTP_ALLOWED_ORIGINS: 'http://localhost:5173,https://example.test',
  SOCKET_ALLOWED_ORIGINS: 'http://localhost:5173',
});

test('loads and types a valid environment', () => {
  const config = loadConfig(validEnvironment());

  assert.equal(config.nodeEnv, 'test');
  assert.equal(config.port, 5100);
  assert.equal(config.databaseUrl, 'postgresql://ekavio:test-only@localhost:5432/ekavio-test');
  assert.deepEqual(config.httpAllowedOrigins, [
    'http://localhost:5173',
    'https://example.test',
  ]);
});

test('rejects missing required configuration without exposing values', () => {
  const environment = validEnvironment();
  delete environment.MONGO_URI;

  assert.throws(() => loadConfig(environment), /MONGO_URI:.*required/);
});

test('rejects an invalid PostgreSQL URL without echoing its value', () => {
  const environment = validEnvironment();
  environment.DATABASE_URL = 'https://secret-user:secret-password@example.test/database';

  assert.throws(
    () => loadConfig(environment),
    (error: unknown) => error instanceof Error &&
      /DATABASE_URL: must be a valid PostgreSQL connection URL/.test(error.message) &&
      !error.message.includes('secret-password'),
  );
});

test('requires strong security secrets in production', () => {
  const environment = validEnvironment();
  environment.NODE_ENV = 'production';
  environment.JWT_SECRET = 'short';
  environment.REFRESH_TOKEN_SECRET = 'short';

  assert.throws(
    () => loadConfig(environment),
    /JWT_SECRET: must contain at least 32 characters in production.*REFRESH_TOKEN_SECRET/,
  );
});

test('rejects wildcard and non-HTTP origins', () => {
  const environment = validEnvironment();
  environment.HTTP_ALLOWED_ORIGINS = '*';

  assert.throws(() => loadConfig(environment), /HTTP_ALLOWED_ORIGINS: contains invalid HTTP origin/);
});
