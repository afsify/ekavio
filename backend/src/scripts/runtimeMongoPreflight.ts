import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { loadLegacyToolConfig } from '../config/env.js';
import { runFinalRuntimePreflight } from '../domains/runtimeRetirement/migration.js';
import {
  MongoAuditLegacySource,
  MongoCorporateLegacySource,
} from '../domains/runtimeRetirement/mongoLegacySource.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import { PostgresDatabase } from '../postgres/database.js';

dotenv.config({ quiet: true });
const config = loadLegacyToolConfig(process.env);
const database = new PostgresDatabase(config.databaseUrl);
try {
  if (process.argv.length !== 2) throw new Error('Usage: runtime:mongo:preflight');
  await connectDB(config.mongoUri);
  const report = await runFinalRuntimePreflight({
    corporateSource: new MongoCorporateLegacySource(),
    auditSource: new MongoAuditLegacySource(),
    database,
    corporateAuthority: runtimePersistence.corporateAuthority,
    securityAuditAuthority: runtimePersistence.securityAuditAuthority,
    mongoRuntimeAuthority: runtimePersistence.mongoRuntimeAuthority,
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Mongo retirement preflight failed');
  process.exitCode = 1;
} finally {
  await Promise.allSettled([mongoose.disconnect(), database.close()]);
}
