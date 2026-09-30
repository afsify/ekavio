import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { loadLegacyToolConfig } from '../config/env.js';
import { verifyAuditMigration } from '../domains/runtimeRetirement/migration.js';
import { MongoAuditLegacySource } from '../domains/runtimeRetirement/mongoLegacySource.js';
import { PostgresDatabase } from '../postgres/database.js';

dotenv.config({ quiet: true });
const config = loadLegacyToolConfig(process.env);
const database = new PostgresDatabase(config.databaseUrl);
try {
  if (process.argv.length !== 2) throw new Error('Usage: runtime:audit:verify');
  await connectDB(config.mongoUri);
  const report = await verifyAuditMigration({ source: new MongoAuditLegacySource(), database });
  console.log(JSON.stringify(report, null, 2));
  if (!report.clean) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Audit verification failed');
  process.exitCode = 1;
} finally {
  await Promise.allSettled([mongoose.disconnect(), database.close()]);
}
