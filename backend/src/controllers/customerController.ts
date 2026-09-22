import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { requireAuthorizationContext } from '../utils/tenantScope.js';
import { mapOperationalError, operationalRuntimeService, pageInput } from '../services/operationalRuntimeService.js';
import { recordSecurityAudit } from '../services/securityAuditService.js';

const customerDto = (customer: NonNullable<Awaited<ReturnType<typeof operationalRuntimeService.getCustomer>>>) => ({
  id: customer.id,
  name: customer.name,
  phone: customer.display_phone,
  normalizedPhone: customer.normalized_phone,
  homeBranchId: customer.home_branch_id,
  notes: customer.notes,
  status: customer.status,
  createdAt: customer.created_at,
  updatedAt: customer.updated_at,
});

export const listCustomers = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const context = requireAuthorizationContext(req);
    const pagination = pageInput(req.query.page, req.query.limit);
    const result = await operationalRuntimeService.listCustomers(
      context,
      typeof req.query.search === 'string' ? req.query.search : undefined,
      pagination.page,
      pagination.limit,
    );
    res.json({ data: result.data.map(customerDto), pagination: { ...pagination, total: result.total, totalPages: Math.ceil(result.total / pagination.limit) } });
  } catch (error) { next(mapOperationalError(error)); }
};

export const createCustomer = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const context = requireAuthorizationContext(req);
    const customer = await operationalRuntimeService.createCustomer(context, req.body);
    await recordSecurityAudit(context, 'customer.created', { customerId: customer.id }, req.ip);
    res.status(201).json({ data: customerDto(customer) });
  } catch (error) { next(mapOperationalError(error)); }
};

export const getCustomer = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const customer = await operationalRuntimeService.getCustomer(requireAuthorizationContext(req), req.params.customerId as string);
    if (!customer) { res.status(404).json({ message: 'Customer not found' }); return; }
    res.json({ data: customerDto(customer) });
  } catch (error) { next(mapOperationalError(error)); }
};

export const updateCustomer = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const context = requireAuthorizationContext(req);
    const customer = await operationalRuntimeService.updateCustomer(context, req.params.customerId as string, req.body);
    if (!customer) { res.status(404).json({ message: 'Customer not found' }); return; }
    await recordSecurityAudit(context, 'customer.updated', { customerId: customer.id }, req.ip);
    res.json({ data: customerDto(customer) });
  } catch (error) { next(mapOperationalError(error)); }
};
