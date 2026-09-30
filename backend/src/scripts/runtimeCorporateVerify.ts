import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { loadLegacyToolConfig } from '../config/env.js';
import { verifyCorporateMigration } from '../domains/runtimeRetirement/migration.js';
import { MongoCorporateLegacySource } from '../domains/runtimeRetirement/mongoLegacySource.js';
import { PostgresDatabase } from '../postgres/database.js';

dotenv.config({ quiet: true });
const config = loadLegacyToolConfig(process.env);
const database = new PostgresDatabase(config.databaseUrl);
try {
  if (process.argv.length !== 2) throw new Error('Usage: runtime:corporate:verify');
  await connectDB(config.mongoUri);
  const report = await verifyCorporateMigration({ source: new MongoCorporateLegacySource(), database });
  console.log(JSON.stringify(report, null, 2));
  if (!report.clean) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Corporate verification failed');
  process.exitCode = 1;
} finally {
  await Promise.allSettled([mongoose.disconnect(), database.close()]);
}
