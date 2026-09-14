import dotenv from 'dotenv';
import { loadDatabaseConfig } from '../config/env.js';
import { PostgresDatabase } from '../postgres/database.js';
import { getMigrationStatus } from '../postgres/migrations.js';

dotenv.config({ quiet: true });
const database = new PostgresDatabase(loadDatabaseConfig(process.env).databaseUrl);

try {
  const statuses = await getMigrationStatus(database);
  for (const status of statuses) console.log(`${status.name}: ${status.state}`);
  if (statuses.some(({ state }) => state === 'pending')) process.exitCode = 1;
} catch {
  console.error('PostgreSQL migration status failed');
  process.exitCode = 1;
} finally {
  await database.close();
}
