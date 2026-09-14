import { Router } from 'express';
import { markAttendance, getDailyAttendance } from '../controllers/attendanceController.js';
import { authenticate, requirePermission } from '../middlewares/authMiddleware.js';
import { permissions } from '../services/authorizationPolicy.js';
import { requireEntitlement } from '../middlewares/tenantMiddleware.js';
import { MODULES } from '../commercial/catalogue.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import { markAttendanceSchema } from '../schemas/attendanceSchemas.js';

const router = Router();

router.use(authenticate);
router.use(requireEntitlement(MODULES.ATTENDANCE));

/**
 * @openapi
 * /attendance:
 *   post:
 *     summary: Mark or upsert staff attendance for a specific date
 *     tags:
 *       - Attendance
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - date
 *               - status
 *             properties:
 *               userId:
 *                 type: string
 *                 description: The ID of the user (staff member)
 *                 example: 60d0fe4f5311236168a109ca
 *               date:
 *                 type: string
 *                 format: date
 *                 description: Date of attendance (YYYY-MM-DD or ISO string)
 *                 example: "2026-07-03"
 *               status:
 *                 type: string
 *                 enum: [present, absent, half-day]
 *                 description: Attendance status
 *                 example: present
 *     responses:
 *       200:
 *         description: Attendance marked successfully
 *       400:
 *         description: Bad request (validation error or invalid date)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied (attendance module inactive)
 *       500:
 *         description: Internal server error
 */
router.post('/', requirePermission(permissions.ATTENDANCE_MANAGE), validateRequest(markAttendanceSchema), markAttendance);

/**
 * @openapi
 * /attendance:
 *   get:
 *     summary: Get daily staff attendance for the tenant on a given date
 *     tags:
 *       - Attendance
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: Optional date to filter attendance records (defaults to today)
 *         example: "2026-07-03"
 *     responses:
 *       200:
 *         description: List of attendance records for the specified date
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Invalid date parameter
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied (attendance module inactive)
 *       500:
 *         description: Internal server error
 */
router.get('/', requirePermission(permissions.ATTENDANCE_READ), getDailyAttendance);

export default router;
