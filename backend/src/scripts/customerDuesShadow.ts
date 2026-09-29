import path from 'node:path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { loadConfig } from '../config/env.js';
import {
  CustomerDuesMigrationBlockedError,
  runCustomerDuesMigration,
} from '../domains/customerDues/migration.js';
import { loadCustomerDuesMigrationMapping } from '../domains/customerDues/migrationMapping.js';
import { MongoCustomerDuesLegacySource } from '../domains/customerDues/mongoMigrationSource.js';
import { PostgresDatabase } from '../postgres/database.js';

dotenv.config({ quiet: true });
const args = process.argv.slice(2);
const mappingIndex = args.indexOf('--mapping');
const mappingArgument = mappingIndex >= 0 ? args[mappingIndex + 1] : undefined;
const apply = args.includes('--apply');
const recovery = args.includes('--recover-customer-dues-authority');
const known = new Set(['--mapping', '--apply', '--recover-customer-dues-authority', mappingArgument]);
const config = loadConfig(process.env);
const database = new PostgresDatabase(config.databaseUrl);

try {
  if (!mappingArgument || args.some((argument) => !known.has(argument))) {
    throw new Error('Usage: operations:customer-dues:shadow -- --mapping <reviewed.json> [--apply] [--recover-customer-dues-authority]');
  }
  if (recovery && !apply) throw new Error('Customer Dues recovery mode requires --apply');
  await connectDB(config.mongoUri);
  const report = await runCustomerDuesMigration({
    source: new MongoCustomerDuesLegacySource(),
    mapping: await loadCustomerDuesMigrationMapping(path.resolve(mappingArgument)),
    database,
    ...(apply ? { apply: true } : {}),
    ...(recovery ? { allowCustomerDuesRecovery: true } : {}),
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.blockerCount > 0) process.exitCode = 1;
} catch (error) {
  if (error instanceof CustomerDuesMigrationBlockedError) {
    console.error(error.message);
    for (const issue of error.issues) console.error(`- ${issue.code} ${issue.sourceRef}: ${issue.message}`);
  } else {
    console.error(error instanceof Error ? error.message : 'Customer Dues migration failed');
  }
  process.exitCode = 1;
} finally {
  await Promise.allSettled([mongoose.disconnect(), database.close()]);
}
