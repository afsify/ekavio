import { Router } from 'express';
import authRoutes from './authRoutes.js';
import queueRoutes from './queueRoutes.js';
import inventoryRoutes from './inventoryRoutes.js';
import ledgerRoutes from './ledgerRoutes.js';
import attendanceRoutes from './attendanceRoutes.js';
import analyticsRoutes from './analyticsRoutes.js';
import corporateRoutes from './corporateRoutes.js';
import staffRoutes from './staffRoutes.js';
import billingRoutes from './billingRoutes.js';
import profileRoutes from './profileRoutes.js';
import customerRoutes from './customerRoutes.js';
import serviceRoutes from './serviceRoutes.js';
import appointmentRoutes from './appointmentRoutes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/queue', queueRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/ledger', ledgerRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/corporate', corporateRoutes);
router.use('/staff', staffRoutes);
router.use('/billing', billingRoutes);
router.use('/profile', profileRoutes);
router.use('/customers', customerRoutes);
router.use('/services', serviceRoutes);
router.use('/appointments', appointmentRoutes);

export default router;
