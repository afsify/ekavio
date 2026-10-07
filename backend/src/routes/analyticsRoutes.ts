import { Router } from 'express';
import { getDashboardStats } from '../controllers/analyticsController.js';
import { authenticate, type AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { dashboardAnalytics } from '../services/analyticsService.js';

const router = Router();

router.use(authenticate);

router.get('/dashboard', getDashboardStats);
router.put('/dashboard/layout',async(req:AuthenticatedRequest,res,next)=>{try{res.setHeader('Cache-Control','no-store');res.json({data:await dashboardAnalytics.save(req.auth!,req.body)});}catch(error){next(error);}});

export default router;
