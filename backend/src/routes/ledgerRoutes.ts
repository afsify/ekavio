import { Router } from 'express';
import { addEntry, getTenantLedger } from '../controllers/ledgerController.js';
import { authenticate, requirePermission } from '../middlewares/authMiddleware.js';
import { permissions } from '../services/authorizationPolicy.js';
import { requireModule } from '../middlewares/tenantMiddleware.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import { addLedgerEntrySchema } from '../schemas/ledgerSchemas.js';

const router = Router();

router.use(authenticate);
router.use(requireModule('khata'));

/**
 * @openapi
 * /ledger:
 *   post:
 *     summary: Add a new entry to the Digital Khata (Ledger)
 *     tags:
 *       - Ledger
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
 *               - amount
 *               - type
 *             properties:
 *               customerName:
 *                 type: string
 *                 description: Name of the customer
 *                 example: Rajesh Kumar
 *               phone:
 *                 type: string
 *                 description: Customer phone number
 *                 example: "+919876543210"
 *               amount:
 *                 type: number
 *                 description: Amount for the transaction
 *                 example: 1500
 *               type:
 *                 type: string
 *                 enum: [credit, payment]
 *                 description: Type of ledger transaction
 *                 example: credit
 *               description:
 *                 type: string
 *                 description: Optional note or description for the entry
 *                 example: Purchased groceries on credit
 *     responses:
 *       201:
 *         description: Ledger entry added successfully
 *       400:
 *         description: Bad request (validation error)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied (khata module inactive)
 *       500:
 *         description: Internal server error
 */
router.post('/', requirePermission(permissions.LEDGER_MANAGE), validateRequest(addLedgerEntrySchema), addEntry);

/**
 * @openapi
 * /ledger:
 *   get:
 *     summary: Get all ledger entries for the tenant
 *     tags:
 *       - Ledger
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of ledger entries
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
 *         description: Access denied (khata module inactive)
 *       500:
 *         description: Internal server error
 */
router.get('/', requirePermission(permissions.LEDGER_READ), getTenantLedger);

export default router;
