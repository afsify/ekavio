import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readdir, rm, rmdir, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { encryptArchive } from './backup-envelope.mjs';
import { requireAbsoluteOutsideRepository, sanitizeDiagnostic } from './postgres-tooling.mjs';

const usage = 'Usage: node scripts/postgres-encrypted-backup.mjs --output-dir <absolute-path> [--compose | --connection-env EKAVIO_BACKUP_DATABASE_URL] [--public-key-env EKAVIO_BACKUP_PUBLIC_KEY_PEM]';
const args = { outputDir: '', compose: false, connectionEnv: 'EKAVIO_BACKUP_DATABASE_URL', publicKeyEnv: 'EKAVIO_BACKUP_PUBLIC_KEY_PEM' };
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === '--output-dir') args.outputDir = process.argv[++index] ?? '';
  else if (argument === '--compose') args.compose = true;
  else if (argument === '--connection-env') args.connectionEnv = process.argv[++index] ?? '';
  else if (argument === '--public-key-env') args.publicKeyEnv = process.argv[++index] ?? '';
  else throw new Error(usage);
}
if (!args.outputDir || ![args.connectionEnv, args.publicKeyEnv].every((value) => /^[A-Z][A-Z0-9_]*$/.test(value))) {
  throw new Error(usage);
}

const captureBackupReport = (directory) => new Promise((resolve, reject) => {
  const script = fileURLToPath(new URL('./postgres-backup.mjs', import.meta.url));
  const backupArguments = args.compose
    ? [script, '--output-dir', directory, '--compose']
    : [script, '--output-dir', directory, '--connection-env', args.connectionEnv];
  const child = spawn(process.execPath, backupArguments, {
    shell: false,
    windowsHide: true,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout = (stdout + chunk.toString()).slice(0, 16_384); });
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(0, 8_192); });
  child.once('error', reject);
  child.once('close', (code) => {
    if (code !== 0) reject(new Error(sanitizeDiagnostic(stderr || 'PostgreSQL backup command failed')));
    else {
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Backup command did not return valid metadata')); }
    }
  });
});

let temporaryDirectory;
let encryptedPath;
let manifestPath;
let encryptedCreated = false;
let manifestCreated = false;
try {
  const outputDirectory = requireAbsoluteOutsideRepository(args.outputDir, 'Encrypted output directory');
  if (!args.compose && !process.env[args.connectionEnv]) throw new Error(`${args.connectionEnv} is required`);
  if (!process.env[args.publicKeyEnv]) throw new Error(`${args.publicKeyEnv} is required`);
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'ekavio-v207c-pg-'));
  const backup = await captureBackupReport(temporaryDirectory);
  if (backup.status !== 'backup_validated' ||
    typeof backup.archive !== 'string' ||
    !backup.archive.startsWith(`${temporaryDirectory}${process.platform === 'win32' ? '\\' : '/'}`) ||
    !/^ekavio-postgresql-[0-9TZ]+\.dump$/.test(basename(backup.archive))) {
    throw new Error('Backup command returned an unexpected archive location');
  }
  encryptedPath = join(outputDirectory, `${basename(backup.archive)}.evb`);
  const envelope = await encryptArchive({
    inputPath: backup.archive,
    outputPath: encryptedPath,
    publicKeyPem: process.env[args.publicKeyEnv],
    expectedSha256: backup.sha256,
  });
  encryptedCreated = true;
  manifestPath = `${encryptedPath}.json`;
  const manifest = {
    status: 'encrypted_backup_validated',
    createdAtUtc: new Date().toISOString(),
    ...envelope,
    archiveTocEntries: backup.tocEntries,
    toolVersion: backup.toolVersion,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  manifestCreated = true;
  console.log(JSON.stringify(manifest));
} catch (error) {
  if (encryptedCreated) await rm(encryptedPath, { force: true });
  if (manifestCreated) await rm(manifestPath, { force: true });
  const message = error instanceof Error ? error.message : 'Unknown encrypted backup failure';
  console.error(`Encrypted PostgreSQL backup failed: ${sanitizeDiagnostic(message)}`);
  process.exitCode = 1;
} finally {
  if (temporaryDirectory) {
    for (const name of await readdir(temporaryDirectory)) {
      if (/^ekavio-postgresql-[0-9TZ]+\.dump$/.test(name)) {
        await rm(join(temporaryDirectory, name), { force: true });
      }
    }
    await rmdir(temporaryDirectory);
  }
}
