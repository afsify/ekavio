import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

export const POSTGRES_IMAGE =
  'postgres:17.11-alpine3.23@sha256:9ae4e8f8d0284836a505f0b2e825144e32e20499856e7dc5f7b99e19d10eedd6';
export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const isWithin = (parent, candidate) => {
  const pathFromParent = relative(parent, candidate);
  return pathFromParent === '' || (!pathFromParent.startsWith('..') && !isAbsolute(pathFromParent));
};

export const requireAbsoluteOutsideRepository = (value, label) => {
  if (!isAbsolute(value)) throw new Error(`${label} must be an absolute path`);
  const resolved = resolve(value);
  if (isWithin(repositoryRoot, resolved)) {
    throw new Error(`${label} must be outside the repository`);
  }
  return resolved;
};

export const sanitizeDiagnostic = (value) => value
  .replace(/(postgres(?:ql)?:\/\/)([^@\s]+)@/gi, '$1[redacted]@')
  .replace(/\b(password|passfile)=([^\s;]+)/gi, '$1=[redacted]')
  .slice(0, 4_096);

const collect = (stream, maximumBytes = 2_000_000) => new Promise((resolvePromise, reject) => {
  const chunks = [];
  let length = 0;
  stream.on('data', (chunk) => {
    if (length >= maximumBytes) return;
    const available = maximumBytes - length;
    const next = chunk.subarray(0, available);
    chunks.push(next);
    length += next.length;
  });
  stream.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
  stream.on('error', reject);
});

export const runDocker = async (argumentsList, options = {}) => {
  const child = spawn('docker', argumentsList, {
    cwd: repositoryRoot,
    env: process.env,
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stderrPromise = collect(child.stderr, 65_536);
  const closePromise = new Promise((resolvePromise, reject) => {
    child.once('error', reject);
    child.once('close', resolvePromise);
  });

  const stdoutPromise = options.outputPath
    ? pipeline(child.stdout, createWriteStream(options.outputPath, { flags: 'wx', mode: 0o600 }))
    : collect(child.stdout, options.maximumOutputBytes);
  const stdinPromise = options.inputPath
    ? pipeline(createReadStream(options.inputPath), child.stdin)
    : Promise.resolve(child.stdin.end());

  const code = await closePromise;
  const stderr = await stderrPromise;
  const [stdoutResult, stdinResult] = await Promise.allSettled([stdoutPromise, stdinPromise]);
  if (code !== 0) {
    throw new Error(sanitizeDiagnostic(stderr.trim() || `Docker command exited with status ${code}`));
  }
  if (stdoutResult.status === 'rejected') throw stdoutResult.reason;
  if (stdinResult.status === 'rejected') throw stdinResult.reason;
  return typeof stdoutResult.value === 'string' ? stdoutResult.value : '';
};

export const validateArchive = async (archivePath) => {
  await access(archivePath);
  const archiveStat = await stat(archivePath);
  if (!archiveStat.isFile() || archiveStat.size === 0) {
    throw new Error('Backup archive is missing or empty');
  }
  const listing = await runDocker(
    ['run', '--rm', '-i', POSTGRES_IMAGE, 'pg_restore', '--list'],
    { inputPath: archivePath },
  );
  if (!listing.includes('; Archive created at')) {
    throw new Error('pg_restore did not recognize a PostgreSQL custom-format archive');
  }
  return { sizeBytes: archiveStat.size, tocEntries: listing.split(/\r?\n/).filter(Boolean).length };
};

export const ensureDirectory = (directory) => mkdir(directory, { recursive: true, mode: 0o700 });
