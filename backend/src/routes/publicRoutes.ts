import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { publicCommercialHandlers } from '../controllers/publicCommercialController.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import {
  publicAccessRequestSchema,
  publicQuoteSchema,
} from '../schemas/publicCommercialSchemas.js';
import { manualCommercialHandlers } from '../controllers/manualCommercialController.js';
import {
  completeOnboardingSchema,
  inspectOnboardingSchema,
} from '../schemas/manualCommercialSchemas.js';

export const createAccessRequestRateLimiter = ({
  limit = 5,
  windowMs = 15 * 60 * 1000,
}: { limit?: number; windowMs?: number } = {}) => rateLimit({
  windowMs,
  limit,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'fail',
    message: 'Too many access requests from this IP, please try again later',
  },
});

const router = Router();
const accessRequestLimiter = createAccessRequestRateLimiter();
const onboardingLimiter = createAccessRequestRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });

router.get('/commercial/catalogue', publicCommercialHandlers.getCatalogue);
router.post(
  '/commercial/quote',
  validateRequest(publicQuoteSchema),
  publicCommercialHandlers.previewQuote,
);
router.post(
  '/access-requests',
  accessRequestLimiter,
  validateRequest(publicAccessRequestSchema),
  publicCommercialHandlers.submitRequest,
);
router.post(
  '/onboarding/inspect',
  onboardingLimiter,
  validateRequest(inspectOnboardingSchema),
  manualCommercialHandlers.inspectOnboarding,
);
router.post(
  '/onboarding/complete',
  onboardingLimiter,
  validateRequest(completeOnboardingSchema),
  manualCommercialHandlers.completeOnboarding,
);

export default router;
