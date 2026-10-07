import { Router } from 'express';
import { authenticate,type AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { reportService } from '../services/analyticsService.js';
const router=Router();router.use(authenticate);
router.get('/',async(req:AuthenticatedRequest,res,next)=>{try{res.setHeader('Cache-Control','no-store');res.json({data:await reportService.catalogue(req.auth!)});}catch(error){next(error);}});
router.get('/:key/export',async(req:AuthenticatedRequest,res,next)=>{try{
 const result=await reportService.run(req.auth!,String(req.params.key),req.query,true);
 if(!('csv' in result))throw new Error('Export unavailable');
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="${result.filename}"`);res.setHeader('X-Content-Type-Options','nosniff');res.send(result.csv);
}catch(error){next(error);}});
router.get('/:key',async(req:AuthenticatedRequest,res,next)=>{try{res.setHeader('Cache-Control','no-store');res.json({data:await reportService.run(req.auth!,String(req.params.key),req.query)});}catch(error){next(error);}});
export default router;
