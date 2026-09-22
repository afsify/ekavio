import { Router } from 'express';
import { authenticate, requirePermission } from '../middlewares/authMiddleware.js';
import { requireEntitlement } from '../middlewares/tenantMiddleware.js';
import { MODULES } from '../commercial/catalogue.js';
import { permissions } from '../services/authorizationPolicy.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import { createCustomerSchema, updateCustomerSchema } from '../schemas/operationalSchemas.js';
import { createCustomer, getCustomer, listCustomers, updateCustomer } from '../controllers/customerController.js';

const router = Router();
router.use(authenticate, requireEntitlement(MODULES.QUEUE));
router.get('/', requirePermission(permissions.QUEUE_READ), listCustomers);
router.post('/', requirePermission(permissions.QUEUE_MANAGE), validateRequest(createCustomerSchema), createCustomer);
router.get('/:customerId', requirePermission(permissions.QUEUE_READ), getCustomer);
router.patch('/:customerId', requirePermission(permissions.QUEUE_MANAGE), validateRequest(updateCustomerSchema), updateCustomer);
export default router;
