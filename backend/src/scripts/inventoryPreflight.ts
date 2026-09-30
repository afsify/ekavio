import path from 'node:path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { loadLegacyToolConfig } from '../config/env.js';
import { runInventoryCutoverPreflight } from '../domains/inventory/migration.js';
import { loadInventoryMigrationMapping } from '../domains/inventory/migrationMapping.js';
import { MongoInventoryLegacySource } from '../domains/inventory/mongoMigrationSource.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import { PostgresDatabase } from '../postgres/database.js';

dotenv.config({ quiet: true });
const args = process.argv.slice(2);
const mappingIndex = args.indexOf('--mapping');
const mappingArgument = mappingIndex >= 0 ? args[mappingIndex + 1] : undefined;
const config = loadLegacyToolConfig(process.env);
const database = new PostgresDatabase(config.databaseUrl);

try {
  if (!mappingArgument || args.length !== 2 || mappingIndex !== 0) {
    throw new Error('Usage: operations:inventory:preflight -- --mapping <reviewed.json>');
  }
  await connectDB(config.mongoUri);
  const report = await runInventoryCutoverPreflight({
    source: new MongoInventoryLegacySource(),
    mapping: await loadInventoryMigrationMapping(path.resolve(mappingArgument)),
    database,
    inventoryAuthority: runtimePersistence.inventoryAuthority,
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Inventory preflight failed');
  process.exitCode = 1;
} finally {
  await Promise.allSettled([mongoose.disconnect(), database.close()]);
}
