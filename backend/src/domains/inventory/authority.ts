import type { PoolClient } from 'pg';
import type { PostgresDatabase } from '../../postgres/database.js';

const vertical = 'inventory';
type Queryable = Pick<PostgresDatabase, 'query'> | Pick<PoolClient, 'query'>;

export const isInventoryAuthorityActivated = async (
  queryable: Queryable,
): Promise<boolean> => {
  const query = queryable.query.bind(queryable) as (
    text: string,
    values?: readonly unknown[],
  ) => Promise<{ rows: Array<{ active: boolean }> }>;
  const result = await query(`
    SELECT EXISTS(
      SELECT 1 FROM operational_runtime_authority
      WHERE vertical = $1 AND authority = 'postgresql'
        AND activated_by = 'v2-06e-cutover'
    ) AS active
  `, [vertical]);
  return result.rows[0]?.active === true;
};

export const activateInventoryAuthority = (
  database: PostgresDatabase,
): Promise<void> => database.transaction(async (client) => {
  await client.query(`
    INSERT INTO operational_runtime_authority
      (vertical, authority, activated_at, activated_by)
    VALUES ($1, 'postgresql', NOW(), 'v2-06e-cutover')
    ON CONFLICT (vertical) DO UPDATE SET
      authority = EXCLUDED.authority,
      activated_at = EXCLUDED.activated_at,
      activated_by = EXCLUDED.activated_by
  `, [vertical]);
});
