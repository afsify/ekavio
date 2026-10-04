// @ts-check
import { pathToFileURL } from 'node:url';

export const MAX_BACKUP_AGE_HOURS = 30;
export const BACKUP_WORKFLOW_PATH = '.github/workflows/postgres-backup.yml';

/** @typedef {{id:number, event:string, head_branch:string, path:string, status:string, conclusion:string|null, run_attempt:number, run_started_at:string, repository:{full_name:string}}} BackupRun */
/** @typedef {{name:string, expired:boolean, size_in_bytes:number, created_at:string, expires_at:string}} BackupArtifact */

/** @param {BackupRun[]} runs @param {string} repository */
export function latestScheduledRun(runs, repository) {
  const scheduled = runs.filter(run => run.event === 'schedule'
    && run.head_branch === 'main' && run.path === BACKUP_WORKFLOW_PATH
    && run.repository?.full_name === repository && run.status === 'completed');
  if (scheduled.some(run => !Number.isFinite(Date.parse(run.run_started_at)))) {
    throw new Error('invalid_run_metadata');
  }
  return scheduled.sort((a, b) => Date.parse(b.run_started_at) - Date.parse(a.run_started_at))[0];
}

/** @param {{runs:BackupRun[], artifacts:BackupArtifact[], repository:string, nowMs?:number}} input */
export function evaluateBackupMetadata({ runs, artifacts, repository, nowMs = Date.now() }) {
  if (!Number.isFinite(nowMs)) throw new Error('invalid_clock');
  const run = latestScheduledRun(runs, repository);
  if (!run) return { status: 'fail', reason: 'no_completed_scheduled_backup' };
  if (!Number.isSafeInteger(run.id) || run.id < 1
    || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) {
    throw new Error('invalid_run_metadata');
  }
  const ageMs = nowMs - Date.parse(run.run_started_at);
  const common = { runId: run.id, event: 'schedule', maxAgeHours: MAX_BACKUP_AGE_HOURS };
  if (ageMs < 0) return { ...common, status: 'fail', reason: 'future_backup_timestamp' };
  if (run.conclusion !== 'success') return { ...common, status: 'fail', reason: 'latest_scheduled_backup_not_successful' };
  if (ageMs > MAX_BACKUP_AGE_HOURS * 3_600_000) return { ...common, status: 'fail', reason: 'scheduled_backup_overdue' };
  const expectedName = `ekavio-postgresql-${run.id}-${run.run_attempt}`;
  const matches = artifacts.filter(artifact => artifact.name === expectedName);
  if (matches.length !== 1) return { ...common, status: 'fail', reason: 'matching_artifact_missing_or_ambiguous' };
  const artifact = matches[0];
  const created = Date.parse(artifact.created_at);
  const expires = Date.parse(artifact.expires_at);
  if (artifact.expired !== false || !Number.isSafeInteger(artifact.size_in_bytes)
    || artifact.size_in_bytes <= 0 || !Number.isFinite(created) || !Number.isFinite(expires)
    || created < Date.parse(run.run_started_at) || created > nowMs || expires <= nowMs) {
    return { ...common, status: 'fail', reason: 'artifact_invalid_or_expired' };
  }
  return { ...common, status: 'pass', ageHours: Number((ageMs / 3_600_000).toFixed(3)), artifactExpiresAt: artifact.expires_at };
}

/**
 * Only GitHub metadata endpoints; no archive/log downloads, database access or writes.
 * @param {{repository:string, token?:string, fetchImpl?:typeof fetch, nowMs?:number}} input
 */
export async function checkBackupWatchdog({ repository, token, fetchImpl = fetch, nowMs = Date.now() }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('invalid_repository');
  /** @param {string} endpoint */
  async function metadata(endpoint) {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}/actions/${endpoint}`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Ekavio-backup-watchdog',
        'X-GitHub-Api-Version': '2026-03-10',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) throw new Error('metadata_api_unavailable');
    return response.json();
  }
  // Event filter prevents manual dispatches from masking missed scheduled backups.
  const response = await metadata('workflows/postgres-backup.yml/runs?branch=main&event=schedule&per_page=100');
  if (!Array.isArray(response.workflow_runs)) throw new Error('invalid_run_metadata');
  const run = latestScheduledRun(response.workflow_runs, repository);
  if (!run) return evaluateBackupMetadata({ runs: response.workflow_runs, artifacts: [], repository, nowMs });
  if (!Number.isSafeInteger(run.id) || run.id < 1) throw new Error('invalid_run_metadata');
  const artifactResponse = await metadata(`runs/${run.id}/artifacts?per_page=100`);
  if (!Array.isArray(artifactResponse.artifacts)) throw new Error('invalid_artifact_metadata');
  // If a bounded page cannot establish completeness, never infer a pass.
  if (artifactResponse.total_count !== artifactResponse.artifacts.length) throw new Error('incomplete_artifact_metadata');
  return evaluateBackupMetadata({ runs: response.workflow_runs, artifacts: artifactResponse.artifacts, repository, nowMs });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await checkBackupWatchdog({
      repository: process.env.GITHUB_REPOSITORY ?? 'afsify/ekavio',
      token: process.env.GITHUB_TOKEN,
    });
    console.log(JSON.stringify(result));
    if (result.status !== 'pass') process.exitCode = 1;
  } catch {
    // Never print raw responses, credential-bearing request objects or errors.
    console.log(JSON.stringify({ status: 'fail', reason: 'metadata_check_unavailable' }));
    process.exitCode = 1;
  }
}
