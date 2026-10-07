import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PostgresDatabase } from '../src/postgres/database.js';
import { migrate,getMigrationStatus } from '../src/postgres/migrations.js';
import { PostgresAccountRepository } from '../src/postgres/accountRepository.js';
import { PostgresCustomerRepository } from '../src/domains/customers/repository.js';
import { PostgresServiceRepository } from '../src/domains/services/repository.js';
import { PostgresAppointmentRepository } from '../src/domains/appointments/repository.js';
import { DynamicFieldsService,fieldCreationRequest,type DefinitionInput } from '../src/domains/dynamicFields/service.js';
import { fieldTypes,type FieldValue } from '../src/domains/dynamicFields/policy.js';
import { permissionsForRole } from '../src/services/authorizationPolicy.js';
import type { AuthorizationContext } from '../src/services/requestContextService.js';
test('dynamic fields and layouts in disposable PostgreSQL',async t=>{
 const url=new URL(process.env.POSTGRES_TEST_URL??'');assert.ok(['localhost','127.0.0.1','postgres'].includes(url.hostname)&&url.pathname==='/postgres');
 const admin=new PostgresDatabase(url.href),name='ekavio_v208d_'+randomUUID().replaceAll('-','');await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;const db=new PostgresDatabase(url.href);
 t.after(async()=>{await db.close();await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1',[name]);await admin.query('DROP DATABASE '+name);await admin.close();});
 await t.test('014 to 015 preserves checksums and reruns idempotently',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'v208d-'));
  try {for(const f of (await readdir('postgres/migrations')).filter(f=>f.endsWith('.sql')&&Number(f.slice(0,3))<=14))await copyFile(path.join('postgres/migrations',f),path.join(dir,f));
   await migrate(db,dir);const before=(await db.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;await migrate(db);await migrate(db);assert.equal((await getMigrationStatus(db)).length, 18);assert.deepEqual((await db.query("SELECT name,checksum FROM schema_migrations WHERE name<'015' ORDER BY name")).rows,before);
  }finally{await rm(dir,{recursive:true});}
 });
 const accounts=new PostgresAccountRepository(db),a=await accounts.registerAdmin({orgName:'QA A',orgType:'shop',userName:'QA Owner',phone:'+919876540005',passwordHash:'fixture-only'}),b=await accounts.registerAdmin({orgName:'QA B',orgType:'shop',userName:'Other QA Owner',phone:'+919876540006',passwordHash:'fixture-only'});
 const org=String(a.user.tenantId),other=String(b.user.tenantId),user=String(a.user.id),branch=String((a.branch as {id:string}).id);
 const membership=(await db.query('SELECT id FROM memberships WHERE organization_id=$1 AND user_id=$2',[org,user])).rows[0]!.id;
 const c:AuthorizationContext={organizationId:org,userId:user,membershipId:membership,branchId:branch,sessionId:'fixture',role:'admin',permissions:permissionsForRole('admin'),platformOperator:false};
 const fields=new DynamicFieldsService(db),customers=new PostgresCustomerRepository(db);
 const input=(key:string,type:DefinitionInput['fieldType']='text'):DefinitionInput=>({key,label:key,help:'',fieldType:type,status:'active',required:false,searchable:true,filterable:true,reportable:true,defaultValue:null,options:[]});
 let choice:Awaited<ReturnType<typeof fields.saveDefinition>>,customer:string;
 await t.test('zero configuration is empty and preserves ordinary records',async()=>{assert.deepEqual((await fields.schema(org,'customer')).definitions,[]);const r=await fields.mutate(c,'customer',undefined,true,()=>customers.create({organizationId:org,name:'Before definitions'}));customer=r.id;assert.deepEqual(await fields.values(org,'customer',r.id),{});});
 await t.test('required choices reject and roll back canonical create',async()=>{
  choice=await fields.saveDefinition(c,'customer',{...input('category','select'),searchable:false,required:true,options:[{key:'regular',label:'Regular',status:'active'},{key:'guest',label:'Guest',status:'active'}]});
  await assert.rejects(fields.mutate(c,'customer',{},true,()=>customers.create({organizationId:org,name:'Must roll back'})),/required/);
  assert.equal((await db.query("SELECT count(*) FROM customers WHERE name='Must roll back'")).rows[0]!.count,'0');
 });
 await t.test('historical read needs no backfill; normal edit now requires value and rolls back',async()=>{
  assert.deepEqual(await fields.values(org,'customer',customer),{});
  await assert.rejects(fields.mutate(c,'customer',{},false,async()=>{const r=await customers.update({organizationId:org,customerId:customer,name:'Not saved'});return r!;}),/required/);
  assert.equal((await customers.findById(org,customer))!.name,'Before definitions');
  await fields.mutate(c,'customer',{category:choice.options[0]!.id},false,async()=>{return (await customers.update({organizationId:org,customerId:customer,notes:'Accepted'}))!;});
 });
 await t.test('cross-tenant definitions, entity references and options fail',async()=>{
  await assert.rejects(fields.saveDefinition({...c,organizationId:other},'customer',input('foreign')),/denied/);
  await assert.rejects(fields.mutate(c,'customer',{foreign:'x'},false,async()=>({id:customer})),/Unknown/);
  await assert.rejects(db.query("INSERT INTO custom_field_entities(organization_id,entity_type,entity_id,customer_id) VALUES($1,'customer',$2,$2)",[other,customer]));
  await assert.rejects(db.query("INSERT INTO custom_field_entities(organization_id,entity_type,entity_id,customer_id) VALUES($1,'service',$2,$2)",[org,customer]));
  await assert.rejects(fields.mutate(c,'customer',{category:randomUUID()},false,async()=>({id:customer})),/Invalid/);
 });
 await t.test('13 typed fields round trip with exact decimals and normalized values',async()=>{
  const values:Record<string,FieldValue>={};
  for(const type of fieldTypes){const f=await fields.saveDefinition(c,'customer',{...input('f_'+type,type),searchable:['text','textarea','email','phone'].includes(type),filterable:type!=='multiselect',options:['select','radio','multiselect'].includes(type)?[{key:'one',label:'One',status:'active'}]:[]});
   values[f.key]=({text:'Text',textarea:'Long\ntext',number:'123456789012345678.123456',currency:'12345',date:'2028-02-29',datetime:'2026-10-07T05:00:00.000Z',email:'QA@EXAMPLE.INVALID',phone:'+919876543210',checkbox:false,select:f.options[0]?.id??'',radio:f.options[0]?.id??'',multiselect:f.options.map(o=>o.id),url:'https://example.invalid'})[type];}
  await fields.mutate(c,'customer',values,false,async()=>({id:customer}));const read=await fields.values(org,'customer',customer);assert.equal(read.f_number,values.f_number);assert.equal(read.f_checkbox,false);assert.equal(read.f_email,'qa@example.invalid');assert.deepEqual(read.f_multiselect,values.f_multiselect);
  assert.equal((await customers.list({organizationId:org,page:1,limit:20,search:'Long'})).total,1);
  for(const [key,value,operator] of [['f_text','Text','eq'],['f_number','123456789012345678.123455','gte'],['f_date','2028-02-29','eq'],['f_checkbox','false','eq']] as const)assert.equal((await customers.list({organizationId:org,page:1,limit:20,customFilter:{key,value,operator}})).total,1);
  await assert.rejects(customers.list({organizationId:org,page:1,limit:20,customFilter:{key:'not_allowed',value:'x',operator:'eq'}}));
 });
 await t.test('stale definitions reject, keys/types immutable and used options cannot disappear',async()=>{
  const body={...input('category','select'),searchable:false,required:true,options:choice.options};
  await fields.saveDefinition(c,'customer',{...body,label:'Renamed category',version:1},choice.id);
  await assert.rejects(fields.saveDefinition(c,'customer',{...body,version:1},choice.id),/changed/);
  await assert.rejects(fields.saveDefinition(c,'customer',{...body,version:2,key:'new_key'},choice.id),/immutable/);
  await assert.rejects(fields.saveDefinition(c,'customer',{...body,version:2,options:[]},choice.id),/option/i);
  await assert.rejects(db.query("UPDATE custom_field_definitions SET field_type='text' WHERE id=$1",[choice.id]),/immutable/);
 });
 await t.test('archive option preserves history and prohibits new assignment',async()=>{
  const body={...input('category','select'),searchable:false,required:true,options:choice.options.map((o,i)=>({...o,label:i===0?'Renamed Regular':o.label,status:i===0?'archived' as const:o.status})),version:2};
  await fields.saveDefinition(c,'customer',body,choice.id);assert.equal((await fields.values(org,'customer',customer)).category,choice.options[0]!.id);
  await fields.mutate(c,'customer',{},false,async()=>({id:customer}));await assert.rejects(fields.mutate(c,'customer',{category:choice.options[0]!.id},false,async()=>({id:customer})),/Invalid/);
 });
 await t.test('required built-ins protected and concurrent layout saves reject stale version',async()=>{
  const sections=[{id:randomUUID(),title:'Main',fields:(await fields.schema(org,'customer')).builtins.map(b=>({key:b.key,visible:true})).concat((await fields.definitions(org,'customer')).map(f=>({key:f.key,visible:true})))}];
  await assert.rejects(fields.saveLayout(c,'customer',{version:0,sections:[{...sections[0]!,fields:[]}] }),/Required/);
  const outcomes=await Promise.allSettled([fields.saveLayout(c,'customer',{version:0,sections}),fields.saveLayout(c,'customer',{version:0,sections})]);assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);assert.equal((await fields.schema(org,'customer')).version,1);
 });
 await t.test('archiving field preserves typed values and makes future writes reject it',async()=>{
  const old=(await fields.definitions(org,'customer')).find(f=>f.key==='f_text')!;
  await fields.saveDefinition(c,'customer',{...input(old.key),status:'archived',version:old.version},old.id);assert.equal((await fields.values(org,'customer',customer)).f_text,'Text');await assert.rejects(fields.mutate(c,'customer',{f_text:'new'},false,async()=>({id:customer})),/archived/);
 });
 await t.test('typed column constraint and append-only redacted audit',async()=>{
  await assert.rejects(db.query("UPDATE custom_field_values SET text_value='wrong' WHERE organization_id=$1 AND field_type='number'",[org]));
  await assert.rejects(db.query("INSERT INTO custom_field_selected_options(organization_id,entity_type,entity_id,definition_id,option_id) VALUES($1,'customer',$2,$3,$4)",[org,customer,choice.id,choice.options[0]!.id]));
  await assert.rejects(db.query('UPDATE field_admin_events SET target_id=$1 WHERE organization_id=$2',[randomUUID(),org]));
  const columns=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='field_admin_events'")).rows.map(r=>r.column_name);assert.ok(!columns.includes('details'));assert.ok(!columns.includes('value'));
 });
 await t.test('atomic connection is released and isolated from ordinary work',async()=>{await db.atomic(async()=>{await assert.rejects(db.atomic(async()=>undefined),/Nested/);});assert.equal((await db.query('SELECT 1 AS n')).rows[0]!.n,1);});
 await t.test('defaults are new-only; duplicate key, invalid defaults and reactivation are safe',async()=>{
  const f=await fields.saveDefinition(c,'customer',{...input('new_default'),defaultValue:'New records only'});
  assert.equal((await fields.values(org,'customer',customer)).new_default,undefined);
  await assert.rejects(fields.saveDefinition(c,'customer',input('new_default')));
  await assert.rejects(fields.saveDefinition(c,'customer',{...input('unsafe_link','url'),searchable:false,defaultValue:'javascript:bad'}));
  const fresh=await fields.mutate(c,'customer',{category:choice.options[1]!.id},true,()=>customers.create({organizationId:org,name:'Defaults fixture'}));assert.equal((await fields.values(org,'customer',fresh.id)).new_default,'New records only');
  await fields.saveDefinition(c,'customer',{...input(f.key),version:1,status:'archived'},f.id);await fields.saveDefinition(c,'customer',{...input(f.key),version:2},f.id);assert.equal((await fields.definitions(org,'customer')).find(d=>d.id===f.id)!.status,'active');
 });
 await t.test('retry keys bind custom input and cannot overwrite later edits/defaults',async()=>{
  const command=fieldCreationRequest({idempotencyKey:'fixture-retry',customFields:{category:choice.options[1]!.id}})!;
  const created=await fields.mutate(c,'customer',{category:choice.options[1]!.id},true,()=>customers.create({organizationId:org,name:'Retry fixture'}),command);
  const reordered=fieldCreationRequest({customFields:{category:choice.options[1]!.id},idempotencyKey:'fixture-retry'})!;assert.deepEqual(reordered,command);
  await fields.mutate(c,'customer',{},true,async()=>created,command);assert.equal((await fields.values(org,'customer',created.id)).category,choice.options[1]!.id);
  await assert.rejects(fields.mutate(c,'customer',{},true,async()=>created,{...command,fingerprint:'f'.repeat(64)}),/Idempotency/);
 });
 await t.test('same-user membership values do not alter shared identity',async()=>{
  const before=(await db.query('SELECT name,phone,password_hash FROM users WHERE id=$1',[user])).rows[0];
  await fields.saveDefinition(c,'membership',input('badge'));await fields.mutate(c,'membership',{badge:'Organization badge'},false,async()=>({id:membership}));assert.equal((await fields.values(org,'membership',membership)).badge,'Organization badge');assert.deepEqual((await db.query('SELECT name,phone,password_hash FROM users WHERE id=$1',[user])).rows[0],before);
 });
 await t.test('legacy creation retries never backfill defaults or edit custom values',async()=>{
  await db.query("UPDATE branches SET timezone='Asia/Kolkata' WHERE id=$1",[branch]);
  const service=await new PostgresServiceRepository(db).createForBranch({organizationId:org,branchId:branch,name:'Legacy retry fixture',durationMinutes:30});
  const appointments=new PostgresAppointmentRepository(db),command={organizationId:org,branchId:branch,customerId:customer,serviceId:service.id,startsAt:new Date('2028-01-01T05:00:00Z'),endsAt:new Date('2028-01-01T05:30:00Z'),actorMembershipId:membership,idempotencyKey:'legacy-fixture'};
  const existing=await appointments.create(command);
  await fields.saveDefinition(c,'appointment',{...input('new_note'),defaultValue:'New records only',required:true});
  const request=fieldCreationRequest({idempotencyKey:command.idempotencyKey})!;
  const retried=await fields.mutate(c,'appointment',undefined,true,()=>appointments.create(command),request);
  assert.equal(retried.id,existing.id);assert.deepEqual(await fields.values(org,'appointment',existing.id),{});
  await assert.rejects(fields.mutate(c,'appointment',{new_note:'Unsafe retry edit'},true,()=>appointments.create(command),request),/Legacy creation retry/);
 });
 await t.test('field counts remain bounded under active/archive lifecycle',async()=>{
  const created=[];for(let i=0;i<40;i++)created.push(await fields.saveDefinition(c,'service',input('limit_'+i)));
  await assert.rejects(fields.saveDefinition(c,'service',input('limit_over')),/40 active/);
  for(let i=0;i<10;i++){const old=created[i]!;await fields.saveDefinition(c,'service',{...input(old.key),version:1,status:'archived'},old.id);await fields.saveDefinition(c,'service',input('limit_more_'+i));}
  await assert.rejects(fields.saveDefinition(c,'service',input('limit_total')),/50 fields/);
 });
 await t.test('schema query count is bounded rather than one request/query per field',async()=>{
  const transaction=db.transaction.bind(db);let count=0;
  db.transaction=async operation=>transaction(client=>operation(new Proxy(client,{get(target,key){if(key==='query')return (sql:string,values?:unknown[])=>{count++;return target.query(sql,values);};return Reflect.get(target,key,target);}})));
  try {const result=await fields.schema(org,'service');assert.equal(result.definitions.length,50);assert.equal(count,3);}finally{db.transaction=transaction;}
 });
});
