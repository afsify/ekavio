import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { client } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import type { FieldEntity, FieldValue, FormSchema } from '../components/forms/DynamicForm';
import { fieldError } from '../components/forms/formSchema';

export function useDynamicForm(entity:FieldEntity,id:string|null|undefined,enabled=true) {
 const tenant=useAppStore(s=>s.activeTenantId),branch=useAppStore(s=>s.activeBranchId);
 const scope=[tenant,branch,entity,id??'new'].join(':');
 const [draft,setDraft]=useState<{scope:string;values:Record<string,FieldValue>}>({scope,values:{}});
 const patch=draft.scope===scope?draft.values:{};
 const schema=useQuery({queryKey:['form-schema',tenant,entity],enabled,queryFn:async()=>(await client.get<{data:FormSchema}>(`/forms/${entity}/schema`)).data.data});
 const stored=useQuery({queryKey:['form-values',tenant,branch,entity,id],enabled:enabled&&Boolean(id),queryFn:async()=>(await client.get<{data:Record<string,FieldValue>}>(`/forms/${entity}/values/${id}`)).data.data});
 const defaults=!id?Object.fromEntries(schema.data?.definitions.filter(f=>f.status==='active'&&f.default_value!==null).map(f=>[f.key,f.default_value])??[]):{};
 const values={...defaults,...stored.data,...patch};
 const valid=schema.data?.definitions.filter(f=>f.status==='active').every(f=>!fieldError(f,values[f.key]));
 return {schema:schema.data,values,patch,change:(key:string,value:FieldValue)=>setDraft(p=>({scope,values:{...(p.scope===scope?p.values:{}),[key]:value}})),reset:()=>setDraft({scope,values:{}}),valid:Boolean(valid),ready:!enabled||Boolean(schema.data&&(!id||stored.data)),error:schema.error??stored.error,retry:()=>{void schema.refetch();if(id)void stored.refetch();}};
}
