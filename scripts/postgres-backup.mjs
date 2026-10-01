import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  POSTGRES_IMAGE,
  ensureDirectory,
  requireAbsoluteOutsideRepository,
  runDocker,
  sanitizeDiagnostic,
  validateArchive,
} from './postgres-tooling.mjs';

const usage = `Usage:
  node scripts/postgres-backup.mjs --output-dir <absolute-path> --compose
  node scripts/postgres-backup.mjs --output-dir <absolute-path> [--connection-env DATABASE_URL]`;

const readArguments = () => {
  const result = { outputDirectory: '', compose: false, connectionEnvironment: 'DATABASE_URL' };
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === '--output-dir') result.outputDirectory = process.argv[++index] ?? '';
    else if (argument === '--compose') result.compose = true;
    else if (argument === '--connection-env') {
      result.connectionEnvironment = process.argv[++index] ?? '';
    } else throw new Error(`Unknown argument: ${argument}\n${usage}`);
  }
  if (!result.outputDirectory) throw new Error(usage);
  if (!/^[A-Z][A-Z0-9_]*$/.test(result.connectionEnvironment)) {
    throw new Error('Connection environment variable name is invalid');
  }
  if (!result.compose) {
    const connectionValue = process.env[result.connectionEnvironment];
    if (!connectionValue) throw new Error(`${result.connectionEnvironment} is required`);
    try {
      const parsed = new URL(connectionValue);
      if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error();
    } catch {
      throw new Error(`${result.connectionEnvironment} must contain a PostgreSQL URL`);
    }
  }
  return result;
};

const checksum = async (path) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
};

const timestamp = () => new Date().toISOString()
  .replaceAll('-', '')
  .replaceAll(':', '')
  .replace('.', '')
  .replace('Z', 'Z');

let archivePath;
try {
  const startedAt = Date.now();
  const input = readArguments();
  const outputDirectory = requireAbsoluteOutsideRepository(input.outputDirectory, 'Output directory');
  await ensureDirectory(outputDirectory);
  archivePath = join(outputDirectory, `ekavio-postgresql-${timestamp()}.dump`);

  const argumentsList = input.compose
    ? [
        'compose', 'exec', '-T', 'postgres', 'sh', '-c',
        'exec pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --no-owner --no-acl',
      ]
    : [
        'run', '--rm', '-i', '-e', input.connectionEnvironment, POSTGRES_IMAGE, 'sh', '-c',
        `exec pg_dump --dbname="$${input.connectionEnvironment}" --format=custom --no-owner --no-acl`,
      ];
  await runDocker(argumentsList, { outputPath: archivePath });
  const validation = await validateArchive(archivePath);
  const version = (await runDocker(['run', '--rm', POSTGRES_IMAGE, 'pg_dump', '--version'])).trim();

  console.log(JSON.stringify({
    status: 'backup_validated',
    source: input.compose ? 'local-compose-postgres' : 'operator-supplied-postgresql-url',
    archive: archivePath,
    filename: basename(archivePath),
    sizeBytes: validation.sizeBytes,
    tocEntries: validation.tocEntries,
    sha256: await checksum(archivePath),
    toolImage: POSTGRES_IMAGE,
    toolVersion: version,
    durationMs: Date.now() - startedAt,
  }, null, 2));
} catch (error) {
  if (archivePath) await rm(archivePath, { force: true });
  const message = error instanceof Error ? error.message : 'Unknown backup failure';
  console.error(`PostgreSQL backup failed: ${sanitizeDiagnostic(message)}`);
  process.exitCode = 1;
}
