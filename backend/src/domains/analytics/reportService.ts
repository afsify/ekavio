import type { PoolClient } from 'pg';
import type { PostgresDatabase } from '../../postgres/database.js';
import type { AuthorizationContext } from '../../services/requestContextService.js';
import { AppError } from '../../utils/AppError.js';
import { BranchTimezoneRepository,instantToBranchBusinessDate,nextBusinessDate,branchLocalDateTimeToInstant,instantToBranchLocalDateTime } from '../appointments/timezone.js';
import { DynamicFieldsService } from '../dynamicFields/service.js';
import { validateCustomerFilter,customerPredicate } from '../dynamicFields/customerFilter.js';
import { authorizeReport,canRead,reports,filterSchema,validateRange,csvCell,rupees } from './policy.js';
import { sources } from './queries.js';
export const EXPORT_LIMIT=2000;
export const RESPONSE_BUDGET=5*1024*1024;
export class ReportService {
 constructor(private readonly db:PostgresDatabase,private readonly enabled:(org:string)=>Promise<ReadonlySet<string>>){}
 async catalogue(c:AuthorizationContext){
  const modules=await this.enabled(c.organizationId);
  if(!c.permissions.includes('reports.read'))throw new AppError('Report access denied',403);
  return reports.filter(r=>canRead(c,r.permission,r.module,modules)).map(r=>({...r,scope:sources[r.key].scope,filters:sources[r.key].filters,statuses:sources[r.key].statuses,dateRange:Boolean(sources[r.key].date)}));
 }
 async run(c:AuthorizationContext,key:string,input:unknown,exporting=false){
  const report=authorizeReport(c,key,await this.enabled(c.organizationId)),source=sources[report.key];
  const parsed=filterSchema.safeParse(input);if(!parsed.success)throw new AppError('Invalid report filters',400);
  const f=parsed.data;
  if(!c.branchId)throw new AppError('Select an authorized branch',400);
  if(f.branchId&&f.branchId!==c.branchId)throw new AppError('Report branch must match the selected authorized branch',403);
  for(const k of ['status','customerId','serviceId','staffId','entryType','stockStatus'] as const)if(f[k]&&!source.filters.includes(k))throw new AppError('Filter is not supported by this report',400);
  if(f.status&&!source.statuses.includes(f.status))throw new AppError('Invalid report status',400);
  if(f.entryType&&!(report.key==='stock-movements'?['opening','receive','consume','adjustment_increase','adjustment_decrease','reversal']:['charge','payment','adjustment_increase','adjustment_decrease','reversal']).includes(f.entryType))throw new AppError('Invalid entry type',400);
  if(!source.date&&(f.from||f.to))throw new AppError('This report shows current all-time state, not a period balance',400);
  const timezone=await new BranchTimezoneRepository(this.db).resolve(c.organizationId,c.branchId),today=instantToBranchBusinessDate(new Date(),timezone);
  const to=f.to??today,from=f.from??new Date(Date.parse(to)-29*86400000).toISOString().slice(0,10);
  validateRange(from,to);
  return this.db.transaction(async client=>{
   await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
   await client.query("SET LOCAL statement_timeout='10s'");
   const params:unknown[]=[c.organizationId,c.branchId],where:string[]=[];
   const p=(v:unknown)=>{params.push(v);return '$'+params.length;};
   if(source.date) {
    if(source.date==='attendance_date')where.push(`q.attendance_date BETWEEN ${p(from)}::date AND ${p(to)}::date`);
    else where.push(`q.${source.date}>=${p(branchLocalDateTimeToInstant(from+'T00:00:00',timezone))}::timestamptz AND q.${source.date}<${p(branchLocalDateTimeToInstant(nextBusinessDate(to)+'T00:00:00',timezone))}::timestamptz`);
   }
   if(f.search)where.push(`q.name ILIKE '%'||${p(f.search)}||'%'`);
   if(f.status)where.push(`q.status=${p(f.status)}`);
   if(f.entryType)where.push(`q.entry_type=${p(f.entryType)}`);
   if(f.stockStatus)where.push(f.stockStatus==='low'?'q.is_low_stock AND q.status=\'active\'':f.stockStatus==='out'?'q.quantity::numeric=0 AND q.status=\'active\'':'NOT q.is_low_stock AND q.status=\'active\'');
   for(const [filter,table,column] of [['customerId','customers','customer_id'],['serviceId','services','service_id'],['staffId','memberships','staff_id']] as const)if(f[filter]){
    const owned=await client.query(`SELECT 1 FROM ${table} WHERE id=$1 AND organization_id=$2`,[f[filter],c.organizationId]);
    if(!owned.rowCount)throw new AppError('Report filter resource is unavailable',403);
    if(filter==='staffId'&&!(await client.query('SELECT 1 FROM membership_branch_assignments WHERE membership_id=$1 AND organization_id=$2 AND branch_id=$3',[f[filter],c.organizationId,c.branchId])).rowCount)throw new AppError('Staff filter is not assigned to selected branch',403);
    where.push(`q.${column}=${p(f[filter])}::uuid`);
   }
   if(f.customKey||f.customValue){
    if(!['customers','crm-leads'].includes(report.key)||!f.customKey||f.customValue===undefined)throw new AppError('Choose one complete supported Customer field filter',400);
    const custom=await validateCustomerFilter(this.db,c.organizationId,{key:f.customKey,value:f.customValue,operator:f.customOperator},report.key==='crm-leads'?'lead':'customer');
    // Reuse the accepted typed predicate, remapping its four positional parameters.
    const bindings=['$1',p(null),p(custom.key),p(custom.value)];
    const cp=customerPredicate(custom,report.key==='crm-leads'?'lead':'customer').replace(/\$(\d+)/g,(_m,n:string)=>bindings[Number(n)-1]!);
    where.push(`q.id IN (SELECT id FROM ${report.key==='crm-leads'?'crm_leads':'customers'} WHERE ${cp})`);
   }
   const fields=report.entity?(await new DynamicFieldsService(this.db).definitions(c.organizationId,report.entity,client)).filter(d=>d.status==='active'&&d.reportable):[];
   const columns=[...source.columns,...fields.map(d=>({key:'custom:'+d.key,label:d.label,...(d.field_type==='currency'?{format:'money' as const}:{})}))];
   const selected=f.columns?f.columns.split(','):source.columns.map(col=>col.key);
   if(!selected.length||selected.length>50||new Set(selected).size!==selected.length||selected.some(k=>!columns.some(col=>col.key===k)))throw new AppError('Choose available report columns',400);
   const selectedFields=fields.filter(field=>selected.includes('custom:'+field.key));
   // Worst-case UTF-8/CSV quoting estimate bounds memory before loading dynamic text.
   const customRowBytes=selectedFields.reduce((sum,field)=>sum+(field.field_type==='textarea'?80000:field.field_type==='multiselect'?41000:8000),0);
   const filtered=`WITH q AS (${source.sql}) SELECT * FROM q ${where.length?'WHERE '+where.join(' AND '):''}`;
   // $2 is deliberately typed even for organization-owned sources.
   const bounded=`WITH filtered AS (${filtered}) SELECT * FROM filtered WHERE $2::uuid IS NOT NULL`;
   const statusTotals=source.statuses.map(status=>`,count(*) FILTER(WHERE status='${status}')::text AS ${status}_records`).join('');
   const stockTotals=report.key==='inventory'?",count(*) FILTER(WHERE status='active' AND is_low_stock)::text AS low_stock_items,count(*) FILTER(WHERE status='active' AND quantity::numeric=0)::text AS out_of_stock_items":'';
   const totals=(await client.query(`WITH filtered AS (${filtered}) SELECT count(*)::text AS records,COALESCE(max(octet_length(to_jsonb(filtered)::text)),0)::text AS maximum_record_bytes ${statusTotals}${stockTotals}${report.key==='dues-balances'?",COALESCE(sum(GREATEST(balance_minor::numeric,0)),0)::text AS outstanding_minor,count(*) FILTER(WHERE balance_minor::numeric>0)::text AS customers_owing":report.key==='dues-journal'?",COALESCE(sum(effect_minor::numeric),0)::text AS net_effect_minor":''} FROM filtered WHERE $2::uuid IS NOT NULL`,params)).rows[0]!;
   // Also measure legacy/canonical text and branch arrays in SQL, before loading rows.
   const maximumRowBytes=Math.max(8000,Number(totals.maximum_record_bytes)*2)+customRowBytes;
   delete totals.maximum_record_bytes;
   const rowBudget=Math.min(EXPORT_LIMIT,Math.floor((RESPONSE_BUDGET-131072)/maximumRowBytes));
   if(rowBudget<1)throw new AppError('A matching record exceeds the response budget; narrow your filters',400);
   if(!exporting&&f.limit>rowBudget)throw new AppError('Selected columns are too wide; reduce page size or select fewer columns',400);
   if(exporting&&Number(totals.records)>rowBudget)throw new AppError(`Export exceeds the ${rowBudget}-row budget for these columns; narrow filters or select fewer columns`,400);
   const rowParams=[...params,exporting?EXPORT_LIMIT:f.limit,exporting?0:(f.page-1)*f.limit];
   const raw=(await client.query(`${bounded} ORDER BY ${source.date?'"'+source.date+'" DESC,':''} id LIMIT $${params.length+1} OFFSET $${params.length+2}`,rowParams)).rows;
   if(report.entity&&selectedFields.length&&raw.length)await this.customValues(client,c.organizationId,report.entity,selectedFields,raw,timezone);
   const rows=raw.map(row=>Object.fromEntries(selected.map(k=>{
    let v=row[k]??null;
    if(v instanceof Date)v=instantToBranchLocalDateTime(v,timezone).replace('T',' ');
    if(Array.isArray(v))v=v.join('; ');
    return [k,v];
   })));
   const choices:Record<string,{id:string;label:string}[]>={};
   if(!exporting)for(const [filter,column,label] of [['customerId','customer_id','name'],['serviceId','service_id','service'],['staffId','staff_id',report.key==='attendance'?'name':'staff']] as const)if(source.filters.includes(filter))choices[filter]=(await client.query(`WITH q AS (${source.sql}) SELECT DISTINCT ${column} AS id,${label} AS label FROM q WHERE ${column} IS NOT NULL AND $2::uuid IS NOT NULL ORDER BY label,id LIMIT 100`,[c.organizationId,c.branchId])).rows;
   const response={report:report.label,key:report.key,scope:source.scope,timezone,generatedAt:new Date().toISOString(),filters:{...f,...(source.date?{from,to}:{})},columns:columns.map(col=>({...col,selected:selected.includes(col.key)})),choices,rows,summary:totals,page:f.page,limit:f.limit,total:Number(totals.records)};
   if(!exporting){if(Buffer.byteLength(JSON.stringify(response),'utf8')>RESPONSE_BUDGET)throw new AppError('Report exceeds 5 MiB; narrow filters or select fewer columns',400);return response;}
   await client.query('INSERT INTO report_export_events(organization_id,actor_user_id,report_key,row_count) VALUES($1,$2,$3,$4)',[c.organizationId,c.userId,report.key,rows.length]);
   const headers=selected.map(k=>columns.find(col=>col.key===k)!.label);
   const relationshipFilters=[['customerId','Customer filter','name'],['serviceId','Service filter','service'],['staffId','Staff filter',report.key==='attendance'?'name':'staff']].filter(([key])=>f[key as 'customerId'|'serviceId'|'staffId']).map(([,label,column])=>[label,String(raw[0]?.[column!]??'Selected resource (no matching records)')]);
   const metadata=[['Report',report.label],['Scope',source.scope==='organization'?'Organization-owned records':'Selected branch'],['Timezone',timezone],['Generated',response.generatedAt],...(source.date?[['From business date',from],['To business date',to]]:[]),...relationshipFilters,...Object.entries(f).filter(([k,v])=>v!==undefined&&v!==''&&['search','status','entryType','stockStatus','customKey','customValue','customOperator'].includes(k)).map(([k,v])=>[k,String(v)]),[]];
   const csv=[...metadata,headers,...rows.map(row=>selected.map(k=>row[k]!==null&&columns.find(col=>col.key===k)?.format==='money'?rupees(String(row[k])):row[k]))].map(row=>row.map(csvCell).join(',')).join('\r\n');
   if(Buffer.byteLength(csv,'utf8')>RESPONSE_BUDGET)throw new AppError('Export exceeds 5 MiB; narrow your filters',400);
   return {...response,csv:'\uFEFF'+csv+'\r\n',filename:`ekavio-${report.key}-${today}.csv`};
  });
 }
 private async customValues(client:PoolClient,org:string,entity:string,fields:{id:string;key:string}[],rows:Record<string,unknown>[],timezone:string){
  const values=(await client.query(`SELECT v.entity_id,d.key,d.field_type,CASE d.field_type
   WHEN 'currency' THEN v.money_minor::text WHEN 'number' THEN v.numeric_value::text WHEN 'date' THEN v.date_value::text WHEN 'datetime' THEN v.timestamp_value::text WHEN 'checkbox' THEN CASE WHEN v.boolean_value THEN 'Yes' ELSE 'No' END
   WHEN 'select' THEN o.label WHEN 'radio' THEN o.label WHEN 'multiselect' THEN (SELECT string_agg(opt.label,'; ' ORDER BY opt.position,opt.id) FROM custom_field_selected_options s JOIN custom_field_options opt ON opt.id=s.option_id AND opt.organization_id=s.organization_id AND opt.definition_id=s.definition_id WHERE s.organization_id=v.organization_id AND s.entity_type=v.entity_type AND s.entity_id=v.entity_id AND s.definition_id=v.definition_id)
   ELSE v.text_value END AS value FROM custom_field_values v JOIN custom_field_definitions d ON d.id=v.definition_id AND d.organization_id=v.organization_id LEFT JOIN custom_field_options o ON o.id=v.option_id AND o.definition_id=v.definition_id AND o.organization_id=v.organization_id WHERE v.organization_id=$1 AND v.entity_type=$2 AND v.entity_id=ANY($3::uuid[]) AND v.definition_id=ANY($4::uuid[])`,[org,entity,rows.map(r=>r.id),fields.map(f=>f.id)])).rows;
  const map=new Map(rows.map(row=>[String(row.id),row]));
  for(const value of values){const row=map.get(String(value.entity_id));if(row)row['custom:'+value.key]=value.field_type==='datetime'&&value.value?instantToBranchLocalDateTime(new Date(value.value),timezone).replace('T',' '):value.value;}
 }
}
