import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PostgresAttendanceRepository } from '../src/domains/attendance/repository.js';
import { PostgresDatabase } from '../src/postgres/database.js';
import { migrate } from '../src/postgres/migrations.js';
import { createAttendanceService } from '../src/services/attendanceService.js';
import type { AuthorizationContext } from '../src/services/requestContextService.js';

test('V2-06C PostgreSQL Attendance runtime invariants and branch isolation', async (context) => {
  const adminUrl = process.env.POSTGRES_TEST_URL;
  assert.ok(adminUrl, 'POSTGRES_TEST_URL is required');
  const parsed = new URL(adminUrl);
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(parsed.hostname));
  assert.equal(parsed.pathname, '/postgres');

  const databaseName = `ekavio_v206c_attendance_${randomUUID().replaceAll('-', '')}`;
  const admin = new PostgresDatabase(adminUrl);
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const database = new PostgresDatabase(databaseUrl.toString());
  context.after(async () => {
    await database.close();
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]);
    await admin.query(`DROP DATABASE "${databaseName}"`);
    await admin.close();
  });
  await migrate(database);

  const now = new Date('2026-10-01T20:00:00.000Z');
  const organizationA = randomUUID();
  const organizationB = randomUUID();
  const branchA = randomUUID();
  const branchA2 = randomUUID();
  const branchB = randomUUID();
  await database.query(`
    INSERT INTO organizations
      (id, name, type, theme_mode, theme_primary_color, created_at, updated_at)
    VALUES
      ($1, 'Attendance Org A', 'clinic', 'light', '#4F46E5', $3, $3),
      ($2, 'Attendance Org B', 'clinic', 'light', '#4F46E5', $3, $3)
  `, [organizationA, organizationB, now]);
  await database.query(`
    INSERT INTO branches
      (id, organization_id, name, code, status, timezone, created_at, updated_at)
    VALUES
      ($1, $4, 'Main', 'main', 'active', 'Asia/Kolkata', $6, $6),
      ($2, $4, 'Second', 'second', 'active', 'UTC', $6, $6),
      ($3, $5, 'Foreign', 'foreign', 'active', 'UTC', $6, $6)
  `, [branchA, branchA2, branchB, organizationA, organizationB, now]);

  const createMembership = async (input: {
    organizationId: string;
    name: string;
    role?: string;
    status?: string;
    branches: string[];
  }) => {
    const userId = randomUUID();
    const membershipId = randomUUID();
    await database.query(`
      INSERT INTO users (id, name, phone, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, NULL, $4, $4)
    `, [userId, input.name, `+91${String(Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000)}`, now]);
    await database.query(`
      INSERT INTO memberships
        (id, user_id, organization_id, role, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $6)
    `, [
      membershipId, userId, input.organizationId, input.role ?? 'staff', input.status ?? 'active', now,
    ]);
    for (const branchId of input.branches) {
      await database.query(`
        INSERT INTO membership_branch_assignments (membership_id, branch_id, organization_id)
        VALUES ($1, $2, $3)
      `, [membershipId, branchId, input.organizationId]);
    }
    return { userId, membershipId };
  };

  const actor = await createMembership({
    organizationId: organizationA, name: 'Attendance Manager', role: 'manager',
    branches: [branchA, branchA2],
  });
  const memberA = await createMembership({
    organizationId: organizationA, name: 'Branch A Staff', branches: [branchA],
  });
  const memberBoth = await createMembership({
    organizationId: organizationA, name: 'Shared Staff', branches: [branchA, branchA2],
  });
  const memberA2 = await createMembership({
    organizationId: organizationA, name: 'Branch A2 Staff', branches: [branchA2],
  });
  const foreign = await createMembership({
    organizationId: organizationB, name: 'Foreign Staff', branches: [branchB],
  });
  const inactive = await createMembership({
    organizationId: organizationA, name: 'Inactive Staff', status: 'inactive', branches: [branchA],
  });
  const concurrent = await createMembership({
    organizationId: organizationA, name: 'Concurrent Staff', branches: [branchA],
  });

  const repository = new PostgresAttendanceRepository(database);
  const service = createAttendanceService(repository, () => now);
  const contextFor = (branchId: string): AuthorizationContext => ({
    userId: actor.userId,
    sessionId: randomUUID(),
    organizationId: organizationA,
    membershipId: actor.membershipId,
    branchId,
    role: 'manager',
    permissions: ['attendance.read', 'attendance.manage'],
    platformOperator: false,
  });
  const contextA = contextFor(branchA);
  const contextA2 = contextFor(branchA2);

  await context.test('branch-local today, roster, initial mark, and exact retry are canonical', async () => {
    const before = await service.dailyRoster(contextA);
    assert.equal(before.attendanceDate, '2026-10-02');
    assert.equal(before.branch.timezone, 'Asia/Kolkata');
    assert.ok(before.roster.some(({ membershipId }) => membershipId === memberA.membershipId));
    assert.equal(JSON.stringify(before).includes('+91'), false);

    const input = {
      membershipId: memberA.membershipId,
      attendanceDate: '2026-10-02',
      status: 'present' as const,
      checkInAt: '2026-10-02T09:15',
      checkOutAt: '2026-10-02T17:30',
      idempotencyKey: 'attendance-member-a-2026-10-02',
    };
    const first = await service.mark(contextA, input);
    const retry = await service.mark(contextA, input);
    assert.equal(first.record.id, retry.record.id);
    assert.equal(first.record.version, 1);
    assert.equal(first.record.checkInAt, '2026-10-02T03:45:00.000Z');
    assert.equal(first.record.checkOutAt, '2026-10-02T12:00:00.000Z');
    const count = await database.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM attendance_records
      WHERE organization_id = $1 AND membership_id = $2 AND attendance_date = '2026-10-02'
    `, [organizationA, memberA.membershipId]);
    assert.equal(count.rows[0]?.count, '1');
  });

  await context.test('manual corrections require reason/version and append immutable history', async () => {
    await assert.rejects(
      service.mark(contextA, {
        membershipId: memberA.membershipId,
        attendanceDate: '2026-10-02',
        status: 'absent',
      }),
      /expectedVersion and correctionReason/,
    );
    const corrected = await service.mark(contextA, {
      membershipId: memberA.membershipId,
      attendanceDate: '2026-10-02',
      status: 'half_day',
      checkInAt: '2026-10-02T09:30',
      expectedVersion: 1,
      correctionReason: 'Corrected after reviewing the daily register',
    });
    assert.equal(corrected.record.version, 2);
    assert.equal(corrected.record.status, 'half_day');
    await assert.rejects(
      service.mark(contextA, {
        membershipId: memberA.membershipId,
        attendanceDate: '2026-10-02',
        status: 'absent',
        expectedVersion: 1,
        correctionReason: 'Stale correction attempt',
      }),
      /version conflict/,
    );
    const history = await service.history(contextA, corrected.record.id);
    assert.equal(history.changes.length, 1);
    assert.equal(history.changes[0]?.priorStatus, 'present');
    assert.equal(history.changes[0]?.newStatus, 'half_day');
    assert.equal(history.changes[0]?.resultingVersion, 2);
    const actorRow = await database.query<{ actor_membership_id: string }>(`
      SELECT actor_membership_id FROM attendance_record_changes
      WHERE attendance_record_id = $1
    `, [corrected.record.id]);
    assert.equal(actorRow.rows[0]?.actor_membership_id, actor.membershipId);
    await assert.rejects(
      database.query('DELETE FROM attendance_record_changes WHERE attendance_record_id = $1', [corrected.record.id]),
      /append-only/,
    );
    await assert.rejects(
      database.query('DELETE FROM attendance_records WHERE id = $1', [corrected.record.id]),
      /cannot be deleted/,
    );
  });

  await context.test('absent and half-day marks preserve explicit status/time invariants', async () => {
    const absent = await service.mark(contextA, {
      membershipId: memberBoth.membershipId,
      attendanceDate: '2026-10-03',
      status: 'absent',
      idempotencyKey: 'attendance-absent',
    });
    assert.equal(absent.record.checkInAt, null);
    assert.equal(absent.record.checkOutAt, null);
    const halfDay = await service.mark(contextA, {
      membershipId: memberA.membershipId,
      attendanceDate: '2026-10-03',
      status: 'half_day',
      idempotencyKey: 'attendance-half-day',
    });
    assert.equal(halfDay.record.status, 'half_day');
    await assert.rejects(
      service.mark(contextA, {
        membershipId: concurrent.membershipId,
        attendanceDate: '2026-10-03',
        status: 'present',
        checkInAt: '2026-10-03T10:00',
        checkOutAt: '2026-10-03T09:00',
      }),
      /later than check-in/,
    );
    await assert.rejects(
      database.query(`
        INSERT INTO attendance_records
          (organization_id, branch_id, membership_id, attendance_date, status, source,
           created_by_membership_id, check_in_at)
        VALUES ($1, $2, $3, '2026-10-04', 'absent', 'manual', $4, '2026-10-04T04:00:00.000Z')
      `, [organizationA, branchA, concurrent.membershipId, actor.membershipId]),
      /attendance_records_absent_has_no_times/,
    );
  });

  await context.test('concurrent initial marks create one row and never silently overwrite', async () => {
    const results = await Promise.allSettled([
      service.mark(contextA, {
        membershipId: concurrent.membershipId,
        attendanceDate: '2026-10-02',
        status: 'present',
        idempotencyKey: 'concurrent-present',
      }),
      service.mark(contextA, {
        membershipId: concurrent.membershipId,
        attendanceDate: '2026-10-02',
        status: 'absent',
        idempotencyKey: 'concurrent-absent',
      }),
    ]);
    assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.equal(results.filter(({ status }) => status === 'rejected').length, 1);
    const count = await database.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM attendance_records
      WHERE organization_id = $1 AND membership_id = $2 AND attendance_date = '2026-10-02'
    `, [organizationA, concurrent.membershipId]);
    assert.equal(count.rows[0]?.count, '1');
  });

  await context.test('tenant, branch, assignment, guessed UUID, and cross-branch ownership fail closed', async () => {
    await assert.rejects(
      service.mark(contextA, {
        membershipId: foreign.membershipId,
        attendanceDate: '2026-10-02',
        status: 'present',
      }),
      /selected branch|relationship|subject/i,
    );
    await assert.rejects(
      service.mark(contextA, {
        membershipId: randomUUID(),
        attendanceDate: '2026-10-02',
        status: 'present',
      }),
      /selected branch|relationship|subject/i,
    );
    await assert.rejects(
      service.mark(contextA, {
        membershipId: memberA2.membershipId,
        attendanceDate: '2026-10-02',
        status: 'present',
      }),
      /selected branch|relationship|subject/i,
    );
    await assert.rejects(
      service.mark(contextA, {
        membershipId: inactive.membershipId,
        attendanceDate: '2026-10-02',
        status: 'present',
      }),
      /selected branch|relationship|subject/i,
    );
    await assert.rejects(
      service.dailyRoster(contextFor(randomUUID()), '2026-10-02'),
      /Active branch has no reviewed IANA timezone/,
    );
    const branchOwned = await service.mark(contextA, {
      membershipId: memberBoth.membershipId,
      attendanceDate: '2026-10-04',
      status: 'present',
    });
    await assert.rejects(
      service.mark(contextA2, {
        membershipId: memberBoth.membershipId,
        attendanceDate: '2026-10-04',
        status: 'absent',
      }),
      /owned by another branch/,
    );
    await assert.rejects(
      service.history(contextA2, branchOwned.record.id),
      /Attendance record not found/,
    );
  });

  await context.test('branch roster isolation has no foreign placeholder identities', async () => {
    const rosterA2 = await service.dailyRoster(contextA2, '2026-10-02');
    assert.ok(rosterA2.roster.some(({ membershipId }) => membershipId === memberA2.membershipId));
    assert.equal(rosterA2.roster.some(({ membershipId }) => membershipId === memberA.membershipId), false);
    assert.equal(JSON.stringify(rosterA2).includes('Foreign Staff'), false);
    assert.equal(JSON.stringify(rosterA2).includes('null placeholder'), false);
  });

  await context.test('historical records remain visible after membership deactivation', async () => {
    await database.query(`
      UPDATE memberships SET status = 'inactive', updated_at = NOW() WHERE id = $1
    `, [memberA.membershipId]);
    const roster = await service.dailyRoster(contextA, '2026-10-02');
    const historical = roster.roster.find(({ membershipId }) => membershipId === memberA.membershipId);
    assert.ok(historical?.attendance);
    assert.equal(historical?.membershipStatus, 'inactive');
  });

  await context.test('Dashboard and Attendance share branch-local business-date semantics', async () => {
    const present = await service.mark(contextA, {
      membershipId: memberBoth.membershipId,
      attendanceDate: '2026-10-02',
      status: 'present',
      idempotencyKey: 'dashboard-present-local-day',
    });
    assert.equal(present.record.attendanceDate, '2026-10-02');
    const roster = await service.dailyRoster(contextA, '2026-10-02');
    assert.equal(await service.countPresentToday(contextA), roster.summary.present);
    assert.ok(roster.summary.present >= 1);
    assert.equal(await service.countPresentToday(contextA2), 0);
  });
});
