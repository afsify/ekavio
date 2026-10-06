import { Router } from 'express';
import { createIdentityAccountRouter, createStaffInvitationRouter, getIdentityAccountService } from './identityAccountRoutes.js';
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
import publicRoutes from './publicRoutes.js';
import customerDuesRoutes from './customerDuesRoutes.js';
import organizationRoutes from './organizationRoutes.js';

export const createRoutes = (identityService = getIdentityAccountService) => {
const router = Router();

router.use('/auth', authRoutes);
router.use('/', organizationRoutes);
router.use('/auth', createIdentityAccountRouter(identityService));
router.use('/staff/invitations', createStaffInvitationRouter(identityService));
router.use('/queue', queueRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/ledger', ledgerRoutes);
router.use('/customer-dues', customerDuesRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/corporate', corporateRoutes);
router.use('/staff', staffRoutes);
router.use('/billing', billingRoutes);
router.use('/profile', profileRoutes);
router.use('/customers', customerRoutes);
router.use('/services', serviceRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/public', publicRoutes);

return router;
};
export default createRoutes();
