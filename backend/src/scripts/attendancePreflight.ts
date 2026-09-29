import path from 'node:path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { loadConfig } from '../config/env.js';
import { MongoAttendanceLegacySource } from '../domains/attendance/mongoMigrationSource.js';
import { runAttendanceCutoverPreflight } from '../domains/attendance/migration.js';
import { loadAttendanceMigrationMapping } from '../domains/attendance/migrationMapping.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import { PostgresDatabase } from '../postgres/database.js';

dotenv.config({ quiet: true });
const args = process.argv.slice(2);
const mappingIndex = args.indexOf('--mapping');
const mappingArgument = mappingIndex >= 0 ? args[mappingIndex + 1] : undefined;
const config = loadConfig(process.env);
const database = new PostgresDatabase(config.databaseUrl);

try {
  if (!mappingArgument || args.length !== 2 || mappingIndex !== 0) {
    throw new Error('Usage: operations:attendance:preflight -- --mapping <reviewed.json>');
  }
  await connectDB(config.mongoUri);
  const report = await runAttendanceCutoverPreflight({
    source: new MongoAttendanceLegacySource(),
    mapping: await loadAttendanceMigrationMapping(path.resolve(mappingArgument)),
    database,
    attendanceAuthority: runtimePersistence.attendanceAuthority,
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Attendance preflight failed');
  process.exitCode = 1;
} finally {
  await Promise.allSettled([mongoose.disconnect(), database.close()]);
}
