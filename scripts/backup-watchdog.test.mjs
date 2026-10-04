import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { checkBackupWatchdog, evaluateBackupMetadata, MAX_BACKUP_AGE_HOURS } from './backup-watchdog.mjs';

const repository = 'afsify/ekavio';
const nowMs = Date.parse('2026-10-04T12:00:00Z');
const run = {
  id: 123, event: 'schedule', head_branch: 'main', path: '.github/workflows/postgres-backup.yml',
  status: 'completed', conclusion: 'success', run_attempt: 2,
  run_started_at: '2026-10-04T02:17:00Z', repository: { full_name: repository },
};
const artifact = {
  name: 'ekavio-postgresql-123-2', expired: false, size_in_bytes: 270002,
  created_at: '2026-10-04T02:18:00Z', expires_at: '2026-11-08T02:18:00Z',
};
const evaluate = (runs = [run], artifacts = [artifact], clock = nowMs) =>
  evaluateBackupMetadata({ runs, artifacts, repository, nowMs: clock });

test('recent scheduled success with its exact nonempty retained artifact passes deterministically', () => {
  const result = evaluate();
  assert.equal(result.status, 'pass');
  assert.equal(result.runId, 123);
  assert.equal(result.maxAgeHours, 30);
  assert.deepEqual(result, evaluate());
});

test('30-hour boundary is explicit; stale and future runs fail closed', () => {
  assert.equal(MAX_BACKUP_AGE_HOURS, 30);
  const start = Date.parse(run.run_started_at);
  assert.equal(evaluate([run], [artifact], start + 30 * 3_600_000).status, 'pass');
  assert.equal(evaluate([run], [artifact], start + 30 * 3_600_000 + 1).reason, 'scheduled_backup_overdue');
  assert.equal(evaluate([{ ...run, run_started_at: '2026-10-05T02:17:00Z' }]).reason, 'future_backup_timestamp');
});

test('manual, push, other-branch, other-workflow and other-repository runs cannot substitute', () => {
  for (const change of [
    { event: 'workflow_dispatch' }, { event: 'push' }, { head_branch: 'feature' },
    { path: '.github/workflows/ci.yml' }, { repository: { full_name: 'elsewhere/repo' } },
    { status: 'in_progress' },
  ]) assert.equal(evaluate([{ ...run, ...change }]).reason, 'no_completed_scheduled_backup');
  assert.equal(evaluate([]).status, 'fail');
});

test('latest failed scheduled attempt is not masked by older success or fresh manual success', () => {
  const failed = { ...run, id: 124, conclusion: 'failure', run_started_at: '2026-10-04T03:00:00Z' };
  const manual = { ...run, id: 125, event: 'workflow_dispatch', run_started_at: '2026-10-04T04:00:00Z' };
  assert.equal(evaluate([manual, run, failed]).reason, 'latest_scheduled_backup_not_successful');
  for (const conclusion of ['cancelled', 'timed_out', 'skipped', null]) {
    assert.equal(evaluate([{ ...run, conclusion }]).status, 'fail');
  }
});

test('missing, duplicate and wrong-attempt artifacts fail', () => {
  for (const artifacts of [[], [artifact, artifact], [{ ...artifact, name: 'ekavio-postgresql-123-1' }]]) {
    assert.equal(evaluate([run], artifacts).reason, 'matching_artifact_missing_or_ambiguous');
  }
});

test('expired, empty, malformed and wrong-time artifact metadata fail', () => {
  for (const change of [
    { expired: true }, { size_in_bytes: 0 }, { size_in_bytes: -1 },
    { size_in_bytes: 1.5 }, { expires_at: 'invalid' }, { expires_at: '2026-10-04T12:00:00Z' },
    { created_at: 'invalid' }, { created_at: '2026-10-04T01:00:00Z' },
    { created_at: '2026-10-04T13:00:00Z' },
  ]) assert.equal(evaluate([run], [{ ...artifact, ...change }]).reason, 'artifact_invalid_or_expired');
});

test('invalid run identity/time and invalid clocks cannot pass', () => {
  for (const change of [{ id: 0 }, { run_attempt: 0 }, { run_started_at: 'invalid' }]) {
    assert.throws(() => evaluate([{ ...run, ...change }]));
  }
  assert.throws(() => evaluate([run], [artifact], NaN));
});

test('live wrapper uses only two GET metadata endpoints with bounded requests', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(url);
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    return { ok: true, json: async () => calls.length === 1
      ? { workflow_runs: [run] } : { total_count: 1, artifacts: [artifact] } };
  };
  assert.equal((await checkBackupWatchdog({ repository, nowMs, fetchImpl })).status, 'pass');
  assert.equal(calls.length, 2);
  assert.match(calls[0], /workflows\/postgres-backup.yml\/runs\?branch=main&event=schedule/);
  assert.match(calls[1], /runs\/123\/artifacts\?per_page=100$/);
});

test('metadata API failures, malformed/incomplete responses and invalid repository fail closed', async () => {
  await assert.rejects(checkBackupWatchdog({ repository, fetchImpl: async () => ({ ok: false }) }));
  await assert.rejects(checkBackupWatchdog({ repository, fetchImpl: async () => { throw new Error('private failure'); } }));
  await assert.rejects(checkBackupWatchdog({ repository, fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }));
  let calls = 0;
  await assert.rejects(checkBackupWatchdog({ repository, fetchImpl: async () => ({ ok: true, json: async () =>
    ++calls === 1 ? { workflow_runs: [run] } : { total_count: 101, artifacts: [artifact] } }) }));
  await assert.rejects(checkBackupWatchdog({ repository: '../private?query' }));
});

test('workflow keeps monitoring separate, read-only and credential-free for databases', async () => {
  const workflow = await readFile(new URL('../.github/workflows/backup-watchdog.yml', import.meta.url), 'utf8');
  const script = await readFile(new URL('./backup-watchdog.mjs', import.meta.url), 'utf8');
  const ci = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cron: '43 \* \* \* \*'/);
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /timeout-minutes: 5/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /workflows: \[Encrypted PostgreSQL Backup\]/);
  assert.match(workflow, /notification_test/);
  assert.match(ci, /node --test scripts\/backup-watchdog.test.mjs/);
  for (const source of [workflow, script]) {
    assert.doesNotMatch(source, /secrets\.|DATABASE_URL|MONGO_URI|PRIVATE_KEY|PUBLIC_KEY_PEM|pg_dump|pg_restore|actions\/download-artifact|permissions:[\s\S]*?actions: write/);
  }
  assert.doesNotMatch(script, /response\.text\(|console\.(log|error)\(.*(?:token|error)/);
});
