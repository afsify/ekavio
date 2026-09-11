import { Router } from 'express';
import { getDashboardStats } from '../controllers/analyticsController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticate);

router.get('/dashboard', getDashboardStats);

export default router;
