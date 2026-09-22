import { Router } from 'express';
import { authenticate, requirePermission } from '../middlewares/authMiddleware.js';
import { requireEntitlement } from '../middlewares/tenantMiddleware.js';
import { MODULES } from '../commercial/catalogue.js';
import { permissions } from '../services/authorizationPolicy.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import { createServiceSchema, providerAssignmentSchema, updateServiceSchema } from '../schemas/operationalSchemas.js';
import { assignProvider, createService, listProviders, listServices, updateService } from '../controllers/serviceController.js';

const router = Router();
router.use(authenticate, requireEntitlement(MODULES.QUEUE));
router.get('/', requirePermission(permissions.QUEUE_READ), listServices);
router.post('/', requirePermission(permissions.QUEUE_MANAGE), validateRequest(createServiceSchema), createService);
router.patch('/:serviceId', requirePermission(permissions.QUEUE_MANAGE), validateRequest(updateServiceSchema), updateService);
router.get('/:serviceId/providers', requirePermission(permissions.QUEUE_READ), listProviders);
router.put('/:serviceId/providers', requirePermission(permissions.QUEUE_MANAGE), validateRequest(providerAssignmentSchema), assignProvider);
export default router;
