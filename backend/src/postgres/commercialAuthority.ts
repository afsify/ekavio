import type { PoolClient } from 'pg';
import type { PostgresDatabase } from './database.js';

export const isCommercialAuthorityActivated = async (
  queryable: Pick<PostgresDatabase, 'query'> | Pick<PoolClient, 'query'>,
): Promise<boolean> => {
  const query = queryable.query.bind(queryable) as (
    text: string,
  ) => Promise<{ rows: Array<{ active: boolean }> }>;
  const result = await query(`
    SELECT EXISTS(
      SELECT 1 FROM commercial_runtime_authority
      WHERE singleton = TRUE AND authority = 'postgresql'
    ) AS active
  `);
  return result.rows[0]?.active === true;
};

export const activateCommercialAuthority = (database: PostgresDatabase): Promise<void> =>
  database.transaction(async (client) => {
    await client.query(`
      INSERT INTO commercial_runtime_authority
        (singleton, authority, activated_at, activated_by)
      VALUES (TRUE, 'postgresql', NOW(), 'v2-05d-cutover')
      ON CONFLICT (singleton) DO UPDATE SET
        authority = EXCLUDED.authority,
        activated_at = EXCLUDED.activated_at,
        activated_by = EXCLUDED.activated_by
    `);
  });
