import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { requireAuthorizationContext } from '../utils/tenantScope.js';
import { mapOperationalError, operationalRuntimeService, pageInput } from '../services/operationalRuntimeService.js';
import { recordSecurityAudit } from '../services/securityAuditService.js';
import { dynamicFieldsService } from '../services/dynamicFieldsService.js';
import { AppError } from '../utils/AppError.js';

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
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const result = await operationalRuntimeService.listServices(context, scope, pagination.page, pagination.limit, search);
    res.json({ data: result.data.map(serviceDto), pagination: { ...pagination, total: result.total, totalPages: Math.ceil(result.total / pagination.limit) } });
  } catch (error) { next(mapOperationalError(error)); }
};

export const createService = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const context = requireAuthorizationContext(req);
    const {customFields,...canonical}=req.body;
    const service = await dynamicFieldsService.mutate(context,'service',customFields,true,()=>operationalRuntimeService.createService(context,canonical));
    await recordSecurityAudit(context, 'service.created', { serviceId: service.id, branchId: context.branchId ?? null }, req.ip);
    res.status(201).json({ data: serviceDto(service) });
  } catch (error) { next(mapOperationalError(error)); }
};

export const updateService = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const context = requireAuthorizationContext(req);
    const {customFields,...canonical}=req.body;
    const service = await dynamicFieldsService.mutate(context,'service',customFields,false,async()=>{
      const result=await operationalRuntimeService.updateService(context,req.params.serviceId as string,canonical);
      if(!result) throw new AppError('Service not found',404);
      return result;
    });
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
