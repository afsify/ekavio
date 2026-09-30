import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { loadLegacyToolConfig } from '../config/env.js';
import { activateFinalRuntimeAuthority } from '../domains/runtimeRetirement/authority.js';
import { runFinalRuntimePreflight } from '../domains/runtimeRetirement/migration.js';
import {
  MongoAuditLegacySource,
  MongoCorporateLegacySource,
} from '../domains/runtimeRetirement/mongoLegacySource.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import { PostgresDatabase } from '../postgres/database.js';

dotenv.config({ quiet: true });
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const config = loadLegacyToolConfig(process.env);
const database = new PostgresDatabase(config.databaseUrl);
try {
  if (args.some((argument) => argument !== '--apply')) {
    throw new Error('Usage: runtime:mongo:activate -- [--apply]');
  }
  await connectDB(config.mongoUri);
  const preflight = await runFinalRuntimePreflight({
    corporateSource: new MongoCorporateLegacySource(),
    auditSource: new MongoAuditLegacySource(),
    database,
    corporateAuthority: runtimePersistence.corporateAuthority,
    securityAuditAuthority: runtimePersistence.securityAuditAuthority,
    mongoRuntimeAuthority: runtimePersistence.mongoRuntimeAuthority,
    allowPendingActivation: true,
  });
  if (!preflight.ready) {
    throw new Error(`Mongo retirement activation blocked: ${preflight.failures.join(', ')}`);
  }
  if (apply) await activateFinalRuntimeAuthority(database);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', activated: apply, preflight }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Mongo retirement activation failed');
  process.exitCode = 1;
} finally {
  await Promise.allSettled([mongoose.disconnect(), database.close()]);
}
