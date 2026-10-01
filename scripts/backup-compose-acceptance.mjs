import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decryptArchive } from './backup-envelope.mjs';
import { sanitizeDiagnostic, validateArchive } from './postgres-tooling.mjs';

if (process.argv.length !== 3 || process.argv[2] !== '--confirm-local-disposable') {
  throw new Error('Usage: node scripts/backup-compose-acceptance.mjs --confirm-local-disposable');
}

const runNode = (script, args, extraEnvironment = {}) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], {
    shell: false,
    windowsHide: true,
    env: { ...process.env, ...extraEnvironment },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout = (stdout + chunk.toString()).slice(0, 100_000); });
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(0, 20_000); });
  child.once('error', reject);
  child.once('close', (code) => {
    if (code !== 0) reject(new Error(sanitizeDiagnostic(stderr || `Command exited with status ${code}`)));
    else {
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Command did not return a JSON verification report')); }
    }
  });
});

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'ekavio-v207c-compose-acceptance-'));
try {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 3072,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const backup = await runNode('./postgres-encrypted-backup.mjs', [
    '--output-dir', temporaryDirectory, '--compose',
  ], { EKAVIO_BACKUP_PUBLIC_KEY_PEM: publicKey });
  assert.equal(backup.status, 'encrypted_backup_validated');
  const encrypted = join(temporaryDirectory, backup.encryptedFilename);
  const plaintext = join(temporaryDirectory, 'decrypted-local-proof.dump');
  const decrypted = await decryptArchive({ inputPath: encrypted, outputPath: plaintext, privateKeyPem: privateKey });
  assert.equal(decrypted.sha256, backup.plaintextSha256);
  const archive = await validateArchive(plaintext);
  assert.ok(archive.tocEntries > 0);
  const database = `ekavio_v207a_restore_v207c_${randomUUID().replaceAll('-', '')}`;
  const restored = await runNode('./postgres-restore-proof.mjs', [
    '--archive', plaintext,
    '--database', database,
    '--drop-after-verification',
  ]);
  assert.equal(restored.status, 'restore_verified');
  assert.equal(restored.disposableDatabaseRemoved, true);
  assert.equal(restored.integrity.migrations.applied, 12);
  assert.ok(Object.values(restored.integrity.integrity).every((count) => count === '0'));
  console.log(JSON.stringify({
    status: 'local_encrypted_backup_restore_passed',
    encryptedArtifact: basename(encrypted),
    archiveSizeBytes: archive.sizeBytes,
    migrationCount: restored.integrity.migrations.applied,
    orphanChecks: restored.integrity.integrity,
    restoreDurationMs: restored.restoreDurationMs,
    disposableDatabaseRemoved: true,
  }));
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown local acceptance failure';
  console.error(`Local encrypted backup acceptance failed: ${sanitizeDiagnostic(message)}`);
  process.exitCode = 1;
} finally {
  for (const name of await readdir(temporaryDirectory)) {
    if (/^(ekavio-postgresql-[0-9TZ]+\.dump\.evb(\.json)?|decrypted-local-proof\.dump)$/.test(name)) {
      await rm(join(temporaryDirectory, name), { force: true });
    }
  }
  await rmdir(temporaryDirectory);
}
