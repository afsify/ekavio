import { PostgresAuditRepository, type SecurityAuditRepository } from '../postgres/auditRepository.js';
import { runtimePostgresDatabase } from '../persistence/runtimePersistence.js';
import {
  boundedAuditIpAddress,
  isSecurityAuditAction,
  validateAuditDetails,
  type SafeAuditDetails,
  type SecurityAuditAction,
} from './auditPolicy.js';
import type { AuthorizationContext } from './requestContextService.js';

export type { SecurityAuditAction } from './auditPolicy.js';

export const createSecurityAuditRecorder = ({
  repository,
  signal = () => console.error('Security audit event could not be persisted'),
}: {
  repository: SecurityAuditRepository;
  signal?: () => void;
}) => async (
  context: AuthorizationContext,
  action: SecurityAuditAction,
  metadata: SafeAuditDetails,
  ipAddress?: string,
  targetOrganizationId?: string,
): Promise<void> => {
  try {
    if (!isSecurityAuditAction(action)) throw new Error('Security audit action is not allowed');
    await repository.create({
      organizationId: targetOrganizationId ?? context.organizationId,
      actorUserId: context.userId,
      action,
      details: validateAuditDetails(metadata),
      ipAddress: boundedAuditIpAddress(ipAddress),
    });
  } catch {
    // The business mutation remains successful, but persistence failure is
    // surfaced through one metadata-free operational signal.
    signal();
  }
};

export const recordSecurityAudit = createSecurityAuditRecorder({
  repository: new PostgresAuditRepository(runtimePostgresDatabase),
});
