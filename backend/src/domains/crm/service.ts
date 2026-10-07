import type { PoolClient } from 'pg';
import type { PostgresDatabase } from '../../postgres/database.js';
import { lockAdministration, membershipAuthority } from '../../postgres/organizationAuthorization.js';
import type { AuthorizationContext } from '../../services/requestContextService.js';
import type { Permission } from '../../services/authorizationPolicy.js';
import { AppError } from '../../utils/AppError.js';
import { DynamicFieldsService } from '../dynamicFields/service.js';
import { validateCustomerFilter,customerPredicate } from '../dynamicFields/customerFilter.js';
import { PostgresCustomerRepository } from '../customers/repository.js';
import { normalizeCustomerName,normalizePhone } from '../customers/normalization.js';
import { BranchTimezoneRepository,instantToBranchBusinessDate,nextBusinessDate,branchLocalDateTimeToInstant } from '../appointments/timezone.js';
import { notifyCrmAssignment } from '../notifications/service.js';
import { leadSchema,leadUpdateSchema,stageSchema,stageUpdateSchema,leadStateSchema,noteSchema,conversionSchema,followupSchema,followupUpdateSchema,followupStateSchema,leadFilterSchema,followupFilterSchema,recommendedStages } from './policy.js';
import { z } from 'zod';
const leadSelect=`SELECT l.*,s.name AS stage_name,u.name AS assignee_name,m.status AS assignee_status,b.name AS branch_name,c.name AS customer_name
 FROM crm_leads l JOIN crm_pipeline_stages s ON s.id=l.pipeline_stage_id AND s.organization_id=l.organization_id
 JOIN branches b ON b.id=l.branch_id AND b.organization_id=l.organization_id
 LEFT JOIN memberships m ON m.id=l.assigned_membership_id AND m.organization_id=l.organization_id LEFT JOIN users u ON u.id=m.user_id
 LEFT JOIN customers c ON c.id=l.converted_customer_id AND c.organization_id=l.organization_id`;
const followSelect=`SELECT f.*,l.name AS lead_name,u.name AS assignee_name,m.status AS assignee_status
 FROM crm_follow_ups f JOIN crm_leads l ON l.id=f.lead_id AND l.organization_id=f.organization_id AND l.branch_id=f.branch_id
 LEFT JOIN memberships m ON m.id=f.assigned_membership_id AND m.organization_id=f.organization_id LEFT JOIN users u ON u.id=m.user_id`;
export class CrmService {
 constructor(private readonly db:PostgresDatabase,private readonly enabled:(org:string)=>Promise<ReadonlySet<string>>){}
 private async access(c:AuthorizationContext,permission:Permission,client?:PoolClient){
  if(!c.branchId)throw new AppError('Select an authorized branch',400);
  const actor=client?await lockAdministration(client,c.userId,c.organizationId,permission):await membershipAuthority(this.db,c.userId,c.organizationId);
  if(actor.id!==c.membershipId||!actor.effective.includes(permission))throw new AppError('CRM permission denied',403);
  if(!(await this.db.query("SELECT 1 FROM membership_branch_assignments a JOIN branches b ON b.id=a.branch_id AND b.organization_id=a.organization_id WHERE a.membership_id=$1 AND a.organization_id=$2 AND a.branch_id=$3 AND b.status='active'",[c.membershipId,c.organizationId,c.branchId])).rowCount)throw new AppError('Access denied to this branch',403);
  if(!(await this.enabled(c.organizationId)).has('crm'))throw new AppError('CRM entitlement required',403);
 }
 private scope(c:AuthorizationContext){return [c.organizationId,c.branchId];}
 private async write<T>(c:AuthorizationContext,operation:(client:PoolClient)=>Promise<T>){return this.db.atomic(async client=>{await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await client.query("SET LOCAL statement_timeout='10s'");await this.access(c,'crm.manage',client);return operation(client);});}
 private async lead(client:PoolClient,c:AuthorizationContext,id:string,version?:number){
  const row=(await client.query('SELECT * FROM crm_leads WHERE organization_id=$1 AND branch_id=$2 AND id=$3 FOR UPDATE',[...this.scope(c),id])).rows[0];
  if(!row)throw new AppError('Lead not found',404);
  if(version!==undefined&&row.version!==version)throw new AppError('Lead changed; reload before saving',409);
  return row;
 }
 private async assignee(client:PoolClient,c:AuthorizationContext,id?:string|null){
  if(!id)return;
  if(!(await client.query("SELECT 1 FROM memberships m JOIN membership_branch_assignments a ON a.membership_id=m.id AND a.organization_id=m.organization_id WHERE m.id=$1 AND m.organization_id=$2 AND a.branch_id=$3 AND m.status='active'",[id,c.organizationId,c.branchId])).rowCount)throw new AppError('Assigned staff must be active in this branch',400);
 }
 private async stage(client:PoolClient,c:AuthorizationContext,id:string){
  if(!(await client.query("SELECT 1 FROM crm_pipeline_stages WHERE id=$1 AND organization_id=$2 AND status='active'",[id,c.organizationId])).rowCount)throw new AppError('Active pipeline stage is unavailable',400);
 }
 private async activity(client:PoolClient,c:AuthorizationContext,id:string,action:string,options:{note?:string;stage?:string;assignee?:string|null;customer?:string;followup?:string}={}){
  await client.query('INSERT INTO crm_activity_events(organization_id,branch_id,lead_id,actor_user_id,action,note,stage_id,assigned_membership_id,customer_id,follow_up_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[...this.scope(c),id,c.userId,action,options.note??null,options.stage??null,options.assignee??null,options.customer??null,options.followup??null]);
 }
 async stages(c:AuthorizationContext){await this.access(c,'crm.read');return (await this.db.query('SELECT * FROM crm_pipeline_stages WHERE organization_id=$1 ORDER BY position,created_at,id LIMIT 50',[c.organizationId])).rows;}
 async saveStage(c:AuthorizationContext,input:unknown,id?:string){
  const v=id?stageUpdateSchema.parse(input):stageSchema.parse(input);
  return this.write(c,async client=>{
   if(id&&!(await client.query('SELECT 1 FROM crm_pipeline_stages WHERE id=$1 AND organization_id=$2 AND version=$3',[id,c.organizationId,'expectedVersion' in v?v.expectedVersion:0])).rowCount)throw new AppError('Stage missing or changed; reload before saving',409);
   if(!id&&Number((await client.query('SELECT count(*) AS n FROM crm_pipeline_stages WHERE organization_id=$1',[c.organizationId])).rows[0]!.n)>=50)throw new AppError('Limit of 50 stages reached',400);
   const row=id?(await client.query('UPDATE crm_pipeline_stages SET name=$3,description=$4,position=$5,status=$6,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING *',[id,c.organizationId,v.name,v.description,v.position,v.status])).rows[0]:
    (await client.query('INSERT INTO crm_pipeline_stages(organization_id,name,description,position,status,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[c.organizationId,v.name,v.description,v.position,v.status,c.userId])).rows[0];
   await client.query('INSERT INTO crm_admin_events(organization_id,actor_user_id,action,target_id) VALUES($1,$2,$3,$4)',[c.organizationId,c.userId,id?'crm.stage.updated':'crm.stage.created',row!.id]);return row;
  });
 }
 async recommend(c:AuthorizationContext){
  return this.write(c,async client=>{
   if((await client.query('SELECT 1 FROM crm_pipeline_stages WHERE organization_id=$1 LIMIT 1',[c.organizationId])).rowCount)throw new AppError('Recommended setup requires an empty pipeline; edit your existing stages instead',409);
   for(const [position,name] of recommendedStages.entries()){
    const row=(await client.query('INSERT INTO crm_pipeline_stages(organization_id,name,position,created_by) VALUES($1,$2,$3,$4) RETURNING id',[c.organizationId,name,position,c.userId])).rows[0]!;
    await client.query("INSERT INTO crm_admin_events(organization_id,actor_user_id,action,target_id) VALUES($1,$2,'crm.stage.created',$3)",[c.organizationId,c.userId,row.id]);
   }return {created:recommendedStages.length};
  });
 }
 async choices(c:AuthorizationContext){await this.access(c,'crm.read');return (await this.db.query("SELECT m.id,u.name,m.role FROM memberships m JOIN users u ON u.id=m.user_id JOIN membership_branch_assignments a ON a.membership_id=m.id AND a.organization_id=m.organization_id WHERE m.organization_id=$1 AND a.branch_id=$2 AND m.status='active' ORDER BY u.name,m.id LIMIT 100",this.scope(c))).rows;}
 async createLead(c:AuthorizationContext,input:unknown){
  const v=leadSchema.parse(input),name=normalizeCustomerName(v.name).display,phone=normalizePhone(v.phone);
  return this.write(c,async client=>{
   await this.stage(client,c,v.pipelineStageId);await this.assignee(client,c,v.assignedMembershipId);
   const row=(await client.query('INSERT INTO crm_leads(organization_id,branch_id,name,company,phone,email,source,pipeline_stage_id,assigned_membership_id,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[...this.scope(c),name,v.company??null,phone,v.email?.toLowerCase()??null,v.source??null,v.pipelineStageId,v.assignedMembershipId??null,v.notes??null,c.userId])).rows[0]!;
   await new DynamicFieldsService(this.db).saveValues(client,c,'lead',row.id,v.customFields??{},true);
   await this.activity(client,c,row.id,'lead.created',{stage:v.pipelineStageId});
   if(v.assignedMembershipId){await this.activity(client,c,row.id,'lead.assigned',{assignee:v.assignedMembershipId});await notifyCrmAssignment(client,c.organizationId,c.branchId!,v.assignedMembershipId,'lead.assigned',row.id,1);}
   return row;
  });
 }
 async updateLead(c:AuthorizationContext,id:string,input:unknown){
  const v=leadUpdateSchema.parse(input);
  return this.write(c,async client=>{
   const old=await this.lead(client,c,id,v.expectedVersion);if(old.status!=='active')throw new AppError('Reactivate a lost or archived lead before editing; converted leads are read-only',409);
   if(v.pipelineStageId!==undefined&&v.pipelineStageId!==old.pipeline_stage_id)await this.stage(client,c,v.pipelineStageId);
   if(v.assignedMembershipId!==undefined&&v.assignedMembershipId!==old.assigned_membership_id)await this.assignee(client,c,v.assignedMembershipId);
   const row=(await client.query('UPDATE crm_leads SET name=$4,company=$5,phone=$6,email=$7,source=$8,pipeline_stage_id=$9,assigned_membership_id=$10,notes=$11,version=version+1,updated_at=now() WHERE organization_id=$1 AND branch_id=$2 AND id=$3 RETURNING *',[...this.scope(c),id,v.name!==undefined?normalizeCustomerName(v.name).display:old.name,v.company===undefined?old.company:v.company,v.phone===undefined?old.phone:normalizePhone(v.phone),v.email===undefined?old.email:v.email?.toLowerCase()??null,v.source===undefined?old.source:v.source,v.pipelineStageId??old.pipeline_stage_id,v.assignedMembershipId===undefined?old.assigned_membership_id:v.assignedMembershipId,v.notes===undefined?old.notes:v.notes])).rows[0]!;
   await new DynamicFieldsService(this.db).saveValues(client,c,'lead',id,v.customFields??{},false);
   await this.activity(client,c,id,'lead.updated');
   if(row.pipeline_stage_id!==old.pipeline_stage_id)await this.activity(client,c,id,'lead.stage_changed',{stage:row.pipeline_stage_id});
   if(row.assigned_membership_id!==old.assigned_membership_id){await this.activity(client,c,id,row.assigned_membership_id?'lead.assigned':'lead.unassigned',{assignee:row.assigned_membership_id});if(row.assigned_membership_id)await notifyCrmAssignment(client,c.organizationId,c.branchId!,row.assigned_membership_id,'lead.assigned',id,row.version);}
   return row;
  });
 }
 async changeState(c:AuthorizationContext,id:string,input:unknown){
  const v=leadStateSchema.parse(input);
  return this.write(c,async client=>{
   const old=await this.lead(client,c,id,v.expectedVersion);
   if(old.status==='converted'||old.status===v.status||v.status==='lost'&&old.status!=='active'||v.status==='active'&&!['lost','archived'].includes(old.status))throw new AppError('Lead status transition is not permitted',409);
   if(v.status==='lost'&&!v.reason?.trim())throw new AppError('A lost reason is required',400);
   const row=(await client.query('UPDATE crm_leads SET status=$4,lost_reason=$5,version=version+1,updated_at=now() WHERE organization_id=$1 AND branch_id=$2 AND id=$3 RETURNING *',[...this.scope(c),id,v.status,v.status==='lost'?v.reason:old.lost_reason])).rows[0];
   await this.activity(client,c,id,v.status==='lost'?'lead.marked_lost':v.status==='archived'?'lead.archived':'lead.reactivated',{...(v.reason?{note:v.reason}:{})});return row;
  });
 }
 async note(c:AuthorizationContext,id:string,input:unknown){const v=noteSchema.parse(input);return this.write(c,async client=>{const old=await this.lead(client,c,id,v.expectedVersion);if(old.status==='converted'||old.status==='archived')throw new AppError('Lead is read-only',409);await client.query('UPDATE crm_leads SET version=version+1,updated_at=now() WHERE id=$1',[id]);await this.activity(client,c,id,'lead.note_added',{note:v.note});return {version:old.version+1};});}
 async convert(c:AuthorizationContext,id:string,input:unknown){
  const v=conversionSchema.parse(input);
  return this.write(c,async client=>{
   const old=await this.lead(client,c,id,v.expectedVersion);if(old.status!=='active'||old.converted_customer_id)throw new AppError('Lead already converted or not active',409);
   const actor=await membershipAuthority(client,c.userId,c.organizationId);
   const required=v.mode==='new'?'customers.manage':'customers.read';
   if(!actor.effective.includes(required))throw new AppError('Customer permission required for conversion',403);
   const repo=new PostgresCustomerRepository(this.db);let customer;
   if(v.mode==='new'){
    customer=await repo.create({organizationId:c.organizationId,name:v.customer.name,phone:v.customer.phone??null,notes:v.customer.notes??null,homeBranchId:c.branchId!});
    await new DynamicFieldsService(this.db).saveValues(client,c,'customer',customer.id,v.customer.customFields??{},true);
   }else{customer=await repo.findById(c.organizationId,v.customerId);if(!customer||customer.status!=='active')throw new AppError('Selected active Customer is unavailable',400);}
   const row=(await client.query("UPDATE crm_leads SET status='converted',converted_customer_id=$4,version=version+1,updated_at=now() WHERE organization_id=$1 AND branch_id=$2 AND id=$3 RETURNING *",[...this.scope(c),id,customer.id])).rows[0];
   await this.activity(client,c,id,'lead.converted',{customer:customer.id});return row;
  });
 }
 async detail(c:AuthorizationContext,id:string){await this.access(c,'crm.read');const row=(await this.db.query(leadSelect+' WHERE l.organization_id=$1 AND l.branch_id=$2 AND l.id=$3',[...this.scope(c),id])).rows[0];if(!row)throw new AppError('Lead not found',404);return row;}
 async history(c:AuthorizationContext,id:string,page=1){await this.detail(c,id);return (await this.db.query(`SELECT e.id,e.action,e.note,e.occurred_at,u.name AS actor_name,s.name AS stage_name,a.name AS assignee_name,c.name AS customer_name
 FROM crm_activity_events e JOIN users u ON u.id=e.actor_user_id LEFT JOIN crm_pipeline_stages s ON s.id=e.stage_id LEFT JOIN memberships m ON m.id=e.assigned_membership_id LEFT JOIN users a ON a.id=m.user_id LEFT JOIN customers c ON c.id=e.customer_id
 WHERE e.organization_id=$1 AND e.branch_id=$2 AND e.lead_id=$3 ORDER BY e.occurred_at DESC,e.id DESC LIMIT 25 OFFSET $4`,[...this.scope(c),id,(page-1)*25])).rows;}
 async customerContext(c:AuthorizationContext,id:string){await this.access(c,'crm.read');return (await this.db.query(leadSelect+' WHERE l.organization_id=$1 AND l.branch_id=$2 AND l.converted_customer_id=$3 ORDER BY l.updated_at DESC LIMIT 10',[...this.scope(c),id])).rows;}
 private async bounds(c:AuthorizationContext){const timezone=await new BranchTimezoneRepository(this.db).resolve(c.organizationId,c.branchId!),today=instantToBranchBusinessDate(new Date(),timezone);return {timezone,today,start:branchLocalDateTimeToInstant(today+'T00:00:00',timezone),end:branchLocalDateTimeToInstant(nextBusinessDate(today)+'T00:00:00',timezone)};}
 async list(c:AuthorizationContext,input:unknown){
  await this.access(c,'crm.read');const f=leadFilterSchema.parse(input),bounds=await this.bounds(c);
  if((f.field===undefined)!==(f.value===undefined))throw new AppError('Choose a complete custom filter',400);
  const custom=f.field&&f.value!==undefined?await validateCustomerFilter(this.db,c.organizationId,{key:f.field,value:f.value,operator:f.operator},'lead'):undefined;
  if(f.from&&f.to&&(f.from>f.to||(Date.parse(f.to)-Date.parse(f.from))/86400000>=366))throw new AppError('Choose an ordered date range of at most 366 days',400);
  return this.db.transaction(async client=>{
   await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');await client.query("SET LOCAL statement_timeout='10s'");
   const values:unknown[]=this.scope(c),where=['l.organization_id=$1','l.branch_id=$2'];
   const p=(v:unknown)=>{values.push(v);return '$'+values.length;};
   if(f.search){const s=p(f.search);where.push(`(l.name ILIKE '%'||${s}||'%' OR l.phone ILIKE '%'||${s}||'%' OR l.email ILIKE '%'||${s}||'%' OR l.company ILIKE '%'||${s}||'%' OR EXISTS(SELECT 1 FROM custom_field_values v JOIN custom_field_definitions d ON d.id=v.definition_id AND d.organization_id=v.organization_id WHERE v.organization_id=l.organization_id AND v.entity_type='lead' AND v.entity_id=l.id AND d.status='active' AND d.searchable AND v.text_value ILIKE '%'||${s}||'%'))`);}
   if(f.status)where.push('l.status='+p(f.status));
   if(f.stageId){if(!(await client.query('SELECT 1 FROM crm_pipeline_stages WHERE id=$1 AND organization_id=$2',[f.stageId,c.organizationId])).rowCount)throw new AppError('Stage filter is unavailable',403);where.push('l.pipeline_stage_id='+p(f.stageId));}
   if(f.assignee){if(f.assignee==='unassigned')where.push('l.assigned_membership_id IS NULL');else{if(!(await client.query('SELECT 1 FROM membership_branch_assignments WHERE membership_id=$1 AND organization_id=$2 AND branch_id=$3',[f.assignee,...this.scope(c)])).rowCount)throw new AppError('Staff filter is unavailable',403);where.push('l.assigned_membership_id='+p(f.assignee));}}
   if(f.source)where.push('l.source='+p(f.source));
   if(f.from)where.push('l.created_at>='+p(branchLocalDateTimeToInstant(f.from+'T00:00:00',bounds.timezone)));
   if(f.to)where.push('l.created_at<'+p(branchLocalDateTimeToInstant(nextBusinessDate(f.to)+'T00:00:00',bounds.timezone)));
   if(f.attention){const a=p(bounds.start),b=p(bounds.end);where.push(`l.status='active' AND EXISTS(SELECT 1 FROM crm_follow_ups f WHERE f.organization_id=l.organization_id AND f.branch_id=l.branch_id AND f.lead_id=l.id AND f.status='pending' AND ${f.attention==='today'?`f.due_at>=${a} AND f.due_at<${b}`:f.attention==='overdue'?`f.due_at<${a} AND ${b}::timestamptz IS NOT NULL`:`f.due_at>=${b} AND ${a}::timestamptz IS NOT NULL`})`);}
   if(custom){const bindings=['$1',p(null),p(custom.key),p(custom.value)];where.push('l.id IN (SELECT id FROM crm_leads WHERE '+customerPredicate(custom,'lead').replace(/\$(\d+)/g,(_m,n:string)=>bindings[Number(n)-1]!)+')');}
   const predicate=where.join(' AND '),total=Number((await client.query('SELECT count(*) AS n FROM crm_leads l WHERE '+predicate,values)).rows[0]!.n);
   const sort={newest:'l.created_at DESC',oldest:'l.created_at',name:'l.name'}[f.sort],data=(await client.query(leadSelect+' WHERE '+predicate+' ORDER BY '+sort+',l.id LIMIT '+p(f.limit)+' OFFSET '+p((f.page-1)*f.limit),values)).rows;
   return {data,total,page:f.page,limit:f.limit,timezone:bounds.timezone};
  });
 }
 async createFollowup(c:AuthorizationContext,input:unknown){
  const v=followupSchema.parse(input);
  return this.write(c,async client=>{const lead=await this.lead(client,c,v.leadId);if(lead.status!=='active')throw new AppError('Follow-ups require an active lead',409);await this.assignee(client,c,v.assignedMembershipId);
   const timezone=await new BranchTimezoneRepository(this.db).resolve(c.organizationId,c.branchId!);
   const row=(await client.query('INSERT INTO crm_follow_ups(organization_id,branch_id,lead_id,assigned_membership_id,type,subject,note,due_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[...this.scope(c),v.leadId,v.assignedMembershipId??null,v.type,v.subject,v.note??null,branchLocalDateTimeToInstant(v.localDue,timezone),c.userId])).rows[0]!;
   await this.activity(client,c,v.leadId,'followup.created',{followup:row.id});
   if(v.assignedMembershipId)await notifyCrmAssignment(client,c.organizationId,c.branchId!,v.assignedMembershipId,'followup.assigned',row.id,row.version);return row;
  });
 }
 async updateFollowup(c:AuthorizationContext,id:string,input:unknown,terminal=false){
  const v=terminal?followupStateSchema.parse(input):followupUpdateSchema.parse(input);
  return this.write(c,async client=>{
   const old=(await client.query('SELECT * FROM crm_follow_ups WHERE organization_id=$1 AND branch_id=$2 AND id=$3 FOR UPDATE',[...this.scope(c),id])).rows[0];
   if(!old)throw new AppError('Follow-up not found',404);if(old.version!==v.expectedVersion||old.status!=='pending')throw new AppError('Follow-up changed or is already terminal',409);
   const lead=await this.lead(client,c,old.lead_id);if(!terminal&&lead.status!=='active')throw new AppError('Lead is not active',409);
   let row;
   if('status' in v)row=(await client.query("UPDATE crm_follow_ups SET status=$4,completed_at=CASE WHEN $4='completed' THEN now() ELSE NULL END,version=version+1,updated_at=now() WHERE organization_id=$1 AND branch_id=$2 AND id=$3 RETURNING *",[...this.scope(c),id,v.status])).rows[0]!;
   else{
    if(v.assignedMembershipId!==undefined&&v.assignedMembershipId!==old.assigned_membership_id)await this.assignee(client,c,v.assignedMembershipId);
    const timezone=await new BranchTimezoneRepository(this.db).resolve(c.organizationId,c.branchId!);
    row=(await client.query('UPDATE crm_follow_ups SET assigned_membership_id=$4,type=$5,subject=$6,note=$7,due_at=$8,version=version+1,updated_at=now() WHERE organization_id=$1 AND branch_id=$2 AND id=$3 RETURNING *',[...this.scope(c),id,v.assignedMembershipId===undefined?old.assigned_membership_id:v.assignedMembershipId,v.type??old.type,v.subject??old.subject,v.note===undefined?old.note:v.note,v.localDue?branchLocalDateTimeToInstant(v.localDue,timezone):old.due_at])).rows[0]!;
    if(row.assigned_membership_id&&row.assigned_membership_id!==old.assigned_membership_id)await notifyCrmAssignment(client,c.organizationId,c.branchId!,row.assigned_membership_id,'followup.assigned',id,row.version);
   }
   await this.activity(client,c,old.lead_id,terminal?(row.status==='completed'?'followup.completed':'followup.cancelled'):'followup.updated',{followup:id});return row;
  });
 }
 async followups(c:AuthorizationContext,input:unknown){
  await this.access(c,'crm.read');const f=followupFilterSchema.parse(input),b=await this.bounds(c);
  const where="f.organization_id=$1 AND f.branch_id=$2 AND ($3::uuid IS NULL OR f.lead_id=$3) AND "+({today:"f.status='pending' AND l.status='active' AND f.due_at>=$4 AND f.due_at<$5",overdue:"f.status='pending' AND l.status='active' AND f.due_at<$4",upcoming:"f.status='pending' AND l.status='active' AND f.due_at>=$5",completed:"f.status='completed'",all:'true'}[f.view])+" AND $4::timestamptz IS NOT NULL AND $5::timestamptz IS NOT NULL";
  const values=[...this.scope(c),f.leadId??null,b.start,b.end];
  return this.db.transaction(async client=>{await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');await client.query("SET LOCAL statement_timeout='10s'");const total=Number((await client.query('SELECT count(*) AS n FROM ('+followSelect+' WHERE '+where+') q',values)).rows[0]!.n);const data=(await client.query(followSelect+' WHERE '+where+' ORDER BY f.due_at,f.id LIMIT $6 OFFSET $7',[...values,f.limit,(f.page-1)*f.limit])).rows;return {data,total,page:f.page,limit:f.limit,timezone:b.timezone,businessDate:b.today};});
 }
 async overview(c:AuthorizationContext){
  await this.access(c,'crm.read');const b=await this.bounds(c);
  return this.db.transaction(async client=>{await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');await client.query("SET LOCAL statement_timeout='10s'");
   const leads=(await client.query("SELECT count(*) FILTER(WHERE status='active')::int AS active,count(*) FILTER(WHERE status='active' AND assigned_membership_id IS NULL)::int AS unassigned FROM crm_leads WHERE organization_id=$1 AND branch_id=$2",this.scope(c))).rows[0];
   const due=(await client.query("SELECT count(*) FILTER(WHERE f.due_at>=$3 AND f.due_at<$4)::int AS today,count(*) FILTER(WHERE f.due_at<$3)::int AS overdue FROM crm_follow_ups f JOIN crm_leads l ON l.id=f.lead_id AND l.organization_id=f.organization_id AND l.branch_id=f.branch_id WHERE f.organization_id=$1 AND f.branch_id=$2 AND f.status='pending' AND l.status='active'",[...this.scope(c),b.start,b.end])).rows[0];
   const stages=(await client.query("SELECT s.id,s.name,s.status,s.position,count(l.id) FILTER(WHERE l.status='active')::int AS leads FROM crm_pipeline_stages s LEFT JOIN crm_leads l ON l.pipeline_stage_id=s.id AND l.organization_id=s.organization_id AND l.branch_id=$2 WHERE s.organization_id=$1 GROUP BY s.id ORDER BY s.position,s.id LIMIT 50",this.scope(c))).rows;
   return {...leads,...due,stages,timezone:b.timezone,businessDate:b.today};
  });
 }
}
export const crmIdentifier=(v:unknown)=>z.uuid().parse(v);
