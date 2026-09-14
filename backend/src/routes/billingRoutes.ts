import { Router } from 'express';
import {
  getCatalogue,
  getSubscription,
  updateSubscription,
  upsertEntitlement,
} from '../controllers/billingController.js';
import {
  authenticate,
  requirePermission,
  requirePlatformOperator,
} from '../middlewares/authMiddleware.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import {
  updateSubscriptionSchema,
  upsertEntitlementSchema,
} from '../schemas/billingSchemas.js';
import { permissions } from '../services/authorizationPolicy.js';

const router = Router();

router.use(authenticate);
router.get('/subscription', requirePermission(permissions.BILLING_READ), getSubscription);
router.get('/catalogue', requirePermission(permissions.BILLING_READ), getCatalogue);

router.put(
  '/operator/organizations/:organizationId/subscription',
  requirePlatformOperator,
  validateRequest(updateSubscriptionSchema),
  updateSubscription,
);
router.put(
  '/operator/organizations/:organizationId/entitlements/:moduleKey',
  requirePlatformOperator,
  validateRequest(upsertEntitlementSchema),
  upsertEntitlement,
);

export default router;
