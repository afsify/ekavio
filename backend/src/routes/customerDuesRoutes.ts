import { Router } from 'express';
import {
  createCustomerDueEntry,
  getCustomerDueBalance,
  getCustomerDueHistory,
  listCustomerDueEntries,
  reverseCustomerDueEntry,
  searchCustomerDueCustomers,
} from '../controllers/customerDuesController.js';
import { authenticate, requirePermission } from '../middlewares/authMiddleware.js';
import { requireEntitlement } from '../middlewares/tenantMiddleware.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import {
  createCustomerDueEntrySchema,
  reverseCustomerDueEntrySchema,
} from '../schemas/customerDuesSchemas.js';
import { permissions } from '../services/authorizationPolicy.js';
import { MODULES } from '../commercial/catalogue.js';

const router = Router();
router.use(authenticate, requireEntitlement(MODULES.LEDGER));

router.get('/entries', requirePermission(permissions.LEDGER_READ), listCustomerDueEntries);
router.post(
  '/entries',
  requirePermission(permissions.LEDGER_MANAGE),
  validateRequest(createCustomerDueEntrySchema),
  createCustomerDueEntry,
);
router.post(
  '/entries/:entryId/reversal',
  requirePermission(permissions.LEDGER_MANAGE),
  validateRequest(reverseCustomerDueEntrySchema),
  reverseCustomerDueEntry,
);
router.get('/customers', requirePermission(permissions.LEDGER_READ), searchCustomerDueCustomers);
router.get(
  '/customers/:customerId/balance',
  requirePermission(permissions.LEDGER_READ),
  getCustomerDueBalance,
);
router.get(
  '/customers/:customerId/history',
  requirePermission(permissions.LEDGER_READ),
  getCustomerDueHistory,
);

export default router;
