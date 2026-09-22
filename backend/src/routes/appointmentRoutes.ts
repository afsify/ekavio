import { Router } from 'express';
import { authenticate, requirePermission } from '../middlewares/authMiddleware.js';
import { requireEntitlement } from '../middlewares/tenantMiddleware.js';
import { MODULES } from '../commercial/catalogue.js';
import { permissions } from '../services/authorizationPolicy.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import { checkInAppointmentSchema, createAppointmentSchema, transitionAppointmentSchema } from '../schemas/operationalSchemas.js';
import { checkInAppointment, createAppointment, getAppointment, listAppointments, transitionAppointment } from '../controllers/appointmentController.js';

const router = Router();
router.use(authenticate, requireEntitlement(MODULES.QUEUE));
router.get('/', requirePermission(permissions.QUEUE_READ), listAppointments);
router.post('/', requirePermission(permissions.QUEUE_MANAGE), validateRequest(createAppointmentSchema), createAppointment);
router.get('/:appointmentId', requirePermission(permissions.QUEUE_READ), getAppointment);
router.patch('/:appointmentId/status', requirePermission(permissions.QUEUE_MANAGE), validateRequest(transitionAppointmentSchema), transitionAppointment);
router.post('/:appointmentId/check-in', requirePermission(permissions.QUEUE_MANAGE), validateRequest(checkInAppointmentSchema), checkInAppointment);
export default router;
