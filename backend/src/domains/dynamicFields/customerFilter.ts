import { DynamicFieldsService } from './service.js';
import type { PostgresDatabase } from '../../postgres/database.js';
import { validateFieldValue,type FieldType,type FieldEntity } from './policy.js';
import { AppError } from '../../utils/AppError.js';
export interface CustomerFieldFilter {key:string;value:string;operator:'eq'|'gte'|'lte'}
export async function validateCustomerFilter(db:PostgresDatabase,org:string,filter:CustomerFieldFilter,entity:FieldEntity='customer') {
 if(!['eq','gte','lte'].includes(filter.operator)||filter.key.length>64||filter.value.length>1000)throw new AppError('Invalid custom filter',400);
 const field=await new DynamicFieldsService(db).definition(org,entity,filter.key);
 if(!field||field.status!=='active'||!field.filterable||field.field_type==='multiselect')throw new AppError('Unsupported or unavailable custom filter',400);
 if(filter.operator!=='eq'&&!['number','currency','date','datetime'].includes(field.field_type))throw new AppError('Comparison requires a numeric or date field',400);
 if(field.field_type==='checkbox'&&!['true','false'].includes(filter.value))throw new AppError('Invalid boolean filter',400);
 const normalized=validateFieldValue(field,field.field_type==='checkbox'?filter.value==='true':filter.value,true);
 if(normalized===null)throw new AppError('Filter value is required',400);
 return {...filter,value:String(normalized),fieldType:field.field_type};
}
export function customerPredicate(filter?:CustomerFieldFilter&{fieldType:FieldType},entity:'customer'|'lead'='customer') {
 const table=entity==='lead'?'crm_leads':'customers',phone=entity==='lead'?'phone':'normalized_phone';
 const status=entity==='lead'?"status IN ('active','converted','lost','archived')":"status<>'merged'";
 const columns:Partial<Record<FieldType,[string,string]>>={number:['numeric_value','numeric'],currency:['money_minor','bigint'],date:['date_value','date'],datetime:['timestamp_value','timestamptz'],checkbox:['boolean_value','boolean'],select:['option_id','uuid'],radio:['option_id','uuid']};
 const [column,cast]=filter?(columns[filter.fieldType]??['text_value','text']):['text_value','text'];
 const op=filter?.operator==='gte'?'>=':filter?.operator==='lte'?'<=':'=';
 return `organization_id=$1 AND ${status}
 AND ($2::text IS NULL OR name ILIKE '%'||$2||'%' OR ${phone} ILIKE '%'||$2||'%' OR EXISTS (
  SELECT 1 FROM custom_field_values v JOIN custom_field_definitions d ON d.id=v.definition_id AND d.organization_id=v.organization_id
  WHERE v.organization_id=${table}.organization_id AND v.entity_type='${entity}' AND v.entity_id=${table}.id
   AND d.status='active' AND d.searchable AND v.text_value ILIKE '%'||$2||'%'))
 AND ($3::text IS NULL OR EXISTS (
  SELECT 1 FROM custom_field_values v JOIN custom_field_definitions d ON d.id=v.definition_id AND d.organization_id=v.organization_id
  WHERE v.organization_id=${table}.organization_id AND v.entity_type='${entity}' AND v.entity_id=${table}.id
   AND d.key=$3 AND d.status='active' AND d.filterable AND v.${column} ${op} $4::${cast}))`;
}
