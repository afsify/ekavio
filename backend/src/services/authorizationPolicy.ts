import type { MembershipRole } from '../models/Membership.js';

export const permissions = {
  ORGANIZATION_MANAGE: 'organization.manage',
  STAFF_READ: 'staff.read',
  STAFF_MANAGE: 'staff.manage',
  QUEUE_READ: 'queue.read',
  QUEUE_MANAGE: 'queue.manage',
  INVENTORY_READ: 'inventory.read',
  INVENTORY_MANAGE: 'inventory.manage',
  LEDGER_READ: 'ledger.read',
  LEDGER_MANAGE: 'ledger.manage',
  ATTENDANCE_READ: 'attendance.read',
  ATTENDANCE_MANAGE: 'attendance.manage',
  REPORTS_READ: 'reports.read',
  BILLING_READ: 'billing.read',
  BILLING_MANAGE: 'billing.manage',
  CORPORATE_MANAGE: 'corporate.manage',
} as const;

export type Permission = (typeof permissions)[keyof typeof permissions];

const operationalPermissions: readonly Permission[] = [
  permissions.STAFF_READ,
  permissions.QUEUE_READ,
  permissions.QUEUE_MANAGE,
  permissions.INVENTORY_READ,
  permissions.INVENTORY_MANAGE,
  permissions.LEDGER_READ,
  permissions.LEDGER_MANAGE,
  permissions.ATTENDANCE_READ,
  permissions.ATTENDANCE_MANAGE,
  permissions.REPORTS_READ,
];

const administratorPermissions: readonly Permission[] = [
  ...operationalPermissions,
  permissions.ORGANIZATION_MANAGE,
  permissions.STAFF_MANAGE,
  permissions.BILLING_READ,
  permissions.BILLING_MANAGE,
  permissions.CORPORATE_MANAGE,
];

const rolePermissions: Record<MembershipRole, readonly Permission[]> = {
  owner: administratorPermissions,
  admin: administratorPermissions,
  manager: operationalPermissions,
  hr: [
    permissions.STAFF_READ,
    permissions.ATTENDANCE_READ,
    permissions.ATTENDANCE_MANAGE,
    permissions.REPORTS_READ,
  ],
  staff: operationalPermissions,
};

export const permissionsForRole = (role: MembershipRole): Permission[] => [
  ...rolePermissions[role],
];

export const hasPermission = (
  effectivePermissions: readonly Permission[],
  permission: Permission,
): boolean => effectivePermissions.includes(permission);
