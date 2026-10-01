import {
  constants,
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { createReadStream } from 'node:fs';
import { link, open, rm, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { requireAbsoluteOutsideRepository } from './postgres-tooling.mjs';

const MAGIC = Buffer.from('EKAVIOPG1\n', 'ascii');
const TAG_LENGTH = 16;
const MAX_HEADER_LENGTH = 8_192;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const SHA256 = /^[a-f0-9]{64}$/;

const writeAll = async (handle, chunk) => {
  let offset = 0;
  while (offset < chunk.length) {
    const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset);
    if (bytesWritten === 0) throw new Error('Encrypted backup write did not advance');
    offset += bytesWritten;
  }
};

const readExactly = async (handle, length, position) => {
  const result = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await handle.read(result, offset, length - offset, position + offset);
    if (bytesRead === 0) throw new Error('Encrypted backup is truncated');
    offset += bytesRead;
  }
  return result;
};

const decodeBase64 = (value, length, label) => {
  if (typeof value !== 'string' || !BASE64.test(value)) throw new Error(`Invalid ${label}`);
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== length || decoded.toString('base64') !== value) {
    throw new Error(`Invalid ${label}`);
  }
  return decoded;
};

const requireRsaKey = (key, kind) => {
  if (typeof key !== 'string' || !key.includes(`-----BEGIN ${kind} KEY-----`)) {
    throw new Error(`${kind} encryption key must be PEM encoded`);
  }
  const parsed = kind === 'PUBLIC' ? createPublicKey(key) : createPrivateKey(key);
  if (parsed.asymmetricKeyType !== 'rsa' || (parsed.asymmetricKeyDetails?.modulusLength ?? 0) < 3072) {
    throw new Error('Backup encryption requires an RSA key of at least 3072 bits');
  }
  return parsed;
};

const envelopeHeader = (wrappedKey, iv, size, sha256) => Buffer.from(JSON.stringify({
  version: 1,
  cipher: 'AES-256-GCM',
  keyWrap: 'RSA-OAEP-SHA256',
  wrappedKey: wrappedKey.toString('base64'),
  iv: iv.toString('base64'),
  plaintextSize: size,
  plaintextSha256: sha256,
}), 'utf8');

export const encryptArchive = async ({ inputPath, outputPath, publicKeyPem, expectedSha256 }) => {
  const input = requireAbsoluteOutsideRepository(inputPath, 'Plaintext archive');
  const output = requireAbsoluteOutsideRepository(outputPath, 'Encrypted archive');
  if (input === output) throw new Error('Encrypted output must differ from plaintext input');
  if (!SHA256.test(expectedSha256 ?? '')) throw new Error('Validated plaintext SHA-256 is required');
  const publicKey = requireRsaKey(publicKeyPem, 'PUBLIC');
  const inputStat = await stat(input);
  if (!inputStat.isFile() || inputStat.size === 0) throw new Error('Validated plaintext archive is missing');

  const dataKey = randomBytes(32);
  const iv = randomBytes(12);
  const wrappedKey = publicEncrypt({
    key: publicKey,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256',
  }, dataKey);
  const header = envelopeHeader(wrappedKey, iv, inputStat.size, expectedSha256);
  if (header.length > MAX_HEADER_LENGTH) throw new Error('Encrypted backup header exceeds limit');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
  cipher.setAAD(header);
  const plaintextHash = createHash('sha256');
  const ciphertextHash = createHash('sha256');
  let handle;
  let created = false;
  try {
    handle = await open(output, 'wx', 0o600);
    created = true;
    const write = async (bytes) => {
      await writeAll(handle, bytes);
      ciphertextHash.update(bytes);
    };
    await write(MAGIC);
    await write(length);
    await write(header);
    for await (const chunk of createReadStream(input)) {
      plaintextHash.update(chunk);
      await write(cipher.update(chunk));
    }
    await write(cipher.final());
    await write(cipher.getAuthTag());
    if (plaintextHash.digest('hex') !== expectedSha256) {
      throw new Error('Plaintext changed after archive validation');
    }
    await handle.sync();
    const encryptedStat = await handle.stat();
    return {
      format: 'EKAVIOPG1',
      encryption: 'AES-256-GCM + RSA-OAEP-SHA256',
      keyFingerprintSha256: createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex'),
      plaintextSizeBytes: inputStat.size,
      plaintextSha256: expectedSha256,
      encryptedSizeBytes: encryptedStat.size,
      encryptedSha256: ciphertextHash.digest('hex'),
      encryptedFilename: basename(output),
    };
  } catch (error) {
    if (handle) await handle.close();
    handle = undefined;
    if (created) await rm(output, { force: true });
    throw error;
  } finally {
    if (handle) await handle.close();
    dataKey.fill(0);
  }
};

export const decryptArchive = async ({ inputPath, outputPath, privateKeyPem }) => {
  const input = requireAbsoluteOutsideRepository(inputPath, 'Encrypted archive');
  const output = requireAbsoluteOutsideRepository(outputPath, 'Restored plaintext archive');
  if (input === output) throw new Error('Plaintext output must differ from encrypted input');
  const privateKey = requireRsaKey(privateKeyPem, 'PRIVATE');
  const partial = `${output}.partial-${randomUUID()}`;
  let source;
  let target;
  let dataKey;
  try {
    source = await open(input, 'r');
    const sourceStat = await source.stat();
    const prefix = await readExactly(source, MAGIC.length + 4, 0);
    if (!prefix.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Unknown backup envelope format');
    const headerLength = prefix.readUInt32BE(MAGIC.length);
    if (headerLength === 0 || headerLength > MAX_HEADER_LENGTH) throw new Error('Invalid backup envelope header length');
    const ciphertextStart = MAGIC.length + 4 + headerLength;
    if (sourceStat.size <= ciphertextStart + TAG_LENGTH) throw new Error('Encrypted backup is empty or truncated');
    const headerBytes = await readExactly(source, headerLength, MAGIC.length + 4);
    const header = JSON.parse(headerBytes.toString('utf8'));
    if (header.version !== 1 || header.cipher !== 'AES-256-GCM' || header.keyWrap !== 'RSA-OAEP-SHA256') {
      throw new Error('Unsupported backup envelope version');
    }
    if (!Number.isSafeInteger(header.plaintextSize) || header.plaintextSize <= 0 ||
      typeof header.plaintextSha256 !== 'string' || !SHA256.test(header.plaintextSha256)) {
      throw new Error('Invalid backup envelope metadata');
    }
    const iv = decodeBase64(header.iv, 12, 'backup nonce');
    const wrappedKey = decodeBase64(header.wrappedKey, privateKey.asymmetricKeyDetails.modulusLength / 8, 'wrapped key');
    dataKey = privateDecrypt({
      key: privateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    }, wrappedKey);
    if (dataKey.length !== 32) throw new Error('Invalid decrypted data key');
    const tag = await readExactly(source, TAG_LENGTH, sourceStat.size - TAG_LENGTH);
    const decipher = createDecipheriv('aes-256-gcm', dataKey, iv);
    decipher.setAAD(headerBytes);
    decipher.setAuthTag(tag);
    const plaintextHash = createHash('sha256');
    let plaintextSize = 0;
    target = await open(partial, 'wx', 0o600);
    for await (const chunk of createReadStream(input, {
      start: ciphertextStart,
      end: sourceStat.size - TAG_LENGTH - 1,
    })) {
      const plaintext = decipher.update(chunk);
      plaintextHash.update(plaintext);
      plaintextSize += plaintext.length;
      await writeAll(target, plaintext);
    }
    const final = decipher.final();
    plaintextHash.update(final);
    plaintextSize += final.length;
    await writeAll(target, final);
    if (plaintextSize !== header.plaintextSize || plaintextHash.digest('hex') !== header.plaintextSha256) {
      throw new Error('Decrypted backup checksum or size mismatch');
    }
    await target.sync();
    await target.close();
    target = undefined;
    await link(partial, output); // Fails if the destination already exists.
    await rm(partial);
    return { filename: basename(output), sizeBytes: plaintextSize, sha256: header.plaintextSha256 };
  } catch (error) {
    if (target) await target.close();
    await rm(partial, { force: true });
    throw error;
  } finally {
    dataKey?.fill(0);
    if (source) await source.close();
  }
};
