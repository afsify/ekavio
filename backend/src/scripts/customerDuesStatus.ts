import dotenv from 'dotenv';
import { loadDatabaseConfig } from '../config/env.js';
import { isCustomerDuesAuthorityActivated } from '../domains/customerDues/authority.js';
import { PostgresDatabase } from '../postgres/database.js';
import { getMigrationStatus } from '../postgres/migrations.js';

dotenv.config({ quiet: true });
const database = new PostgresDatabase(loadDatabaseConfig(process.env).databaseUrl);

try {
  const migrations = await getMigrationStatus(database);
  const migration = migrations.find(({ name }) => name === '010_customer_dues_runtime_authority.sql');
  const [activated, counts] = await Promise.all([
    migration?.state === 'applied' ? isCustomerDuesAuthorityActivated(database) : Promise.resolve(false),
    migration?.state === 'applied'
      ? database.query<{ total: string; imported: string }>(`
          SELECT COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE legacy_mongo_id IS NOT NULL)::text AS imported
          FROM customer_due_entries
        `)
      : Promise.resolve({ rows: [{ total: '0', imported: '0' }] }),
  ]);
  console.log(JSON.stringify({
    migration010: migration?.state ?? 'missing',
    authority: activated ? 'postgresql' : 'pending',
    customerDueEntries: Number(counts.rows[0]?.total ?? 0),
    importedEntries: Number(counts.rows[0]?.imported ?? 0),
  }, null, 2));
  if (migration?.state !== 'applied' || !activated) process.exitCode = 1;
} catch {
  console.error('Customer Dues cutover status failed');
  process.exitCode = 1;
} finally {
  await database.close();
}
