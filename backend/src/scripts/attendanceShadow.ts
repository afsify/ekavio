import path from 'node:path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { loadConfig } from '../config/env.js';
import { MongoAttendanceLegacySource } from '../domains/attendance/mongoMigrationSource.js';
import { loadAttendanceMigrationMapping } from '../domains/attendance/migrationMapping.js';
import {
  AttendanceMigrationBlockedError,
  runAttendanceMigration,
} from '../domains/attendance/migration.js';
import { PostgresDatabase } from '../postgres/database.js';

dotenv.config({ quiet: true });
const args = process.argv.slice(2);
const mappingIndex = args.indexOf('--mapping');
const mappingArgument = mappingIndex >= 0 ? args[mappingIndex + 1] : undefined;
const apply = args.includes('--apply');
const recovery = args.includes('--recover-attendance-authority');
const known = new Set(['--mapping', '--apply', '--recover-attendance-authority', mappingArgument]);
const config = loadConfig(process.env);
const database = new PostgresDatabase(config.databaseUrl);

try {
  if (!mappingArgument || args.some((argument) => !known.has(argument))) {
    throw new Error('Usage: operations:attendance:shadow -- --mapping <reviewed.json> [--apply] [--recover-attendance-authority]');
  }
  if (recovery && !apply) throw new Error('Attendance recovery mode requires --apply');
  await connectDB(config.mongoUri);
  const report = await runAttendanceMigration({
    source: new MongoAttendanceLegacySource(),
    mapping: await loadAttendanceMigrationMapping(path.resolve(mappingArgument)),
    database,
    ...(apply ? { apply: true } : {}),
    ...(recovery ? { allowAttendanceRecovery: true } : {}),
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.blockerCount > 0) process.exitCode = 1;
} catch (error) {
  if (error instanceof AttendanceMigrationBlockedError) {
    console.error(error.message);
    for (const issue of error.issues) console.error(`- ${issue.code} ${issue.sourceRef}: ${issue.message}`);
  } else {
    console.error(error instanceof Error ? error.message : 'Attendance migration failed');
  }
  process.exitCode = 1;
} finally {
  await Promise.allSettled([mongoose.disconnect(), database.close()]);
}
