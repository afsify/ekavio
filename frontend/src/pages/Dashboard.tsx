import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { client } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { visibleDestinations } from '../components/layout/navigation';
export default function Dashboard() {
  const { user, entitlements, activeTenantId, activeBranchId, isPlatformOperator } = useAppStore();
  const permissions = user?.permissions ?? [];
  const items = visibleDestinations(permissions, entitlements, isPlatformOperator);
  const stats = useQuery({ queryKey: ['dashboardStats', activeTenantId, activeBranchId], enabled: permissions.includes('reports.read'), queryFn: async () => (await client.get<{ data: { totalQueue: number; lowStockItems: number; presentStaff: number } }>('/analytics/dashboard')).data.data });
  const membership = user?.memberships?.find((item) => item.organizationId === activeTenantId);
  return <div className="page-stack"><header className="page-heading"><div><h1>Welcome, {user?.name ?? 'team member'}</h1><p>{membership?.orgName ?? 'Your workspace'} · Your branch at a glance</p></div><Link className="quiet-button" to="/settings?section=appearance">Appearance</Link></header>
    {stats.isLoading && <p role="status">Loading current activity…</p>}
    {stats.isError && <div className="panel"><p role="alert">Current activity could not be loaded.</p><button className="quiet-button mt-3" onClick={() => void stats.refetch()}>Retry activity</button></div>}
    {stats.data && <section className="catalogue-grid">{[{ label: 'Active Queue', value: stats.data.totalQueue, path: '/queue' },{ label: 'Low-stock items', value: stats.data.lowStockItems, path: '/inventory' },{ label: 'Staff present today', value: stats.data.presentStaff, path: '/attendance' }].filter((item) => items.some((destination) => destination.path === item.path)).map((item) => <Link className="panel" to={item.path} key={item.label}><p className="muted">{item.label}</p><p className="text-3xl font-bold">{item.value}</p></Link>)}</section>}
    <section className="panel"><h2 className="font-semibold">Your workspace</h2><p className="muted mt-2">Start with customers and services, then open an enabled workflow. Access is controlled by your organization and role.</p><div className="record-actions">{items.filter((item) => item.group === 'Workspace' && item.path !== '/dashboard').map((item) => <Link className="quiet-button" key={item.path} to={item.path}>{item.name}</Link>)}</div></section>
    <section><h2 className="font-semibold mb-3">Operations</h2><div className="catalogue-grid">{items.filter((item) => item.group === 'Operations').map((item) => <Link key={item.path} className="panel record-card" to={item.path}><h2>{item.name}</h2><p className="muted">Open {item.name}</p></Link>)}</div>{!items.some((item) => item.group === 'Operations') && <p className="muted mt-3">No operational workflows are available for your current access. Ask your administrator for help.</p>}</section>
  </div>;
}
