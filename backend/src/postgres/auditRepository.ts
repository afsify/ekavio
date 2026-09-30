import type { PostgresDatabase } from './database.js';
import type {
  SafeAuditDetails,
  SecurityAuditAction,
} from '../services/auditPolicy.js';

export interface CreateAuditEventInput {
  organizationId: string;
  actorUserId: string | null;
  action: SecurityAuditAction;
  details: SafeAuditDetails;
  ipAddress: string | null;
  occurredAt?: Date;
  legacyMongoId?: string | null;
}

export interface AuditEventRecord {
  id: string;
  organization_id: string;
  actor_user_id: string | null;
  action: string;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  legacy_mongo_id: string | null;
  occurred_at: Date;
  created_at: Date;
}

export interface SecurityAuditRepository {
  create(input: CreateAuditEventInput): Promise<AuditEventRecord>;
}

export class PostgresAuditRepository implements SecurityAuditRepository {
  public constructor(private readonly database: PostgresDatabase) {}

  public async create(input: CreateAuditEventInput): Promise<AuditEventRecord> {
    const occurredAt = input.occurredAt ?? new Date();
    const result = await this.database.query<AuditEventRecord>(`
      INSERT INTO audit_events (
        organization_id, actor_user_id, action, details, ip_address,
        legacy_mongo_id, occurred_at
      ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
      RETURNING id, organization_id, actor_user_id, action, details,
        ip_address, legacy_mongo_id, occurred_at, created_at
    `, [
      input.organizationId,
      input.actorUserId,
      input.action,
      JSON.stringify(input.details),
      input.ipAddress,
      input.legacyMongoId ?? null,
      occurredAt,
    ]);
    return result.rows[0]!;
  }
}
