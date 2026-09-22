import type { PostgresDatabase } from '../../postgres/database.js';
import { normalizeCustomerName, normalizePhone, type PhoneNormalizationPolicy } from './normalization.js';

export interface CreateCustomerInput {
  organizationId: string;
  name: string;
  phone?: string | null;
  phonePolicy?: PhoneNormalizationPolicy;
  homeBranchId?: string | null;
  notes?: string | null;
}

export interface CustomerRecord {
  id: string;
  organization_id: string;
  name: string;
  normalized_phone: string | null;
  display_phone: string | null;
  home_branch_id: string | null;
  notes: string | null;
  status: 'active' | 'inactive' | 'merged';
  created_at: Date;
  updated_at: Date;
}

const customerColumns = `
  id, organization_id, name, normalized_phone, display_phone,
  home_branch_id, notes, status, created_at, updated_at
`;

export class PostgresCustomerRepository {
  public constructor(private readonly database: PostgresDatabase) {}

  public async create(input: CreateCustomerInput): Promise<CustomerRecord> {
    const name = normalizeCustomerName(input.name).display;
    const normalizedPhone = normalizePhone(input.phone, input.phonePolicy);
    const result = await this.database.query<CustomerRecord>(`
      INSERT INTO customers (
        organization_id, name, normalized_phone, display_phone, home_branch_id, notes
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING ${customerColumns}
    `, [
      input.organizationId,
      name,
      normalizedPhone,
      input.phone?.trim() || null,
      input.homeBranchId ?? null,
      input.notes ?? null,
    ]);
    return result.rows[0]!;
  }

  public async findById(organizationId: string, customerId: string): Promise<CustomerRecord | null> {
    const result = await this.database.query<CustomerRecord>(`
      SELECT ${customerColumns}
      FROM customers
      WHERE id = $1 AND organization_id = $2 AND status <> 'merged'
    `, [customerId, organizationId]);
    return result.rows[0] ?? null;
  }

  public async list(input: {
    organizationId: string;
    search?: string;
    page: number;
    limit: number;
  }): Promise<{ data: CustomerRecord[]; total: number }> {
    const search = input.search?.trim() || null;
    return this.database.transaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const values = [input.organizationId, search];
      const count = await client.query<{ total: string }>(`
        SELECT COUNT(*)::text AS total
        FROM customers
        WHERE organization_id = $1 AND status <> 'merged'
          AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR normalized_phone ILIKE '%' || $2 || '%')
      `, values);
      const result = await client.query<CustomerRecord>(`
        SELECT ${customerColumns}
        FROM customers
        WHERE organization_id = $1 AND status <> 'merged'
          AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR normalized_phone ILIKE '%' || $2 || '%')
        ORDER BY name, id
        LIMIT $3 OFFSET $4
      `, [...values, input.limit, (input.page - 1) * input.limit]);
      return { data: result.rows, total: Number(count.rows[0]?.total ?? 0) };
    });
  }

  public async update(input: {
    organizationId: string;
    customerId: string;
    name?: string;
    phone?: string | null;
    phonePolicy?: PhoneNormalizationPolicy;
    homeBranchId?: string | null;
    notes?: string | null;
    status?: 'active' | 'inactive';
  }): Promise<CustomerRecord | null> {
    const hasPhone = input.phone !== undefined;
    const normalizedPhone = hasPhone ? normalizePhone(input.phone, input.phonePolicy) : null;
    const displayPhone = hasPhone ? input.phone?.trim() || null : null;
    const name = input.name === undefined ? null : normalizeCustomerName(input.name).display;
    const result = await this.database.query<CustomerRecord>(`
      UPDATE customers
      SET name = COALESCE($3, name),
        normalized_phone = CASE WHEN $4 THEN $5 ELSE normalized_phone END,
        display_phone = CASE WHEN $4 THEN $6 ELSE display_phone END,
        home_branch_id = CASE WHEN $7 THEN $8 ELSE home_branch_id END,
        notes = CASE WHEN $9 THEN $10 ELSE notes END,
        status = COALESCE($11, status),
        updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND status <> 'merged'
      RETURNING ${customerColumns}
    `, [
      input.customerId,
      input.organizationId,
      name,
      hasPhone,
      normalizedPhone,
      displayPhone,
      input.homeBranchId !== undefined,
      input.homeBranchId ?? null,
      input.notes !== undefined,
      input.notes ?? null,
      input.status ?? null,
    ]);
    return result.rows[0] ?? null;
  }

  public async merge(input: {
    organizationId: string;
    sourceCustomerId: string;
    targetCustomerId: string;
  }): Promise<void> {
    if (input.sourceCustomerId === input.targetCustomerId) {
      throw new Error('A customer cannot be merged into itself');
    }
    await this.database.transaction(async (client) => {
      const rows = await client.query<{ id: string; status: string }>(`
        SELECT id, status
        FROM customers
        WHERE organization_id = $1 AND id = ANY($2::uuid[])
        ORDER BY id
        FOR UPDATE
      `, [input.organizationId, [input.sourceCustomerId, input.targetCustomerId]]);
      if (rows.rowCount !== 2) throw new Error('Both customers must belong to the organization');
      const source = rows.rows.find(({ id }) => id === input.sourceCustomerId);
      const target = rows.rows.find(({ id }) => id === input.targetCustomerId);
      if (!source || source.status !== 'active') throw new Error('Merge source must be an active customer record');
      if (!target || target.status !== 'active') throw new Error('Merge target must be an active customer record');

      await client.query(`
        UPDATE customer_source_links
        SET customer_id = $1
        WHERE organization_id = $2 AND customer_id = $3
      `, [input.targetCustomerId, input.organizationId, input.sourceCustomerId]);
      await client.query(`
        UPDATE customers
        SET status = 'merged', merged_into_customer_id = $1, updated_at = NOW()
        WHERE id = $2 AND organization_id = $3
      `, [input.targetCustomerId, input.sourceCustomerId, input.organizationId]);
    });
  }
}
