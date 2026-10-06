import { Router } from 'express';
import { authenticate, requirePermission } from '../middlewares/authMiddleware.js';
import { permissions } from '../services/authorizationPolicy.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import { createServiceSchema, providerAssignmentSchema, updateServiceSchema } from '../schemas/operationalSchemas.js';
import { assignProvider, createService, listProviders, listServices, updateService } from '../controllers/serviceController.js';

const router = Router();
router.use(authenticate);
router.get('/', requirePermission(permissions.SERVICES_READ), listServices);
router.post('/', requirePermission(permissions.SERVICES_MANAGE), validateRequest(createServiceSchema), createService);
router.patch('/:serviceId', requirePermission(permissions.SERVICES_MANAGE), validateRequest(updateServiceSchema), updateService);
router.get('/:serviceId/providers', requirePermission(permissions.SERVICES_READ), listProviders);
router.put('/:serviceId/providers', requirePermission(permissions.SERVICES_MANAGE), validateRequest(providerAssignmentSchema), assignProvider);
export default router;
