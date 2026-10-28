import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { client } from '../../api/client';
import { useSocketStore } from '../../store/useSocketStore';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { AdminSidebar } from './AdminSidebar';
import { TenantSwitcher } from './TenantSwitcher';
import { visibleDestinations, mobileDestinations } from './navigation';
import { NavigationIcon } from './NavigationIcon';
import { AccountMenu } from './AccountMenu';
import { Menu, MoreHorizontal } from 'lucide-react';
import { NotificationBell } from '../analytics/NotificationBell';
import { ThemeSwitch } from '../ui/ThemeControl';
export function AdminLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const closeNavigation = useCallback(() => setOpen(false), []);
  const [compact, setCompact] = useState(() => { try { return sessionStorage.getItem('ekavio-compact-navigation') === 'true'; } catch { return false; } });
  const [switching, setSwitching] = useState(false);
  const [contextRevision, setContextRevision] = useState(0);
  const onSwitching = useCallback((value: boolean) => { setSwitching(value); if (!value) setContextRevision(revision => revision + 1); }, []);
  const { user, entitlements, activeTenantId, activeBranchId, isPlatformOperator } = useAppStore();
  const authority=useQuery({queryKey:['live-authority',user?.id,activeTenantId,activeBranchId,contextRevision],enabled:!switching,retry:false,refetchOnWindowFocus:'always',refetchInterval:30_000,queryFn:async()=>(await client.get<{data:{permissions:string[];role:string}}>('/organization/context')).data.data});
  useEffect(()=>{
    if(!authority.data || switching) return;
    useAppStore.setState(state=>({user:state.user?{...state.user,permissions:authority.data.permissions,role:authority.data.role}:null}));
    const current=useAppStore.getState();
    if(current.token&&current.activeTenantId&&!useSocketStore.getState().isConnected)useSocketStore.getState().connectSocket(current.token,current.activeTenantId,current.activeBranchId??undefined);
  },[authority.data,authority.dataUpdatedAt,switching]);
  const location = useLocation();
  const items = visibleDestinations(user?.permissions ?? [], entitlements, isPlatformOperator);
  const current = items.find((item) => item.path === location.pathname);
  // Authority is a set. A harmless server ordering change must not unmount an
  // open workspace/draft; real grant additions/removals still replace it.
  const scope = [user?.id, activeTenantId, activeBranchId, contextRevision, [...(user?.permissions ?? [])].sort().join(',')].join(':');
  const toggleCompact = () => { setCompact(value => { try { sessionStorage.setItem('ekavio-compact-navigation', String(!value)); } catch { /* Nonessential display preference. */ } return !value; }); };
  return <div className="app-shell"><a className="workspace-skip" href="#workspace-main">Skip to workspace content</a><AdminSidebar isOpen={open} onClose={closeNavigation} compact={compact} onCompact={toggleCompact} /><div className="workspace">
    <header className="workspace-header"><div className="workspace-heading"><button className="menu-toggle icon-button" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={21} aria-hidden="true" /></button><div><nav className="workspace-breadcrumb" aria-label="Breadcrumb"><Link to="/dashboard">{current?.operator ? 'Platform operations' : 'Workspace'}</Link><span aria-hidden="true">/</span><span aria-current="page">{current?.name ?? 'Home'}</span></nav></div></div>
      <div className="header-account"><ThemeSwitch />{!switching && <NotificationBell key={contextRevision} />}<Link to="/settings?section=profile" className="profile-link" aria-label="Open my profile">{user?.name ?? 'My profile'}</Link><AccountMenu key={`${scope}:${switching}`} /></div>
      <TenantSwitcher onSwitching={onSwitching} /></header>
    <main id="workspace-main" tabIndex={-1} className="workspace-content" key={scope}>{switching ? <section className="panel" role="status">Switching workspace context…</section> : children}</main>
    <nav className="mobile-nav" aria-label="Mobile navigation">{mobileDestinations(items).map(item => <NavLink key={item.path} to={item.path}><NavigationIcon path={item.path} /><span>{item.name === 'CRM & Follow-ups' ? 'CRM' : item.name === 'HR Plus / My Work' ? 'My Work' : item.name}</span></NavLink>)}<button aria-expanded={open} onClick={() => setOpen(true)}><MoreHorizontal size={20} aria-hidden="true" /><span>More</span></button></nav>
  </div></div>;
}
