import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';

export class PostgresDatabase {
  private pool: Pool | undefined;
  private closed = false;
  private readonly atomicClient = new AsyncLocalStorage<PoolClient>();

  public constructor(private readonly connectionString: string | (() => string)) {}

  public get inAtomicTransaction(): boolean { return Boolean(this.atomicClient.getStore()); }

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
    return (this.atomicClient.getStore() ?? this.getPool()).query<Row>(text, [...values]);
  }

  public async withClient<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const scoped = this.atomicClient.getStore();
    if (scoped) return operation(scoped);
    const client = await this.getPool().connect();
    try {
      return await operation(client);
    } finally {
      client.release();
    }
  }

  public async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const scoped = this.atomicClient.getStore();
    if (scoped) return operation(scoped);
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

  /** Opt-in composition of a canonical mutation and dynamic values. Ordinary
   * repository transactions retain their existing connection lifecycle. A nested
   * failure must propagate to this boundary, which rolls back the whole write. */
  public async atomic<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    if (this.atomicClient.getStore()) throw new Error('Nested atomic boundary is not supported');
    return this.transaction(client => this.atomicClient.run(client, () => operation(client)));
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
