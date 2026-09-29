import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import express, { type NextFunction, type Response } from 'express';
import { requirePermission, type AuthenticatedRequest } from '../src/middlewares/authMiddleware.js';
import { markAttendanceSchema, attendanceRosterQuerySchema } from '../src/schemas/attendanceSchemas.js';
import { permissions, type Permission } from '../src/services/authorizationPolicy.js';

test('Attendance schemas enforce canonical membership, date, status, correction, and time boundaries', () => {
  const valid = markAttendanceSchema.parse({
    membershipId: '11111111-1111-4111-8111-111111111111',
    attendanceDate: '2026-09-28',
    status: 'half-day',
    checkInAt: '2026-09-28T09:30',
    expectedVersion: 1,
    correctionReason: 'Correcting the reviewed daily state',
    idempotencyKey: 'attendance-ui-retry-1',
  });
  assert.equal(valid.status, 'half_day');
  assert.equal(attendanceRosterQuerySchema.parse({ date: '2024-02-29' }).date, '2024-02-29');

  for (const invalid of [
    { membershipId: 'mongo-object-id', attendanceDate: '2026-09-28', status: 'present' },
    { membershipId: valid.membershipId, attendanceDate: '2026-02-30', status: 'present' },
    { membershipId: valid.membershipId, attendanceDate: '2026-09-28', status: 'late' },
    { membershipId: valid.membershipId, attendanceDate: '2026-09-28', status: 'absent', checkInAt: '2026-09-28T09:00' },
    { membershipId: valid.membershipId, attendanceDate: '2026-09-28', status: 'present', expectedVersion: 1 },
    { membershipId: valid.membershipId, attendanceDate: '2026-09-28', status: 'present', correctionReason: 'Reason' },
    { membershipId: valid.membershipId, attendanceDate: '2026-09-28', status: 'present', source: 'import' },
    { membershipId: valid.membershipId, attendanceDate: '2026-09-28', status: 'present', userId: 'legacy' },
  ]) assert.equal(markAttendanceSchema.safeParse(invalid).success, false);
});

test('Attendance runtime and frontend contracts are PostgreSQL-only and contain no mock success path', async () => {
  const [composition, controller, repository, analytics, routes, frontend] = await Promise.all([
    readFile(new URL('../src/persistence/runtimePersistence.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/controllers/attendanceController.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/domains/attendance/repository.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/controllers/analyticsController.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/attendanceRoutes.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../frontend/src/pages/Attendance/AttendancePage.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(composition, /attendanceAuthority: 'postgresql'/);
  assert.match(composition, /PostgresAttendanceRepository/);
  for (const forbidden of [
    'mongooseAttendanceStorageRepository',
    'PostgresAttendanceIdentityResolver',
    'attendanceStorage',
    'attendanceIdentities',
  ]) assert.equal(composition.includes(forbidden), false, forbidden);
  for (const source of [controller, repository]) {
    assert.equal(source.includes("models/Attendance"), false);
    assert.equal(source.includes('mongooseAttendanceStorageRepository'), false);
    assert.equal(source.includes('legacyMongoOrganizationId'), false);
    assert.equal(source.includes('legacyMongoUserId'), false);
  }
  assert.equal(analytics.includes("models/Attendance"), false);
  assert.equal(analytics.includes('Attendance.countDocuments'), false);
  assert.match(routes, /ATTENDANCE_READ/);
  assert.match(routes, /ATTENDANCE_MANAGE/);
  assert.match(frontend, /client\.(get|post)/);
  assert.match(frontend, /params: selectedDate \? \{ date: selectedDate \}/);
  assert.match(frontend, /permissions\.includes\('attendance\.manage'\)/);
  assert.match(frontend, /expectedVersion/);
  assert.match(frontend, /correctionReason/);
  assert.equal(frontend.includes('mockStaffData'), false);
  assert.equal(frontend.includes('60d0fe4f5311236168a109ca'), false);
  assert.equal(frontend.includes('fake'), false);
});

test('Attendance read and manage permissions remain distinct HTTP boundaries', async (context) => {
  const authorization = (effectivePermissions: Permission[]) => (
    request: AuthenticatedRequest,
    _response: Response,
    next: NextFunction,
  ) => {
    request.auth = {
      userId: 'user',
      sessionId: 'session',
      organizationId: 'organization',
      membershipId: 'membership',
      branchId: 'branch',
      role: 'staff',
      permissions: effectivePermissions,
      platformOperator: false,
    };
    next();
  };
  const app = express();
  app.get(
    '/attendance-read',
    authorization([permissions.ATTENDANCE_READ]),
    requirePermission(permissions.ATTENDANCE_READ),
    (_request, response) => response.sendStatus(204),
  );
  app.post(
    '/attendance-read-only',
    authorization([permissions.ATTENDANCE_READ]),
    requirePermission(permissions.ATTENDANCE_MANAGE),
    (_request, response) => response.sendStatus(204),
  );
  app.post(
    '/attendance-manage',
    authorization([permissions.ATTENDANCE_READ, permissions.ATTENDANCE_MANAGE]),
    requirePermission(permissions.ATTENDANCE_MANAGE),
    (_request, response) => response.sendStatus(204),
  );
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  assert.equal((await fetch(`${baseUrl}/attendance-read`)).status, 204);
  assert.equal((await fetch(`${baseUrl}/attendance-read-only`, { method: 'POST' })).status, 403);
  assert.equal((await fetch(`${baseUrl}/attendance-manage`, { method: 'POST' })).status, 204);
});
