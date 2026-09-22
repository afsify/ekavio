import type { PoolClient } from 'pg';
import type { PostgresDatabase } from '../../postgres/database.js';

const vertical = 'customer_service_appointment_queue';

type Queryable = Pick<PostgresDatabase, 'query'> | Pick<PoolClient, 'query'>;

export const isOperationalAuthorityActivated = async (
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
    ) AS active
  `, [vertical]);
  return result.rows[0]?.active === true;
};

export const activateOperationalAuthority = (
  database: PostgresDatabase,
): Promise<void> => database.transaction(async (client) => {
  await client.query(`
    INSERT INTO operational_runtime_authority
      (vertical, authority, activated_at, activated_by)
    VALUES ($1, 'postgresql', NOW(), 'v2-06b2-cutover')
    ON CONFLICT (vertical) DO UPDATE SET
      authority = EXCLUDED.authority,
      activated_at = EXCLUDED.activated_at,
      activated_by = EXCLUDED.activated_by
  `, [vertical]);
});
