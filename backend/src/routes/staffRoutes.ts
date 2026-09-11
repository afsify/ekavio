import { Router } from 'express';
import { getStaff, addStaff, deleteStaff } from '../controllers/staffController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

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
router.get('/', getStaff);

/**
 * @openapi
 * /staff:
 *   post:
 *     summary: Add a new staff member (Admin only)
 *     tags:
 *       - Staff
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - phone
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: Jane Doe
 *               phone:
 *                 type: string
 *                 example: "+1234567890"
 *               password:
 *                 type: string
 *                 example: "securepassword"
 *               role:
 *                 type: string
 *                 enum: [admin, staff]
 *                 example: staff
 *     responses:
 *       201:
 *         description: Staff member created successfully
 *       400:
 *         description: Bad request
 *       403:
 *         description: Forbidden (Admin role required)
 *       500:
 *         description: Internal server error
 */
router.post('/', addStaff);

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
router.delete('/:id', deleteStaff);

export default router;
