import path from 'node:path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { loadConfig } from '../config/env.js';
import { MongoOperationalLegacySource } from '../domains/queue/mongoMigrationSource.js';
import { loadOperationalMigrationMapping } from '../domains/queue/migrationMapping.js';
import { OperationalMigrationBlockedError, runOperationalMigration } from '../domains/queue/migration.js';
import { PostgresDatabase } from '../postgres/database.js';

dotenv.config({ quiet: true });
const args = process.argv.slice(2);
const mappingIndex = args.indexOf('--mapping');
const mappingArgument = mappingIndex >= 0 ? args[mappingIndex + 1] : undefined;
const apply = args.includes('--apply');
const recovery = args.includes('--recover-operational-authority');
const known = new Set(['--mapping', '--apply', '--recover-operational-authority', mappingArgument]);
const config = loadConfig(process.env);
let database: PostgresDatabase | undefined;

try {
  if (!mappingArgument || args.some((argument) => !known.has(argument))) {
    throw new Error('Usage: operations:queue:shadow -- --mapping <reviewed.json> [--apply] [--recover-operational-authority]');
  }
  if (recovery && !apply) throw new Error('Operational recovery mode requires --apply');
  await connectDB(config.mongoUri);
  if (apply) database = new PostgresDatabase(config.databaseUrl);
  const report = await runOperationalMigration({
    source: new MongoOperationalLegacySource(),
    mapping: await loadOperationalMigrationMapping(path.resolve(mappingArgument)),
    ...(database ? { database, apply: true } : {}),
    ...(recovery ? { allowOperationalRecovery: true } : {}),
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.issues.length > 0) process.exitCode = 1;
} catch (error) {
  if (error instanceof OperationalMigrationBlockedError) {
    console.error(error.message);
    for (const issue of error.issues) console.error(`- ${issue.code} ${issue.sourceRef}: ${issue.message}`);
  } else {
    console.error(error instanceof Error ? error.message : 'Operational Queue shadow migration failed');
  }
  process.exitCode = 1;
} finally {
  await Promise.allSettled([
    mongoose.disconnect(),
    ...(database ? [database.close()] : []),
  ]);
}
