import type { PostgresDatabase } from '../../postgres/database.js';
import { normalizeServiceName } from './normalization.js';

export interface ServiceRecord {
  id: string;
  organization_id: string;
  name: string;
  duration_minutes: number;
  price_minor: string | null;
  currency: string | null;
  active: boolean;
}

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
    if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) {
      throw new Error('Service duration must be a positive whole number of minutes');
    }
    if ((input.priceMinor === null || input.priceMinor === undefined) !== (input.currency === null || input.currency === undefined)) {
      throw new Error('Service price and currency must be provided together');
    }
    const name = normalizeServiceName(input.name);
    const result = await this.database.query<ServiceRecord>(`
      INSERT INTO services (
        organization_id, name, normalized_name, description, duration_minutes, price_minor, currency
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, organization_id, name, duration_minutes, price_minor::text, currency, active
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
