import { readFile } from 'node:fs/promises';
import { decryptArchive } from './backup-envelope.mjs';
import { requireAbsoluteOutsideRepository, sanitizeDiagnostic } from './postgres-tooling.mjs';

const usage = 'Usage: node scripts/postgres-decrypt-backup.mjs --encrypted <absolute-path> --output <absolute-path> --private-key-file <absolute-path-outside-repository>';
const args = { encrypted: '', output: '', privateKeyFile: '' };
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === '--encrypted') args.encrypted = process.argv[++index] ?? '';
  else if (argument === '--output') args.output = process.argv[++index] ?? '';
  else if (argument === '--private-key-file') args.privateKeyFile = process.argv[++index] ?? '';
  else throw new Error(usage);
}
if (!args.encrypted || !args.output || !args.privateKeyFile) throw new Error(usage);

try {
  const keyFile = requireAbsoluteOutsideRepository(args.privateKeyFile, 'Private key file');
  const privateKeyPem = await readFile(keyFile, 'utf8');
  const result = await decryptArchive({
    inputPath: args.encrypted,
    outputPath: args.output,
    privateKeyPem,
  });
  console.log(JSON.stringify({ status: 'decrypted_backup_authenticated', ...result }));
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown decrypt failure';
  console.error(`Backup decrypt failed: ${sanitizeDiagnostic(message)}`);
  process.exitCode = 1;
}
