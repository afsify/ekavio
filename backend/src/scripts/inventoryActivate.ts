import path from 'node:path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { loadConfig } from '../config/env.js';
import { activateInventoryAuthority } from '../domains/inventory/authority.js';
import { runInventoryCutoverPreflight } from '../domains/inventory/migration.js';
import { loadInventoryMigrationMapping } from '../domains/inventory/migrationMapping.js';
import { MongoInventoryLegacySource } from '../domains/inventory/mongoMigrationSource.js';
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
    throw new Error('Usage: operations:inventory:activate -- --mapping <reviewed.json> [--apply]');
  }
  await connectDB(config.mongoUri);
  const preflight = await runInventoryCutoverPreflight({
    source: new MongoInventoryLegacySource(),
    mapping: await loadInventoryMigrationMapping(path.resolve(mappingArgument)),
    database,
    inventoryAuthority: runtimePersistence.inventoryAuthority,
    allowPendingActivation: true,
  });
  if (!preflight.ready) {
    throw new Error(`Inventory authority activation blocked: ${preflight.failures.join(', ')}`);
  }
  if (apply) await activateInventoryAuthority(database);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', activated: apply, preflight }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Inventory authority activation failed');
  process.exitCode = 1;
} finally {
  await Promise.allSettled([mongoose.disconnect(), database.close()]);
}
