import { parsePhoneNumberFromString } from 'libphonenumber-js';
export const entities = ['customer','service','appointment','inventory_item','membership','lead'] as const;
export type FieldEntity = typeof entities[number];
export const types = ['text','textarea','number','currency','date','datetime','email','phone','checkbox','select','multiselect','radio','url'] as const;
export type FieldValue = string | boolean | string[] | null;
export interface Definition {id:string;key:string;label:string;help:string;field_type:typeof types[number];status:'active'|'archived';required:boolean;searchable:boolean;filterable:boolean;reportable:boolean;default_value:FieldValue;version:number;options:{id:string;key:string;label:string;status:'active'|'archived'}[]}
export interface Section {id:string;title:string;status?:'active'|'archived';fields:{key:string;visible:boolean}[]}
export interface FormSchema {entity:FieldEntity;version:number;builtins:{key:string;label:string;required:boolean}[];definitions:Definition[];sections:Section[]}
export function fieldError(field:Definition,value:FieldValue|undefined):string|undefined {
 if(value===undefined||value===null||value===''||(Array.isArray(value)&&!value.length))return field.required?'A value is required.':undefined;
 if(field.field_type==='checkbox')return typeof value==='boolean'?undefined:'Choose Yes or No.';
 if(field.field_type==='multiselect')return Array.isArray(value)&&value.length<=50&&new Set(value).size===value.length&&value.every(v=>field.options.some(o=>o.id===v))?undefined:'Choose up to 50 distinct options.';
 if(typeof value!=='string')return 'Enter a valid value.';
 if(value.length>(field.field_type==='textarea'?10000:1000))return 'Value is too long.';
 switch(field.field_type){
  case 'number':return /^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,6})?$/.test(value)?undefined:'Use a decimal with at most 18 integer digits and 6 decimal places.';
  case 'currency':return /^(?:0|[1-9]\d{0,17})$/.test(value)?undefined:'Enter a non-negative whole number of INR minor units.';
  case 'date':return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!value.startsWith('0000')&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value?undefined:'Choose a valid calendar date.';
  case 'datetime':return Number.isFinite(Date.parse(value))?undefined:'Choose a valid UTC date and time.';
  case 'email':return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&value.length<=254?undefined:'Enter a valid email address.';
  case 'phone':return value.startsWith('+')&&parsePhoneNumberFromString(value)?.isValid()?undefined:'Enter a valid international phone number.';
  case 'url':try {const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?undefined:'Use an HTTP or HTTPS URL without credentials.';}catch{return 'Enter a valid HTTP or HTTPS URL.';}
  case 'select':case 'radio':return field.options.some(o=>o.id===value)?undefined:'Choose an available option.';
 }
}
export function formSections(schema:FormSchema):Section[] {
 const placed=new Set(schema.sections.flatMap(s=>s.fields.map(f=>f.key)));
 const missing=[...schema.builtins,...schema.definitions.filter(f=>f.status==='active')].filter(f=>!placed.has(f.key)).map(f=>({key:f.key,visible:true}));
 return [...schema.sections,...(missing.length?[{id:'unplaced',title:schema.sections.length?'Additional information':'',fields:missing}]:[])];
}
