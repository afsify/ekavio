import { Router } from 'express';
import {
  createParentOrg,
  getCorporateSummary,
  linkChildOrg,
  listParentOrgs,
} from '../controllers/corporateController.js';
import { authenticate, requirePermission } from '../middlewares/authMiddleware.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import {
  createParentOrganizationSchema,
  linkCorporateChildSchema,
} from '../schemas/corporateSchemas.js';
import { permissions } from '../services/authorizationPolicy.js';

const router = Router();
router.use(authenticate);

router.get('/parents', requirePermission(permissions.CORPORATE_MANAGE), listParentOrgs);
router.post(
  '/parents',
  requirePermission(permissions.CORPORATE_MANAGE),
  validateRequest(createParentOrganizationSchema),
  createParentOrg,
);
router.post(
  '/links',
  requirePermission(permissions.CORPORATE_MANAGE),
  validateRequest(linkCorporateChildSchema),
  linkChildOrg,
);
router.get(
  '/parents/:parentId/summary',
  requirePermission(permissions.BILLING_READ),
  getCorporateSummary,
);

export default router;
