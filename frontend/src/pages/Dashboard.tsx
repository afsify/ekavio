import { useQuery,useMutation,useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { client } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { visibleDestinations } from '../components/layout/navigation';
import { arrangeWidgets,exactRupees,type DashboardData } from '../components/analytics/contracts';
export default function Dashboard() {
  const { user, entitlements, activeTenantId, activeBranchId, isPlatformOperator } = useAppStore();
  const permissions = user?.permissions ?? [];
  const items = visibleDestinations(permissions, entitlements, isPlatformOperator);
  const stats = useQuery({ queryKey: ['dashboardStats',user?.id,activeTenantId,activeBranchId,permissions,entitlements],staleTime:30_000,queryFn: async () => (await client.get<{data:DashboardData}>('/analytics/dashboard')).data.data });
  const [customize,setCustomize]=useState(false),cache=useQueryClient();
  const scope=JSON.stringify([user?.id,activeTenantId,activeBranchId,permissions,entitlements]);
  const [draft,setDraft]=useState<{scope:string;layout:DashboardData['layout']}|null>(null);
  const save=useMutation({mutationFn:(layout:DashboardData['layout'])=>client.put('/analytics/dashboard/layout',layout),onMutate:async layout=>{await cache.cancelQueries({queryKey:['dashboardStats',user?.id,activeTenantId,activeBranchId]});cache.setQueriesData<DashboardData>({queryKey:['dashboardStats',user?.id,activeTenantId,activeBranchId]},old=>old?{...old,layout}:old);},onError:()=>cache.invalidateQueries({queryKey:['dashboardStats']}),onSuccess:()=>cache.invalidateQueries({queryKey:['dashboardStats']}),onSettled:()=>setDraft(null)});
  const data=stats.data?{...stats.data,layout:draft?.scope===scope?draft.layout:stats.data.layout}:undefined;
  // React restores controlled inputs before asynchronous mutation notifications.
  // Update the scoped draft inside the input event, then revalidate server authority.
  const persist=(layout:DashboardData['layout'])=>{setDraft({scope,layout});save.mutate(layout);};
  const order=data?[...data.layout.order,...data.widgets.map(w=>w.key).filter(k=>!data.layout.order.includes(k))]:[];
  const move=(key:string,direction:number)=>{if(!data)return;const next=[...order],index=next.indexOf(key),other=index+direction;if(other<0||other>=next.length)return;[next[index],next[other]]=[next[other]!,next[index]!];persist({...data.layout,order:next});};
  const membership = user?.memberships?.find((item) => item.organizationId === activeTenantId);
  return <div className="page-stack"><header className="page-heading"><div><h1>Welcome, {user?.name ?? 'team member'}</h1><p>{membership?.orgName ?? 'Your workspace'} · Your branch at a glance</p></div><Link className="quiet-button" to="/settings?section=appearance">Appearance</Link></header>
    {stats.isLoading && <p role="status">Loading current activity…</p>}
    {stats.isError && <div className="panel"><p role="alert">Current activity could not be loaded.</p><button className="quiet-button mt-3" onClick={() => void stats.refetch()}>Retry activity</button></div>}
    {data&&<><p className="muted">Business date {data.businessDate} · {data.timezone}</p><div className="record-actions"><button className="quiet-button" aria-expanded={customize} onClick={()=>setCustomize(!customize)}>Customize dashboard</button>{customize&&<button className="quiet-button" disabled={save.isPending} onClick={()=>persist({order:[],hidden:[],version:data.layout.version})}>Reset layout</button>}</div>{save.isError&&<p role="alert">Layout changed or could not be saved. Reload activity before retrying.</p>}{customize&&<section className="panel page-stack" aria-label="Dashboard customization">{order.map((key,index)=>{const w=data.widgets.find(w=>w.key===key)!;return <div key={key} className="record-actions"><label className="flex gap-2"><input type="checkbox" checked={!data.layout.hidden.includes(key)} disabled={save.isPending} onChange={e=>persist({...data.layout,order,hidden:e.target.checked?data.layout.hidden.filter(k=>k!==key):[...data.layout.hidden,key]})}/>{w.label}</label><button className="quiet-button" disabled={save.isPending||index===0} aria-label={`Move ${w.label} up`} onClick={()=>move(key,-1)}>Up</button><button className="quiet-button" disabled={save.isPending||index===order.length-1} aria-label={`Move ${w.label} down`} onClick={()=>move(key,1)}>Down</button></div>;})}</section>}<section className="catalogue-grid" aria-label="Workspace metrics">{arrangeWidgets(data.widgets,order,data.layout.hidden).map(w=><Link className="panel record-card" to={w.path} key={w.key}><h2>{w.label}</h2><p className="text-3xl font-bold">{w.format==='money'?exactRupees(w.value):w.value}</p><p className="muted">{w.description}</p></Link>)}</section>{data.widgets.length===0&&<p>No metrics are available for your current access. Your personal Settings remain available.</p>}</>}
    <section className="panel"><h2 className="font-semibold">Your workspace</h2><p className="muted mt-2">Start with customers and services, then open an enabled workflow. Access is controlled by your organization and role.</p><div className="record-actions">{items.filter((item) => item.group === 'Workspace' && item.path !== '/dashboard').map((item) => <Link className="quiet-button" key={item.path} to={item.path}>{item.name}</Link>)}</div></section>
    <section><h2 className="font-semibold mb-3">Operations</h2><div className="catalogue-grid">{items.filter((item) => item.group === 'Operations').map((item) => <Link key={item.path} className="panel record-card" to={item.path}><h2>{item.name}</h2><p className="muted">Open {item.name}</p></Link>)}</div>{!items.some((item) => item.group === 'Operations') && <p className="muted mt-3">No operational workflows are available for your current access. Ask your administrator for help.</p>}</section>
  </div>;
}
