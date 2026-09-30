import path from 'node:path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { loadLegacyToolConfig } from '../config/env.js';
import { activateAttendanceAuthority } from '../domains/attendance/authority.js';
import { MongoAttendanceLegacySource } from '../domains/attendance/mongoMigrationSource.js';
import { runAttendanceCutoverPreflight } from '../domains/attendance/migration.js';
import { loadAttendanceMigrationMapping } from '../domains/attendance/migrationMapping.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import { PostgresDatabase } from '../postgres/database.js';

dotenv.config({ quiet: true });
const args = process.argv.slice(2);
const mappingIndex = args.indexOf('--mapping');
const mappingArgument = mappingIndex >= 0 ? args[mappingIndex + 1] : undefined;
const apply = args.includes('--apply');
const known = new Set(['--mapping', '--apply', mappingArgument]);
const config = loadLegacyToolConfig(process.env);
const database = new PostgresDatabase(config.databaseUrl);

try {
  if (!mappingArgument || args.some((argument) => !known.has(argument))) {
    throw new Error('Usage: operations:attendance:activate -- --mapping <reviewed.json> [--apply]');
  }
  await connectDB(config.mongoUri);
  const preflight = await runAttendanceCutoverPreflight({
    source: new MongoAttendanceLegacySource(),
    mapping: await loadAttendanceMigrationMapping(path.resolve(mappingArgument)),
    database,
    attendanceAuthority: runtimePersistence.attendanceAuthority,
    allowPendingActivation: true,
  });
  if (!preflight.ready) {
    throw new Error(`Attendance authority activation blocked: ${preflight.failures.join(', ')}`);
  }
  if (apply) await activateAttendanceAuthority(database);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', activated: apply, preflight }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Attendance authority activation failed');
  process.exitCode = 1;
} finally {
  await Promise.allSettled([mongoose.disconnect(), database.close()]);
}
