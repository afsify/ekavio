import path from 'node:path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { loadConfig } from '../config/env.js';
import { MongoOperationalLegacySource } from '../domains/queue/mongoMigrationSource.js';
import { verifyOperationalMigration } from '../domains/queue/migration.js';
import { loadOperationalMigrationMapping } from '../domains/queue/migrationMapping.js';
import { PostgresDatabase } from '../postgres/database.js';

dotenv.config({ quiet: true });
const args = process.argv.slice(2);
const mappingIndex = args.indexOf('--mapping');
const mappingArgument = mappingIndex >= 0 ? args[mappingIndex + 1] : undefined;
const config = loadConfig(process.env);
const database = new PostgresDatabase(config.databaseUrl);

try {
  if (!mappingArgument || args.length !== 2 || mappingIndex !== 0) {
    throw new Error('Usage: operations:queue:verify -- --mapping <reviewed.json>');
  }
  await connectDB(config.mongoUri);
  const report = await verifyOperationalMigration({
    source: new MongoOperationalLegacySource(),
    mapping: await loadOperationalMigrationMapping(path.resolve(mappingArgument)),
    database,
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.clean) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Operational Queue verification failed');
  process.exitCode = 1;
} finally {
  await Promise.allSettled([mongoose.disconnect(), database.close()]);
}
