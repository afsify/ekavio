import { ActivityLog } from '../models/ActivityLog.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import type { AuthorizationContext } from './requestContextService.js';

export type SecurityAuditAction =
  | 'membership.created'
  | 'membership.revoked'
  | 'corporate.parent.created'
  | 'corporate.child.linked'
  | 'commercial.subscription.updated'
  | 'commercial.entitlement.updated';

type SafeAuditValue = string | number | boolean | null;

export interface SecurityAuditRepository {
  create(record: {
    tenantId: string;
    userId: string;
    action: SecurityAuditAction;
    details: Readonly<Record<string, SafeAuditValue>>;
    ipAddress?: string;
  }): Promise<unknown>;
}

export interface SecurityAuditIdentityBridge {
  organizationToLegacy(organizationId: string): Promise<string>;
  userToLegacy(userId: string): Promise<string>;
}

export const createSecurityAuditRecorder = ({
  repository,
  identities,
}: {
  repository: SecurityAuditRepository;
  identities: SecurityAuditIdentityBridge;
}) => async (
  context: AuthorizationContext,
  action: SecurityAuditAction,
  metadata: Readonly<Record<string, SafeAuditValue>>,
  ipAddress?: string,
  targetOrganizationId?: string,
): Promise<void> => {
  try {
    const [legacyOrganizationId, legacyUserId] = await Promise.all([
      identities.organizationToLegacy(targetOrganizationId ?? context.organizationId),
      identities.userToLegacy(context.userId),
    ]);
    await repository.create({
      tenantId: legacyOrganizationId,
      userId: legacyUserId,
      action,
      details: { ...metadata },
      ...(ipAddress ? { ipAddress: ipAddress.slice(0, 128) } : {}),
    });
  } catch {
    // Report a safe operational signal without leaking request or credential data.
    console.error('Security audit event could not be persisted');
  }
};

export const recordSecurityAudit = createSecurityAuditRecorder({
  identities: runtimePersistence.commercial,
  repository: {
    create: (record) => ActivityLog.create(record),
  },
});
