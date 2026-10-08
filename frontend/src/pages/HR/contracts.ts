import { client } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
export interface Page<T>{data:T[];total:number;page:number;limit:number}
export interface LeaveType{id:string;name:string;description:string;status:'active'|'archived';requires_reason:boolean;allow_past:boolean;minimum_notice_days:number;count_non_working:boolean;display_order:number;version:number}
export interface Calendar{id:string;name:string;working_days:number[];version:number}
export interface Holiday{id:string;day:string;name:string;non_working:boolean;status:'active'|'archived';version:number}
export interface Template{id:string;name:string;start_time:string;end_time:string;overnight:boolean;break_minutes:number;status:'active'|'archived';version:number}
export interface Context{types:LeaveType[];templates:Template[];calendar:Calendar|null;days:Holiday[];timezone:string;businessDate:string;permissions:string[]}
export interface Leave{id:string;membership_id:string;employee:string;type_name_snapshot:string;start_date:string;end_date:string;counted_days:number;status:'pending'|'approved'|'rejected'|'cancelled';reason:string|null;can_review:boolean;version:number;created_at:string}
export interface Shift{id:string;employee:string;branch_name:string;membership_id:string;template_id:string;template_name_snapshot:string;business_date:string;timezone_snapshot:string;starts_at:string;ends_at:string;break_minutes:number;status:'draft'|'published'|'cancelled';version:number}
export interface Availability{id:string;name:string;days:{day:string;state:string}[]}
export interface History{events:{action:string;resulting_version:number;occurred_at:string;actor:string}[];decisions:{status:string;note:string|null;resulting_version:number;occurred_at:string;actor:string}[]}
export const get=async<T,>(path:string,params?:Record<string,unknown>)=>(await client.get<{data:T}>(path,{params})).data.data;
export function useHrAccess(){const {user,activeTenantId,activeBranchId,entitlements}=useAppStore();const permissions=user?.permissions??[];return {scope:[user?.id,activeTenantId,activeBranchId,[...permissions].sort().join(','),entitlements?.modules.filter(m=>m.enabled).map(m=>m.key).sort().join(',')],read:permissions.includes('hr_plus.read'),manage:permissions.includes('hr_plus.manage'),approve:permissions.includes('hr_plus.approve'),membership:user?.memberships?.find(m=>m.organizationId===activeTenantId)?.id};}
export function addDays(day:string,days:number){return new Date(Date.parse(day+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);}
export function localTime(instant:string,zone:string){return new Intl.DateTimeFormat('en-IN',{timeZone:zone,dateStyle:'medium',timeStyle:'short'}).format(new Date(instant));}
export const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
