import { useQuery,useMutation,useQueryClient } from '@tanstack/react-query';
import { client } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
export default function NotificationPreferences(){
 const {user,activeTenantId}=useAppStore(),cache=useQueryClient(),key=['notification-preferences',user?.id,activeTenantId];
 const query=useQuery({queryKey:key,queryFn:async()=>(await client.get<{data:{organizationChanges:boolean}}>('/notifications/preferences')).data.data});
 const save=useMutation({mutationFn:(organizationChanges:boolean)=>client.put('/notifications/preferences',{organizationChanges}),onMutate:organizationChanges=>{cache.setQueryData(key,{organizationChanges});},onError:()=>void cache.invalidateQueries({queryKey:key}),onSuccess:()=>cache.invalidateQueries({queryKey:key})});
 return <section className="panel page-stack"><h2 className="font-semibold">Notification preferences</h2><p>Optional in-app updates for your own workspace access. This setting applies to this organization only. Account recovery emails are unchanged.</p>{query.isPending&&<p role="status">Loading preferences…</p>}{query.data&&<label className="flex items-center gap-3"><input type="checkbox" checked={query.data.organizationChanges} disabled={save.isPending} onChange={e=>save.mutate(e.target.checked)}/>Organization changes</label>}{(query.isError||save.isError)&&<p role="alert">Preferences could not be saved or loaded. <button onClick={()=>void query.refetch()}>Reload preferences</button></p>}</section>;
}
