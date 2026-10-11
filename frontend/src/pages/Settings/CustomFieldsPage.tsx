import { isAxiosError } from 'axios';
import { useOperationalScope } from '../../hooks/useOperationalContext';
import { FieldCatalogue } from '../../components/forms/FieldCatalogue';
import { FieldDefinitionEditor, FieldDefinitionSummary } from '../../components/forms/FieldDefinitionEditor';
import { blankDefinition, entityNames } from '../../components/forms/fieldDefinitionUtils';
import { ErrorState, Skeleton } from '../../components/ui/WorkspacePrimitives';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '../../api/client';
import { getErrorMessage } from '../../api/errors';
import { useAppStore } from '../../store/useAppStore';
import { useDynamicForm } from '../../hooks/useDynamicForm';
import { AdvancedModal } from '../../components/ui/AdvancedModal';
import { Input } from '../../components/ui/Input';
import { DynamicForm } from '../../components/forms/DynamicForm';
import { entities, formSections, type Definition, type FieldEntity, type Section } from '../../components/forms/formSchema';

const move=<T,>(list:T[],index:number,delta:number)=>{const copy=[...list];if(index+delta>=0&&index+delta<copy.length)[copy[index],copy[index+delta]]=[copy[index+delta],copy[index]];return copy;};
export default function CustomFieldsPage() {
 const scope=useOperationalScope();
 return <CustomFieldsWorkspace key={JSON.stringify(scope)}/>;
}
function CustomFieldsWorkspace() {
 const [entity,setEntity]=useState<FieldEntity>('customer'),[editing,setEditing]=useState<Definition|null>(null),[layout,setLayout]=useState<Section[]|null>(null),[preview,setPreview]=useState<'desktop'|'mobile'|null>(null);
 const form=useDynamicForm(entity,null),cache=useQueryClient(),manage=useAppStore(s=>s.user?.permissions?.includes('fields.manage'));
 const schema=form.schema;
 const [inspecting,setInspecting]=useState<Definition|null>(null);
 const refresh=async()=>{await cache.invalidateQueries({queryKey:['form-schema']});await cache.invalidateQueries({queryKey:['form-values']});};
 const saveLayout=useMutation({mutationFn:async(reset:boolean)=>{
  const sections=(reset?[{id:crypto.randomUUID(),title:'',fields:[...schema!.builtins,...schema!.definitions.filter(f=>f.status==='active')].map(f=>({key:f.key,visible:true}))}]:layout??formSections(schema!)).map(s=>({...s,id:s.id==='unplaced'?crypto.randomUUID():s.id,title:s.title||'General'}));
  return client[reset?'post':'put'](`/forms/${entity}/layout${reset?'/reset':''}`,{version:schema!.version,sections});
 },onSuccess:async()=>{await refresh();setLayout(null);}});
 const sections=layout??(schema?formSections(schema):[]);
 const editLayout=(operation:(s:Section[])=>Section[])=>setLayout(operation(sections.map(s=>({...s,fields:s.fields.map(f=>({...f}))}))));
 const error=saveLayout.error??form.error;
 const denied=isAxiosError(error)&&error.response?.status===403;
 const names=new Map([...(schema?.builtins??[]),...(schema?.definitions??[])].map(f=>[f.key,f.label]));
 return <div className="page-stack dynamic-fields-admin"><header className="page-heading"><div><h1>Data & Forms</h1><p>Organization fields inherit the record’s permissions. Do not store credentials or differently restricted sensitive information here.</p></div></header>
  <label className="field">Record type<select value={entity} onChange={e=>{setEntity(e.target.value as FieldEntity);setLayout(null);setEditing(null);setPreview(null);setInspecting(null);saveLayout.reset();}}>{entities.map(e=><option key={e} value={e}>{entityNames[e]}</option>)}</select></label>
  {error&&<ErrorState title={denied?'Configuration access denied':'Form configuration unavailable'} message={getErrorMessage(error,'Unable to load current configuration.')} retry={form.retry} retryLabel="Reload configuration"/>}
  {!schema?(!error&&<Skeleton label="Loading form schema…"/>):denied?null:<><div className="record-actions"><button className="quiet-button" onClick={()=>setPreview('desktop')}>Desktop preview</button><button className="quiet-button" onClick={()=>setPreview('mobile')}>Mobile preview</button></div>
   <FieldCatalogue definitions={schema.definitions} manage={Boolean(manage)} onAdd={()=>setEditing(blankDefinition())} onEdit={field=>setEditing({...field,options:field.options.map(option=>({...option}))})} onInspect={setInspecting}/>
   <h2 className="font-semibold">Form layout</h2><p className="muted">One shared create/edit/view ordering. Required built-ins and active required custom fields stay visible. New fields appear in Additional information until placed.</p>
   {sections.map((section,index)=><section className="panel page-stack" key={section.id}><Input label={`Section ${index+1} title`} disabled={!manage} maxLength={100} value={section.title} onChange={e=>editLayout(s=>s.map((x,i)=>i===index?{...x,title:e.target.value}:x))}/><label className="field">Section {index+1} status<select disabled={!manage||section.fields.length>0} value={section.status??'active'} onChange={e=>editLayout(s=>s.map((x,i)=>i===index?{...x,status:e.target.value as 'active'|'archived'}:x))}><option value="active">Active</option><option value="archived">Archived (move all fields first)</option></select></label>{manage&&<div className="record-actions"><button className="quiet-button" disabled={index===0} onClick={()=>editLayout(s=>move(s,index,-1))}>Move section {index+1} up</button><button className="quiet-button" disabled={index===sections.length-1} onClick={()=>editLayout(s=>move(s,index,1))}>Move section {index+1} down</button></div>}
    {section.fields.map((placement,position)=>{const required=schema.builtins.some(b=>b.key===placement.key&&b.required)||schema.definitions.some(f=>f.key===placement.key&&f.required&&f.status==='active');return <div className="page-stack border-t pt-3" key={placement.key}><p>{names.get(placement.key)??placement.key}</p><div className="flex flex-wrap gap-2">{manage&&<><button className="quiet-button" disabled={!position} onClick={()=>editLayout(s=>s.map((x,i)=>i===index?{...x,fields:move(x.fields,position,-1)}:x))}>Move {names.get(placement.key)} up</button><button className="quiet-button" disabled={position===section.fields.length-1} onClick={()=>editLayout(s=>s.map((x,i)=>i===index?{...x,fields:move(x.fields,position,1)}:x))}>Move {names.get(placement.key)} down</button><label>Section for {names.get(placement.key)}<select value={section.id} onChange={e=>editLayout(s=>s.map(x=>({...x,fields:x.id===e.target.value?[...x.fields,placement]:x.fields.filter(f=>f.key!==placement.key)})))}>{sections.filter(s=>s.status!=='archived').map((s,i)=><option key={s.id} value={s.id}>{s.title||`Section ${i+1}`}</option>)}</select></label></>}<label className="flex items-center gap-2"><input type="checkbox" checked={placement.visible||required} disabled={!manage||required} onChange={e=>editLayout(s=>s.map(x=>({...x,fields:x.fields.map(f=>f.key===placement.key?{...f,visible:e.target.checked}:f)})))}/>Visible{required?' (required)':''}</label></div></div>;})}
   </section>)}
   {manage&&<div className="record-actions"><button className="quiet-button" disabled={sections.length>=20} onClick={()=>editLayout(s=>[...s,{id:crypto.randomUUID(),title:'New section',fields:[]}])}>Add section</button><button className="action-link" disabled={saveLayout.isPending} onClick={()=>saveLayout.mutate(false)}>Save layout</button><button className="quiet-button" disabled={saveLayout.isPending} onClick={()=>{if(window.confirm('Reset to the default layout? Field definitions and values are preserved.'))saveLayout.mutate(true);}}>Reset default layout</button></div>}
  </>}
  {editing&&<FieldDefinitionEditor key={entity+':'+(editing.id||'new')} entity={entity} initial={editing} manage={Boolean(manage)} definitions={schema?.definitions??[]} onSaved={refresh} onClose={()=>setEditing(null)}/>}
  <AdvancedModal isOpen={Boolean(inspecting)} onClose={()=>setInspecting(null)} title="Field definition" presentation="drawer" size="xl">{inspecting&&<FieldDefinitionSummary field={inspecting}/>}</AdvancedModal>
  <AdvancedModal isOpen={Boolean(preview)} onClose={()=>setPreview(null)} title={`${preview==='mobile'?'Mobile':'Desktop'} form preview`}>{schema&&<div className="mx-auto max-w-full" style={{width:preview==='mobile'?390:undefined}}><p className="muted">Preview only; nothing is saved.</p><DynamicForm schema={{...schema,sections}} values={form.values} onChange={form.change} builtins={Object.fromEntries(schema.builtins.map(b=>[b.key,<Input key={b.key} label={b.label} required={b.required} disabled placeholder="Built-in field"/>]))}/></div>}</AdvancedModal>
 </div>;
}
