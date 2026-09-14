import dotenv from 'dotenv';
import { loadDatabaseConfig } from '../config/env.js';
import { PostgresDatabase } from '../postgres/database.js';
import { migrate } from '../postgres/migrations.js';

dotenv.config({ quiet: true });
const database = new PostgresDatabase(loadDatabaseConfig(process.env).databaseUrl);

try {
  const statuses = await migrate(database);
  for (const status of statuses) console.log(`${status.name}: ${status.state}`);
} catch {
  console.error('PostgreSQL migration failed');
  process.exitCode = 1;
} finally {
  await database.close();
}
