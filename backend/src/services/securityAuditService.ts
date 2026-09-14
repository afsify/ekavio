import { ActivityLog } from '../models/ActivityLog.js';
import type { AuthorizationContext } from './requestContextService.js';

export type SecurityAuditAction =
  | 'membership.created'
  | 'membership.revoked'
  | 'corporate.parent.created'
  | 'corporate.child.linked'
  | 'commercial.subscription.updated'
  | 'commercial.entitlement.updated';

type SafeAuditValue = string | number | boolean | null;

export const recordSecurityAudit = async (
  context: AuthorizationContext,
  action: SecurityAuditAction,
  metadata: Readonly<Record<string, SafeAuditValue>>,
  ipAddress?: string,
  targetOrganizationId?: string,
): Promise<void> => {
  try {
    await ActivityLog.create({
      tenantId: targetOrganizationId ?? context.organizationId,
      userId: context.userId,
      action,
      details: { ...metadata },
      ...(ipAddress ? { ipAddress: ipAddress.slice(0, 128) } : {}),
    });
  } catch {
    // Audit persistence must not expose request data or turn a completed admin action into a 500.
    console.error('Security audit event could not be persisted');
  }
};
