import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { requireAuthorizationContext } from '../utils/tenantScope.js';
import { mapOperationalError, operationalRuntimeService, pageInput } from '../services/operationalRuntimeService.js';
import { recordSecurityAudit } from '../services/securityAuditService.js';

const serviceDto = (service: NonNullable<Awaited<ReturnType<typeof operationalRuntimeService.updateService>>>) => ({
  id: service.id, name: service.name, description: service.description,
  durationMinutes: service.duration_minutes, priceMinor: service.price_minor,
  currency: service.currency, active: service.active,
  createdAt: service.created_at, updatedAt: service.updated_at,
});

export const listServices = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const context = requireAuthorizationContext(req);
    const pagination = pageInput(req.query.page, req.query.limit);
    const scope = req.query.scope === 'organization' ? 'organization' : 'branch';
    const result = await operationalRuntimeService.listServices(context, scope, pagination.page, pagination.limit);
    res.json({ data: result.data.map(serviceDto), pagination: { ...pagination, total: result.total, totalPages: Math.ceil(result.total / pagination.limit) } });
  } catch (error) { next(mapOperationalError(error)); }
};

export const createService = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const context = requireAuthorizationContext(req);
    const service = await operationalRuntimeService.createService(context, req.body);
    await recordSecurityAudit(context, 'service.created', { serviceId: service.id, branchId: context.branchId ?? null }, req.ip);
    res.status(201).json({ data: serviceDto(service) });
  } catch (error) { next(mapOperationalError(error)); }
};

export const updateService = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const context = requireAuthorizationContext(req);
    const service = await operationalRuntimeService.updateService(context, req.params.serviceId as string, req.body);
    if (!service) { res.status(404).json({ message: 'Service not found' }); return; }
    await recordSecurityAudit(context, 'service.updated', { serviceId: service.id }, req.ip);
    res.json({ data: serviceDto(service) });
  } catch (error) { next(mapOperationalError(error)); }
};

export const listProviders = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const providers = await operationalRuntimeService.listProviders(requireAuthorizationContext(req), req.params.serviceId as string);
    res.json({ data: providers.map((provider) => ({ membershipId: provider.membership_id, userId: provider.user_id, name: provider.name })) });
  } catch (error) { next(mapOperationalError(error)); }
};

export const assignProvider = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const context = requireAuthorizationContext(req);
    await operationalRuntimeService.assignProvider(context, req.params.serviceId as string, req.body.membershipId, req.body.active);
    await recordSecurityAudit(context, 'service.provider.updated', {
      serviceId: req.params.serviceId as string, membershipId: req.body.membershipId, active: req.body.active,
    }, req.ip);
    res.status(204).send();
  } catch (error) { next(mapOperationalError(error)); }
};
