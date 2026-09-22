import path from 'node:path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { loadConfig } from '../config/env.js';
import { MongoOperationalLegacySource } from '../domains/queue/mongoMigrationSource.js';
import { activateOperationalAuthority } from '../domains/queue/operationalAuthority.js';
import { runOperationalCutoverPreflight } from '../domains/queue/migration.js';
import { loadOperationalMigrationMapping } from '../domains/queue/migrationMapping.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import { PostgresDatabase } from '../postgres/database.js';

dotenv.config({ quiet: true });
const args = process.argv.slice(2);
const mappingIndex = args.indexOf('--mapping');
const mappingArgument = mappingIndex >= 0 ? args[mappingIndex + 1] : undefined;
const apply = args.includes('--apply');
const known = new Set(['--mapping', '--apply', mappingArgument]);
const config = loadConfig(process.env);
const database = new PostgresDatabase(config.databaseUrl);

try {
  if (!mappingArgument || args.some((argument) => !known.has(argument))) {
    throw new Error('Usage: operations:queue:activate -- --mapping <reviewed.json> [--apply]');
  }
  await connectDB(config.mongoUri);
  const preflight = await runOperationalCutoverPreflight({
    source: new MongoOperationalLegacySource(),
    mapping: await loadOperationalMigrationMapping(path.resolve(mappingArgument)),
    database,
    operationalAuthority: runtimePersistence.operationalAuthority,
    allowPendingActivation: true,
  });
  if (!preflight.ready) throw new Error(`Operational authority activation blocked: ${preflight.failures.join(', ')}`);
  if (apply) await activateOperationalAuthority(database);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', activated: apply, preflight }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Operational authority activation failed');
  process.exitCode = 1;
} finally {
  await Promise.allSettled([mongoose.disconnect(), database.close()]);
}
