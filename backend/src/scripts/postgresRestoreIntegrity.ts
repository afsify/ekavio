import dotenv from 'dotenv';
import { loadDatabaseConfig } from '../config/env.js';
import { PostgresDatabase } from '../postgres/database.js';
import { verifyRestoredDatabase } from '../postgres/restoreIntegrity.js';

dotenv.config({ quiet: true });
const database = new PostgresDatabase(loadDatabaseConfig(process.env).databaseUrl);

try {
  const report = await verifyRestoredDatabase(database);
  console.log(JSON.stringify(report, null, 2));
} catch {
  console.error('PostgreSQL restore integrity verification failed');
  process.exitCode = 1;
} finally {
  await database.close();
}
