import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { client } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import { hasEntitlement } from '../../commercial/catalogue';
export function CustomerCrmContext({customerId}:{customerId:string}){
 const {user,entitlements,activeTenantId,activeBranchId}=useAppStore(),enabled=hasEntitlement(entitlements,'crm')&&Boolean(user?.permissions?.includes('crm.read'));
 const query=useQuery({queryKey:['crm',activeTenantId,activeBranchId,'customer',customerId],enabled,queryFn:async()=>(await client.get<{data:{id:string;name:string;stage_name:string}[]}>('/crm/customers/'+customerId+'/leads')).data.data});
 if(!enabled)return null;
 return <section className="page-stack"><h3 className="font-semibold">CRM origin · selected branch</h3>{query.isPending?<p>Loading CRM context…</p>:query.isError?<p role="alert">CRM context unavailable. <button onClick={()=>void query.refetch()}>Retry CRM context</button></p>:query.data.length?<><p className="muted">Most recent 10 converted leads. Customer identity remains canonical.</p>{query.data.map(l=><Link className="quiet-button break-words" key={l.id} to={'/crm?lead='+encodeURIComponent(l.id)}>{l.name} · {l.stage_name}</Link>)}</>:<p>No converted CRM leads in this branch.</p>}</section>;
}
