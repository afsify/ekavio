import { z } from 'zod';
import type { AuthorizationContext } from '../../services/requestContextService.js';
import type { Permission } from '../../services/authorizationPolicy.js';
import { AppError } from '../../utils/AppError.js';
export const reports = [
 {key:'customers',label:'Customer Report',permission:'customers.read',entity:'customer',module:null},
 {key:'services',label:'Service Report',permission:'services.read',entity:'service',module:null},
 {key:'appointments',label:'Appointments',permission:'queue.read',entity:'appointment',module:'queue'},
 {key:'queue',label:'Queue tokens',permission:'queue.read',entity:null,module:'queue'},
 {key:'attendance',label:'Attendance',permission:'attendance.read',entity:null,module:'attendance'},
 {key:'dues-balances',label:'Customer Dues balances',permission:'ledger.read',entity:null,module:'ledger'},
 {key:'dues-journal',label:'Customer Dues journal',permission:'ledger.read',entity:null,module:'ledger'},
 {key:'inventory',label:'Inventory stock',permission:'inventory.read',entity:'inventory_item',module:'inventory'},
 {key:'stock-movements',label:'Stock movements',permission:'inventory.read',entity:null,module:'inventory'},
 {key:'staff',label:'Staff directory',permission:'staff.read',entity:'membership',module:null},
 {key:'crm-leads',label:'CRM Leads',permission:'crm.read',entity:'lead',module:'crm'},
 {key:'crm-followups',label:'CRM Follow-ups',permission:'crm.read',entity:null,module:'crm'},
] as const;
export type ReportKey=typeof reports[number]['key'];
export const widgetKeys=['customers','services','queue','appointments','attendance','dues','inventory','staff','branches','roles','invitations','crm-active','crm-today','crm-overdue','crm-unassigned'] as const;
export const layoutSchema=z.object({order:z.array(z.enum(widgetKeys)).max(20),hidden:z.array(z.enum(widgetKeys)).max(20),version:z.number().int().nonnegative()}).strict().refine(v=>new Set(v.order).size===v.order.length&&new Set(v.hidden).size===v.hidden.length,'Duplicate widgets');
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number(v.slice(0,4))>=1900&&Number(v.slice(0,4))<=9998&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Invalid calendar date');
export const filterSchema=z.object({from:date.optional(),to:date.optional(),branchId:z.uuid().optional(),search:z.string().trim().max(200).default(''),status:z.string().max(32).optional(),customerId:z.uuid().optional(),serviceId:z.uuid().optional(),staffId:z.uuid().optional(),entryType:z.string().max(32).optional(),stockStatus:z.enum(['low','out','normal']).optional(),customKey:z.string().max(64).optional(),customValue:z.string().max(1000).optional(),customOperator:z.enum(['eq','gte','lte']).default('eq'),columns:z.string().max(3000).optional(),page:z.coerce.number().int().min(1).max(200).default(1),limit:z.coerce.number().int().min(1).max(100).default(25)}).strict();
export type ReportFilters=z.infer<typeof filterSchema>;
export function canRead(c:AuthorizationContext,permission:string,module:string|null,enabled:ReadonlySet<string>) {
 return c.permissions.includes(permission as Permission)&&(!module||enabled.has(module));
}
export function authorizeReport(c:AuthorizationContext,key:string,enabled:ReadonlySet<string>) {
 const report=reports.find(r=>r.key===key);
 if(!report)throw new AppError('Report not found',404);
 if(!c.permissions.includes('reports.read')||!canRead(c,report.permission,report.module,enabled))throw new AppError('Report access denied',403);
 return report;
}
export function validateRange(from:string,to:string) {
 const days=(Date.parse(to)-Date.parse(from))/86400000;
 if(days<0||days>=366)throw new AppError('Choose an ordered range of at most 366 days',400);
}
export function csvCell(value:unknown):string {
 let text=value===null||value===undefined?'':String(value);
 // Quoting alone does not neutralize spreadsheet formulas, including leading controls.
 // eslint-disable-next-line no-control-regex -- Deliberate spreadsheet control-prefix security check.
 if(/^[\s\u0000-\u001f]*[=+\-@]/u.test(text)||/^[\t\r\n]/u.test(text))text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';
}
export function rupees(minor:string):string {
 const n=BigInt(minor),a=n<0n?-n:n;
 return `${n<0n?'-':''}₹${a/100n}.${String(a%100n).padStart(2,'0')}`;
}
