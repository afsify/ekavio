import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { randomUUID,createHash } from 'node:crypto';
import type { PostgresDatabase } from '../../postgres/database.js';
import { lockAdministration } from '../../postgres/organizationAuthorization.js';
import type { AuthorizationContext } from '../../services/requestContextService.js';
import { AppError } from '../../utils/AppError.js';
import { builtinFields, validateFieldKey, validateFieldValue, type FieldDefinition, type FieldEntity, type FieldOption, type FieldType, type FieldValue } from './policy.js';

export interface DefinitionInput { key:string; label:string; help:string; fieldType:FieldType; status:'active'|'archived'; required:boolean; searchable:boolean; filterable:boolean; reportable:boolean; defaultValue:FieldValue; version?:number; options:{id?:string;key:string;label:string;status:'active'|'archived'}[] }
export interface LayoutInput { version:number; sections:{id:string;title:string;status?:'active'|'archived';fields:{key:string;visible:boolean}[]}[] }
const entityColumn:Record<FieldEntity,string>={customer:'customer_id',service:'service_id',appointment:'appointment_id',inventory_item:'inventory_item_id',membership:'membership_id',lead:'lead_id'};
type Query = {query<Row extends QueryResultRow = QueryResultRow>(text:string,values:unknown[]):Promise<QueryResult<Row>>};
const fieldSelect=`d.id,d.key,d.label,d.help,d.field_type,d.status,d.required,d.searchable,d.filterable,d.reportable,d.default_value,d.version,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'key',o.key,'label',o.label,'status',o.status,'position',o.position) ORDER BY o.position,o.id) FROM custom_field_options o WHERE o.definition_id=d.id),'[]'::jsonb) AS options`;
export function fieldCreationRequest(input:Record<string,unknown>) {
 if(typeof input.idempotencyKey!=='string'||!input.idempotencyKey)return undefined;
 const stable=(value:unknown):unknown=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,stable(v)])):value;
 return {key:input.idempotencyKey,fingerprint:createHash('sha256').update(JSON.stringify(stable(input))).digest('hex')};
}

export class DynamicFieldsService {
 constructor(private readonly database:PostgresDatabase) {}
 async definitions(org:string,entity:FieldEntity,client?:PoolClient):Promise<FieldDefinition[]> {
  return (await (client??this.database as Query).query<FieldDefinition>(`SELECT ${fieldSelect} FROM custom_field_definitions d WHERE organization_id=$1 AND entity_type=$2 ORDER BY created_at,id LIMIT 50`,[org,entity])).rows;
 }
 async definition(org:string,entity:FieldEntity,key:string):Promise<FieldDefinition|undefined> {
  return (await this.database.query<FieldDefinition>(`SELECT ${fieldSelect} FROM custom_field_definitions d WHERE organization_id=$1 AND entity_type=$2 AND key=$3`,[org,entity,key])).rows[0];
 }
 async schema(org:string,entity:FieldEntity) {
  return this.database.transaction(async client=>{
   await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
   const definitions=await this.definitions(org,entity,client);
   const layout=(await client.query(`SELECT id,version FROM form_layouts WHERE organization_id=$1 AND entity_type=$2`,[org,entity])).rows[0];
   const sections=layout?(await client.query(`SELECT s.id,s.title,s.status,COALESCE(jsonb_agg(jsonb_build_object('key',p.key,'visible',p.visible) ORDER BY p.position,p.key) FILTER(WHERE p.key IS NOT NULL),'[]'::jsonb) AS fields
    FROM form_sections s LEFT JOIN form_placements p ON p.section_id=s.id AND p.layout_id=s.layout_id WHERE s.layout_id=$1 GROUP BY s.id ORDER BY s.position,s.id`,[layout.id])).rows:[];
   return {entity,version:layout?.version??0,builtins:builtinFields[entity],definitions,sections};
  });
 }
 private async event(client:PoolClient,c:AuthorizationContext,action:string,target:string) {
  await client.query('INSERT INTO field_admin_events(organization_id,actor_user_id,action,target_id) VALUES($1,$2,$3,$4)',[c.organizationId,c.userId,action,target]);
 }
 async saveDefinition(c:AuthorizationContext,entity:FieldEntity,input:DefinitionInput,id?:string) {
  validateFieldKey(entity,input.key);
  return this.database.transaction(async client=>{
   await lockAdministration(client,c.userId,c.organizationId,'fields.manage');
   const definitions=await this.definitions(c.organizationId,entity,client);
   const old=id?definitions.find(f=>f.id===id):undefined;
   if(id&&!old) throw new AppError('Field not found',404);
   if(old&&(old.version!==input.version||old.key!==input.key||old.field_type!==input.fieldType)) throw new AppError('Field changed or immutable identity was modified; reload before saving',409);
   if(old&&input.status==='active'&&input.required){const placement=(await client.query(`SELECT p.visible FROM form_placements p JOIN form_layouts l ON l.id=p.layout_id WHERE l.organization_id=$1 AND l.entity_type=$2 AND p.key=$3`,[c.organizationId,entity,old.key])).rows[0];if(placement&&!placement.visible)throw new AppError('Make the field visible in its layout before requiring it',400);}
   if(!old&&definitions.length>=50) throw new AppError('Limit of 50 fields reached',400);
   if(input.status==='active'&&definitions.filter(f=>f.status==='active'&&f.id!==id).length>=40) throw new AppError('Limit of 40 active fields reached',400);
   const choice=['select','radio','multiselect'].includes(input.fieldType);
   if(input.searchable&&!['text','textarea','email','phone'].includes(input.fieldType))throw new AppError('Searchable is supported only for bounded text, email and phone fields',400);
   if(input.filterable&&input.fieldType==='multiselect')throw new AppError('Multiselect filtering is deferred; use a single-choice field',400);
   if(!choice&&input.options.length) throw new AppError('Options require a choice field',400);
   if(choice&&input.status==='active'&&!input.options.some(o=>o.status==='active')) throw new AppError('An active option is required',400);
   if(old&&old.options.some(o=>!input.options.some(n=>n.id===o.id&&n.key===o.key))) throw new AppError('Options cannot be removed or re-keyed; archive them',400);
   if(input.options.some(o=>o.id&&!old?.options.some(n=>n.id===o.id&&n.key===o.key))) throw new AppError('Option belongs to another field',400);
   const row=id?(await client.query(`UPDATE custom_field_definitions SET label=$3,help=$4,status=$5,required=$6,searchable=$7,filterable=$8,reportable=$9,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING id`,[id,c.organizationId,input.label,input.help,input.status,input.required,input.searchable,input.filterable,input.reportable])).rows[0]
    :(await client.query(`INSERT INTO custom_field_definitions(organization_id,entity_type,key,label,help,field_type,status,required,searchable,filterable,reportable,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,[c.organizationId,entity,input.key,input.label,input.help,input.fieldType,input.status,input.required,input.searchable,input.filterable,input.reportable,c.userId])).rows[0];
   const options:FieldOption[]=[];
   for(const [position,o] of input.options.entries()) {
    const option=o.id?(await client.query(`UPDATE custom_field_options SET label=$4,status=$5,position=$6 WHERE id=$1 AND definition_id=$2 AND organization_id=$3 RETURNING *`,[o.id,row!.id,c.organizationId,o.label,o.status,position])).rows[0]
     :(await client.query(`INSERT INTO custom_field_options(definition_id,organization_id,key,label,status,position) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[row!.id,c.organizationId,o.key,o.label,o.status,position])).rows[0];
    options.push(option as FieldOption);
   }
   const candidate={...input,id:String(row!.id),field_type:input.fieldType,options} as unknown as FieldDefinition;
   const defaultValue=validateFieldValue(candidate,input.defaultValue);
   await client.query('UPDATE custom_field_definitions SET default_value=$2::jsonb WHERE id=$1',[row!.id,JSON.stringify(defaultValue)]);
   await this.event(client,c,!old?'field.created':old.status!==input.status?(input.status==='active'?'field.reactivated':'field.archived'):'field.updated',String(row!.id));
   if(choice) await this.event(client,c,'field.options.updated',String(row!.id));
   return {...candidate,default_value:defaultValue,version:old?old.version+1:1};
  });
 }
 async saveLayout(c:AuthorizationContext,entity:FieldEntity,input:LayoutInput,reset=false) {
  return this.database.transaction(async client=>{
   await lockAdministration(client,c.userId,c.organizationId,'fields.manage');
   const definitions=await this.definitions(c.organizationId,entity,client);
   if(reset)input={version:input.version,sections:[{id:randomUUID(),title:'General',fields:[...builtinFields[entity],...definitions.filter(f=>f.status==='active')].map(f=>({key:f.key,visible:true}))}]};
   const keys=input.sections.flatMap(s=>s.fields.map(f=>f.key));
   if(input.sections.some(s=>s.status==='archived'&&s.fields.length))throw new AppError('Move fields to an active section before archiving its section',400);
   const known=[...builtinFields[entity].map(b=>b.key),...definitions.map(f=>f.key)];
   if(new Set(keys).size!==keys.length||keys.some(k=>!known.includes(k))||new Set(input.sections.map(s=>s.id)).size!==input.sections.length) throw new AppError('Layout has unknown or duplicate fields/sections',400);
   for(const b of builtinFields[entity]) if(b.required&&!input.sections.some(s=>s.fields.some(f=>f.key===b.key&&f.visible))) throw new AppError('Required built-in fields cannot be hidden or removed',400);
   for(const d of definitions) if(d.status==='active'&&d.required&&!input.sections.some(s=>s.fields.some(f=>f.key===d.key&&f.visible))) throw new AppError('Required custom fields cannot be hidden or removed',400);
   const old=(await client.query('SELECT id,version FROM form_layouts WHERE organization_id=$1 AND entity_type=$2',[c.organizationId,entity])).rows[0];
   if((old?.version??0)!==input.version) throw new AppError('Layout changed; reload before saving',409);
   const layout=old?(await client.query('UPDATE form_layouts SET version=version+1 WHERE id=$1 RETURNING *',[old.id])).rows[0]
    :(await client.query('INSERT INTO form_layouts(organization_id,entity_type) VALUES($1,$2) RETURNING *',[c.organizationId,entity])).rows[0];
   await client.query('DELETE FROM form_placements WHERE layout_id=$1',[layout!.id]);
   await client.query('DELETE FROM form_sections WHERE layout_id=$1',[layout!.id]);
   for(const [position,section] of input.sections.entries()) {
    await client.query('INSERT INTO form_sections(id,layout_id,title,position,status) VALUES($1,$2,$3,$4,$5)',[section.id,layout!.id,section.title,position,section.status??'active']);
    for(const [index,field] of section.fields.entries()) await client.query('INSERT INTO form_placements(layout_id,section_id,key,position,visible) VALUES($1,$2,$3,$4,$5)',[layout!.id,section.id,field.key,index,field.visible]);
   }
   await this.event(client,c,reset?'layout.reset':'layout.updated',String(layout!.id));
   return {version:layout!.version};
  });
 }
 /** Called inside the canonical write's opt-in atomic boundary. Acquiring the
  * organization lock first serializes schema changes and membership revocation. */
 async mutate<T extends {id:string}>(c:AuthorizationContext,entity:FieldEntity,patch:Record<string,FieldValue>|undefined,isNew:boolean,canonical:()=>Promise<T>,request?:{key:string;fingerprint:string}):Promise<T> {
  return this.database.atomic(async client=>{
   const permission={customer:'customers.manage',service:'services.manage',appointment:'queue.manage',inventory_item:'inventory.manage',membership:'staff.manage',lead:'crm.manage'} as const;
   await lockAdministration(client,c.userId,c.organizationId,permission[entity]);
   if(c.branchId) {
    const branch=await client.query(`SELECT a.branch_id FROM membership_branch_assignments a JOIN branches b ON b.id=a.branch_id AND b.organization_id=a.organization_id
     WHERE a.membership_id=$1 AND a.organization_id=$2 AND a.branch_id=$3 AND b.status='active'`,[c.membershipId,c.organizationId,c.branchId]);
    if(!branch.rows[0])throw new AppError('Access denied to this branch',403);
   }
   const retry=isNew&&request?(await client.query('SELECT entity_id,fingerprint FROM custom_field_creation_requests WHERE organization_id=$1 AND entity_type=$2 AND retry_key=$3',[c.organizationId,entity,request.key])).rows[0]:undefined;
   if(retry&&retry.fingerprint!==request!.fingerprint)throw new AppError('Idempotency key was used with different custom fields or canonical input',409);
   // Pre-migration creation retries have no field fingerprint. Preserve them
   // unchanged: a retry must never backfill defaults or act as a metadata edit.
   const legacyTable=entity==='appointment'?'appointments':entity==='inventory_item'?'inventory_items':undefined;
   const legacyColumn=entity==='appointment'?'idempotency_key':'creation_idempotency_key';
   const legacy=isNew&&request&&!retry&&legacyTable?(await client.query(`SELECT id FROM ${legacyTable} WHERE organization_id=$1 AND ${legacyColumn}=$2`,[c.organizationId,request.key])).rows[0]:undefined;
   if(legacy&&Object.keys(patch??{}).length)throw new AppError('Legacy creation retry cannot edit custom fields; use the normal metadata edit',409);
   const record=await canonical();
   if(retry){if(retry.entity_id!==record.id)throw new AppError('Idempotency target conflict',409);return record;}
   if(legacy){if(legacy.id!==record.id)throw new AppError('Idempotency target conflict',409);return record;}
   await this.saveValues(client,c,entity,record.id,patch??{},isNew);
   if(isNew&&request){await client.query(`INSERT INTO custom_field_entities(organization_id,entity_type,entity_id,${entityColumn[entity]}) VALUES($1,$2,$3,$3) ON CONFLICT DO NOTHING`,[c.organizationId,entity,record.id]);await client.query('INSERT INTO custom_field_creation_requests(organization_id,entity_type,retry_key,entity_id,fingerprint) VALUES($1,$2,$3,$4,$5)',[c.organizationId,entity,request.key,record.id,request.fingerprint]);}
   return record;
  });
 }
 async saveValues(client:PoolClient,c:AuthorizationContext,entity:FieldEntity,id:string,patch:Record<string,FieldValue>,isNew:boolean) {
  const definitions=await this.definitions(c.organizationId,entity,client);
  if(Object.keys(patch).some(key=>!definitions.some(f=>f.key===key&&f.status==='active'))) throw new AppError('Unknown, archived or foreign custom field',400);
  const current=await this.values(c.organizationId,entity,id,client);
  const values:Record<string,FieldValue>={};
  for(const field of definitions.filter(f=>f.status==='active')) {
   const proposed=Object.hasOwn(patch,field.key)?patch[field.key]:isNew?field.default_value:current[field.key]??null;
   const value=validateFieldValue(field,proposed,!Object.hasOwn(patch,field.key)&&!isNew);
   if(field.required&&(value===null||(Array.isArray(value)&&!value.length))) throw new AppError(`${field.label} is required`,400);
   if(Object.hasOwn(patch,field.key)||(isNew&&value!==null)) values[field.key]=value;
  }
  if(!Object.keys(values).length) return;
  await client.query(`INSERT INTO custom_field_entities(organization_id,entity_type,entity_id,${entityColumn[entity]}) VALUES($1,$2,$3,$3) ON CONFLICT DO NOTHING`,[c.organizationId,entity,id]);
  for(const field of definitions.filter(f=>Object.hasOwn(values,f.key))) {
   const value=values[field.key];
   await client.query('DELETE FROM custom_field_values WHERE organization_id=$1 AND entity_type=$2 AND entity_id=$3 AND definition_id=$4',[c.organizationId,entity,id,field.id]);
   if(value===null) continue;
   const columns:Record<FieldType,string>={text:'text_value',textarea:'text_value',email:'text_value',phone:'text_value',url:'text_value',number:'numeric_value',currency:'money_minor',date:'date_value',datetime:'timestamp_value',checkbox:'boolean_value',select:'option_id',radio:'option_id',multiselect:''};
   const column=columns[field.field_type];
   await client.query(`INSERT INTO custom_field_values(organization_id,entity_type,entity_id,definition_id,field_type${column?','+column:''}) VALUES($1,$2,$3,$4,$5${column?',$6':''})`,[c.organizationId,entity,id,field.id,field.field_type,...(column?[value]:[])]);
   if(field.field_type==='multiselect') await client.query('INSERT INTO custom_field_selected_options(organization_id,entity_type,entity_id,definition_id,option_id) SELECT $1,$2,$3,$4,option FROM unnest($5::uuid[]) AS option',[c.organizationId,entity,id,field.id,value]);
  }
  await this.event(client,c,'field.values.updated',id);
 }
 async values(org:string,entity:FieldEntity,id:string,client?:PoolClient):Promise<Record<string,FieldValue>> {
  const query:Query=client??this.database;
  const rows=(await query.query(`SELECT d.key,CASE v.field_type
   WHEN 'number' THEN to_jsonb(v.numeric_value::text) WHEN 'currency' THEN to_jsonb(v.money_minor::text)
   WHEN 'date' THEN to_jsonb(to_char(v.date_value,'YYYY-MM-DD')) WHEN 'datetime' THEN to_jsonb(v.timestamp_value)
   WHEN 'checkbox' THEN to_jsonb(v.boolean_value) WHEN 'select' THEN to_jsonb(v.option_id) WHEN 'radio' THEN to_jsonb(v.option_id)
   WHEN 'multiselect' THEN (SELECT jsonb_agg(s.option_id ORDER BY s.option_id) FROM custom_field_selected_options s WHERE s.organization_id=v.organization_id AND s.entity_type=v.entity_type AND s.entity_id=v.entity_id AND s.definition_id=v.definition_id)
   ELSE to_jsonb(v.text_value) END AS value FROM custom_field_values v JOIN custom_field_definitions d ON d.id=v.definition_id
   WHERE v.organization_id=$1 AND v.entity_type=$2 AND v.entity_id=$3`,[org,entity,id])).rows;
  return Object.fromEntries(rows.map(row=>[row.key,row.value]));
 }
}
