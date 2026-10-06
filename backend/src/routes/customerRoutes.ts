import { Router } from 'express';
import { authenticate, requirePermission } from '../middlewares/authMiddleware.js';
import { permissions } from '../services/authorizationPolicy.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import { createCustomerSchema, updateCustomerSchema } from '../schemas/operationalSchemas.js';
import { createCustomer, getCustomer, listCustomers, updateCustomer } from '../controllers/customerController.js';

const router = Router();
router.use(authenticate);
router.get('/', requirePermission(permissions.CUSTOMERS_READ), listCustomers);
router.post('/', requirePermission(permissions.CUSTOMERS_MANAGE), validateRequest(createCustomerSchema), createCustomer);
router.get('/:customerId', requirePermission(permissions.CUSTOMERS_READ), getCustomer);
router.patch('/:customerId', requirePermission(permissions.CUSTOMERS_MANAGE), validateRequest(updateCustomerSchema), updateCustomer);
export default router;
