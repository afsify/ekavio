import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { PostgresDatabase } from '../../postgres/database.js';
import { membershipAuthority } from '../../postgres/organizationAuthorization.js';
import type { Permission } from '../../services/authorizationPolicy.js';
import type { AuthorizationContext } from '../../services/requestContextService.js';
import { AppError } from '../../utils/AppError.js';
import { BranchTimezoneRepository,instantToBranchBusinessDate } from '../appointments/timezone.js';
import { calendarDates,isWorking,shiftInstants,typeSchema,calendarSchema,holidaySchema,templateSchema,leaveSchema,reviewSchema,cancelSchema,shiftSchema,shiftEditSchema,shiftStatusSchema,rangeSchema } from './policy.js';
import { notifyHr } from '../notifications/hr.js';
const scope=(c:AuthorizationContext)=>[c.organizationId,c.branchId];
// Reviewer authority covers ALL active branches of the organization membership.
// Viewing availability in one branch never confers authority over another branch.
export const coversSubject=`NOT EXISTS(SELECT 1 FROM membership_branch_assignments target JOIN branches b ON b.id=target.branch_id AND b.organization_id=target.organization_id WHERE target.membership_id=l.membership_id AND target.organization_id=l.organization_id AND b.status='active' AND NOT EXISTS(SELECT 1 FROM membership_branch_assignments actor WHERE actor.membership_id=$3 AND actor.organization_id=target.organization_id AND actor.branch_id=target.branch_id))`;
const leaveColumns=`l.id,l.membership_id,l.type_name_snapshot,l.start_date::text,l.end_date::text,l.counted_days,l.status,l.version,l.created_at,l.reviewed_at,u.name AS employee`;
const shiftColumns=`s.*,s.business_date::text,u.name AS employee,b.name AS branch_name`;
export class HrService {
 constructor(private readonly db:PostgresDatabase,private readonly enabled:(org:string)=>Promise<ReadonlySet<string>>,private readonly now:()=>Date=()=>new Date()){}
 private async access(c:AuthorizationContext,permission?:Permission,client?:PoolClient){
  if(!c.branchId)throw new AppError('Select an authorized branch',400);
  const actor=await membershipAuthority(client??this.db,c.userId,c.organizationId);
  if(actor.role!=='owner'&&actor.custom_role_id&&actor.role_status!=='active')throw new AppError('HR access requires an active assigned role',403);
  if(actor.id!==c.membershipId||(permission&&!actor.effective.includes(permission)))throw new AppError('HR permission denied',403);
  const assignmentSql="SELECT 1 FROM membership_branch_assignments a JOIN branches b ON b.id=a.branch_id AND b.organization_id=a.organization_id WHERE a.membership_id=$1 AND a.organization_id=$2 AND a.branch_id=$3 AND b.status='active'",args=[c.membershipId,...scope(c)];
  if(!(client?await client.query(assignmentSql,args):await this.db.query(assignmentSql,args)).rowCount)throw new AppError('Access denied to this branch',403);
  if(!(await this.enabled(c.organizationId)).has('hr_plus'))throw new AppError('HR Plus entitlement required',403);
  return actor;
 }
 private write<T>(c:AuthorizationContext,p:Permission|undefined,op:(client:PoolClient)=>Promise<T>){return this.db.atomic(async client=>{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='10s'");
  await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[c.organizationId]);await this.access(c,p,client);return op(client);
 });}
 private async command<T>(client:PoolClient,c:AuthorizationContext,key:string,action:string,value:unknown,op:()=>Promise<T>):Promise<T>{
  const hash=createHash('sha256').update(JSON.stringify({org:c.organizationId,branch:c.branchId,actor:c.membershipId,action,value})).digest('hex');
  const prior=(await client.query('SELECT actor_membership_id,command_fingerprint,result FROM hr_commands WHERE organization_id=$1 AND key=$2',[c.organizationId,key])).rows[0];
  if(prior){if(prior.actor_membership_id!==c.membershipId||prior.command_fingerprint.trim()!==hash)throw new AppError('Idempotency key conflicts with another command',409);return prior.result as T;}
  const result=await op();await client.query('INSERT INTO hr_commands(organization_id,key,actor_membership_id,command_fingerprint,result) VALUES($1,$2,$3,$4,$5)',[c.organizationId,key,c.membershipId,hash,JSON.stringify(result)]);return result;
 }
 private async bounded(client:PoolClient,org:string,table:'hr_leave_types'|'hr_shift_templates',limit:number){if(Number((await client.query(`SELECT count(*) AS n FROM ${table} WHERE organization_id=$1`,[org])).rows[0]!.n)>=limit)throw new AppError('Configuration limit reached; reuse archived records',400);}
 private async calendar(client:PoolClient,c:AuthorizationContext,from:string,to:string){
  const calendar=(await client.query('SELECT * FROM hr_work_calendars WHERE organization_id=$1 AND branch_id=$2',scope(c))).rows[0];
  const days=(await client.query('SELECT id,day::text,name,non_working,status,version FROM hr_calendar_days WHERE organization_id=$1 AND branch_id=$2 AND day BETWEEN $3::date AND $4::date ORDER BY day',[...scope(c),from,to])).rows;
  return {calendar:calendar??null,days};
 }
 async context(c:AuthorizationContext,input:unknown){await this.access(c);const v=rangeSchema.parse(input);return this.db.transaction(async client=>{
  await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');const actor=await this.access(c,undefined,client);
  const types=(await client.query(`SELECT id,name,description,status,requires_reason,allow_past,minimum_notice_days,count_non_working,display_order,version FROM hr_leave_types WHERE organization_id=$1 ${actor.effective.includes('hr_plus.manage')?'':"AND status='active'"} ORDER BY display_order,name,id LIMIT 30`,[c.organizationId])).rows;
  const templates=actor.effective.includes('hr_plus.read')||actor.effective.includes('hr_plus.manage')?(await client.query('SELECT id,name,start_time::text,end_time::text,overnight,break_minutes,status,version FROM hr_shift_templates WHERE organization_id=$1 ORDER BY name,id LIMIT 50',[c.organizationId])).rows:[];
  return {types,templates,...await this.calendar(client,c,v.from,v.to),timezone:await new BranchTimezoneRepository(this.db).resolve(c.organizationId,c.branchId!),businessDate:instantToBranchBusinessDate(this.now(),await new BranchTimezoneRepository(this.db).resolve(c.organizationId,c.branchId!)),permissions:actor.effective};
 });}
 async saveType(c:AuthorizationContext,input:unknown,id?:string){const v=typeSchema.parse(input);if(id&&!v.expectedVersion)throw new AppError('Expected version required',400);return this.write(c,'hr_plus.manage',async client=>{
  if(!id)await this.bounded(client,c.organizationId,'hr_leave_types',30);const args=[c.organizationId,v.name,v.description,v.status,v.requiresReason,v.allowPast,v.minimumNoticeDays,v.countNonWorking,v.displayOrder,c.userId];
  const row=id?(await client.query('UPDATE hr_leave_types SET name=$2,description=$3,status=$4,requires_reason=$5,allow_past=$6,minimum_notice_days=$7,count_non_working=$8,display_order=$9,updated_by=$10,version=version+1 WHERE organization_id=$1 AND id=$11 AND version=$12 RETURNING *',[...args,id,v.expectedVersion])).rows[0]:(await client.query('INSERT INTO hr_leave_types(organization_id,name,description,status,requires_reason,allow_past,minimum_notice_days,count_non_working,display_order,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING *',args)).rows[0];
  if(!row)throw new AppError('Leave type missing or changed; reload',409);return {id:row.id,version:row.version};
 });}
 async saveCalendar(c:AuthorizationContext,input:unknown){const v=calendarSchema.parse(input);return this.write(c,'hr_plus.manage',async client=>{
  const old=(await client.query('SELECT id,version FROM hr_work_calendars WHERE organization_id=$1 AND branch_id=$2',scope(c))).rows[0];if(old&&old.version!==v.expectedVersion)throw new AppError('Calendar changed; reload',409);if(!old&&v.expectedVersion)throw new AppError('Calendar not found',409);
  const args=[...scope(c),v.name,[...v.workingDays].sort(),c.userId];const row=old?(await client.query('UPDATE hr_work_calendars SET name=$3,working_days=$4,updated_by=$5,version=version+1 WHERE organization_id=$1 AND branch_id=$2 RETURNING id,version',args)).rows[0]:(await client.query('INSERT INTO hr_work_calendars(organization_id,branch_id,name,working_days,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$5) RETURNING id,version',args)).rows[0];return row;
 });}
 async saveHoliday(c:AuthorizationContext,input:unknown,id?:string){const v=holidaySchema.parse(input);if(id&&!v.expectedVersion)throw new AppError('Expected version required',400);return this.write(c,'hr_plus.manage',async client=>{
  const cal=(await this.calendar(client,c,v.day,v.day)).calendar;if(!cal)throw new AppError('Configure this branch work calendar first',400);
  const args=[...scope(c),cal.id,v.day,v.name,v.nonWorking,v.status,c.userId];const row=id?(await client.query('UPDATE hr_calendar_days SET calendar_id=$3,day=$4,name=$5,non_working=$6,status=$7,updated_by=$8,version=version+1 WHERE organization_id=$1 AND branch_id=$2 AND id=$9 AND version=$10 RETURNING id,version',[...args,id,v.expectedVersion])).rows[0]:(await client.query('INSERT INTO hr_calendar_days(organization_id,branch_id,calendar_id,day,name,non_working,status,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id,version',args)).rows[0];if(!row)throw new AppError('Holiday missing or changed; reload',409);return row;
 });}
 async saveTemplate(c:AuthorizationContext,input:unknown,id?:string){const v=templateSchema.parse(input);if(id&&!v.expectedVersion)throw new AppError('Expected version required',400);return this.write(c,'hr_plus.manage',async client=>{
  if(!id)await this.bounded(client,c.organizationId,'hr_shift_templates',50);const args=[c.organizationId,v.name,v.startTime,v.endTime,v.overnight,v.breakMinutes,v.status,c.userId];const row=id?(await client.query('UPDATE hr_shift_templates SET name=$2,start_time=$3,end_time=$4,overnight=$5,break_minutes=$6,status=$7,updated_by=$8,version=version+1 WHERE organization_id=$1 AND id=$9 AND version=$10 RETURNING id,version',[...args,id,v.expectedVersion])).rows[0]:(await client.query('INSERT INTO hr_shift_templates(organization_id,name,start_time,end_time,overnight,break_minutes,status,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id,version',args)).rows[0];if(!row)throw new AppError('Template missing or changed; reload',409);return row;
 });}
 async submit(c:AuthorizationContext,input:unknown){const v=leaveSchema.parse(input);return this.write(c,undefined,client=>this.command(client,c,v.idempotencyKey,'leave.submit',v,async()=>{
  const type=(await client.query("SELECT * FROM hr_leave_types WHERE id=$1 AND organization_id=$2 AND status='active'",[v.leaveTypeId,c.organizationId])).rows[0];if(!type)throw new AppError('Select an active organization leave type',400);
  const timezone=await new BranchTimezoneRepository(this.db).resolve(c.organizationId,c.branchId!),today=instantToBranchBusinessDate(this.now(),timezone);
  if((type.requires_reason&&!v.reason)||(!type.allow_past&&v.startDate<today)||(v.startDate>=today&&(Date.parse(v.startDate)-Date.parse(today))/86400000<type.minimum_notice_days))throw new AppError('Request does not satisfy the configured reason/date/notice policy',400);
  const cal=await this.calendar(client,c,v.startDate,v.endDate);if(!type.count_non_working&&!cal.calendar)throw new AppError('Configure a work calendar before working-day leave',400);
  const counted=calendarDates(v.startDate,v.endDate).filter(d=>type.count_non_working||isWorking(d,cal.calendar!.working_days,cal.days)).length;if(!counted)throw new AppError('Request contains no counted leave days',400);
  const row=(await client.query('INSERT INTO hr_leave_requests(organization_id,membership_id,branch_id,leave_type_id,type_name_snapshot,policy_snapshot,start_date,end_date,counted_days,reason,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING id,status,version',[c.organizationId,c.membershipId,c.branchId,type.id,type.name,JSON.stringify({requiresReason:type.requires_reason,allowPast:type.allow_past,minimumNoticeDays:type.minimum_notice_days,countNonWorking:type.count_non_working,calendarVersion:cal.calendar?.version??null,branchTimezone:timezone}),v.startDate,v.endDate,counted,v.reason||null,c.userId])).rows[0]!;
  await notifyHr(client,c.organizationId,c.branchId!,c.membershipId,'leave.submitted',row.id,1);return row;
 }));}
 async leaves(c:AuthorizationContext,input:unknown,self=false){const actor=await this.access(c,self?undefined:'hr_plus.read'),v=rangeSchema.parse(input);if(v.status&&!['pending','approved','rejected','cancelled'].includes(v.status))throw new AppError('Invalid leave status',400);
  return this.db.transaction(async client=>{await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
   const args=[...scope(c),c.membershipId,v.from,v.to,v.status??null,v.search],where=`l.organization_id=$1 AND $2::uuid IS NOT NULL AND $3::uuid IS NOT NULL AND ${self?'l.membership_id=$3':"EXISTS(SELECT 1 FROM membership_branch_assignments a WHERE a.membership_id=l.membership_id AND a.organization_id=l.organization_id AND a.branch_id=$2)"} AND l.start_date<=$5::date AND l.end_date>=$4::date AND ($6::text IS NULL OR l.status=$6) AND ($7='' OR u.name ILIKE '%'||$7||'%')`;
   const privileged=actor.effective.includes('hr_plus.approve')?coversSubject:'false';
   const data=(await client.query(`SELECT ${leaveColumns},CASE WHEN l.membership_id=$3 OR (${privileged}) THEN l.reason ELSE NULL END AS reason,(${privileged}) AND l.membership_id<>$3 AS can_review FROM hr_leave_requests l JOIN memberships m ON m.id=l.membership_id AND m.organization_id=l.organization_id JOIN users u ON u.id=m.user_id WHERE ${where} ORDER BY l.created_at DESC,l.id LIMIT $8 OFFSET $9`,[...args,v.limit,(v.page-1)*v.limit])).rows;
   const total=Number((await client.query(`SELECT count(*) AS n FROM hr_leave_requests l JOIN memberships m ON m.id=l.membership_id JOIN users u ON u.id=m.user_id WHERE ${where}`,args)).rows[0]!.n);return {data,total,page:v.page,limit:v.limit};
  });
 }
 private async leave(client:PoolClient,c:AuthorizationContext,id:string,version:number,self:boolean){
  const row=(await client.query('SELECT l.*,l.start_date::text,l.end_date::text FROM hr_leave_requests l WHERE l.id=$1 AND l.organization_id=$2 FOR UPDATE',[id,c.organizationId])).rows[0];
  if(!row||!(await client.query('SELECT 1 FROM membership_branch_assignments WHERE organization_id=$1 AND membership_id=$2 AND branch_id=$3',[c.organizationId,row.membership_id,c.branchId])).rowCount||(self&&row.membership_id!==c.membershipId))throw new AppError('Leave request not found',404);
  if(row.version!==version)throw new AppError('Leave request changed; reload',409);return row;
 }
 async cancelOwn(c:AuthorizationContext,id:string,input:unknown){const v=cancelSchema.parse(input);return this.write(c,undefined,client=>this.command(client,c,v.idempotencyKey,'leave.cancel-own',{id,...v},async()=>{
  const l=await this.leave(client,c,id,v.expectedVersion,true);if(l.status!=='pending')throw new AppError('Only pending leave can be cancelled by its requester; contact an authorized reviewer',409);
  return (await client.query("UPDATE hr_leave_requests SET status='cancelled',updated_by=$3,version=version+1 WHERE organization_id=$1 AND id=$2 RETURNING id,status,version",[c.organizationId,id,c.userId])).rows[0];
 }));}
 async review(c:AuthorizationContext,id:string,input:unknown){const v=reviewSchema.parse(input);return this.write(c,'hr_plus.approve',client=>this.command(client,c,v.idempotencyKey,'leave.review',{id,...v},async()=>{
  const l=await this.leave(client,c,id,v.expectedVersion,false);if(l.membership_id===c.membershipId)throw new AppError('Self review is prohibited; another authorized reviewer is required',403);
  if(!(await client.query(`SELECT 1 FROM hr_leave_requests l WHERE l.id=$1 AND l.organization_id=$2 AND ${coversSubject}`,[id,c.organizationId,c.membershipId])).rowCount)throw new AppError('Review requires authority over every active assigned branch of this employee',403);
  if(!(await client.query("SELECT 1 FROM memberships WHERE id=$1 AND organization_id=$2 AND status='active'",[l.membership_id,c.organizationId])).rowCount)throw new AppError('Employee is no longer active',409);
  if((v.status==='cancelled'?!['pending','approved'].includes(l.status):l.status!=='pending'))throw new AppError('Leave cannot make this transition',409);
  const timezone=(l.policy_snapshot as {branchTimezone:string}).branchTimezone;if(l.status==='approved'&&l.start_date<=instantToBranchBusinessDate(this.now(),timezone))throw new AppError('Past/started approved leave cannot be rewritten; historical correction is deferred',409);
  const row=(await client.query('UPDATE hr_leave_requests SET status=$3,reviewed_by=$4,reviewed_at=now(),updated_by=$4,version=version+1 WHERE organization_id=$1 AND id=$2 RETURNING id,status,version',[c.organizationId,id,v.status,c.userId])).rows[0]!;
  await client.query('INSERT INTO hr_leave_decisions(organization_id,request_id,actor_user_id,status,note,resulting_version) VALUES($1,$2,$3,$4,$5,$6)',[c.organizationId,id,c.userId,v.status,v.note||null,row.version]);
  if(v.status!=='cancelled')await notifyHr(client,c.organizationId,c.branchId!,l.membership_id,'leave.'+v.status as 'leave.approved'|'leave.rejected',id,row.version);return row;
 }));}
 async history(c:AuthorizationContext,id:string,self=false){const actor=await this.access(c,self?undefined:'hr_plus.read');return this.db.transaction(async client=>{
  const l=(await client.query('SELECT l.* FROM hr_leave_requests l WHERE l.organization_id=$1 AND l.id=$2',[c.organizationId,id])).rows[0];
  if(l){await this.leave(client,c,id,l.version,self);}else if(self||!(await client.query('SELECT 1 FROM hr_shift_assignments WHERE organization_id=$1 AND branch_id=$2 AND id=$3',[...scope(c),id])).rowCount)throw new AppError('History not found',404);
  const events=(await client.query('SELECT e.action,e.resulting_version,e.occurred_at,u.name AS actor FROM hr_events e JOIN users u ON u.id=e.actor_user_id WHERE e.organization_id=$1 AND e.target_id=$2 ORDER BY e.resulting_version DESC,e.id LIMIT 100',[c.organizationId,id])).rows;
  const allowed=l&&!self&&actor.effective.includes('hr_plus.approve')&&(await client.query(`SELECT 1 FROM hr_leave_requests l WHERE l.id=$1 AND l.organization_id=$2 AND ${coversSubject}`,[id,c.organizationId,c.membershipId])).rowCount;
  return {events,decisions:allowed?(await client.query('SELECT d.status,d.note,d.resulting_version,d.occurred_at,u.name AS actor FROM hr_leave_decisions d JOIN users u ON u.id=d.actor_user_id WHERE d.organization_id=$1 AND d.request_id=$2 ORDER BY resulting_version',[c.organizationId,id])).rows:[]};
 });}
 async shifts(c:AuthorizationContext,input:unknown,self=false){await this.access(c,self?undefined:'hr_plus.read');const v=rangeSchema.parse(input);if(v.status&&!['draft','published','cancelled'].includes(v.status))throw new AppError('Invalid shift status',400);
  return this.db.transaction(async client=>{await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');const args=[...scope(c),c.membershipId,v.from,v.to,v.status??null,v.search],where=`s.organization_id=$1 AND s.branch_id=$2 ${self?"AND s.membership_id=$3 AND s.status IN ('published','cancelled')":'AND $3::uuid IS NOT NULL'} AND s.business_date BETWEEN $4::date AND $5::date AND ($6::text IS NULL OR s.status=$6) AND ($7='' OR u.name ILIKE '%'||$7||'%')`,joins='FROM hr_shift_assignments s JOIN memberships m ON m.id=s.membership_id JOIN users u ON u.id=m.user_id JOIN branches b ON b.id=s.branch_id';return {data:(await client.query(`SELECT ${shiftColumns} ${joins} WHERE ${where} ORDER BY s.starts_at,s.id LIMIT $8 OFFSET $9`,[...args,v.limit,(v.page-1)*v.limit])).rows,total:Number((await client.query(`SELECT count(*) AS n ${joins} WHERE ${where}`,args)).rows[0]!.n),page:v.page,limit:v.limit};
  });
 }
 private async template(client:PoolClient,c:AuthorizationContext,id:string){const row=(await client.query("SELECT *,start_time::text,end_time::text FROM hr_shift_templates WHERE id=$1 AND organization_id=$2 AND status='active'",[id,c.organizationId])).rows[0];if(!row)throw new AppError('Select an active organization shift template',400);return row;}
 async generate(c:AuthorizationContext,input:unknown){const v=shiftSchema.parse(input);return this.write(c,'hr_plus.manage',client=>this.command(client,c,v.idempotencyKey,'shift.generate',v,async()=>{
  const template=await this.template(client,c,v.templateId),timezone=await new BranchTimezoneRepository(this.db).resolve(c.organizationId,c.branchId!),cal=await this.calendar(client,c,v.from,v.to);
  if(v.workingDaysOnly&&!cal.calendar)throw new AppError('Configure a work calendar before working-day scheduling',400);
  const dates=calendarDates(v.from,v.to).filter(d=>!v.workingDaysOnly||isWorking(d,cal.calendar!.working_days,cal.days));if(!dates.length)throw new AppError('Range contains no selected working days',400);
  const rows=[];for(const day of dates){const {starts,ends}=shiftInstants(day,template.start_time,template.end_time,template.overnight,timezone);rows.push((await client.query('INSERT INTO hr_shift_assignments(organization_id,branch_id,membership_id,template_id,template_name_snapshot,business_date,timezone_snapshot,starts_at,ends_at,break_minutes,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING id,status,version',[...scope(c),v.membershipId,template.id,template.name,day,timezone,starts,ends,template.break_minutes,c.userId])).rows[0]!);}return rows;
 }));}
 async editShift(c:AuthorizationContext,id:string,input:unknown){const v=shiftEditSchema.parse(input);return this.write(c,'hr_plus.manage',async client=>{
  const s=(await client.query('SELECT * FROM hr_shift_assignments WHERE organization_id=$1 AND branch_id=$2 AND id=$3 FOR UPDATE',[...scope(c),id])).rows[0];if(!s||s.status!=='draft'||s.version!==v.expectedVersion)throw new AppError('Shift missing, changed or no longer a draft',409);
  const template=await this.template(client,c,v.templateId),timezone=await new BranchTimezoneRepository(this.db).resolve(c.organizationId,c.branchId!),{starts,ends}=shiftInstants(v.day,template.start_time,template.end_time,template.overnight,timezone);
  return (await client.query('UPDATE hr_shift_assignments SET template_id=$4,template_name_snapshot=$5,business_date=$6,timezone_snapshot=$7,starts_at=$8,ends_at=$9,break_minutes=$10,updated_by=$11,version=version+1 WHERE organization_id=$1 AND branch_id=$2 AND id=$3 RETURNING id,status,version',[...scope(c),id,template.id,template.name,v.day,timezone,starts,ends,template.break_minutes,c.userId])).rows[0];
 });}
 async transitionShift(c:AuthorizationContext,id:string,input:unknown){const v=shiftStatusSchema.parse(input);return this.write(c,'hr_plus.manage',client=>this.command(client,c,v.idempotencyKey,'shift.status',{id,...v},async()=>{
  const s=(await client.query('SELECT * FROM hr_shift_assignments WHERE organization_id=$1 AND branch_id=$2 AND id=$3 FOR UPDATE',[...scope(c),id])).rows[0];if(!s||s.version!==v.expectedVersion||s.status==='cancelled'||(v.status==='published'&&s.status!=='draft'))throw new AppError('Shift changed or cannot make this transition',409);
  if(v.status==='published')await this.template(client,c,s.template_id);
  const row=(await client.query('UPDATE hr_shift_assignments SET status=$4,version=version+1,updated_by=$5 WHERE organization_id=$1 AND branch_id=$2 AND id=$3 RETURNING id,status,version',[...scope(c),id,v.status,c.userId])).rows[0]!;
  if(s.status==='published'||v.status==='published')await notifyHr(client,c.organizationId,c.branchId!,s.membership_id,'shift.'+v.status as 'shift.published'|'shift.cancelled',id,row.version);return row;
 }));}
 async availability(c:AuthorizationContext,input:unknown){await this.access(c,'hr_plus.read');const v=rangeSchema.parse(input);if(calendarDates(v.from,v.to).length>31)throw new AppError('Availability is limited to 31 days',400);
  return this.db.transaction(async client=>{await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');const cal=await this.calendar(client,c,v.from,v.to),args=[...scope(c),v.search],where="m.organization_id=$1 AND m.status='active' AND a.branch_id=$2 AND ($3='' OR u.name ILIKE '%'||$3||'%')",joins='FROM memberships m JOIN membership_branch_assignments a ON a.membership_id=m.id AND a.organization_id=m.organization_id JOIN users u ON u.id=m.user_id';
   const staff=(await client.query(`SELECT m.id,u.name ${joins} WHERE ${where} ORDER BY u.name,m.id LIMIT $4 OFFSET $5`,[...args,v.limit,(v.page-1)*v.limit])).rows,ids=staff.map(s=>s.id),dates=calendarDates(v.from,v.to);
   // Include yesterday's overnight carryover; [start,end) excludes midnight's next day.
   const shifts=(await client.query("SELECT membership_id,business_date::text,((ends_at-interval '1 microsecond') AT TIME ZONE timezone_snapshot)::date::text AS end_date FROM hr_shift_assignments WHERE organization_id=$1 AND branch_id=$2 AND membership_id=ANY($3::uuid[]) AND business_date BETWEEN ($4::date-1) AND $5::date AND status='published'",[...scope(c),ids,v.from,v.to])).rows;
   const leave=(await client.query("SELECT membership_id,start_date::text,end_date::text FROM hr_leave_requests WHERE organization_id=$1 AND membership_id=ANY($2::uuid[]) AND start_date<=$4::date AND end_date>=$3::date AND status='approved'",[c.organizationId,ids,v.from,v.to])).rows;
   return {data:staff.map(s=>({...s,days:dates.map(day=>({day,state:leave.some(l=>l.membership_id===s.id&&l.start_date<=day&&l.end_date>=day)?'Approved leave':shifts.some(x=>x.membership_id===s.id&&x.business_date<=day&&x.end_date>=day)?'Scheduled':cal.calendar&&!isWorking(day,cal.calendar.working_days,cal.days)?'Non-working calendar day':'No published shift'}))})),total:Number((await client.query(`SELECT count(*) AS n ${joins} WHERE ${where}`,args)).rows[0]!.n),page:v.page,limit:v.limit,calendarConfigured:Boolean(cal.calendar)};
  });
 }
}
