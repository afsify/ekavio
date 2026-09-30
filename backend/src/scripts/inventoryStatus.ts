import dotenv from 'dotenv';
import { loadDatabaseConfig } from '../config/env.js';
import { isInventoryAuthorityActivated } from '../domains/inventory/authority.js';
import { PostgresDatabase } from '../postgres/database.js';
import { getMigrationStatus } from '../postgres/migrations.js';

dotenv.config({ quiet: true });
const database = new PostgresDatabase(loadDatabaseConfig(process.env).databaseUrl);

try {
  const migrations = await getMigrationStatus(database);
  const migration = migrations.find(({ name }) => name === '011_inventory_runtime_authority.sql');
  const [activated, counts] = await Promise.all([
    migration?.state === 'applied' ? isInventoryAuthorityActivated(database) : Promise.resolve(false),
    migration?.state === 'applied'
      ? database.query<{ items: string; movements: string; imported: string }>(`
          SELECT
            (SELECT COUNT(*) FROM inventory_items)::text AS items,
            (SELECT COUNT(*) FROM stock_movements)::text AS movements,
            (SELECT COUNT(*) FROM inventory_items WHERE legacy_mongo_id IS NOT NULL)::text AS imported
        `)
      : Promise.resolve({ rows: [{ items: '0', movements: '0', imported: '0' }] }),
  ]);
  console.log(JSON.stringify({
    migration011: migration?.state ?? 'missing',
    authority: activated ? 'postgresql' : 'pending',
    inventoryItems: Number(counts.rows[0]?.items ?? 0),
    stockMovements: Number(counts.rows[0]?.movements ?? 0),
    importedItems: Number(counts.rows[0]?.imported ?? 0),
  }, null, 2));
  if (migration?.state !== 'applied' || !activated) process.exitCode = 1;
} catch {
  console.error('Inventory cutover status failed');
  process.exitCode = 1;
} finally {
  await database.close();
}
