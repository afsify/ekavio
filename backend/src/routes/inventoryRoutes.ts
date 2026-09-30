import { Router } from 'express';
import { MODULES } from '../commercial/catalogue.js';
import {
  adjustInventoryStock,
  consumeInventoryStock,
  createInventoryItem,
  getInventoryItem,
  listInventoryItems,
  listInventoryMovements,
  listInventoryUnits,
  listLowStockInventory,
  receiveInventoryStock,
  reverseInventoryMovement,
  updateInventoryItem,
} from '../controllers/inventoryController.js';
import { authenticate, requirePermission } from '../middlewares/authMiddleware.js';
import { requireEntitlement } from '../middlewares/tenantMiddleware.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import {
  addItemSchema,
  adjustStockSchema,
  consumeStockSchema,
  receiveStockSchema,
  reverseStockMovementSchema,
  updateInventoryItemSchema,
} from '../schemas/inventorySchemas.js';
import { permissions } from '../services/authorizationPolicy.js';

const router = Router();

router.use(authenticate, requireEntitlement(MODULES.INVENTORY));

router.get('/units', requirePermission(permissions.INVENTORY_READ), listInventoryUnits);
router.get('/low-stock', requirePermission(permissions.INVENTORY_READ), listLowStockInventory);
router.post(
  '/movements/:movementId/reversal',
  requirePermission(permissions.INVENTORY_MANAGE),
  validateRequest(reverseStockMovementSchema),
  reverseInventoryMovement,
);

router.get('/', requirePermission(permissions.INVENTORY_READ), listInventoryItems);
router.post(
  '/',
  requirePermission(permissions.INVENTORY_MANAGE),
  validateRequest(addItemSchema),
  createInventoryItem,
);
router.get('/:itemId', requirePermission(permissions.INVENTORY_READ), getInventoryItem);
router.patch(
  '/:itemId',
  requirePermission(permissions.INVENTORY_MANAGE),
  validateRequest(updateInventoryItemSchema),
  updateInventoryItem,
);
router.get(
  '/:itemId/movements',
  requirePermission(permissions.INVENTORY_READ),
  listInventoryMovements,
);
router.post(
  '/:itemId/receive',
  requirePermission(permissions.INVENTORY_MANAGE),
  validateRequest(receiveStockSchema),
  receiveInventoryStock,
);
router.post(
  '/:itemId/consume',
  requirePermission(permissions.INVENTORY_MANAGE),
  validateRequest(consumeStockSchema),
  consumeInventoryStock,
);
router.post(
  '/:itemId/adjust',
  requirePermission(permissions.INVENTORY_MANAGE),
  validateRequest(adjustStockSchema),
  adjustInventoryStock,
);

export default router;
