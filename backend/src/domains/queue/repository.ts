import type { PoolClient } from 'pg';
import type { PostgresDatabase } from '../../postgres/database.js';

export const queueStatuses = ['waiting', 'serving', 'completed', 'cancelled'] as const;
export type QueueStatus = typeof queueStatuses[number];

const transitions: Readonly<Record<QueueStatus, readonly QueueStatus[]>> = Object.freeze({
  waiting: ['serving', 'cancelled'],
  serving: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
});

export const canTransitionQueueToken = (from: QueueStatus, to: QueueStatus): boolean =>
  transitions[from].includes(to);

export interface QueueTokenRecord {
  id: string;
  organization_id: string;
  branch_id: string;
  queue_session_id: string;
  token_number: string;
  customer_id: string;
  service_id: string;
  appointment_id: string | null;
  provider_membership_id: string | null;
  status: QueueStatus;
  idempotency_key: string | null;
  version: number;
}

interface TokenInput {
  organizationId: string;
  branchId: string;
  sessionId: string;
  customerId: string;
  serviceId: string;
  providerMembershipId?: string | null;
  appointmentId?: string | null;
  idempotencyKey?: string | null;
  actorMembershipId: string;
}

const selectTokenColumns = `
  id, organization_id, branch_id, queue_session_id, token_number::text,
  customer_id, service_id, appointment_id, provider_membership_id,
  status, idempotency_key, version
`;

export class PostgresQueueRepository {
  public constructor(private readonly database: PostgresDatabase) {}

  public async openSession(input: {
    organizationId: string;
    branchId: string;
    localBusinessDate: string;
    laneKey?: string;
  }): Promise<{ id: string; next_token_number: string }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.localBusinessDate)) {
      throw new Error('Queue business date must use YYYY-MM-DD');
    }
    const result = await this.database.query<{ id: string; next_token_number: string }>(`
      INSERT INTO queue_sessions (
        organization_id, branch_id, local_business_date, lane_key
      ) VALUES ($1, $2, $3, $4)
      ON CONFLICT (organization_id, branch_id, local_business_date, lane_key)
      DO UPDATE SET updated_at = queue_sessions.updated_at
      RETURNING id, next_token_number::text
    `, [input.organizationId, input.branchId, input.localBusinessDate, input.laneKey ?? 'default']);
    return result.rows[0]!;
  }

  private async findIdempotent(client: PoolClient, input: TokenInput): Promise<QueueTokenRecord | undefined> {
    if (!input.idempotencyKey) return undefined;
    const result = await client.query<QueueTokenRecord>(`
      SELECT ${selectTokenColumns}
      FROM queue_tokens
      WHERE organization_id = $1 AND idempotency_key = $2
    `, [input.organizationId, input.idempotencyKey]);
    const existing = result.rows[0];
    if (existing && (
      existing.branch_id !== input.branchId || existing.queue_session_id !== input.sessionId
      || existing.customer_id !== input.customerId
      || existing.service_id !== input.serviceId
      || existing.appointment_id !== (input.appointmentId ?? null)
      || existing.provider_membership_id !== (input.providerMembershipId ?? null)
    )) throw new Error('Idempotency key was already used for a different queue operation');
    return existing;
  }

  private async allocate(client: PoolClient, input: TokenInput): Promise<QueueTokenRecord> {
    const idempotent = await this.findIdempotent(client, input);
    if (idempotent) return idempotent;

    const session = await client.query<{ status: 'open' | 'closed' }>(`
      SELECT status
      FROM queue_sessions
      WHERE id = $1 AND organization_id = $2 AND branch_id = $3
      FOR UPDATE
    `, [input.sessionId, input.organizationId, input.branchId]);
    if (!session.rows[0]) throw new Error('Queue session not found in active context');
    if (session.rows[0].status !== 'open') throw new Error('Queue session is closed');
    const concurrentIdempotent = await this.findIdempotent(client, input);
    if (concurrentIdempotent) return concurrentIdempotent;

    const counter = await client.query<{ token_number: string }>(`
      UPDATE queue_sessions
      SET next_token_number = next_token_number + 1, updated_at = NOW()
      WHERE id = $1
      RETURNING (next_token_number - 1)::text AS token_number
    `, [input.sessionId]);
    const tokenNumber = counter.rows[0]!.token_number;
    const result = await client.query<QueueTokenRecord>(`
      INSERT INTO queue_tokens (
        organization_id, branch_id, queue_session_id, token_number,
        customer_id, service_id, appointment_id, provider_membership_id,
        idempotency_key, created_by_membership_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING ${selectTokenColumns}
    `, [
      input.organizationId, input.branchId, input.sessionId, tokenNumber,
      input.customerId, input.serviceId, input.appointmentId ?? null,
      input.providerMembershipId ?? null, input.idempotencyKey ?? null,
      input.actorMembershipId,
    ]);
    const token = result.rows[0]!;
    await client.query(`
      INSERT INTO queue_status_events (
        queue_token_id, organization_id, queue_token_version, from_status,
        to_status, actor_membership_id, source
      ) VALUES ($1, $2, 1, NULL, 'waiting', $3, 'user')
    `, [token.id, input.organizationId, input.actorMembershipId]);
    return token;
  }

  public createToken(input: TokenInput): Promise<QueueTokenRecord> {
    return this.database.transaction((client) => this.allocate(client, input));
  }

  public async transition(input: {
    organizationId: string;
    branchId: string;
    tokenId: string;
    toStatus: QueueStatus;
    expectedVersion: number;
    actorMembershipId: string;
    reason?: string | null;
  }): Promise<QueueTokenRecord> {
    return this.database.transaction(async (client) => {
      const result = await client.query<QueueTokenRecord>(`
        SELECT ${selectTokenColumns}
        FROM queue_tokens
        WHERE id = $1 AND organization_id = $2 AND branch_id = $3
        FOR UPDATE
      `, [input.tokenId, input.organizationId, input.branchId]);
      const current = result.rows[0];
      if (!current) throw new Error('Queue token not found in active branch context');
      if (current.version !== input.expectedVersion) throw new Error('Queue token version conflict');
      if (!canTransitionQueueToken(current.status, input.toStatus)) {
        throw new Error(`Invalid queue transition: ${current.status} -> ${input.toStatus}`);
      }
      const updatedResult = await client.query<QueueTokenRecord>(`
        UPDATE queue_tokens
        SET status = $1, version = version + 1, updated_at = NOW()
        WHERE id = $2 AND organization_id = $3 AND branch_id = $4 AND version = $5
        RETURNING ${selectTokenColumns}
      `, [
        input.toStatus, input.tokenId, input.organizationId,
        input.branchId, input.expectedVersion,
      ]);
      const updated = updatedResult.rows[0];
      if (!updated) throw new Error('Queue token version conflict');
      await client.query(`
        INSERT INTO queue_status_events (
          queue_token_id, organization_id, queue_token_version, from_status,
          to_status, actor_membership_id, source, reason
        ) VALUES ($1, $2, $3, $4, $5, $6, 'user', $7)
      `, [
        updated.id, input.organizationId, updated.version, current.status,
        input.toStatus, input.actorMembershipId, input.reason ?? null,
      ]);
      return updated;
    });
  }

  public async checkInAppointment(input: {
    organizationId: string;
    branchId: string;
    sessionId: string;
    appointmentId: string;
    idempotencyKey: string;
    actorMembershipId: string;
  }): Promise<QueueTokenRecord> {
    return this.database.transaction(async (client) => {
      const appointmentResult = await client.query<{
        id: string;
        branch_id: string;
        customer_id: string;
        service_id: string;
        provider_membership_id: string | null;
        status: string;
        version: number;
      }>(`
        SELECT id, branch_id, customer_id, service_id, provider_membership_id, status, version
        FROM appointments
        WHERE id = $1 AND organization_id = $2 AND branch_id = $3
        FOR UPDATE
      `, [input.appointmentId, input.organizationId, input.branchId]);
      const appointment = appointmentResult.rows[0];
      if (!appointment) throw new Error('Appointment not found in active branch context');

      const existingResult = await client.query<QueueTokenRecord>(`
        SELECT ${selectTokenColumns}
        FROM queue_tokens
        WHERE appointment_id = $1
      `, [input.appointmentId]);
      const existing = existingResult.rows[0];
      if (existing) {
        if (existing.organization_id !== input.organizationId || existing.branch_id !== input.branchId) {
          throw new Error('Existing appointment token is outside the active context');
        }
        return existing;
      }
      if (appointment.status !== 'scheduled' && appointment.status !== 'confirmed') {
        throw new Error(`Appointment cannot be checked in from ${appointment.status}`);
      }
      const token = await this.allocate(client, {
        organizationId: input.organizationId,
        branchId: input.branchId,
        sessionId: input.sessionId,
        customerId: appointment.customer_id,
        serviceId: appointment.service_id,
        providerMembershipId: appointment.provider_membership_id,
        appointmentId: appointment.id,
        idempotencyKey: input.idempotencyKey,
        actorMembershipId: input.actorMembershipId,
      });
      const nextVersion = appointment.version + 1;
      await client.query(`
        UPDATE appointments
        SET status = 'checked_in', version = $1, updated_at = NOW()
        WHERE id = $2 AND organization_id = $3
      `, [nextVersion, appointment.id, input.organizationId]);
      await client.query(`
        INSERT INTO appointment_status_events (
          appointment_id, organization_id, appointment_version, from_status,
          to_status, actor_membership_id, reason
        ) VALUES ($1, $2, $3, $4, 'checked_in', $5, 'Queue check-in')
      `, [
        appointment.id, input.organizationId, nextVersion,
        appointment.status, input.actorMembershipId,
      ]);
      return token;
    });
  }
}
