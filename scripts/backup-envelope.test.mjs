import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, sep } from 'node:path';
import { after, test } from 'node:test';
import { decryptArchive, encryptArchive } from './backup-envelope.mjs';

const directory = await mkdtemp(join(tmpdir(), 'ekavio-v207c-envelope-test-'));
after(async () => {
  assert.ok(directory.startsWith(`${tmpdir()}${sep}`));
  assert.match(basename(directory), /^ekavio-v207c-envelope-test-/);
  await rm(directory, { recursive: true });
});

const keypair = () => generateKeyPairSync('rsa', {
  modulusLength: 3072,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

test('streamed authenticated envelope round-trips and identifies its offline key', async () => {
  const { publicKey, privateKey } = keypair();
  const plaintext = Buffer.concat([Buffer.from('PGDMP-disposable-test-only-'), Buffer.alloc(256_000, 0x72)]);
  const inputPath = join(directory, 'fixture.dump');
  const encryptedPath = join(directory, 'fixture.evb');
  const outputPath = join(directory, 'restored.dump');
  await writeFile(inputPath, plaintext);
  const sha256 = createHash('sha256').update(plaintext).digest('hex');
  const manifest = await encryptArchive({ inputPath, outputPath: encryptedPath, publicKeyPem: publicKey, expectedSha256: sha256 });
  assert.equal(manifest.plaintextSha256, sha256);
  assert.equal(manifest.encryptedSha256.length, 64);
  assert.equal(manifest.keyFingerprintSha256.length, 64);
  assert.equal((await readFile(encryptedPath)).includes(Buffer.from('PGDMP-disposable-test-only-')), false);
  const restored = await decryptArchive({ inputPath: encryptedPath, outputPath, privateKeyPem: privateKey });
  assert.equal(restored.sha256, sha256);
  assert.deepEqual(await readFile(outputPath), plaintext);
});

test('wrong private key and changed ciphertext fail without leaving plaintext', async () => {
  const first = keypair();
  const second = keypair();
  const plaintext = Buffer.from('PGDMP-fixture-for-authentication-test');
  const source = join(directory, 'tamper-source.dump');
  const encrypted = join(directory, 'tamper.evb');
  await writeFile(source, plaintext);
  await encryptArchive({
    inputPath: source,
    outputPath: encrypted,
    publicKeyPem: first.publicKey,
    expectedSha256: createHash('sha256').update(plaintext).digest('hex'),
  });
  const wrongOutput = join(directory, 'wrong-key.dump');
  await assert.rejects(decryptArchive({ inputPath: encrypted, outputPath: wrongOutput, privateKeyPem: second.privateKey }));
  await assert.rejects(stat(wrongOutput), { code: 'ENOENT' });
  const changed = await readFile(encrypted);
  changed[changed.length - 17] ^= 1;
  const changedPath = join(directory, 'changed.evb');
  await writeFile(changedPath, changed);
  const changedOutput = join(directory, 'changed.dump');
  await assert.rejects(decryptArchive({ inputPath: changedPath, outputPath: changedOutput, privateKeyPem: first.privateKey }));
  await assert.rejects(stat(changedOutput), { code: 'ENOENT' });
});

test('encryption refuses an existing output and never replaces it', async () => {
  const { publicKey } = keypair();
  const source = join(directory, 'existing-source.dump');
  const existing = join(directory, 'existing.evb');
  await writeFile(source, 'PGDMP-safe-test');
  await writeFile(existing, 'keep-existing');
  await assert.rejects(encryptArchive({
    inputPath: source,
    outputPath: existing,
    publicKeyPem: publicKey,
    expectedSha256: createHash('sha256').update('PGDMP-safe-test').digest('hex'),
  }), { code: 'EEXIST' });
  assert.equal(await readFile(existing, 'utf8'), 'keep-existing');
});
