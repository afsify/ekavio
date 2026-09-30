import type { PoolClient } from 'pg';
import type { PostgresDatabase } from '../../postgres/database.js';

export type FinalRuntimeDomain = 'corporate' | 'security_audit';
type Queryable = Pick<PostgresDatabase, 'query'> | Pick<PoolClient, 'query'>;

export const isFinalRuntimeAuthorityActivated = async (
  queryable: Queryable,
  domain: FinalRuntimeDomain,
): Promise<boolean> => {
  const query = queryable.query.bind(queryable) as (
    text: string,
    values?: readonly unknown[],
  ) => Promise<{ rows: Array<{ active: boolean }> }>;
  const result = await query(`
    SELECT EXISTS(
      SELECT 1 FROM final_runtime_authority
      WHERE domain = $1 AND authority = 'postgresql'
        AND activated_by = 'v2-06f-cutover'
    ) AS active
  `, [domain]);
  return result.rows[0]?.active === true;
};

export const activateFinalRuntimeAuthority = (
  database: PostgresDatabase,
): Promise<void> => database.transaction(async (client) => {
  for (const domain of ['corporate', 'security_audit'] as const) {
    await client.query(`
      INSERT INTO final_runtime_authority
        (domain, authority, activated_at, activated_by)
      VALUES ($1, 'postgresql', NOW(), 'v2-06f-cutover')
      ON CONFLICT (domain) DO UPDATE SET
        authority = EXCLUDED.authority,
        activated_at = EXCLUDED.activated_at,
        activated_by = EXCLUDED.activated_by
    `, [domain]);
  }
});
