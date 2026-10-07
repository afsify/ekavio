import type { PostgresDatabase } from '../../postgres/database.js';
import type { AuthorizationContext } from '../../services/requestContextService.js';
import { AppError } from '../../utils/AppError.js';
import { BranchTimezoneRepository,instantToBranchBusinessDate,branchLocalDateTimeToInstant,nextBusinessDate } from '../appointments/timezone.js';
import { canRead,layoutSchema,widgetKeys } from './policy.js';
import { sources } from './queries.js';
export class DashboardAnalyticsService {
 constructor(private readonly db:PostgresDatabase,private readonly enabled:(org:string)=>Promise<ReadonlySet<string>>){}
 async get(c:AuthorizationContext){
  if(!c.branchId)throw new AppError('Select an authorized branch',400);
  const modules=await this.enabled(c.organizationId),timezone=await new BranchTimezoneRepository(this.db).resolve(c.organizationId,c.branchId),today=instantToBranchBusinessDate(new Date(),timezone);
  const widgets:{key:string;label:string;value:string;description:string;path:string;format?:'money'}[]=[];
  const permitted=(p:string,m:string|null=null)=>canRead(c,p,m,modules);
  const add=(key:string,label:string,value:unknown,description:string,path:string,format?:'money')=>widgets.push({key,label,value:String(value),description,path,...(format?{format}:{})});
  // A single repeatable snapshot; only authorized domain SQL is executed.
  await this.db.transaction(async client=>{
   await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
   await client.query("SET LOCAL statement_timeout='10s'");
   const args=[c.organizationId,c.branchId];
   const count=async(sql:string,values:unknown[]=args)=>(await client.query(sql,values)).rows[0]!;
   if(permitted('customers.read'))add('customers','Active customers',(await count("SELECT count(*)::text AS n FROM customers WHERE organization_id=$1 AND status='active'",[c.organizationId])).n,'Organization-wide active Customer records','/customers');
   if(permitted('services.read'))add('services','Available services',(await count(`WITH q AS (${sources.services.sql}) SELECT count(*)::text AS n FROM q WHERE status='active'`)).n,'Active services available in this branch','/services');
   if(permitted('queue.read','queue')){
    add('queue','Active Queue',(await count("SELECT count(*)::text AS n FROM queue_tokens WHERE organization_id=$1 AND branch_id=$2 AND status IN ('waiting','serving')")).n,'Waiting and serving tokens, including earlier dates','/queue');
    add('appointments','Appointments today',(await count('SELECT count(*)::text AS n FROM appointments WHERE organization_id=$1 AND branch_id=$2 AND starts_at>=$3 AND starts_at<$4 AND status<>\'cancelled\'',[...args,branchLocalDateTimeToInstant(today+'T00:00:00',timezone),branchLocalDateTimeToInstant(nextBusinessDate(today)+'T00:00:00',timezone)])).n,'All non-cancelled starts on this branch business date','/appointments');
   }
   if(permitted('attendance.read','attendance'))add('attendance','Staff present today',(await count("SELECT count(*)::text AS n FROM attendance_records WHERE organization_id=$1 AND branch_id=$2 AND attendance_date=$3::date AND status='present'",[...args,today])).n,'Explicit present marks; unmarked is not absent','/attendance');
   if(permitted('ledger.read','ledger'))add('dues','Outstanding Customer Dues',(await count(`WITH q AS (${sources['dues-balances'].sql}) SELECT COALESCE(sum(GREATEST(balance_minor::numeric,0)),0)::text AS n FROM q`)).n,'Sum of positive all-time selected-branch customer balances; not revenue','/ledger','money');
   if(permitted('inventory.read','inventory'))add('inventory','Low-stock items',(await count(`WITH q AS (${sources.inventory.sql}) SELECT count(*)::text AS n FROM q WHERE status='active' AND is_low_stock`)).n,'Active items with branch quantity at or below reorder threshold','/inventory');
   if(permitted('crm.read','crm')){
    const l=await count("SELECT count(*) FILTER(WHERE status='active')::text AS active,count(*) FILTER(WHERE status='active' AND assigned_membership_id IS NULL)::text AS unassigned FROM crm_leads WHERE organization_id=$1 AND branch_id=$2");
    const f=await count("SELECT count(*) FILTER(WHERE f.due_at>=$3 AND f.due_at<$4)::text AS today,count(*) FILTER(WHERE f.due_at<$3)::text AS overdue FROM crm_follow_ups f JOIN crm_leads l ON l.id=f.lead_id AND l.organization_id=f.organization_id AND l.branch_id=f.branch_id WHERE f.organization_id=$1 AND f.branch_id=$2 AND f.status='pending' AND l.status='active'",[...args,branchLocalDateTimeToInstant(today+'T00:00:00',timezone),branchLocalDateTimeToInstant(nextBusinessDate(today)+'T00:00:00',timezone)]);
    add('crm-active','Active leads',l.active,'Active leads in the selected branch','/crm');
    add('crm-unassigned','Unassigned leads',l.unassigned,'Active leads without assigned staff in this branch','/crm');
    add('crm-today','CRM follow-ups today',f.today,'Pending actions for active leads on this branch business date','/crm');
    add('crm-overdue','Overdue CRM follow-ups',f.overdue,'Pending actions for active leads before today’s branch business date','/crm');
   }
   if(permitted('staff.read'))add('staff','Active staff',(await count("SELECT count(*)::text AS n FROM memberships WHERE organization_id=$1 AND status='active'",[c.organizationId])).n,'Organization-wide active memberships','/staff');
   if(permitted('branches.read'))add('branches','Active branches',(await count("SELECT count(*)::text AS n FROM branches WHERE organization_id=$1 AND status='active'",[c.organizationId])).n,'Organization-wide active branches','/branches');
   if(permitted('roles.read'))add('roles','Custom roles',(await count("SELECT count(*)::text AS n FROM organization_roles WHERE organization_id=$1 AND status='active'",[c.organizationId])).n,'Organization-wide active custom roles','/roles');
   if(permitted('staff.manage'))add('invitations','Pending invitations',(await count('SELECT count(*)::text AS n FROM staff_invitations WHERE organization_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>now()',[c.organizationId])).n,'Unconsumed, unrevoked, unexpired invitations','/staff');
  });
  const saved=(await this.db.query('SELECT widget_order,hidden_widgets,version FROM dashboard_preferences WHERE organization_id=$1 AND user_id=$2',[c.organizationId,c.userId])).rows[0];
  const allowed=new Set(widgets.map(w=>w.key));
  const layout={order:(saved?.widget_order??[]).filter((k:string)=>allowed.has(k)),hidden:(saved?.hidden_widgets??[]).filter((k:string)=>allowed.has(k)),version:saved?.version??0};
  return {widgets,layout,timezone,businessDate:today,...(allowed.has('queue')?{totalQueue:Number(widgets.find(w=>w.key==='queue')!.value)}:{}),...(allowed.has('inventory')?{lowStockItems:Number(widgets.find(w=>w.key==='inventory')!.value)}:{}),...(allowed.has('attendance')?{presentStaff:Number(widgets.find(w=>w.key==='attendance')!.value)}:{})};
 }
 async save(c:AuthorizationContext,input:unknown){
  const parsed=layoutSchema.safeParse(input);if(!parsed.success)throw new AppError('Invalid dashboard layout',400);const v=parsed.data;
  const row=(await this.db.query(`INSERT INTO dashboard_preferences(organization_id,user_id,widget_order,hidden_widgets)
   SELECT $1,$2,$3::text[],$4::text[] WHERE $5::int=0
   ON CONFLICT(organization_id,user_id) DO NOTHING RETURNING version`,[c.organizationId,c.userId,v.order,v.hidden,v.version])).rows[0];
  if(row)return row;
  const changed=await this.db.query('UPDATE dashboard_preferences SET widget_order=$3,hidden_widgets=$4,version=version+1,updated_at=now() WHERE organization_id=$1 AND user_id=$2 AND version=$5 RETURNING version',[c.organizationId,c.userId,v.order,v.hidden,v.version]);
  if(!changed.rowCount)throw new AppError('Dashboard layout changed; reload before saving',409);
  return changed.rows[0];
 }
}
export { widgetKeys };
