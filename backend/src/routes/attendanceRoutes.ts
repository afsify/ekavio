import { Router } from 'express';
import {
  getAttendanceHistory,
  getDailyAttendance,
  markAttendance,
} from '../controllers/attendanceController.js';
import { authenticate, requirePermission } from '../middlewares/authMiddleware.js';
import { requireEntitlement } from '../middlewares/tenantMiddleware.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import { markAttendanceSchema } from '../schemas/attendanceSchemas.js';
import { permissions } from '../services/authorizationPolicy.js';
import { MODULES } from '../commercial/catalogue.js';

const router = Router();

router.use(authenticate);
router.use(requireEntitlement(MODULES.ATTENDANCE));

/**
 * @openapi
 * /attendance:
 *   get:
 *     summary: Get the selected branch roster and Attendance state for one business date
 *     tags: [Attendance]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date, example: "2026-09-28" }
 *         description: Branch-local business date; defaults to today in the selected branch timezone
 *     responses:
 *       200: { description: Branch roster with marked and unmarked memberships }
 *       400: { description: Missing branch context or invalid date }
 *       403: { description: Entitlement or permission denied }
 */
router.get('/', requirePermission(permissions.ATTENDANCE_READ), getDailyAttendance);

/**
 * @openapi
 * /attendance/{recordId}/history:
 *   get:
 *     summary: Get immutable corrections for a branch-scoped Attendance record
 *     tags: [Attendance]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: recordId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Immutable correction history }
 *       404: { description: Record not found in the selected tenant and branch }
 */
router.get(
  '/:recordId/history',
  requirePermission(permissions.ATTENDANCE_READ),
  getAttendanceHistory,
);

/**
 * @openapi
 * /attendance:
 *   post:
 *     summary: Mark or version-correct daily Attendance for a canonical membership
 *     tags: [Attendance]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [membershipId, attendanceDate, status]
 *             properties:
 *               membershipId: { type: string, format: uuid }
 *               attendanceDate: { type: string, format: date, example: "2026-09-28" }
 *               status: { type: string, enum: [present, absent, half_day] }
 *               checkInAt: { type: string, nullable: true, description: ISO instant or branch-local datetime }
 *               checkOutAt: { type: string, nullable: true, description: ISO instant or branch-local datetime }
 *               expectedVersion: { type: integer, minimum: 1 }
 *               correctionReason: { type: string, minLength: 3, maxLength: 500 }
 *               idempotencyKey: { type: string, maxLength: 128 }
 *     responses:
 *       200: { description: Persisted PostgreSQL Attendance projection }
 *       409: { description: Stale version, cross-branch ownership, or retry conflict }
 */
router.post(
  '/',
  requirePermission(permissions.ATTENDANCE_MANAGE),
  validateRequest(markAttendanceSchema),
  markAttendance,
);

export default router;
