import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { requireAuthorizationContext } from '../utils/tenantScope.js';
import { operationalRuntimeService, mapOperationalError, pageInput } from '../services/operationalRuntimeService.js';
import { recordSecurityAudit } from '../services/securityAuditService.js';
import { emitToBranch } from '../config/socket.js';
import type { QueueTokenDetails } from '../domains/queue/repository.js';

const queueDto = (token: QueueTokenDetails) => ({
  id: token.id,
  tokenNumber: token.token_number,
  status: token.status,
  customer: { id: token.customer_id, name: token.customer_name, phone: token.customer_phone },
  service: { id: token.service_id, name: token.service_name },
  provider: token.provider_membership_id
    ? { membershipId: token.provider_membership_id, name: token.provider_name }
    : null,
  appointmentId: token.appointment_id,
  createdAt: token.created_at,
  version: token.version,
});

const emitToken = (
  branchId: string,
  event: 'queue.token.created' | 'queue.token.status_changed',
  token: QueueTokenDetails,
) => emitToBranch(branchId, event, {
  id: token.id,
  tokenNumber: token.token_number,
  status: token.status,
  serviceId: token.service_id,
  appointmentId: token.appointment_id,
  version: token.version,
});

export const createToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(req);
    const queueEntry = await operationalRuntimeService.createQueueToken(context, req.body);
    if (queueEntry.created) {
      await recordSecurityAudit(context, 'queue.token.created', {
        tokenId: queueEntry.id,
        branchId: queueEntry.branch_id,
        serviceId: queueEntry.service_id,
      }, req.ip);
      emitToken(queueEntry.branch_id, 'queue.token.created', queueEntry);
    }
    res.status(queueEntry.created ? 201 : 200).json({
      message: queueEntry.created ? 'Token created successfully' : 'Existing token returned',
      data: queueDto(queueEntry),
    });
  } catch (error: unknown) {
    next(mapOperationalError(error));
  }
};

export const getQueue = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(req);
    const pagination = pageInput(req.query.page, req.query.limit);
    const result = await operationalRuntimeService.listQueue(context, pagination.page, pagination.limit);
    res.status(200).json({
      data: result.data.map(queueDto),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / pagination.limit),
      },
      summary: { active: result.total, waiting: result.waiting, serving: result.serving },
    });
  } catch (error: unknown) {
    next(mapOperationalError(error));
  }
};

export const updateTokenStatus = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(req);
    const { tokenId } = req.params;
    const updatedToken = await operationalRuntimeService.transitionQueueToken(
      context,
      tokenId as string,
      req.body,
    );
    await recordSecurityAudit(context, 'queue.token.status_changed', {
      tokenId: updatedToken.id,
      branchId: updatedToken.branch_id,
      status: updatedToken.status,
      version: updatedToken.version,
    }, req.ip);
    emitToken(updatedToken.branch_id, 'queue.token.status_changed', updatedToken);
    res.status(200).json({ message: 'Token status updated successfully', data: queueDto(updatedToken) });
  } catch (error: unknown) {
    next(mapOperationalError(error));
  }
};
