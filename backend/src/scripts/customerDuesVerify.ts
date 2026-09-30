import path from 'node:path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { loadLegacyToolConfig } from '../config/env.js';
import { verifyCustomerDuesMigration } from '../domains/customerDues/migration.js';
import { loadCustomerDuesMigrationMapping } from '../domains/customerDues/migrationMapping.js';
import { MongoCustomerDuesLegacySource } from '../domains/customerDues/mongoMigrationSource.js';
import { PostgresDatabase } from '../postgres/database.js';

dotenv.config({ quiet: true });
const args = process.argv.slice(2);
const mappingIndex = args.indexOf('--mapping');
const mappingArgument = mappingIndex >= 0 ? args[mappingIndex + 1] : undefined;
const config = loadLegacyToolConfig(process.env);
const database = new PostgresDatabase(config.databaseUrl);

try {
  if (!mappingArgument || args.length !== 2 || mappingIndex !== 0) {
    throw new Error('Usage: operations:customer-dues:verify -- --mapping <reviewed.json>');
  }
  await connectDB(config.mongoUri);
  const report = await verifyCustomerDuesMigration({
    source: new MongoCustomerDuesLegacySource(),
    mapping: await loadCustomerDuesMigrationMapping(path.resolve(mappingArgument)),
    database,
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.clean) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Customer Dues verification failed');
  process.exitCode = 1;
} finally {
  await Promise.allSettled([mongoose.disconnect(), database.close()]);
}
