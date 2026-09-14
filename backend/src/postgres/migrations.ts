import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';
import type { PostgresDatabase } from './database.js';

const migrationPattern = /^\d{3}_[a-z0-9_]+\.sql$/;
const migrationLockId = 2_050_001;

export interface MigrationDefinition {
  name: string;
  checksum: string;
  sql: string;
}

export interface MigrationStatus {
  name: string;
  state: 'applied' | 'pending';
}

export const defaultMigrationsDirectory = (): string =>
  path.resolve(process.cwd(), 'postgres', 'migrations');

const readMigrations = async (directory: string): Promise<MigrationDefinition[]> => {
  const names = (await fs.readdir(directory)).filter((name) => migrationPattern.test(name)).sort();
  if (names.length === 0) {
    throw new Error('No PostgreSQL migrations were found');
  }
  const orderPrefixes = names.map((name) => name.slice(0, 3));
  if (new Set(orderPrefixes).size !== orderPrefixes.length) {
    throw new Error('PostgreSQL migration order prefixes must be unique');
  }

  return Promise.all(names.map(async (name) => {
    const sql = await fs.readFile(path.join(directory, name), 'utf8');
    return {
      name,
      sql,
      checksum: createHash('sha256').update(sql).digest('hex'),
    };
  }));
};

const ensureHistoryTable = (client: PoolClient): Promise<unknown> => client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`);

export const migrate = async (
  database: PostgresDatabase,
  directory = defaultMigrationsDirectory(),
): Promise<MigrationStatus[]> => {
  const migrations = await readMigrations(directory);

  return database.withClient(async (client) => {
    await client.query('SELECT pg_advisory_lock($1)', [migrationLockId]);
    try {
      await ensureHistoryTable(client);
      const appliedResult = await client.query<{ name: string; checksum: string }>(
        'SELECT name, checksum FROM schema_migrations ORDER BY name',
      );
      const applied = new Map(appliedResult.rows.map((row) => [row.name, row.checksum.trim()]));
      const knownNames = new Set(migrations.map(({ name }) => name));
      for (const appliedName of applied.keys()) {
        if (!knownNames.has(appliedName)) throw new Error(`Applied migration is missing from source: ${appliedName}`);
      }

      for (const migration of migrations) {
        const existingChecksum = applied.get(migration.name);
        if (existingChecksum && existingChecksum !== migration.checksum) {
          throw new Error(`Applied migration checksum changed: ${migration.name}`);
        }
        if (existingChecksum) continue;

        await client.query('BEGIN');
        try {
          await client.query(migration.sql);
          await client.query(
            'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
            [migration.name, migration.checksum],
          );
          await client.query('COMMIT');
          applied.set(migration.name, migration.checksum);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }

      return migrations.map(({ name }) => ({ name, state: 'applied' as const }));
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [migrationLockId]);
    }
  });
};

export const getMigrationStatus = async (
  database: PostgresDatabase,
  directory = defaultMigrationsDirectory(),
): Promise<MigrationStatus[]> => {
  const migrations = await readMigrations(directory);
  const tableResult = await database.query<{ exists: boolean }>(
    `SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists`,
  );
  if (!tableResult.rows[0]?.exists) {
    return migrations.map(({ name }) => ({ name, state: 'pending' }));
  }

  const appliedResult = await database.query<{ name: string; checksum: string }>(
    'SELECT name, checksum FROM schema_migrations',
  );
  const applied = new Map(appliedResult.rows.map((row) => [row.name, row.checksum.trim()]));
  const knownNames = new Set(migrations.map(({ name }) => name));
  for (const appliedName of applied.keys()) {
    if (!knownNames.has(appliedName)) throw new Error(`Applied migration is missing from source: ${appliedName}`);
  }

  return migrations.map((migration) => {
    const checksum = applied.get(migration.name);
    if (checksum && checksum !== migration.checksum) {
      throw new Error(`Applied migration checksum changed: ${migration.name}`);
    }
    return { name: migration.name, state: checksum ? 'applied' : 'pending' };
  });
};
