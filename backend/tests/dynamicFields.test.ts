import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { fieldTypes,validateFieldKey,validateFieldValue,customValuesSchema,type FieldDefinition } from '../src/domains/dynamicFields/policy.js';
const option=randomUUID();
const field=(type:FieldDefinition['field_type']):FieldDefinition=>({id:randomUUID(),key:'fixture',label:'Fixture',help:'',field_type:type,status:'active',required:false,searchable:false,filterable:false,reportable:false,default_value:null,version:1,options:[{id:option,key:'stable',label:'Stable',status:'active',position:0}]});
const valid:Record<FieldDefinition['field_type'],unknown>={text:'text',textarea:'line\nline',number:'123456789012345678.123456',currency:'12345',date:'2028-02-29',datetime:'2026-10-07T10:00:00+05:30',email:'QA@EXAMPLE.INVALID',phone:'+919876543210',checkbox:false,select:option,multiselect:[option],radio:option,url:'https://example.invalid/path'};
for(const type of fieldTypes) test(`validates typed ${type} without coercion`,()=>{assert.notEqual(validateFieldValue(field(type),valid[type]),null);assert.throws(()=>validateFieldValue(field(type),{}));});
test('exact precision, invalid dates, URI credentials and unsafe protocols rejected',()=>{
 for(const v of ['1e3','NaN','Infinity','1.1234567','9999999999999999999','01'])assert.throws(()=>validateFieldValue(field('number'),v));
 for(const v of ['2026-02-29','2026-13-01','2026-02-30'])assert.throws(()=>validateFieldValue(field('date'),v));
 for(const v of ['2026-02-30T10:00:00Z','2026-10-07T24:00:00Z'])assert.throws(()=>validateFieldValue(field('datetime'),v));
 for(const v of ['javascript:alert(1)','data:text/html,test','https://name:password@example.invalid'])assert.throws(()=>validateFieldValue(field('url'),v));
 assert.throws(()=>validateFieldValue(field('currency'),'1.25'));assert.throws(()=>validateFieldValue(field('number'),1.2));
});
test('options are stable identifiers, duplicates and unknown choices fail',()=>{
 assert.throws(()=>validateFieldValue(field('select'),'Stable'));assert.throws(()=>validateFieldValue(field('multiselect'),[option,option]));
 const archived=field('select');archived.options[0]!.status='archived';assert.throws(()=>validateFieldValue(archived,option));assert.equal(validateFieldValue(archived,option,true),option);
});
test('keys reserve canonical identity and authority, limits reject oversized inputs',()=>{
 for(const key of ['name','tenant_id','password_hash','permission_set','stock','duration_minutes','custom_payload'])assert.throws(()=>validateFieldKey('service',key));
 validateFieldKey('customer','blood_group');assert.throws(()=>validateFieldValue(field('text'),'x'.repeat(1001)));assert.throws(()=>validateFieldValue(field('textarea'),'x'.repeat(10001)));
 assert.equal(customValuesSchema.safeParse(Object.fromEntries(Array.from({length:41},(_,i)=>['f'+i,'x']))).success,false);
});
