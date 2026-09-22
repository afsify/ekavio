import type { PostgresDatabase } from '../../postgres/database.js';
import { normalizeServiceName } from './normalization.js';

export interface ServiceRecord {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_minor: string | null;
  currency: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ServiceProviderRecord {
  membership_id: string;
  user_id: string;
  name: string;
}

const serviceColumns = `
  id, organization_id, name, description, duration_minutes,
  price_minor::text, currency, active, created_at, updated_at
`;

const validateServiceInput = (input: {
  durationMinutes: number;
  priceMinor?: bigint | null;
  currency?: string | null;
}): void => {
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) {
    throw new Error('Service duration must be a positive whole number of minutes');
  }
  if ((input.priceMinor === null || input.priceMinor === undefined) !== (input.currency === null || input.currency === undefined)) {
    throw new Error('Service price and currency must be provided together');
  }
};

export class PostgresServiceRepository {
  public constructor(private readonly database: PostgresDatabase) {}

  public async create(input: {
    organizationId: string;
    name: string;
    description?: string | null;
    durationMinutes: number;
    priceMinor?: bigint | null;
    currency?: string | null;
  }): Promise<ServiceRecord> {
    validateServiceInput(input);
    const name = normalizeServiceName(input.name);
    const result = await this.database.query<ServiceRecord>(`
      INSERT INTO services (
        organization_id, name, normalized_name, description, duration_minutes, price_minor, currency
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING ${serviceColumns}
    `, [
      input.organizationId,
      name.display,
      name.key,
      input.description ?? null,
      input.durationMinutes,
      input.priceMinor?.toString() ?? null,
      input.currency?.toUpperCase() ?? null,
    ]);
    return result.rows[0]!;
  }

  public async createForBranch(input: {
    organizationId: string;
    branchId: string;
    name: string;
    description?: string | null;
    durationMinutes: number;
    priceMinor?: bigint | null;
    currency?: string | null;
  }): Promise<ServiceRecord> {
    validateServiceInput(input);
    const name = normalizeServiceName(input.name);
    return this.database.transaction(async (client) => {
      const result = await client.query<ServiceRecord>(`
        INSERT INTO services (
          organization_id, name, normalized_name, description, duration_minutes, price_minor, currency
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING ${serviceColumns}
      `, [
        input.organizationId,
        name.display,
        name.key,
        input.description ?? null,
        input.durationMinutes,
        input.priceMinor?.toString() ?? null,
        input.currency?.toUpperCase() ?? null,
      ]);
      const service = result.rows[0]!;
      await client.query(`
        INSERT INTO service_branch_availability (service_id, branch_id, organization_id, active)
        VALUES ($1, $2, $3, TRUE)
      `, [service.id, input.branchId, input.organizationId]);
      return service;
    });
  }

  public async findById(organizationId: string, serviceId: string): Promise<ServiceRecord | null> {
    const result = await this.database.query<ServiceRecord>(`
      SELECT ${serviceColumns}
      FROM services
      WHERE id = $1 AND organization_id = $2
    `, [serviceId, organizationId]);
    return result.rows[0] ?? null;
  }

  public async list(input: {
    organizationId: string;
    branchId?: string;
    activeOnly?: boolean;
    page: number;
    limit: number;
  }): Promise<{ data: ServiceRecord[]; total: number }> {
    return this.database.transaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const values = [input.organizationId, input.branchId ?? null, input.activeOnly ?? false];
      const predicate = `
        s.organization_id = $1
        AND (NOT $3::boolean OR s.active)
        AND ($2::uuid IS NULL OR EXISTS (
          SELECT 1 FROM service_branch_availability a
          WHERE a.service_id = s.id AND a.organization_id = s.organization_id
            AND a.branch_id = $2 AND a.active
        ))
      `;
      const count = await client.query<{ total: string }>(`
        SELECT COUNT(*)::text AS total FROM services s WHERE ${predicate}
      `, values);
      const result = await client.query<ServiceRecord>(`
        SELECT ${serviceColumns.replaceAll(/\b(id|organization_id|name|description|duration_minutes|price_minor|currency|active|created_at|updated_at)\b/g, 's.$1')}
        FROM services s
        WHERE ${predicate}
        ORDER BY s.name, s.id
        LIMIT $4 OFFSET $5
      `, [...values, input.limit, (input.page - 1) * input.limit]);
      return { data: result.rows, total: Number(count.rows[0]?.total ?? 0) };
    });
  }

  public async update(input: {
    organizationId: string;
    serviceId: string;
    name?: string;
    description?: string | null;
    durationMinutes?: number;
    priceMinor?: bigint | null;
    currency?: string | null;
    active?: boolean;
  }): Promise<ServiceRecord | null> {
    if (input.durationMinutes !== undefined && (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0)) {
      throw new Error('Service duration must be a positive whole number of minutes');
    }
    const hasPrice = input.priceMinor !== undefined || input.currency !== undefined;
    if (hasPrice && ((input.priceMinor === null || input.priceMinor === undefined)
      !== (input.currency === null || input.currency === undefined))) {
      throw new Error('Service price and currency must be provided together');
    }
    const name = input.name === undefined ? null : normalizeServiceName(input.name);
    const result = await this.database.query<ServiceRecord>(`
      UPDATE services
      SET name = COALESCE($3, name),
        normalized_name = COALESCE($4, normalized_name),
        description = CASE WHEN $5 THEN $6 ELSE description END,
        duration_minutes = COALESCE($7, duration_minutes),
        price_minor = CASE WHEN $8 THEN $9 ELSE price_minor END,
        currency = CASE WHEN $8 THEN $10 ELSE currency END,
        active = COALESCE($11, active),
        updated_at = NOW()
      WHERE id = $1 AND organization_id = $2
      RETURNING ${serviceColumns}
    `, [
      input.serviceId,
      input.organizationId,
      name?.display ?? null,
      name?.key ?? null,
      input.description !== undefined,
      input.description ?? null,
      input.durationMinutes ?? null,
      hasPrice,
      input.priceMinor?.toString() ?? null,
      input.currency?.toUpperCase() ?? null,
      input.active ?? null,
    ]);
    return result.rows[0] ?? null;
  }

  public async listProviders(input: {
    organizationId: string;
    branchId: string;
    serviceId: string;
  }): Promise<ServiceProviderRecord[]> {
    const result = await this.database.query<ServiceProviderRecord>(`
      SELECT p.membership_id, m.user_id, u.name
      FROM provider_service_assignments p
      JOIN memberships m
        ON m.id = p.membership_id AND m.organization_id = p.organization_id
      JOIN users u ON u.id = m.user_id
      WHERE p.organization_id = $1 AND p.branch_id = $2 AND p.service_id = $3
        AND p.active AND m.status = 'active'
      ORDER BY u.name, p.membership_id
    `, [input.organizationId, input.branchId, input.serviceId]);
    return result.rows;
  }

  public async setBranchAvailability(input: {
    organizationId: string;
    serviceId: string;
    branchId: string;
    active: boolean;
  }): Promise<void> {
    const result = await this.database.query(`
      INSERT INTO service_branch_availability (
        service_id, branch_id, organization_id, active
      ) VALUES ($1, $2, $3, $4)
      ON CONFLICT (service_id, branch_id) DO UPDATE
      SET active = EXCLUDED.active, updated_at = NOW()
      WHERE service_branch_availability.organization_id = EXCLUDED.organization_id
      RETURNING service_id
    `, [input.serviceId, input.branchId, input.organizationId, input.active]);
    if (result.rowCount !== 1) throw new Error('Service availability scope conflict');
  }

  public async assignProvider(input: {
    organizationId: string;
    membershipId: string;
    serviceId: string;
    branchId: string;
    active: boolean;
  }): Promise<void> {
    const result = await this.database.query(`
      INSERT INTO provider_service_assignments (
        membership_id, service_id, branch_id, organization_id, active
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (membership_id, service_id, branch_id) DO UPDATE
      SET active = EXCLUDED.active, updated_at = NOW()
      WHERE provider_service_assignments.organization_id = EXCLUDED.organization_id
      RETURNING membership_id
    `, [input.membershipId, input.serviceId, input.branchId, input.organizationId, input.active]);
    if (result.rowCount !== 1) throw new Error('Provider assignment scope conflict');
  }
}
