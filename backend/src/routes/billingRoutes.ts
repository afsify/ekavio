import { Router } from 'express';
import { getInvoices, createPaymentOrder } from '../controllers/billingController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /billing/invoices:
 *   get:
 *     summary: Get past invoices for the tenant
 *     tags:
 *       - Billing
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of mock invoices
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/invoices', getInvoices);

/**
 * @openapi
 * /billing/create-order:
 *   post:
 *     summary: Create a payment order for a subscription plan
 *     tags:
 *       - Billing
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - planId
 *             properties:
 *               planId:
 *                 type: string
 *                 example: pro
 *     responses:
 *       201:
 *         description: Payment order created
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post('/create-order', createPaymentOrder);

export default router;
