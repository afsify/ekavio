import { Router } from 'express';
import { addItem, getInventory, getLowStockAlerts } from '../controllers/inventoryController.js';
import { authenticate, requirePermission } from '../middlewares/authMiddleware.js';
import { permissions } from '../services/authorizationPolicy.js';
import { requireModule } from '../middlewares/tenantMiddleware.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import { addItemSchema } from '../schemas/inventorySchemas.js';

const router = Router();

router.use(authenticate);
router.use(requireModule('inventory'));

/**
 * @openapi
 * /inventory:
 *   post:
 *     summary: Add a new item to the inventory
 *     tags:
 *       - Inventory
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - itemName
 *               - currentStock
 *               - lowStockThreshold
 *               - price
 *             properties:
 *               itemName:
 *                 type: string
 *                 description: Name of the inventory item
 *                 example: Paracetamol 500mg
 *               currentStock:
 *                 type: number
 *                 description: Current quantity in stock
 *                 example: 100
 *               lowStockThreshold:
 *                 type: number
 *                 description: Threshold quantity below which low stock alert triggers
 *                 example: 15
 *               price:
 *                 type: number
 *                 description: Price per unit
 *                 example: 2.5
 *     responses:
 *       201:
 *         description: Inventory item added successfully
 *       400:
 *         description: Bad request (validation error)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied (inventory module inactive)
 *       500:
 *         description: Internal server error
 */
router.post('/', requirePermission(permissions.INVENTORY_MANAGE), validateRequest(addItemSchema), addItem);

/**
 * @openapi
 * /inventory:
 *   get:
 *     summary: Get all inventory items for the tenant
 *     tags:
 *       - Inventory
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of inventory items
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
 *         description: Access denied (inventory module inactive)
 *       500:
 *         description: Internal server error
 */
router.get('/', requirePermission(permissions.INVENTORY_READ), getInventory);

/**
 * @openapi
 * /inventory/low-stock:
 *   get:
 *     summary: Get inventory items triggering low-stock alerts (currentStock <= lowStockThreshold)
 *     tags:
 *       - Inventory
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of low-stock inventory items
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
 *         description: Access denied (inventory module inactive)
 *       500:
 *         description: Internal server error
 */
router.get('/low-stock', requirePermission(permissions.INVENTORY_READ), getLowStockAlerts);

export default router;
