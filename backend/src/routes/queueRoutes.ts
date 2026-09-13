import { Router } from 'express';
import { createToken, getQueue, updateTokenStatus } from '../controllers/queueController.js';
import { authenticate, requirePermission } from '../middlewares/authMiddleware.js';
import { permissions } from '../services/authorizationPolicy.js';
import { requireModule } from '../middlewares/tenantMiddleware.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import { createTokenSchema, updateTokenStatusSchema } from '../schemas/queueSchemas.js';

const router = Router();

router.use(authenticate);
router.use(requireModule('queue'));

/**
 * @openapi
 * /queue:
 *   post:
 *     summary: Create a new queue token for a customer
 *     tags:
 *       - Queue
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customerName
 *               - phone
 *               - serviceType
 *             properties:
 *               customerName:
 *                 type: string
 *                 description: Name of the customer
 *                 example: Alice Smith
 *               phone:
 *                 type: string
 *                 description: Phone number of the customer
 *                 example: "+19876543210"
 *               serviceType:
 *                 type: string
 *                 description: Type of service requested
 *                 example: Consultation
 *               tokenNumber:
 *                 type: string
 *                 description: Optional custom token number (auto-generated if not provided)
 *                 example: "#10"
 *     responses:
 *       201:
 *         description: Token created successfully
 *       400:
 *         description: Bad request (validation error)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied (queue module inactive)
 *       500:
 *         description: Internal server error
 */
router.post('/', requirePermission(permissions.QUEUE_MANAGE), validateRequest(createTokenSchema), createToken);

/**
 * @openapi
 * /queue:
 *   get:
 *     summary: Get all active queue tokens (waiting or serving) for the tenant
 *     tags:
 *       - Queue
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active queue items
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied (queue module inactive)
 *       500:
 *         description: Internal server error
 */
router.get('/', requirePermission(permissions.QUEUE_READ), getQueue);

/**
 * @openapi
 * /queue/{tokenId}/status:
 *   patch:
 *     summary: Update the status of a queue token
 *     tags:
 *       - Queue
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tokenId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the queue token entry
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [waiting, serving, completed, cancelled]
 *                 example: serving
 *     responses:
 *       200:
 *         description: Token status updated successfully
 *       400:
 *         description: Bad request (validation error)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Token not found
 *       500:
 *         description: Internal server error
 */
router.patch('/:tokenId/status', requirePermission(permissions.QUEUE_MANAGE), validateRequest(updateTokenStatusSchema), updateTokenStatus);

export default router;
