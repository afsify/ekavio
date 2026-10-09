import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SlidersHorizontal, ArrowUp, ArrowDown } from 'lucide-react';
import { client } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { visibleDestinations, navigationGroup } from '../components/layout/navigation';
import { NavigationIcon } from '../components/layout/NavigationIcon';
import { arrangeWidgets, exactRupees, type DashboardData } from '../components/analytics/contracts';
import { ActionCard, AppPage, ErrorState, PageHeader, SectionHeader, Skeleton, StatCard, StatusBadge } from '../components/ui/WorkspacePrimitives';

const attentionKeys = new Set(['crm-overdue','inventory','hr-pending','invitations','purchasing-partial']);
export default function Dashboard() {
  const { user, entitlements, activeTenantId, activeBranchId, isPlatformOperator } = useAppStore();
  const permissions = user?.permissions ?? [];
  const items = visibleDestinations(permissions, entitlements, isPlatformOperator);
  const stats = useQuery({ queryKey: ['dashboardStats', user?.id, activeTenantId, activeBranchId, permissions, entitlements], staleTime: 30_000, queryFn: async ({ signal }) => (await client.get<{ data: DashboardData }>('/analytics/dashboard', { signal })).data.data });
  const [customize, setCustomize] = useState(false);
  const cache = useQueryClient();
  const scope = JSON.stringify([user?.id, activeTenantId, activeBranchId, permissions, entitlements]);
  const [draft, setDraft] = useState<{ scope: string; layout: DashboardData['layout'] } | null>(null);
  const save = useMutation({
    mutationFn: (layout: DashboardData['layout']) => client.put('/analytics/dashboard/layout', layout),
    onMutate: async layout => { await cache.cancelQueries({ queryKey: ['dashboardStats', user?.id, activeTenantId, activeBranchId] }); cache.setQueriesData<DashboardData>({ queryKey: ['dashboardStats', user?.id, activeTenantId, activeBranchId] }, old => old ? { ...old, layout } : old); },
    onError: () => cache.invalidateQueries({ queryKey: ['dashboardStats'] }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ['dashboardStats'] }),
    onSettled: () => setDraft(null),
  });
  const data = stats.data ? { ...stats.data, layout: draft?.scope === scope ? draft.layout : stats.data.layout } : undefined;
  const persist = (layout: DashboardData['layout']) => { if (save.isPending) return; setDraft({ scope, layout }); save.mutate(layout); };
  const allowed = data?.widgets.filter(widget => items.some(item => item.path === widget.path)) ?? [];
  const order = data ? [...data.layout.order.filter(key => allowed.some(widget => widget.key === key)), ...allowed.map(widget => widget.key).filter(key => !data.layout.order.includes(key))] : [];
  const move = (key: string, direction: number) => {
    if (!data) return;
    const next = [...order], index = next.indexOf(key), other = index + direction;
    if (other < 0 || other >= next.length) return;
    [next[index], next[other]] = [next[other]!, next[index]!]; persist({ ...data.layout, order: next });
  };
  const membership = user?.memberships?.find(item => item.organizationId === activeTenantId);
  const branch = membership?.branches.find(item => item.id === activeBranchId);
  const attention = allowed.filter(widget => attentionKeys.has(widget.key) && /^\d+$/.test(widget.value) && BigInt(widget.value) > 0n);
  // Actions are chosen by live permissions, never by trusting a role label.
  const quickPaths = ['/queue','/appointments','/customers','/crm','/hr','/inventory','/staff'];
  const quick = quickPaths.flatMap(path => items.filter(item => item.path === path)).slice(0, 4);
  const arranged = data ? arrangeWidgets(allowed, order, data.layout.hidden) : [];
  const platformItems = items.filter(item => item.operator);
  return <AppPage className="dashboard-workspace"><PageHeader title={`Welcome, ${user?.name ?? 'team member'}`} eyebrow={isPlatformOperator ? 'Workspace overview · operator access available' : 'Workspace overview'} description={`${membership?.orgName ?? 'Your workspace'} · ${branch?.name ?? 'Selected branch'}`} actions={<Link className="quiet-button" to="/settings?section=appearance">Appearance</Link>} />
    <section className="dashboard-intro panel"><div><StatusBadge tone="info">{data ? `Business date ${data.businessDate}` : 'Current workspace'}</StatusBadge><h2>Your work, in one place</h2><p className="muted">Start a permitted workflow or review your branch activity.{data ? ` Dates follow ${data.timezone}.` : ''}</p></div><div className="intro-actions"><button className="quiet-button" aria-expanded={customize} onClick={() => setCustomize(value => !value)}><SlidersHorizontal size={18} aria-hidden="true" />Customize dashboard</button></div></section>
    <section aria-label="Quick actions"><SectionHeader title="Get to work" description="Shortcuts selected from your current workspace access." /><div className="quick-action-grid">{quick.map(item => <ActionCard key={item.path} title={item.name} description={item.path === '/customers' ? 'Find or add a customer record' : item.path === '/hr' ? 'Open your permitted work schedule' : `Open ${item.name.toLowerCase()}`} to={item.path} icon={<NavigationIcon path={item.path} />} />)}</div>{quick.length === 0 && <p className="muted">No operational workflows are available for your current access. Your account settings remain available.</p>}</section>
    {stats.isPending && <Skeleton label="Loading current activity…" rows={4} />}
    {stats.isError && <ErrorState title="Current activity could not be loaded" message="Your shortcuts remain available. Retry to load the latest server summary." retry={() => void stats.refetch()} retryLabel="Retry activity" />}
    {data && <>
      {save.isError && <ErrorState title="Dashboard layout could not be saved" message="The layout may have changed on another device. Reload activity before retrying." retry={() => { save.reset(); void stats.refetch(); }} retryLabel="Reload activity" />}
      {customize && <section className="panel page-stack" aria-label="Dashboard customization"><SectionHeader title="Make this overview yours" description="Hide or reorder authorized widgets. Changes sync to your account." actions={<button className="quiet-button" disabled={save.isPending} onClick={() => persist({ order: [], hidden: [], version: data.layout.version })}>Reset layout</button>} /><ol className="widget-settings">{order.map((key, index) => { const widget = allowed.find(w => w.key === key)!; return <li key={key}><label><input type="checkbox" checked={!data.layout.hidden.includes(key)} disabled={save.isPending} onChange={event => persist({ ...data.layout, order, hidden: event.target.checked ? data.layout.hidden.filter(k => k !== key) : [...data.layout.hidden, key] })} />{widget.label}</label><div><button className="icon-button" disabled={save.isPending || index === 0} aria-label={`Move ${widget.label} up`} onClick={() => move(key,-1)}><ArrowUp size={18} aria-hidden="true" /></button><button className="icon-button" disabled={save.isPending || index === order.length - 1} aria-label={`Move ${widget.label} down`} onClick={() => move(key,1)}><ArrowDown size={18} aria-hidden="true" /></button></div></li>; })}</ol><p role="status" className="muted">{save.isPending ? 'Saving layout…' : 'Use the arrows to reorder on keyboard or touch.'}</p></section>}
      <section aria-label="Workspace metrics"><SectionHeader title="At a glance" description="Server-authorized metrics. Each card states its scope." /><div className="metrics-grid">{arranged.map(widget => <StatCard key={widget.key} label={widget.label} value={widget.format === 'money' ? exactRupees(widget.value) : widget.value} description={widget.description} to={widget.path} />)}</div>{allowed.length === 0 && <div className="panel"><p>No metrics are available for your current access. Your personal Settings remain available.</p></div>}{allowed.length > 0 && arranged.length === 0 && <div className="panel"><p>All your widgets are hidden.</p><button className="quiet-button" onClick={() => setCustomize(true)}>Choose visible widgets</button></div>}</section>
      {attention.length > 0 && <section className="panel attention-panel" aria-label="Attention needed"><SectionHeader title="Needs a look" description="Existing server indicators, not new tasks or predictions." /><ul>{attention.map(widget => <li key={widget.key}><Link to={widget.path}><StatusBadge tone="warning">{widget.value}</StatusBadge><span>{widget.label}</span><span className="muted">Review</span></Link></li>)}</ul></section>}
    </>}
    <section><SectionHeader title="Your workspace" description="Explore the workflows available to you." /><div className="workspace-destinations">{items.filter(item => !item.operator && item.path !== '/dashboard').map(item => <Link className="quiet-button" key={item.path} to={item.path}><NavigationIcon path={item.path} /><span>{item.name}</span><small>{navigationGroup(item)}</small></Link>)}</div></section>
    {platformItems.length > 0 && <section className="panel operator-workspace" aria-label="Operator workspace"><SectionHeader title="Platform operations" description="Separate operator tools. Organization data remains scoped to your active membership." /><div className="record-actions">{platformItems.map(item => <Link className="quiet-button" to={item.path} key={item.path}>{item.name}</Link>)}</div></section>}
  </AppPage>;
}
