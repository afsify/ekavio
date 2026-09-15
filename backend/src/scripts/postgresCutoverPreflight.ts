import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { loadConfig } from '../config/env.js';
import { runCutoverPreflight } from '../postgres/cutoverPreflight.js';
import { PostgresDatabase } from '../postgres/database.js';
import { MongoSharedCoreSource } from '../postgres/mongoShadowSource.js';

dotenv.config({ quiet: true });
const config = loadConfig(process.env);
const database = new PostgresDatabase(config.databaseUrl);

try {
  await connectDB(config.mongoUri);
  const report = await runCutoverPreflight({
    source: new MongoSharedCoreSource(),
    database,
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 1;
} catch {
  console.error('PostgreSQL cutover preflight failed');
  process.exitCode = 1;
} finally {
  await Promise.allSettled([mongoose.disconnect(), database.close()]);
}
