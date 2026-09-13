import { Router } from 'express';
import { createParentOrg, linkChildOrg, getConsolidatedBilling } from '../controllers/corporateController.js';
import { authenticate, requirePermission } from '../middlewares/authMiddleware.js';
import { permissions } from '../services/authorizationPolicy.js';

const router = Router();

router.use(authenticate);

router.post('/parent', requirePermission(permissions.CORPORATE_MANAGE), createParentOrg);
router.post('/link', requirePermission(permissions.CORPORATE_MANAGE), linkChildOrg);
router.get('/billing/:parentId', requirePermission(permissions.BILLING_READ), getConsolidatedBilling);

export default router;
