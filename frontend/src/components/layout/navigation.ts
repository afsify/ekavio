import { hasEntitlement, type EffectiveEntitlements, type ModuleKey } from '../../commercial/catalogue';
export interface Destination { name: string; path: string; group: 'Workspace' | 'Operations' | 'Administration' | 'Platform operations'; permission?: string; module?: ModuleKey; operator?: boolean }
export const destinations: Destination[] = [
  { name: 'Home', path: '/dashboard', group: 'Workspace' },
  { name: 'Customers', path: '/customers', group: 'Workspace', permission: 'customers.read' },
  { name: 'Services', path: '/services', group: 'Workspace', permission: 'services.read' },
  { name: 'Queue', path: '/queue', group: 'Operations', permission: 'queue.read', module: 'queue' },
  { name: 'Appointments', path: '/appointments', group: 'Operations', permission: 'queue.read', module: 'queue' },
  { name: 'Attendance', path: '/attendance', group: 'Operations', permission: 'attendance.read', module: 'attendance' },
  { name: 'Customer Dues', path: '/ledger', group: 'Operations', permission: 'ledger.read', module: 'ledger' },
  { name: 'CRM & Follow-ups', path: '/crm', group: 'Operations', permission: 'crm.read', module: 'crm' },
  { name: 'Inventory', path: '/inventory', group: 'Operations', permission: 'inventory.read', module: 'inventory' },
  { name: 'Staff', path: '/staff', group: 'Administration', permission: 'staff.read' },
  { name: 'Organization', path: '/admin', group: 'Administration', permission: 'organization.read' },
  { name: 'Branches', path: '/branches', group: 'Administration', permission: 'branches.read' },
  { name: 'Roles', path: '/roles', group: 'Administration', permission: 'roles.read' },
  { name: 'Data & Forms', path: '/custom-fields', group: 'Administration', permission: 'fields.read' },
  { name: 'Audit', path: '/audit', group: 'Administration', permission: 'audit.read' },
  { name: 'Billing', path: '/billing', group: 'Administration', permission: 'billing.read' },
  { name: 'Reports', path: '/reports', group: 'Administration', permission: 'reports.read' },
  { name: 'Settings', path: '/settings', group: 'Administration' },
  { name: 'Notifications', path: '/notifications', group: 'Workspace' },
  { name: 'Help & Support', path: '/help', group: 'Administration' },
  { name: 'Commercial Intake', path: '/commercial/requests', group: 'Platform operations', operator: true },
  { name: 'Platform Operations', path: '/platform', group: 'Platform operations', operator: true },
  { name: 'Renewals', path: '/commercial/renewals', group: 'Platform operations', operator: true },
  { name: 'Corporate HQ', path: '/corporate', group: 'Platform operations', permission: 'corporate.manage', operator: true },
];
export const visibleDestinations = (permissions: string[], entitlements: EffectiveEntitlements | null, operator: boolean) => destinations.filter((item) =>
  (!item.permission || permissions.includes(item.permission)) && (!item.module || hasEntitlement(entitlements, item.module)) && (!item.operator || operator));
