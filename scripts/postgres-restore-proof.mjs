import { basename } from 'node:path';
import {
  requireAbsoluteOutsideRepository,
  runDocker,
  sanitizeDiagnostic,
  validateArchive,
} from './postgres-tooling.mjs';

const usage = `Usage:
  node scripts/postgres-restore-proof.mjs --archive <absolute-path> \\
    --database ekavio_v207a_restore_<suffix> [--drop-after-verification]`;

const readArguments = () => {
  const result = { archive: '', database: '', dropAfterVerification: false };
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === '--archive') result.archive = process.argv[++index] ?? '';
    else if (argument === '--database') result.database = process.argv[++index] ?? '';
    else if (argument === '--drop-after-verification') result.dropAfterVerification = true;
    else throw new Error(`Unknown argument: ${argument}\n${usage}`);
  }
  if (!result.archive || !result.database) throw new Error(usage);
  if (!/^ekavio_v207a_restore_[a-z0-9_]+$/.test(result.database)) {
    throw new Error('Disposable database name must use the ekavio_v207a_restore_ prefix');
  }
  return result;
};

const runPostgres = (shellCommand, ...argumentsList) => runDocker([
  'compose', 'exec', '-T', 'postgres', 'sh', '-c', shellCommand, 'sh', ...argumentsList,
]);

const runBackendAgainst = (database, script) => runDocker([
  'compose', 'run', '--rm', '--no-deps', '-T', 'backend', 'sh', '-c',
  `export DATABASE_URL="\${DATABASE_URL%/*}/$1"; exec node ${script}`,
  'sh', database,
]);

try {
  const input = readArguments();
  const archive = requireAbsoluteOutsideRepository(input.archive, 'Archive');
  const validation = await validateArchive(archive);
  const runningServices = (await runDocker(['compose', 'ps', '--status', 'running', '--services']))
    .split(/\r?\n/)
    .filter(Boolean);
  for (const requiredService of ['postgres', 'backend']) {
    if (!runningServices.includes(requiredService)) {
      throw new Error(`Required Compose service is not running: ${requiredService}`);
    }
  }

  const existenceQuery = `SELECT COUNT(*) FROM pg_database WHERE datname = '${input.database}'`;
  const existing = (await runPostgres(
    'exec psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --tuples-only --no-align --command="$1"',
    existenceQuery,
  )).trim();
  if (existing !== '0') throw new Error('Disposable restore database already exists');

  const restoreStartedAt = Date.now();
  await runPostgres('exec createdb --username="$POSTGRES_USER" "$1"', input.database);
  await runDocker([
    'compose', 'exec', '-T', 'postgres', 'sh', '-c',
    'exec pg_restore --exit-on-error --no-owner --no-acl --username="$POSTGRES_USER" --dbname="$1"',
    'sh', input.database,
  ], { inputPath: archive });
  const migrationStatus = await runBackendAgainst(
    input.database,
    'dist/scripts/postgresMigrationStatus.js',
  );
  const integrityOutput = await runBackendAgainst(
    input.database,
    'dist/scripts/postgresRestoreIntegrity.js',
  );
  const integrity = JSON.parse(integrityOutput);
  const restoreDurationMs = Date.now() - restoreStartedAt;

  if (input.dropAfterVerification) {
    await runPostgres('exec dropdb --username="$POSTGRES_USER" "$1"', input.database);
  }

  console.log(JSON.stringify({
    status: 'restore_verified',
    archive: basename(archive),
    archiveSizeBytes: validation.sizeBytes,
    disposableDatabase: input.database,
    migrationStatus: migrationStatus.trim().split(/\r?\n/),
    integrity,
    restoreDurationMs,
    disposableDatabaseRemoved: input.dropAfterVerification,
  }, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown restore failure';
  console.error(`PostgreSQL restore proof failed: ${sanitizeDiagnostic(message)}`);
  process.exitCode = 1;
}
