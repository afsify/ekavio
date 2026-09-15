import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

export class PostgresDatabase {
  private pool: Pool | undefined;
  private closed = false;

  public constructor(private readonly connectionString: string | (() => string)) {}

  private getPool(): Pool {
    if (this.closed) throw new Error('PostgreSQL database connection is closed');
    if (this.pool) return this.pool;
    this.pool = new Pool({
      connectionString: typeof this.connectionString === 'function'
        ? this.connectionString()
        : this.connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    this.pool.on('error', () => {
      console.error('PostgreSQL pool encountered an unexpected idle-client error');
    });
    return this.pool;
  }

  public query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    return this.getPool().query<Row>(text, [...values]);
  }

  public async withClient<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getPool().connect();
    try {
      return await operation(client);
    } finally {
      client.release();
    }
  }

  public async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const result = await operation(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  public async isReady(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  public close(): Promise<void> {
    this.closed = true;
    const pool = this.pool;
    this.pool = undefined;
    return pool ? pool.end() : Promise.resolve();
  }
}
