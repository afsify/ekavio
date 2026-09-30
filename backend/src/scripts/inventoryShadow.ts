import path from 'node:path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { loadConfig } from '../config/env.js';
import {
  InventoryMigrationBlockedError,
  runInventoryMigration,
} from '../domains/inventory/migration.js';
import { loadInventoryMigrationMapping } from '../domains/inventory/migrationMapping.js';
import { MongoInventoryLegacySource } from '../domains/inventory/mongoMigrationSource.js';
import { PostgresDatabase } from '../postgres/database.js';

dotenv.config({ quiet: true });
const args = process.argv.slice(2);
const mappingIndex = args.indexOf('--mapping');
const mappingArgument = mappingIndex >= 0 ? args[mappingIndex + 1] : undefined;
const apply = args.includes('--apply');
const recovery = args.includes('--recover-inventory-authority');
const known = new Set(['--mapping', '--apply', '--recover-inventory-authority', mappingArgument]);
const config = loadConfig(process.env);
const database = new PostgresDatabase(config.databaseUrl);

try {
  if (!mappingArgument || args.some((argument) => !known.has(argument))) {
    throw new Error('Usage: operations:inventory:shadow -- --mapping <reviewed.json> [--apply] [--recover-inventory-authority]');
  }
  if (recovery && !apply) throw new Error('Inventory recovery mode requires --apply');
  await connectDB(config.mongoUri);
  const report = await runInventoryMigration({
    source: new MongoInventoryLegacySource(),
    mapping: await loadInventoryMigrationMapping(path.resolve(mappingArgument)),
    database,
    ...(apply ? { apply: true } : {}),
    ...(recovery ? { allowInventoryRecovery: true } : {}),
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.blockerCount > 0) process.exitCode = 1;
} catch (error) {
  if (error instanceof InventoryMigrationBlockedError) {
    console.error(error.message);
    for (const issue of error.issues) console.error(`- ${issue.code} ${issue.sourceRef}: ${issue.message}`);
  } else {
    console.error(error instanceof Error ? error.message : 'Inventory migration failed');
  }
  process.exitCode = 1;
} finally {
  await Promise.allSettled([mongoose.disconnect(), database.close()]);
}
