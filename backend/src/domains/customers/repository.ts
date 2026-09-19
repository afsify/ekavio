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
  status: 'active' | 'inactive' | 'merged';
}

export class PostgresCustomerRepository {
  public constructor(private readonly database: PostgresDatabase) {}

  public async create(input: CreateCustomerInput): Promise<CustomerRecord> {
    const name = normalizeCustomerName(input.name).display;
    const normalizedPhone = normalizePhone(input.phone, input.phonePolicy);
    const result = await this.database.query<CustomerRecord>(`
      INSERT INTO customers (
        organization_id, name, normalized_phone, display_phone, home_branch_id, notes
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, organization_id, name, normalized_phone, status
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
