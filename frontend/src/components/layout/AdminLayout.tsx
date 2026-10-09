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
import { AdvancedModal } from '../ui/AdvancedModal';
import { Menu, MoreHorizontal, ChevronDown, UserRound } from 'lucide-react';
import { NotificationBell } from '../analytics/NotificationBell';
export function AdminLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const closeNavigation = useCallback(() => setOpen(false), []);
  const [compact, setCompact] = useState(() => { try { return sessionStorage.getItem('ekavio-compact-navigation') === 'true'; } catch { return false; } });
  const [profileOpen, setProfileOpen] = useState(false);
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
  const membership = user?.memberships?.find((item) => item.organizationId === activeTenantId);
  const branch = membership?.branches.find((item) => item.id === activeBranchId);
  const scope = [user?.id, activeTenantId, activeBranchId, contextRevision, user?.permissions?.join(',')].join(':');
  const toggleCompact = () => { setCompact(value => { try { sessionStorage.setItem('ekavio-compact-navigation', String(!value)); } catch { /* Nonessential display preference. */ } return !value; }); };
  return <div className="app-shell"><a className="workspace-skip" href="#workspace-main">Skip to workspace content</a><AdminSidebar isOpen={open} onClose={closeNavigation} compact={compact} onCompact={toggleCompact} /><div className="workspace">
    <header className="workspace-header"><div className="workspace-heading"><button className="menu-toggle icon-button" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={21} aria-hidden="true" /></button><div><nav className="workspace-breadcrumb" aria-label="Breadcrumb"><Link to="/dashboard">{current?.operator ? 'Platform operations' : 'Workspace'}</Link><span aria-hidden="true">/</span><span aria-current="page">{current?.name ?? 'Home'}</span></nav><p className="context-label">{membership?.orgName ?? 'Your workspace'} · {branch?.name ?? 'Selected branch'}</p></div></div>
      <div className="header-account">{!switching && <NotificationBell key={contextRevision} />}<Link to="/settings?section=profile" className="profile-link" aria-label="Open my profile">{user?.name ?? 'My profile'}</Link><button className="account-trigger icon-button" aria-label="Account menu" aria-expanded={profileOpen} onClick={() => setProfileOpen(true)}><UserRound size={19} aria-hidden="true" /><ChevronDown size={14} aria-hidden="true" /></button></div>
      <TenantSwitcher onSwitching={onSwitching} /></header>
    <main id="workspace-main" tabIndex={-1} className="workspace-content" key={scope}>{switching ? <section className="panel" role="status">Switching workspace context…</section> : children}</main>
    <AdvancedModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} title="Your account" size="sm"><div className="account-sheet"><div><p className="account-name">{user?.name ?? 'Team member'}</p><p className="muted">{user?.roleName ?? user?.role ?? 'Member'} · {membership?.orgName ?? 'Your workspace'}</p></div><Link className="quiet-button" to="/settings?section=profile" onClick={() => setProfileOpen(false)}>My profile</Link><Link className="quiet-button" to="/settings?section=security" onClick={() => setProfileOpen(false)}>Security & password</Link><fieldset><legend>Appearance</legend><div className="appearance-segment">{(['light','dark','system'] as const).map(mode => <button key={mode} aria-pressed={useAppStore.getState().theme.mode === mode} onClick={() => useAppStore.getState().setTheme(mode)}>{mode[0].toUpperCase() + mode.slice(1)}</button>)}</div></fieldset><Link className="quiet-button" to="/help" onClick={() => setProfileOpen(false)}>Help & support</Link></div></AdvancedModal>
    <nav className="mobile-nav" aria-label="Mobile navigation">{mobileDestinations(items).map(item => <NavLink key={item.path} to={item.path}><NavigationIcon path={item.path} /><span>{item.name === 'CRM & Follow-ups' ? 'CRM' : item.name === 'HR Plus / My Work' ? 'My Work' : item.name}</span></NavLink>)}<button aria-expanded={open} onClick={() => setOpen(true)}><MoreHorizontal size={20} aria-hidden="true" /><span>More</span></button></nav>
  </div></div>;
}
