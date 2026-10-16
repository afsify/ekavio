import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PostgresDatabase } from '../src/postgres/database.js';
import { migrate } from '../src/postgres/migrations.js';
import { verifyRestoredDatabase } from '../src/postgres/restoreIntegrity.js';
import { PostgresAccountRepository } from '../src/postgres/accountRepository.js';
import { PostgresCommercialRepository } from '../src/postgres/commercialRepository.js';
import { TaskService } from '../src/domains/tasks/service.js';
import { permissionsForRole } from '../src/services/authorizationPolicy.js';
import type { AuthorizationContext } from '../src/services/requestContextService.js';

// This contract requires the explicitly selected local/CI PostgreSQL service
// container. No fallback to DATABASE_URL, hosted credentials, files or pg_dump 18.
test('Populated Task custom archive restores into isolated PostgreSQL 17 with unchanged integrity', async () => {
  const url = new URL(process.env.POSTGRES_TEST_URL ?? '');
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(url.hostname) && url.pathname === '/postgres');
  const container = process.env.TASKS_QA_POSTGRES_CONTAINER ?? '';
  assert.match(container, /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/);
  const user = decodeURIComponent(url.username); assert.match(user, /^[a-z_][a-z0-9_]*$/);
  const suffix = randomUUID().replaceAll('-', '');
  const sourceName = 'ekavio_v212c_dump_' + suffix, targetName = 'ekavio_v212c_restore_' + suffix;
  const admin = new PostgresDatabase(url.href);
  await admin.query('CREATE DATABASE ' + sourceName); await admin.query('CREATE DATABASE ' + targetName);
  const sourceUrl = new URL(url.href); sourceUrl.pathname = '/' + sourceName;
  const targetUrl = new URL(url.href); targetUrl.pathname = '/' + targetName;
  const source = new PostgresDatabase(sourceUrl.href), target = new PostgresDatabase(targetUrl.href);
  let dump: Buffer | undefined;
  try {
    assert.equal((await source.query('SHOW server_version_num')).rows[0]!.server_version_num.slice(0, 2), '17');
    await migrate(source);
    const account = await new PostgresAccountRepository(source).registerAdmin({ orgName: 'STAGING V212C recovery', orgType: 'shop', userName: 'Synthetic recovery owner', phone: '+919876542099', passwordHash: 'no-login-fixture' });
    const org = String(account.user.tenantId), actor = String(account.user.id);
    await source.query("UPDATE branches SET timezone='Asia/Kolkata' WHERE organization_id=$1", [org]);
    const membership = (await source.query('SELECT id FROM memberships WHERE user_id=$1', [actor])).rows[0]!.id;
    const context: AuthorizationContext = { organizationId: org, userId: actor, membershipId: membership, branchId: String((account.branch as { id: string }).id), sessionId: 'fixture', role: 'admin', permissions: permissionsForRole('admin'), platformOperator: false };
    await new PostgresCommercialRepository(source).upsertEntitlement(org, actor, 'tasks', { effect: 'grant', status: 'active', source: 'pilot', reason: 'Synthetic recovery only' });
    const tasks = new TaskService(source);
    const a = await tasks.create(context, { title: 'Synthetic restored completed work', assignedMembershipId: membership, localDue: '2026-09-26T10:30', idempotencyKey: randomUUID() });
    await tasks.progress(context, a.id, { status: 'completed', expectedVersion: a.version, idempotencyKey: randomUUID() });
    const b = await tasks.create(context, { title: 'Synthetic restored cancelled work', assignedMembershipId: membership, idempotencyKey: randomUUID() });
    await tasks.lifecycle(context, b.id, 'cancel', { expectedVersion: b.version, reason: 'Synthetic retained cancellation', idempotencyKey: randomUUID() });
    const before = await verifyRestoredDatabase(source);
    const run = (args: string[], input?: Buffer): Buffer => execFileSync('docker', ['exec', ...(input ? ['-i'] : []), container, ...args],
      { ...(input ? { input } : {}), maxBuffer: 32 * 1024 * 1024, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
    assert.match(run(['pg_dump', '--version']).toString(), /17\.11/);
    dump = run(['pg_dump', '-U', user, '--format=custom', '--no-owner', '--no-acl', '--dbname', sourceName]);
    assert.equal(dump.subarray(0, 5).toString(), 'PGDMP');
    const archive = run(['pg_restore', '--list'], dump).toString();
    for (const table of ['work_tasks', 'work_task_events', 'work_task_commands']) assert.match(archive, new RegExp('TABLE DATA public ' + table + ' '));
    run(['pg_restore', '-U', user, '--no-owner', '--no-acl', '--exit-on-error', '--dbname', targetName], dump);
    const restored = await verifyRestoredDatabase(target);
    assert.deepEqual(restored.migrations, before.migrations); assert.deepEqual(restored.counts, before.counts);
    assert.equal(restored.coverage.reviewedThrough, '021_work_tasks.sql');
    assert.equal(restored.counts.work_tasks, '2'); assert.equal(restored.counts.work_task_events, '4');
    assert.equal(restored.counts.work_task_commands, '4'); assert.ok(Object.values(restored.integrity).every(v => v === '0'));
    assert.equal((await new TaskService(target).detail(context, a.id)).status, 'completed');
    assert.equal((await new TaskService(target).detail(context, b.id)).status, 'cancelled');
  } finally {
    dump?.fill(0); await source.close(); await target.close();
    await admin.query('DROP DATABASE ' + sourceName); await admin.query('DROP DATABASE ' + targetName); await admin.close();
  }
});
