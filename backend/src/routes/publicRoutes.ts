import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { publicCommercialHandlers } from '../controllers/publicCommercialController.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import {
  publicAccessRequestSchema,
  publicQuoteSchema,
} from '../schemas/publicCommercialSchemas.js';

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

export default router;
