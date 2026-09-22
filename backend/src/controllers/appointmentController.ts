import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { requireAuthorizationContext } from '../utils/tenantScope.js';
import { mapOperationalError, operationalRuntimeService, pageInput } from '../services/operationalRuntimeService.js';
import { recordSecurityAudit } from '../services/securityAuditService.js';
import { emitToBranch } from '../config/socket.js';

const appointmentDto = (appointment: NonNullable<Awaited<ReturnType<typeof operationalRuntimeService.getAppointment>>>) => ({
  id: appointment.id, customerId: appointment.customer_id, serviceId: appointment.service_id,
  providerMembershipId: appointment.provider_membership_id, startsAt: appointment.starts_at,
  endsAt: appointment.ends_at, status: appointment.status, notes: appointment.notes,
  version: appointment.version, customer: { name: appointment.customer_name, phone: appointment.customer_phone },
  service: { name: appointment.service_name }, provider: appointment.provider_membership_id ? { name: appointment.provider_name } : null,
  createdAt: appointment.created_at, updatedAt: appointment.updated_at,
});

const detailAfter = async (context: ReturnType<typeof requireAuthorizationContext>, appointmentId: string) => {
  const detail = await operationalRuntimeService.getAppointment(context, appointmentId);
  if (!detail) throw new Error('Appointment not found after committed mutation');
  return detail;
};

export const createAppointment = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const context = requireAuthorizationContext(req);
    const created = await operationalRuntimeService.createAppointment(context, req.body);
    const appointment = await detailAfter(context, created.id);
    await recordSecurityAudit(context, 'appointment.created', { appointmentId: created.id, branchId: created.branch_id, serviceId: created.service_id }, req.ip);
    res.status(201).json({ data: appointmentDto(appointment) });
  } catch (error) { next(mapOperationalError(error)); }
};

export const listAppointments = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const context = requireAuthorizationContext(req);
    const date = typeof req.query.date === 'string' ? req.query.date : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ message: 'date must use YYYY-MM-DD' }); return; }
    const pagination = pageInput(req.query.page, req.query.limit);
    const result = await operationalRuntimeService.listAppointments(context, date, pagination.page, pagination.limit);
    res.json({ data: result.data.map(appointmentDto), pagination: { ...pagination, total: result.total, totalPages: Math.ceil(result.total / pagination.limit) } });
  } catch (error) { next(mapOperationalError(error)); }
};

export const getAppointment = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const appointment = await operationalRuntimeService.getAppointment(requireAuthorizationContext(req), req.params.appointmentId as string);
    if (!appointment) { res.status(404).json({ message: 'Appointment not found' }); return; }
    res.json({ data: appointmentDto(appointment) });
  } catch (error) { next(mapOperationalError(error)); }
};

export const transitionAppointment = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const context = requireAuthorizationContext(req);
    const changed = await operationalRuntimeService.transitionAppointment(context, req.params.appointmentId as string, req.body);
    const appointment = await detailAfter(context, changed.id);
    await recordSecurityAudit(context, 'appointment.status_changed', { appointmentId: changed.id, branchId: changed.branch_id, status: changed.status, version: changed.version }, req.ip);
    res.json({ data: appointmentDto(appointment) });
  } catch (error) { next(mapOperationalError(error)); }
};

export const checkInAppointment = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const context = requireAuthorizationContext(req);
    const token = await operationalRuntimeService.checkInAppointment(context, req.params.appointmentId as string, req.body.idempotencyKey);
    if (token.created) {
      await recordSecurityAudit(context, 'appointment.checked_in', { appointmentId: req.params.appointmentId as string, tokenId: token.id, branchId: token.branch_id }, req.ip);
      emitToBranch(token.branch_id, 'queue.token.created', { id: token.id, tokenNumber: token.token_number, status: token.status, serviceId: token.service_id, appointmentId: token.appointment_id, version: token.version });
    }
    res.json({ data: { tokenId: token.id, tokenNumber: token.token_number, status: token.status, version: token.version, created: token.created } });
  } catch (error) { next(mapOperationalError(error)); }
};
