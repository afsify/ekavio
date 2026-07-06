import { Router } from 'express';
import authRoutes from './authRoutes.js';
import queueRoutes from './queueRoutes.js';
import inventoryRoutes from './inventoryRoutes.js';
import ledgerRoutes from './ledgerRoutes.js';
import attendanceRoutes from './attendanceRoutes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/queue', queueRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/ledger', ledgerRoutes);
router.use('/attendance', attendanceRoutes);

export default router;
