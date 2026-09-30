import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  activateFinalRuntimeAuthority,
  isFinalRuntimeAuthorityActivated,
} from '../src/domains/runtimeRetirement/authority.js';
import {
  runAuditMigration,
  runCorporateMigration,
  runFinalRuntimePreflight,
} from '../src/domains/runtimeRetirement/migration.js';
import type {
  AuditLegacySource,
  CorporateLegacySource,
} from '../src/domains/runtimeRetirement/migrationTypes.js';
import { PostgresDatabase } from '../src/postgres/database.js';
import { migrate } from '../src/postgres/migrations.js';

const emptyCorporate: CorporateLegacySource = {
  loadParents: async () => [],
  loadChildLinks: async () => [],
};
const emptyAudit: AuditLegacySource = { loadActivityLogs: async () => [] };

test('V2-06F preflight fails closed until both final PostgreSQL authority latches are explicit', async (context) => {
  const adminUrl = process.env.POSTGRES_TEST_URL;
  assert.ok(adminUrl, 'POSTGRES_TEST_URL is required');
  const parsed = new URL(adminUrl);
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(parsed.hostname)
    || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(parsed.hostname));
  assert.equal(parsed.pathname, '/postgres');
  const databaseName = `ekavio_v206f_cutover_${randomUUID().replaceAll('-', '')}`;
  const admin = new PostgresDatabase(adminUrl);
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const url = new URL(adminUrl); url.pathname = `/${databaseName}`;
  const database = new PostgresDatabase(url.toString());
  context.after(async () => {
    await database.close();
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]);
    await admin.query(`DROP DATABASE "${databaseName}"`);
    await admin.close();
  });
  await migrate(database);
  const input = {
    corporateSource: emptyCorporate,
    auditSource: emptyAudit,
    database,
    corporateAuthority: 'postgresql',
    securityAuditAuthority: 'postgresql',
    mongoRuntimeAuthority: 'offline-only',
  };
  const blocked = await runFinalRuntimePreflight(input);
  assert.equal(blocked.ready, false);
  assert.deepEqual(blocked.failures, [
    'corporateAuthorityLatchMatches',
    'securityAuditAuthorityLatchMatches',
  ]);
  const activationReady = await runFinalRuntimePreflight({ ...input, allowPendingActivation: true });
  assert.equal(activationReady.ready, true);
  assert.ok(Object.values(activationReady.checks).every(Boolean));
  await activateFinalRuntimeAuthority(database);
  assert.equal(await isFinalRuntimeAuthorityActivated(database, 'corporate'), true);
  assert.equal(await isFinalRuntimeAuthorityActivated(database, 'security_audit'), true);
  const ready = await runFinalRuntimePreflight(input);
  assert.equal(ready.ready, true);
  const latches = await database.query<{ domain: string; authority: string; activated_by: string }>(`
    SELECT domain, authority, activated_by FROM final_runtime_authority ORDER BY domain
  `);
  assert.deepEqual(latches.rows, [
    { domain: 'corporate', authority: 'postgresql', activated_by: 'v2-06f-cutover' },
    { domain: 'security_audit', authority: 'postgresql', activated_by: 'v2-06f-cutover' },
  ]);
  await assert.rejects(
    runCorporateMigration({ source: emptyCorporate, database, apply: true }),
    /refused after PostgreSQL authority activation/,
  );
  await assert.rejects(
    runAuditMigration({ source: emptyAudit, database, apply: true }),
    /refused after PostgreSQL authority activation/,
  );
});
