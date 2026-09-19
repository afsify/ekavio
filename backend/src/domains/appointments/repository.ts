import type { PostgresDatabase } from '../../postgres/database.js';

export const appointmentStatuses = [
  'scheduled', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show',
] as const;
export type AppointmentStatus = typeof appointmentStatuses[number];

const transitions: Readonly<Record<AppointmentStatus, readonly AppointmentStatus[]>> = Object.freeze({
  scheduled: ['confirmed', 'checked_in', 'cancelled', 'no_show'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
});

export const canTransitionAppointment = (from: AppointmentStatus, to: AppointmentStatus): boolean =>
  transitions[from].includes(to);

export interface AppointmentRecord {
  id: string;
  organization_id: string;
  branch_id: string;
  customer_id: string;
  service_id: string;
  provider_membership_id: string | null;
  starts_at: Date;
  ends_at: Date;
  status: AppointmentStatus;
  version: number;
}

export class PostgresAppointmentRepository {
  public constructor(private readonly database: PostgresDatabase) {}

  public async create(input: {
    organizationId: string;
    branchId: string;
    customerId: string;
    serviceId: string;
    providerMembershipId?: string | null;
    startsAt: Date;
    endsAt: Date;
    notes?: string | null;
    idempotencyKey?: string | null;
    actorMembershipId: string;
  }): Promise<AppointmentRecord> {
    if (!(input.endsAt > input.startsAt)) throw new Error('Appointment end must be after its start');
    return this.database.transaction(async (client) => {
      const result = await client.query<AppointmentRecord>(`
        INSERT INTO appointments (
          organization_id, branch_id, customer_id, service_id, provider_membership_id,
          starts_at, ends_at, notes, idempotency_key, created_by_membership_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, organization_id, branch_id, customer_id, service_id,
          provider_membership_id, starts_at, ends_at, status, version
      `, [
        input.organizationId, input.branchId, input.customerId, input.serviceId,
        input.providerMembershipId ?? null, input.startsAt, input.endsAt, input.notes ?? null,
        input.idempotencyKey ?? null, input.actorMembershipId,
      ]);
      const appointment = result.rows[0]!;
      await client.query(`
        INSERT INTO appointment_status_events (
          appointment_id, organization_id, appointment_version, from_status,
          to_status, actor_membership_id
        ) VALUES ($1, $2, 1, NULL, 'scheduled', $3)
      `, [appointment.id, input.organizationId, input.actorMembershipId]);
      return appointment;
    });
  }

  public async transition(input: {
    organizationId: string;
    branchId: string;
    appointmentId: string;
    toStatus: AppointmentStatus;
    expectedVersion: number;
    actorMembershipId: string;
    reason?: string | null;
  }): Promise<AppointmentRecord> {
    return this.database.transaction(async (client) => {
      const currentResult = await client.query<AppointmentRecord>(`
        SELECT id, organization_id, branch_id, customer_id, service_id,
          provider_membership_id, starts_at, ends_at, status, version
        FROM appointments
        WHERE id = $1 AND organization_id = $2 AND branch_id = $3
        FOR UPDATE
      `, [input.appointmentId, input.organizationId, input.branchId]);
      const current = currentResult.rows[0];
      if (!current) throw new Error('Appointment not found in active branch context');
      if (current.version !== input.expectedVersion) throw new Error('Appointment version conflict');
      if (!canTransitionAppointment(current.status, input.toStatus)) {
        throw new Error(`Invalid appointment transition: ${current.status} -> ${input.toStatus}`);
      }
      const result = await client.query<AppointmentRecord>(`
        UPDATE appointments
        SET status = $1, version = version + 1, updated_at = NOW()
        WHERE id = $2 AND organization_id = $3 AND branch_id = $4 AND version = $5
        RETURNING id, organization_id, branch_id, customer_id, service_id,
          provider_membership_id, starts_at, ends_at, status, version
      `, [
        input.toStatus, input.appointmentId, input.organizationId,
        input.branchId, input.expectedVersion,
      ]);
      const updated = result.rows[0];
      if (!updated) throw new Error('Appointment version conflict');
      await client.query(`
        INSERT INTO appointment_status_events (
          appointment_id, organization_id, appointment_version, from_status,
          to_status, actor_membership_id, reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        updated.id, input.organizationId, updated.version, current.status,
        input.toStatus, input.actorMembershipId, input.reason ?? null,
      ]);
      return updated;
    });
  }
}
