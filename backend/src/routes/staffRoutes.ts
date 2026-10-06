import { Router } from 'express';
import { getStaff, deleteStaff } from '../controllers/staffController.js';
import { authenticate, requirePermission } from '../middlewares/authMiddleware.js';
import { permissions } from '../services/authorizationPolicy.js';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /staff:
 *   get:
 *     summary: Get all staff members for the tenant
 *     tags:
 *       - Staff
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of staff members
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/', requirePermission(permissions.STAFF_READ), getStaff);

/**
 * @openapi
 * /staff:
 *   post:
 *     summary: Retired administrator-selected password endpoint
 *     deprecated: true
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       410:
 *         description: Use POST /staff/invitations; the recipient chooses a password
 */
// Administrator-selected staff passwords are no longer a runtime API. Internal
// legacy repository contracts remain solely for migration/regression fixtures.
router.post('/', requirePermission(permissions.STAFF_MANAGE), (_request, response) => {
  response.status(410).json({ message: 'Use secure staff invitations; staff choose their own password' });
});

/**
 * @openapi
 * /staff/{id}:
 *   delete:
 *     summary: Delete a staff member (Admin only)
 *     tags:
 *       - Staff
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the staff member
 *     responses:
 *       200:
 *         description: Staff member deleted successfully
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Staff not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', requirePermission(permissions.STAFF_MANAGE), deleteStaff);

export default router;
