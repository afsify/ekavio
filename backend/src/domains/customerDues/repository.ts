import type { PoolClient, QueryResultRow } from 'pg';
import type { PostgresDatabase } from '../../postgres/database.js';
import { AppError } from '../../utils/AppError.js';

export type CustomerDueEntryType =
  | 'charge'
  | 'payment'
  | 'adjustment_increase'
  | 'adjustment_decrease'
  | 'reversal';

export type CustomerDueCreateType = Exclude<CustomerDueEntryType, 'reversal'>;

export interface CustomerDueEntry {
  id: string;
  organizationId: string;
  branchId: string;
  customerId: string;
  customerName: string;
  entryType: CustomerDueEntryType;
  amountMinor: string;
  signedEffectMinor: string;
  currency: 'INR';
  dueDate: string | null;
  description: string | null;
  sourceType: string | null;
  sourceId: string | null;
  reversesEntryId: string | null;
  reversedByEntryId: string | null;
  reversedEntryType: CustomerDueEntryType | null;
  createdByMembershipId: string | null;
  occurredAt: Date;
  createdAt: Date;
}

interface CustomerDueRow extends QueryResultRow {
  id: string;
  organization_id: string;
  branch_id: string;
  customer_id: string;
  customer_name: string;
  entry_type: CustomerDueEntryType;
  amount_minor: string;
  signed_effect_minor: string;
  currency: 'INR';
  due_date: string | null;
  description: string | null;
  source_type: string | null;
  source_id: string | null;
  reverses_entry_id: string | null;
  reversed_by_entry_id: string | null;
  reversed_entry_type: CustomerDueEntryType | null;
  created_by_membership_id: string | null;
  occurred_at: Date;
  created_at: Date;
  command_fingerprint: string | null;
}

const signedEffectSql = (entry = 'e', target = 'target'): string => `
  CASE ${entry}.entry_type
    WHEN 'charge' THEN ${entry}.amount_minor
    WHEN 'adjustment_increase' THEN ${entry}.amount_minor
    WHEN 'payment' THEN -${entry}.amount_minor
    WHEN 'adjustment_decrease' THEN -${entry}.amount_minor
    WHEN 'reversal' THEN CASE ${target}.entry_type
      WHEN 'charge' THEN -${entry}.amount_minor
      WHEN 'adjustment_increase' THEN -${entry}.amount_minor
      WHEN 'payment' THEN ${entry}.amount_minor
      WHEN 'adjustment_decrease' THEN ${entry}.amount_minor
      ELSE 0
    END
    ELSE 0
  END
`;

const entrySelect = `
  e.id, e.organization_id, e.branch_id, e.customer_id, c.name AS customer_name,
  e.entry_type, e.amount_minor::text,
  (${signedEffectSql()})::text AS signed_effect_minor,
  e.currency, e.due_date::text, e.description, e.source_type, e.source_id,
  e.reverses_entry_id, reversed.id AS reversed_by_entry_id,
  target.entry_type AS reversed_entry_type,
  e.created_by_membership_id, e.occurred_at, e.created_at,
  e.command_fingerprint
`;

const projectEntry = (row: CustomerDueRow): CustomerDueEntry => ({
  id: row.id,
  organizationId: row.organization_id,
  branchId: row.branch_id,
  customerId: row.customer_id,
  customerName: row.customer_name,
  entryType: row.entry_type,
  amountMinor: row.amount_minor,
  signedEffectMinor: row.signed_effect_minor,
  currency: row.currency,
  dueDate: row.due_date,
  description: row.description,
  sourceType: row.source_type,
  sourceId: row.source_id,
  reversesEntryId: row.reverses_entry_id,
  reversedByEntryId: row.reversed_by_entry_id,
  reversedEntryType: row.reversed_entry_type,
  createdByMembershipId: row.created_by_membership_id,
  occurredAt: row.occurred_at,
  createdAt: row.created_at,
});

const selectByIdempotency = async (
  client: PoolClient,
  organizationId: string,
  idempotencyKey: string,
): Promise<CustomerDueRow | null> => {
  const result = await client.query<CustomerDueRow>(`
    SELECT ${entrySelect}
    FROM customer_due_entries e
    JOIN customers c ON c.id = e.customer_id AND c.organization_id = e.organization_id
    LEFT JOIN customer_due_entries target ON target.id = e.reverses_entry_id
    LEFT JOIN customer_due_entries reversed ON reversed.reverses_entry_id = e.id
    WHERE e.organization_id = $1 AND e.idempotency_key = $2
  `, [organizationId, idempotencyKey]);
  return result.rows[0] ?? null;
};

const lockCommand = async (
  client: PoolClient,
  organizationId: string,
  key: string,
): Promise<void> => {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `customer-dues-command:${organizationId}:${key}`,
  ]);
};

const lockCustomer = async (
  client: PoolClient,
  organizationId: string,
  customerId: string,
): Promise<void> => {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `customer-dues-balance:${organizationId}:${customerId}`,
  ]);
};

const balanceQuery = async (
  client: PostgresDatabase | PoolClient,
  organizationId: string,
  customerId: string,
  branchId?: string,
): Promise<bigint> => {
  const query = client.query.bind(client) as <Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ) => Promise<{ rows: Row[] }>;
  const result = await query<{ balance: string }>(`
    SELECT COALESCE(SUM(${signedEffectSql()}), 0)::text AS balance
    FROM customer_due_entries e
    LEFT JOIN customer_due_entries target ON target.id = e.reverses_entry_id
    WHERE e.organization_id = $1 AND e.customer_id = $2
      AND ($3::uuid IS NULL OR e.branch_id = $3)
  `, [organizationId, customerId, branchId ?? null]);
  return BigInt(result.rows[0]?.balance ?? '0');
};

export class PostgresCustomerDuesRepository {
  public constructor(private readonly database: PostgresDatabase) {}

  public create(input: {
    organizationId: string;
    branchId: string;
    customerId: string;
    entryType: CustomerDueCreateType;
    amountMinor: bigint;
    currency: 'INR';
    dueDate: string | null;
    description: string | null;
    sourceType: string | null;
    sourceId: string | null;
    actorMembershipId: string;
    idempotencyKey: string;
    commandFingerprint: string;
    occurredAt: Date;
  }): Promise<CustomerDueEntry> {
    return this.database.transaction(async (client) => {
      await lockCommand(client, input.organizationId, input.idempotencyKey);
      const retry = await selectByIdempotency(client, input.organizationId, input.idempotencyKey);
      if (retry) {
        if (retry.command_fingerprint?.trim() !== input.commandFingerprint) {
          throw new AppError('Customer Dues idempotency key was used with a different command', 409);
        }
        return projectEntry(retry);
      }

      await lockCustomer(client, input.organizationId, input.customerId);
      if (input.entryType === 'payment') {
        const balance = await balanceQuery(client, input.organizationId, input.customerId);
        if (input.amountMinor > balance) {
          throw new AppError('Payment cannot exceed the customer organization-wide outstanding balance', 409);
        }
      }

      const inserted = await client.query<{ id: string }>(`
        INSERT INTO customer_due_entries (
          organization_id, branch_id, customer_id, entry_type, amount_minor,
          currency, due_date, description, source_type, source_id,
          created_by_membership_id, idempotency_key, command_fingerprint,
          occurred_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10,
          $11, $12, $13, $14
        )
        RETURNING id
      `, [
        input.organizationId, input.branchId, input.customerId, input.entryType,
        input.amountMinor.toString(), input.currency, input.dueDate, input.description,
        input.sourceType, input.sourceId, input.actorMembershipId,
        input.idempotencyKey, input.commandFingerprint, input.occurredAt,
      ]);
      const created = await selectByIdempotency(client, input.organizationId, input.idempotencyKey);
      if (!created || created.id !== inserted.rows[0]?.id) {
        throw new Error('Customer Dues entry was not available after insertion');
      }
      return projectEntry(created);
    });
  }

  public reverse(input: {
    organizationId: string;
    branchId: string;
    targetEntryId: string;
    description: string;
    actorMembershipId: string;
    idempotencyKey: string;
    commandFingerprint: string;
    occurredAt: Date;
  }): Promise<CustomerDueEntry> {
    return this.database.transaction(async (client) => {
      await lockCommand(client, input.organizationId, input.idempotencyKey);
      const retry = await selectByIdempotency(client, input.organizationId, input.idempotencyKey);
      if (retry) {
        if (retry.command_fingerprint?.trim() !== input.commandFingerprint) {
          throw new AppError('Customer Dues idempotency key was used with a different command', 409);
        }
        return projectEntry(retry);
      }

      const targetResult = await client.query<{
        id: string; customer_id: string; entry_type: CustomerDueEntryType;
        amount_minor: string; currency: 'INR';
      }>(`
        SELECT id, customer_id, entry_type, amount_minor::text, currency
        FROM customer_due_entries
        WHERE id = $1 AND organization_id = $2 AND branch_id = $3
        FOR UPDATE
      `, [input.targetEntryId, input.organizationId, input.branchId]);
      const target = targetResult.rows[0];
      if (!target) throw new AppError('Customer Due entry not found in the selected branch', 404);
      if (target.entry_type === 'reversal') {
        throw new AppError('A reversal cannot reverse another reversal', 409);
      }
      await lockCustomer(client, input.organizationId, target.customer_id);
      const reversed = await client.query<{ exists: boolean }>(`
        SELECT EXISTS(
          SELECT 1 FROM customer_due_entries WHERE reverses_entry_id = $1
        ) AS exists
      `, [target.id]);
      if (reversed.rows[0]?.exists) throw new AppError('Customer Due entry is already reversed', 409);

      await client.query(`
        INSERT INTO customer_due_entries (
          organization_id, branch_id, customer_id, entry_type, amount_minor,
          currency, description, reverses_entry_id, created_by_membership_id,
          idempotency_key, command_fingerprint, occurred_at
        ) VALUES ($1, $2, $3, 'reversal', $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        input.organizationId, input.branchId, target.customer_id, target.amount_minor,
        target.currency, input.description, target.id, input.actorMembershipId,
        input.idempotencyKey, input.commandFingerprint, input.occurredAt,
      ]);
      const created = await selectByIdempotency(client, input.organizationId, input.idempotencyKey);
      if (!created) throw new Error('Customer Dues reversal was not available after insertion');
      return projectEntry(created);
    });
  }

  public async list(input: {
    organizationId: string;
    branchId: string;
    customerId?: string;
    entryType?: CustomerDueEntryType;
    dateFrom?: string;
    dateTo?: string;
    page: number;
    limit: number;
  }): Promise<{ data: CustomerDueEntry[]; total: number }> {
    const values = [
      input.organizationId, input.branchId, input.customerId ?? null,
      input.entryType ?? null, input.dateFrom ?? null, input.dateTo ?? null,
    ];
    return this.database.transaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const where = `
        e.organization_id = $1 AND e.branch_id = $2
        AND ($3::uuid IS NULL OR e.customer_id = $3)
        AND ($4::text IS NULL OR e.entry_type = $4)
        AND ($5::date IS NULL OR (e.occurred_at AT TIME ZONE b.timezone)::date >= $5::date)
        AND ($6::date IS NULL OR (e.occurred_at AT TIME ZONE b.timezone)::date <= $6::date)
      `;
      const count = await client.query<{ total: string }>(`
        SELECT COUNT(*)::text AS total
        FROM customer_due_entries e
        JOIN branches b ON b.id = e.branch_id AND b.organization_id = e.organization_id
        WHERE ${where}
      `, values);
      const rows = await client.query<CustomerDueRow>(`
        SELECT ${entrySelect}
        FROM customer_due_entries e
        JOIN branches b ON b.id = e.branch_id AND b.organization_id = e.organization_id
        JOIN customers c ON c.id = e.customer_id AND c.organization_id = e.organization_id
        LEFT JOIN customer_due_entries target ON target.id = e.reverses_entry_id
        LEFT JOIN customer_due_entries reversed ON reversed.reverses_entry_id = e.id
        WHERE ${where}
        ORDER BY e.occurred_at DESC, e.id DESC
        LIMIT $7 OFFSET $8
      `, [...values, input.limit, (input.page - 1) * input.limit]);
      return { data: rows.rows.map(projectEntry), total: Number(count.rows[0]?.total ?? 0) };
    });
  }

  public async balances(input: {
    organizationId: string;
    branchId: string;
    customerId: string;
  }): Promise<{ organizationBalanceMinor: string; branchBalanceMinor: string } | null> {
    const customer = await this.database.query<{ exists: boolean }>(`
      SELECT EXISTS(
        SELECT 1 FROM customers
        WHERE id = $1 AND organization_id = $2 AND status <> 'merged'
      ) AS exists
    `, [input.customerId, input.organizationId]);
    if (!customer.rows[0]?.exists) return null;
    const [organizationBalance, branchBalance] = await Promise.all([
      balanceQuery(this.database, input.organizationId, input.customerId),
      balanceQuery(this.database, input.organizationId, input.customerId, input.branchId),
    ]);
    return {
      organizationBalanceMinor: organizationBalance.toString(),
      branchBalanceMinor: branchBalance.toString(),
    };
  }
}
