import path from 'node:path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { loadLegacyToolConfig } from '../config/env.js';
import { activateCustomerDuesAuthority } from '../domains/customerDues/authority.js';
import { runCustomerDuesCutoverPreflight } from '../domains/customerDues/migration.js';
import { loadCustomerDuesMigrationMapping } from '../domains/customerDues/migrationMapping.js';
import { MongoCustomerDuesLegacySource } from '../domains/customerDues/mongoMigrationSource.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import { PostgresDatabase } from '../postgres/database.js';

dotenv.config({ quiet: true });
const args = process.argv.slice(2);
const mappingIndex = args.indexOf('--mapping');
const mappingArgument = mappingIndex >= 0 ? args[mappingIndex + 1] : undefined;
const apply = args.includes('--apply');
const known = new Set(['--mapping', '--apply', mappingArgument]);
const config = loadLegacyToolConfig(process.env);
const database = new PostgresDatabase(config.databaseUrl);

try {
  if (!mappingArgument || args.some((argument) => !known.has(argument))) {
    throw new Error('Usage: operations:customer-dues:activate -- --mapping <reviewed.json> [--apply]');
  }
  await connectDB(config.mongoUri);
  const preflight = await runCustomerDuesCutoverPreflight({
    source: new MongoCustomerDuesLegacySource(),
    mapping: await loadCustomerDuesMigrationMapping(path.resolve(mappingArgument)),
    database,
    customerDuesAuthority: runtimePersistence.customerDuesAuthority,
    allowPendingActivation: true,
  });
  if (!preflight.ready) {
    throw new Error(`Customer Dues authority activation blocked: ${preflight.failures.join(', ')}`);
  }
  if (apply) await activateCustomerDuesAuthority(database);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', activated: apply, preflight }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Customer Dues authority activation failed');
  process.exitCode = 1;
} finally {
  await Promise.allSettled([mongoose.disconnect(), database.close()]);
}
