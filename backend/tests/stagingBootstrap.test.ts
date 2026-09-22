import assert from 'node:assert/strict';
import test from 'node:test';
import { loadStagingBootstrapConfig } from '../src/scripts/stagingBootstrapConfig.js';

const validEnvironment = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/ekavio',
  STAGING_BOOTSTRAP_CONFIRM: 'staging',
  STAGING_BOOTSTRAP_PHONE: '+15550001111',
  STAGING_BOOTSTRAP_PASSWORD: 'test-only-password',
  STAGING_BOOTSTRAP_USER_NAME: 'Staging Operator',
  STAGING_BOOTSTRAP_ORGANIZATION_NAME: 'Staging Organization',
  STAGING_BOOTSTRAP_ORGANIZATION_TYPE: 'clinic',
  STAGING_BOOTSTRAP_BRANCH_TIMEZONE: 'Asia/Kolkata',
});

test('loads an explicit staging-only bootstrap contract without exposing the password', () => {
  const config = loadStagingBootstrapConfig(validEnvironment());
  assert.equal(config.phone, '+15550001111');
  assert.equal(config.branchTimezone, 'Asia/Kolkata');
  assert.equal(config.password, 'test-only-password');
});

test('staging bootstrap refuses production and missing confirmation', () => {
  const production = validEnvironment();
  production.NODE_ENV = 'production';
  assert.throws(() => loadStagingBootstrapConfig(production), /refuses NODE_ENV=production/);

  const unconfirmed = validEnvironment();
  delete unconfirmed.STAGING_BOOTSTRAP_CONFIRM;
  assert.throws(() => loadStagingBootstrapConfig(unconfirmed), /STAGING_BOOTSTRAP_CONFIRM/);
});

test('staging bootstrap rejects invalid timezone and weak password without echoing a secret', () => {
  const environment = validEnvironment();
  environment.STAGING_BOOTSTRAP_BRANCH_TIMEZONE = 'Not/A_Timezone';
  environment.STAGING_BOOTSTRAP_PASSWORD = 'secret';
  assert.throws(
    () => loadStagingBootstrapConfig(environment),
    (error: unknown) => error instanceof Error &&
      error.message.includes('STAGING_BOOTSTRAP_PASSWORD') &&
      error.message.includes('STAGING_BOOTSTRAP_BRANCH_TIMEZONE') &&
      !error.message.includes('secret'),
  );
});
