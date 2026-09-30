export const securityAuditActions = [
  'membership.created',
  'membership.revoked',
  'corporate.parent.created',
  'corporate.child.linked',
  'commercial.subscription.updated',
  'commercial.entitlement.updated',
  'customer.created',
  'customer.updated',
  'service.created',
  'service.updated',
  'service.provider.updated',
  'appointment.created',
  'appointment.status_changed',
  'appointment.checked_in',
  'queue.token.created',
  'queue.token.status_changed',
  'customer_dues.entry_created',
  'customer_dues.entry_reversed',
  'inventory.item_created',
  'inventory.item_updated',
  'inventory.stock_changed',
  'inventory.movement_reversed',
] as const;

export type SecurityAuditAction = (typeof securityAuditActions)[number];
export type SafeAuditValue = string | number | boolean | null;
export type SafeAuditDetails = Readonly<Record<string, SafeAuditValue>>;

const actionSet = new Set<string>(securityAuditActions);
const sensitiveKey = /(password|token|authorization|cookie|secret|credential|header)/i;

export const isSecurityAuditAction = (value: string): value is SecurityAuditAction =>
  actionSet.has(value);

export const validateAuditDetails = (details: unknown): SafeAuditDetails => {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    throw new Error('Security audit details must be a scalar object');
  }
  const entries = Object.entries(details as Record<string, unknown>);
  if (entries.length > 32) throw new Error('Security audit details contain too many fields');
  const safe: Record<string, SafeAuditValue> = {};
  for (const [key, value] of entries) {
    if (key.length < 1 || key.length > 64 || sensitiveKey.test(key)) {
      throw new Error('Security audit detail key is not allowed');
    }
    if (
      value !== null &&
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      throw new Error('Security audit detail values must be scalar');
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('Security audit numeric details must be finite');
    }
    if (typeof value === 'string' && value.length > 512) {
      throw new Error('Security audit string detail exceeds the allowed size');
    }
    safe[key] = value;
  }
  if (Buffer.byteLength(JSON.stringify(safe), 'utf8') > 8192) {
    throw new Error('Security audit details exceed the allowed size');
  }
  return safe;
};

export const boundedAuditIpAddress = (value?: string | null): string | null => {
  const normalized = value?.trim();
  if (!normalized) return null;
  return normalized.slice(0, 128);
};
