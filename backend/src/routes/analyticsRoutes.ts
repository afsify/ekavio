import { Router } from 'express';
import { getDashboardStats } from '../controllers/analyticsController.js';
import { authenticate, requirePermission } from '../middlewares/authMiddleware.js';
import { permissions } from '../services/authorizationPolicy.js';

const router = Router();

router.use(authenticate);

router.get('/dashboard', requirePermission(permissions.REPORTS_READ), getDashboardStats);

export default router;
