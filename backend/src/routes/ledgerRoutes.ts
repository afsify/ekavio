import { Router } from 'express';
import { getTenantLedger } from '../controllers/ledgerController.js';
import { authenticate, requirePermission } from '../middlewares/authMiddleware.js';
import { permissions } from '../services/authorizationPolicy.js';
import { requireEntitlement } from '../middlewares/tenantMiddleware.js';
import { MODULES } from '../commercial/catalogue.js';

const router = Router();

router.use(authenticate);
router.use(requireEntitlement(MODULES.LEDGER));

/**
 * @openapi
 * /ledger:
 *   get:
 *     summary: Read-only compatibility view of the selected branch Customer Dues journal
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
 *         description: Access denied (ledger entitlement required)
 *       500:
 *         description: Internal server error
 */
router.get('/', requirePermission(permissions.LEDGER_READ), getTenantLedger);

export default router;
