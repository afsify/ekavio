import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { loadConfig } from '../config/env.js';
import { activateCommercialAuthority } from '../postgres/commercialAuthority.js';
import { runCommercialPreflight } from '../postgres/commercialPreflight.js';
import { PostgresDatabase } from '../postgres/database.js';
import { MongoSharedCoreSource } from '../postgres/mongoShadowSource.js';

dotenv.config({ quiet: true });
const config = loadConfig(process.env);
const database = new PostgresDatabase(config.databaseUrl);
const argumentsList = process.argv.slice(2);
const shouldApply = argumentsList.includes('--apply');

try {
  if (argumentsList.some((argument) => argument !== '--apply')) {
    throw new Error('Unsupported commercial activation argument');
  }
  await connectDB(config.mongoUri);
  const preflight = await runCommercialPreflight({
    source: new MongoSharedCoreSource(),
    database,
  });
  if (!preflight.ready) throw new Error('Commercial activation refused because preflight failed');
  if (shouldApply) await activateCommercialAuthority(database);
  console.log(JSON.stringify({
    mode: shouldApply ? 'apply' : 'dry-run',
    ready: preflight.ready,
    activated: shouldApply,
  }, null, 2));
} catch {
  console.error('PostgreSQL commercial authority activation failed');
  process.exitCode = 1;
} finally {
  await Promise.allSettled([mongoose.disconnect(), database.close()]);
}
