import { useQuery,useMutation,useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { client } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
export default function NotificationPreferences(){
 const {user,activeTenantId}=useAppStore(),cache=useQueryClient(),key=['notification-preferences',user?.id,activeTenantId];
 const query=useQuery({queryKey:key,queryFn:async()=>(await client.get<{data:{organizationChanges:boolean;crmAssignments?:boolean}}>('/notifications/preferences')).data.data});
 const scope=JSON.stringify(key),[draft,setDraft]=useState<{scope:string;value:boolean}|null>(null);
 const save=useMutation({mutationFn:(organizationChanges:boolean)=>client.put('/notifications/preferences',{organizationChanges}),onMutate:async organizationChanges=>{await cache.cancelQueries({queryKey:key});cache.setQueryData(key,{...query.data,organizationChanges});},onError:()=>cache.invalidateQueries({queryKey:key}),onSuccess:()=>cache.invalidateQueries({queryKey:key}),onSettled:()=>setDraft(null)});
 const [crmDraft,setCrmDraft]=useState<{scope:string;value:boolean}|null>(null);
 const crmSave=useMutation({mutationFn:(crmAssignments:boolean)=>client.put('/notifications/preferences',{organizationChanges:query.data?.organizationChanges??true,crmAssignments}),onSuccess:()=>cache.invalidateQueries({queryKey:key}),onSettled:()=>setCrmDraft(null)});
 return <section className="panel page-stack"><h2 className="font-semibold">Notification preferences</h2><p>Optional in-app updates for your own workspace access. This setting applies to this organization only. Account recovery emails are unchanged.</p>{query.isPending&&<p role="status">Loading preferences…</p>}{query.data&&<label className="flex items-center gap-3"><input type="checkbox" checked={draft?.scope===scope?draft.value:query.data.organizationChanges} disabled={save.isPending||crmSave.isPending} onChange={e=>{setDraft({scope,value:e.target.checked});save.mutate(e.target.checked);}}/>Organization changes</label>}{query.data&&<label className="flex items-center gap-3"><input type="checkbox" checked={crmDraft?.scope===scope?crmDraft.value:query.data.crmAssignments??true} disabled={crmSave.isPending||save.isPending} onChange={e=>{setCrmDraft({scope,value:e.target.checked});crmSave.mutate(e.target.checked);}}/>CRM assignments (no scheduled reminders)</label>}{(query.isError||save.isError||crmSave.isError)&&<p role="alert">Preferences could not be saved or loaded. <button onClick={()=>void query.refetch()}>Reload preferences</button></p>}</section>;
}
