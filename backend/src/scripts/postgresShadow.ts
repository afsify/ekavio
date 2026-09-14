import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { loadConfig } from '../config/env.js';
import { PostgresDatabase } from '../postgres/database.js';
import { MongoSharedCoreSource } from '../postgres/mongoShadowSource.js';
import { PostgresSharedCoreRepository } from '../postgres/sharedCoreRepository.js';
import { runShadowMigration, ShadowValidationError } from '../postgres/shadowMigration.js';

dotenv.config({ quiet: true });
const config = loadConfig(process.env);
const shouldApply = process.argv.slice(2).includes('--apply');
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--apply');
const database = new PostgresDatabase(config.databaseUrl);

try {
  if (unknownArguments.length > 0) throw new Error('Unsupported shadow migration argument');
  await connectDB(config.mongoUri);
  const report = await runShadowMigration(shouldApply
    ? { source: new MongoSharedCoreSource(), target: new PostgresSharedCoreRepository(database), apply: true }
    : { source: new MongoSharedCoreSource() });
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  if (error instanceof ShadowValidationError) {
    console.error(error.message);
    for (const issue of error.issues) console.error(`- ${issue}`);
  } else {
    console.error('PostgreSQL shadow migration failed');
  }
  process.exitCode = 1;
} finally {
  await Promise.allSettled([mongoose.disconnect(), database.close()]);
}
