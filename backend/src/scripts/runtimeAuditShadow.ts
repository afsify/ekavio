import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { loadLegacyToolConfig } from '../config/env.js';
import { runAuditMigration } from '../domains/runtimeRetirement/migration.js';
import { MongoAuditLegacySource } from '../domains/runtimeRetirement/mongoLegacySource.js';
import { PostgresDatabase } from '../postgres/database.js';

dotenv.config({ quiet: true });
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const allowRecovery = args.includes('--recover-audit-authority');
const known = new Set(['--apply', '--recover-audit-authority']);
const config = loadLegacyToolConfig(process.env);
const database = new PostgresDatabase(config.databaseUrl);
try {
  if (args.some((argument) => !known.has(argument))) {
    throw new Error('Usage: runtime:audit:shadow -- [--apply] [--recover-audit-authority]');
  }
  await connectDB(config.mongoUri);
  const report = await runAuditMigration({
    source: new MongoAuditLegacySource(), database, apply, allowRecovery,
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.blockerCount > 0) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Audit migration failed');
  process.exitCode = 1;
} finally {
  await Promise.allSettled([mongoose.disconnect(), database.close()]);
}
