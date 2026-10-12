import { useId, type ReactNode } from 'react';
import { PhoneInput } from '../ui/PhoneInput';
import { exactRupees } from '../analytics/contracts';
import { fieldError,formSections, type Definition, type FieldValue, type FormSchema } from './formSchema';
export type { Definition, FieldValue, FieldEntity, FormSchema, Section } from './formSchema';
function FieldControl({field,value,onChange,readOnly=false}:{field:Definition;value:FieldValue|undefined;onChange:(v:FieldValue)=>void;readOnly?:boolean}) {
 const id=useId(),help=id+'-help',errorId=id+'-error',error=readOnly?undefined:fieldError(field,value);
 const string=typeof value==='string'?value:'';
 const options=field.options.filter(o=>o.status==='active'||(Array.isArray(value)?value.includes(o.id):value===o.id));
 if(readOnly) {
  if(!hasValue(value))return null;
  const display=['select','radio','multiselect'].includes(field.field_type)?(Array.isArray(value)?value:[value]).map(v=>field.options.find(o=>o.id===v)?.label??'Unavailable option').join(', '):typeof value==='boolean'?(value?'Yes':'No'):string;
  return <dl className="field dynamic-value min-w-0"><dt>{field.label}{field.status==='archived'?' (archived)':''}</dt><dd className="whitespace-pre-wrap break-words">{field.field_type==='currency'&&/^\d+$/.test(string)?<><span>{exactRupees(string)}</span><small className="muted block">{string} INR minor units</small></>:display}</dd></dl>;
 }
 const description=[field.help?help:null,error?errorId:null].filter(Boolean).join(' ')||undefined;
 const common={id,required:field.required,'aria-describedby':description,'aria-invalid':Boolean(error),className:'w-full min-w-0 rounded-lg border p-3'};
 let control:ReactNode;
 switch(field.field_type) {
  case 'phone': control=<PhoneInput label={field.label} value={string} required={field.required} descriptionId={description} invalid={Boolean(error)} onChange={onChange}/>;break;
  case 'textarea': control=<textarea {...common} maxLength={10000} rows={4} value={string} onChange={e=>onChange(e.target.value||null)}/>;break;
  case 'checkbox': control=<input {...common} required={false} style={{width:20,minHeight:20}} type="checkbox" checked={value===true} onChange={e=>onChange(e.target.checked)}/>;break;
  case 'select': control=<select {...common} value={string} onChange={e=>onChange(e.target.value||null)}><option value="">Select an option</option>{options.map(o=><option key={o.id} value={o.id} disabled={o.status==='archived'}>{o.label}{o.status==='archived'?' (archived)':''}</option>)}</select>;break;
  case 'radio': case 'multiselect': control=<fieldset className="dynamic-choices page-stack" aria-describedby={description} aria-invalid={Boolean(error)}><legend>{field.label}{field.required?' *':''}</legend>{options.map(o=><label key={o.id} className="flex min-h-[44px] min-w-0 items-center gap-2"><input type={field.field_type==='radio'?'radio':'checkbox'} name={id} style={{width:20,minHeight:20}} className="shrink-0" disabled={o.status==='archived'} checked={field.field_type==='radio'?value===o.id:Array.isArray(value)&&value.includes(o.id)} required={field.field_type==='radio'&&field.required} aria-describedby={description} onChange={e=>onChange(field.field_type==='radio'?o.id:e.target.checked?[...(Array.isArray(value)?value:[]),o.id]:(Array.isArray(value)?value:[]).filter(v=>v!==o.id))}/><span className="min-w-0 break-words">{o.label}{o.status==='archived'?' (archived)':''}</span></label>)}</fieldset>;break;
  case 'datetime': control=<input {...common} type="datetime-local" step="0.001" value={string&&Number.isFinite(Date.parse(string))?new Date(string).toISOString().slice(0,23):''} onChange={e=>onChange(e.target.value?(e.target.value.length===16?e.target.value+':00':e.target.value)+'Z':null)}/>;break;
  default: control=<input {...common} type={['email','url','date'].includes(field.field_type)?field.field_type:'text'} inputMode={['number','currency'].includes(field.field_type)?'decimal':undefined} maxLength={1000} value={string} onChange={e=>onChange(e.target.value||null)}/>;
 }
 return <div className="field min-w-0 break-words">{!['phone','radio','multiselect'].includes(field.field_type)&&<label htmlFor={id}>{field.label}{field.required?' *':''}{field.field_type==='currency'?' (INR minor units)':''}{field.field_type==='datetime'?' (UTC)':''}</label>}{control}{field.help&&<p id={help} className="muted break-words">{field.help}</p>}{error&&<p id={errorId} role="alert" className="error-text">{error}</p>}</div>;
}
const hasValue=(value:FieldValue|undefined)=>value!==undefined&&value!==null&&value!==''&&(!Array.isArray(value)||value.length>0);
function FormSection({title,children}:{title:string;children:ReactNode[]}) {
 const id=useId();
 return children.length?<section className="dynamic-section page-stack min-w-0" aria-labelledby={title?id:undefined}>{title&&<h3 id={id} className="font-semibold break-words">{title}</h3>}{children}</section>:null;
}
export function DynamicForm({schema,values,onChange,builtins={},readOnly=false}:{schema:FormSchema;values:Record<string,FieldValue>;onChange?:(key:string,value:FieldValue)=>void;builtins?:Record<string,ReactNode>;readOnly?:boolean}) {
 const sections=formSections(schema),displayed=new Set<string>();
 const content=sections.filter(s=>s.status!=='archived').map(section=>{
  const children=section.fields.flatMap(placement=>{
  const field=schema.definitions.find(f=>f.key===placement.key);
  if(field) {
   if(!(readOnly||placement.visible||field.required)||!(readOnly?hasValue(values[field.key]):field.status==='active'))return [];
   displayed.add(field.key);
   return [<FieldControl key={field.key} field={field} value={values[field.key]} readOnly={readOnly} onChange={value=>onChange?.(field.key,value)}/>];
  }
  return (placement.visible||schema.builtins.find(b=>b.key===placement.key)?.required)&&builtins[placement.key]?[<div className="min-w-0" key={placement.key}>{builtins[placement.key]}</div>]:[];
  });
  return <FormSection key={section.id} title={section.title}>{children}</FormSection>;
 });
 // Presentation archival/visibility never deletes or authorizes record history.
 const history=readOnly?schema.definitions.filter(f=>!displayed.has(f.key)&&hasValue(values[f.key])).map(field=><FieldControl key={field.key} field={field} value={values[field.key]} readOnly onChange={()=>{}}/>):[];
 return <div className="page-stack min-w-0" data-dynamic-form>{content}{history.length>0&&<FormSection title="Retained information">{history}</FormSection>}</div>;
}
