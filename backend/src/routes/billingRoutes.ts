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
import { publicCommercialHandlers } from '../controllers/publicCommercialController.js';
import {
  operatorAccessRequestUpdateSchema,
  publicPricingUpdateSchema,
} from '../schemas/publicCommercialSchemas.js';
import { manualCommercialHandlers } from '../controllers/manualCommercialController.js';
import {
  emptyCommercialActionSchema,
  finalizeAgreementSchema,
  recordManualPaymentSchema,
  revokeOnboardingInvitationSchema,
  voidManualPaymentSchema,
} from '../schemas/manualCommercialSchemas.js';

const router = Router();

router.use(authenticate);
router.get('/subscription', requirePermission(permissions.BILLING_READ), getSubscription);
router.get('/catalogue', requirePermission(permissions.BILLING_READ), getCatalogue);
router.get(
  '/commercial',
  requirePermission(permissions.BILLING_READ),
  manualCommercialHandlers.getCustomerCommercialSummary,
);

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
router.get(
  '/operator/public-pricing',
  requirePlatformOperator,
  publicCommercialHandlers.getOperatorPricing,
);
router.put(
  '/operator/public-pricing/:offerType/:offerKey',
  requirePlatformOperator,
  validateRequest(publicPricingUpdateSchema),
  publicCommercialHandlers.updatePricing,
);
router.get(
  '/operator/access-requests',
  requirePlatformOperator,
  publicCommercialHandlers.listRequests,
);
router.get(
  '/operator/access-requests/:requestId',
  requirePlatformOperator,
  publicCommercialHandlers.getRequest,
);
router.patch(
  '/operator/access-requests/:requestId',
  requirePlatformOperator,
  validateRequest(operatorAccessRequestUpdateSchema),
  publicCommercialHandlers.updateRequest,
);
router.post(
  '/operator/access-requests/:requestId/agreement',
  requirePlatformOperator,
  validateRequest(finalizeAgreementSchema),
  manualCommercialHandlers.finalizeAgreement,
);
router.get(
  '/operator/access-requests/:requestId/agreement',
  requirePlatformOperator,
  manualCommercialHandlers.getAgreement,
);
router.post(
  '/operator/agreements/:agreementId/payments',
  requirePlatformOperator,
  validateRequest(recordManualPaymentSchema),
  manualCommercialHandlers.recordPayment,
);
router.post(
  '/operator/agreements/:agreementId/payments/:paymentId/void',
  requirePlatformOperator,
  validateRequest(voidManualPaymentSchema),
  manualCommercialHandlers.voidPayment,
);
router.post(
  '/operator/agreements/:agreementId/onboarding-invitations',
  requirePlatformOperator,
  validateRequest(emptyCommercialActionSchema),
  manualCommercialHandlers.issueInvitation,
);
router.post(
  '/operator/agreements/:agreementId/onboarding-invitations/:invitationId/revoke',
  requirePlatformOperator,
  validateRequest(revokeOnboardingInvitationSchema),
  manualCommercialHandlers.revokeInvitation,
);

export default router;
