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

const productionEnvironment = (): NodeJS.ProcessEnv => ({
  ...validEnvironment(),
  NODE_ENV: 'production',
  MONGO_URI: 'mongodb+srv://staging-user:staging-password@mongo.example.test/ekavio',
  DATABASE_URL: 'postgresql://staging-user:staging-password@pg.example.test/ekavio?sslmode=require',
  JWT_SECRET: 'staging-jwt-secret-with-at-least-32-characters',
  REFRESH_TOKEN_SECRET: 'staging-refresh-secret-with-at-least-32-characters',
  HTTP_ALLOWED_ORIGINS: 'https://app.example.test',
  SOCKET_ALLOWED_ORIGINS: 'https://app.example.test',
  TRUST_PROXY_HOPS: '1',
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
  assert.equal(config.trustProxyHops, 0);
});

test('accepts a standard multi-host MongoDB TLS connection string', () => {
  const environment = validEnvironment();
  environment.MONGO_URI = 'mongodb://user:password@mongo-a.example.test:27017,mongo-b.example.test:27017/ekavio?tls=true';
  assert.equal(loadConfig(environment).mongoUri, environment.MONGO_URI);
});

test('accepts secure managed database URLs and explicit proxy hops in production', () => {
  const config = loadConfig(productionEnvironment());

  assert.equal(config.nodeEnv, 'production');
  assert.equal(config.trustProxyHops, 1);
  assert.deepEqual(config.httpAllowedOrigins, ['https://app.example.test']);
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
  const environment = productionEnvironment();
  environment.JWT_SECRET = 'short';
  environment.REFRESH_TOKEN_SECRET = 'short';

  assert.throws(
    () => loadConfig(environment),
    /JWT_SECRET: must contain at least 32 characters in production.*REFRESH_TOKEN_SECRET/,
  );
});

test('requires TLS database URLs, HTTPS origins, and explicit proxy trust in production', () => {
  const environment = productionEnvironment();
  environment.DATABASE_URL = 'postgresql://user:password@pg.example.test/ekavio';
  environment.MONGO_URI = 'mongodb://user:password@mongo.example.test/ekavio';
  environment.HTTP_ALLOWED_ORIGINS = 'http://app.example.test';
  delete environment.TRUST_PROXY_HOPS;

  assert.throws(
    () => loadConfig(environment),
    (error: unknown) => error instanceof Error &&
      error.message.includes('DATABASE_URL: must enable TLS') &&
      error.message.includes('MONGO_URI: must enable TLS') &&
      error.message.includes('HTTP_ALLOWED_ORIGINS: must contain only HTTPS') &&
      error.message.includes('TRUST_PROXY_HOPS: is required'),
  );
});

test('rejects malformed MongoDB URLs and origin values with paths', () => {
  const badMongo = validEnvironment();
  badMongo.MONGO_URI = 'https://secret-user:secret-password@example.test/database';
  assert.throws(
    () => loadConfig(badMongo),
    (error: unknown) => error instanceof Error &&
      error.message.includes('MONGO_URI: must be a valid MongoDB connection URL') &&
      !error.message.includes('secret-password'),
  );

  const badOrigin = validEnvironment();
  badOrigin.HTTP_ALLOWED_ORIGINS = 'https://app.example.test/path';
  assert.throws(() => loadConfig(badOrigin), /HTTP_ALLOWED_ORIGINS: contains invalid HTTP origin/);
});

test('rejects wildcard and non-HTTP origins', () => {
  const environment = validEnvironment();
  environment.HTTP_ALLOWED_ORIGINS = '*';

  assert.throws(() => loadConfig(environment), /HTTP_ALLOWED_ORIGINS: contains invalid HTTP origin/);
});
