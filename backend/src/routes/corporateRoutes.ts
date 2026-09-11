import { Router } from 'express';
import { createParentOrg, linkChildOrg, getConsolidatedBilling } from '../controllers/corporateController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticate);

router.post('/parent', createParentOrg);
router.post('/link', linkChildOrg);
router.get('/billing/:parentId', getConsolidatedBilling);

export default router;
