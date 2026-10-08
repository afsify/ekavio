import type { MembershipRole } from '../models/Membership.js';

export const permissions = {
  PURCHASING_READ: 'purchasing.read',
  PURCHASING_MANAGE: 'purchasing.manage',
  CRM_READ: 'crm.read',
  CRM_MANAGE: 'crm.manage',
  FIELDS_READ: 'fields.read',
  FIELDS_MANAGE: 'fields.manage',
  ORGANIZATION_READ: 'organization.read',
  BRANCHES_READ: 'branches.read',
  BRANCHES_MANAGE: 'branches.manage',
  ROLES_READ: 'roles.read',
  ROLES_MANAGE: 'roles.manage',
  AUDIT_READ: 'audit.read',
  CUSTOMERS_READ: 'customers.read',
  CUSTOMERS_MANAGE: 'customers.manage',
  SERVICES_READ: 'services.read',
  SERVICES_MANAGE: 'services.manage',
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
  permissions.ORGANIZATION_READ,
  permissions.BRANCHES_READ,
  permissions.CUSTOMERS_READ, permissions.CUSTOMERS_MANAGE,
  permissions.SERVICES_READ, permissions.SERVICES_MANAGE,
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
  permissions.PURCHASING_READ, permissions.PURCHASING_MANAGE,
  permissions.CRM_READ, permissions.CRM_MANAGE,
  permissions.FIELDS_READ, permissions.FIELDS_MANAGE,
  permissions.BRANCHES_MANAGE, permissions.ROLES_READ, permissions.ROLES_MANAGE, permissions.AUDIT_READ,
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
  manager: [...operationalPermissions, permissions.CRM_READ, permissions.CRM_MANAGE, permissions.PURCHASING_READ, permissions.PURCHASING_MANAGE],
  hr: [
    permissions.ORGANIZATION_READ, permissions.BRANCHES_READ,
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

// The sole tenant catalogue. Platform/provider authority is deliberately absent.
export const permissionCatalogue = Object.values(permissions).map((key) => {
  const [category, operation] = key.split('.');
  const subject = category === 'ledger' ? 'Customer dues' : category![0]!.toUpperCase() + category!.slice(1);
  return { key, category: subject, label: `${operation === 'read' ? 'View' : 'Manage'} ${subject.toLowerCase()}`, description: `${operation === 'read' ? 'Read' : 'Change'} organization-scoped ${subject.toLowerCase()} records. ${category==='customers'||category==='services'?'Core capability; no Queue subscription required.':'Commercial capabilities, where applicable, remain independent.'}` };
});
