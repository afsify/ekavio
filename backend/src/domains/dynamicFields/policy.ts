import { z } from 'zod';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { AppError } from '../../utils/AppError.js';

export const entityTypes = ['customer','service','appointment','inventory_item','membership'] as const;
export type FieldEntity = typeof entityTypes[number];
export const fieldTypes = ['text','textarea','number','currency','date','datetime','email','phone','checkbox','select','multiselect','radio','url'] as const;
export type FieldType = typeof fieldTypes[number];
export type FieldValue = string | boolean | string[] | null;
export const customValuesSchema = z.record(z.string().max(64),z.union([z.string().max(10000),z.boolean(),z.array(z.uuid()).max(50),z.null()])).refine(v=>Object.keys(v).length<=40,'At most 40 custom values');
export interface FieldOption { id:string; key:string; label:string; status:'active'|'archived'; position:number }
export interface FieldDefinition { id:string; key:string; label:string; help:string; field_type:FieldType; status:'active'|'archived'; required:boolean; searchable:boolean; filterable:boolean; reportable:boolean; default_value:FieldValue; version:number; options:FieldOption[] }
export const builtinFields: Record<FieldEntity,readonly {key:string;label:string;required:boolean}[]> = {
 customer:[{key:'name',label:'Customer name',required:true},{key:'phone',label:'Phone',required:false},{key:'notes',label:'Notes',required:false},{key:'status',label:'Status',required:false}],
 service:[{key:'name',label:'Service name',required:true},{key:'durationMinutes',label:'Duration (minutes)',required:true},{key:'description',label:'Description',required:false},{key:'priceMinor',label:'Price',required:false},{key:'active',label:'Active',required:false}],
 appointment:[{key:'customerId',label:'Customer',required:true},{key:'serviceId',label:'Service',required:true},{key:'localStart',label:'Local start',required:true},{key:'providerMembershipId',label:'Provider',required:false},{key:'notes',label:'Notes',required:false}],
 inventory_item:[{key:'name',label:'Item name',required:true},{key:'unitCode',label:'Unit',required:true},{key:'sku',label:'SKU',required:false},{key:'barcode',label:'Barcode',required:false},{key:'price',label:'Reference price',required:false}],
 membership:[{key:'role',label:'Role',required:true},{key:'status',label:'Status',required:true},{key:'branchIds',label:'Branches',required:true}],
};
export function validateFieldKey(entity:FieldEntity,key:string) {
 if(!/^[a-z][a-z0-9_]{0,63}$/.test(key) || /^(system|internal|auth|jwt|password|token|permission|organization|tenant|branch|user|id|created|updated|version|custom)_?/.test(key)
 || builtinFields[entity].some(b=>b.key.toLowerCase()===key.replaceAll('_','')) || (entity==='membership'&&['name','phone','email'].includes(key)) || ['currency','stock','quantity','balance','module','entitlement','platform_operator','role'].includes(key)) throw new AppError('Field key is reserved or invalid',400);
}
export function validateFieldValue(field:FieldDefinition,value:unknown,allowHistorical=false):FieldValue {
 if(value===null || value===undefined || value==='') return null;
 const fail=()=>{throw new AppError(`Invalid value for ${field.label}`,400);};
 if(field.field_type==='checkbox') return typeof value==='boolean'?value:fail();
 if(field.field_type==='multiselect') {
  if(!Array.isArray(value)||value.length>50||new Set(value).size!==value.length) return fail();
  if(value.some(v=>typeof v!=='string'||!field.options.some(o=>o.id===v&&(allowHistorical||o.status==='active')))) return fail();
  return value.length?value as string[]:null;
 }
 if(typeof value!=='string') return fail();
 const text=value.trim(); if(!text) return null;
 if(text.length>(field.field_type==='textarea'?10000:1000)) return fail();
 switch(field.field_type) {
  case 'number': if(!/^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,6})?$/.test(text)) return fail(); break;
  case 'currency': if(!/^(?:0|[1-9]\d{0,17})$/.test(text)||BigInt(text)>9223372036854775807n) return fail(); break;
  case 'date': if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||text.startsWith('0000')||!Number.isFinite(Date.parse(text+'T00:00:00Z'))||new Date(text+'T00:00:00Z').toISOString().slice(0,10)!==text) return fail(); break;
  case 'datetime': if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(text)||text.startsWith('0000')||!Number.isFinite(Date.parse(text))||Number(text.slice(11,13))>23||new Date(text.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)!==text.slice(0,10)) return fail(); return new Date(text).toISOString();
  case 'email': if(!z.email().max(254).safeParse(text).success) return fail(); return text.toLowerCase();
  case 'phone': {const phone=parsePhoneNumberFromString(text); if(!text.startsWith('+')||!phone?.isValid()) return fail(); return phone.number;}
  case 'url': {try {const url=new URL(text); if(!['https:','http:'].includes(url.protocol)||url.username||url.password) return fail();} catch{return fail();} break;}
  case 'select': case 'radio': if(!field.options.some(o=>o.id===text&&(allowHistorical||o.status==='active'))) return fail(); break;
 }
 return text;
}
