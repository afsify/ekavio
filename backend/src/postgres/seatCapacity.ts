import type { PoolClient } from 'pg';
import type { PostgresDatabase } from './database.js';
import { PostgresCommercialRepository } from './commercialRepository.js';
import { calculateEffectiveEntitlements } from '../services/entitlementService.js';
import { AppError } from '../utils/AppError.js';

// Shared catalogue coordination precedes organization and all identity/command
// locks. Catalogue writers must take the exclusive form before any row locks.
export async function lockSeatCatalogue(client: PoolClient, exclusive = false): Promise<void> {
  await client.query(exclusive
    ? "SELECT pg_advisory_xact_lock(hashtextextended('ekavio-seat-catalogue-v1',0))"
    : "SELECT pg_advisory_xact_lock_shared(hashtextextended('ekavio-seat-catalogue-v1',0))");
}

export async function lockOrganizationSeats(client: PoolClient, organizationId: string): Promise<void> {
  await lockSeatCatalogue(client);
  const result = await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [organizationId]);
  if (!result.rowCount) throw new AppError('Organization not found', 404);
}

export interface SeatCapacity {
  occupied: number;
  reserved: number;
  allowed: number | null;
  available: number;
  overCapacity: boolean;
}

export function summarizeSeats(occupied: number, reserved: number, limit: number | null): SeatCapacity {
  const allowed = limit !== null && Number.isSafeInteger(limit) && limit >= 0 ? limit : null;
  return { occupied, reserved, allowed, available: Math.max(0, (allowed ?? 0) - occupied - reserved),
    overCapacity: occupied + reserved > (allowed ?? 0) };
}

// Caller holds catalogue + organization locks for the complete mutation.
// Read on that SAME client; never open a second snapshot/connection.
export async function readSeatCapacity(database: PostgresDatabase, client: PoolClient, organizationId: string, renewalStartsAt?: Date): Promise<SeatCapacity> {
  const now = (await client.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0]!.now;
  const snapshot = await new PostgresCommercialRepository(database).loadSnapshot(organizationId, client);
  // Only commercial renewal may evaluate its future package. Usage/reservations
  // still reflect NOW, and all membership/invitation writes use current eligibility.
  const capacityAt = renewalStartsAt && renewalStartsAt > now ? renewalStartsAt : now;
  const limit = calculateEffectiveEntitlements(organizationId, snapshot, capacityAt).limits.staff;
  const result = await client.query<{ occupied: number; reserved: number }>(`
    SELECT
      (SELECT count(*)::int FROM memberships WHERE organization_id=$1 AND status IN ('active','inactive')) AS occupied,
      (SELECT count(*)::int FROM staff_invitations i WHERE i.organization_id=$1
        AND i.consumed_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>$2
        AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id=i.organization_id
          AND m.user_id=i.target_user_id AND m.status IN ('active','inactive'))) AS reserved`, [organizationId, now]);
  const usage = result.rows[0]!;
  return summarizeSeats(usage.occupied, usage.reserved, limit);
}

export function requireSeatCapacity(capacity: SeatCapacity, additional = 0): void {
  if (capacity.allowed === null) throw new AppError('Organization staff capacity is not available', 409);
  if (capacity.occupied + capacity.reserved + additional > capacity.allowed) {
    throw new AppError('Organization staff capacity exceeded', 409);
  }
}

export async function assertSeatCapacity(database: PostgresDatabase, client: PoolClient, organizationId: string, additional = 0): Promise<void> {
  requireSeatCapacity(await readSeatCapacity(database, client, organizationId), additional);
}
