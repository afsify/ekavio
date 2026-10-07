import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { client } from '../../api/client';
import { useSocketStore } from '../../store/useSocketStore';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { AdminSidebar } from './AdminSidebar';
import { TenantSwitcher } from './TenantSwitcher';
import { visibleDestinations } from './navigation';
import { NotificationBell } from '../analytics/NotificationBell';
export function AdminLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const closeNavigation = useCallback(() => setOpen(false), []);
  const { user, entitlements, activeTenantId, activeBranchId, isPlatformOperator } = useAppStore();
  const authority=useQuery({queryKey:['live-authority',activeTenantId,activeBranchId],retry:false,refetchOnWindowFocus:'always',refetchInterval:30_000,queryFn:async()=>(await client.get<{data:{permissions:string[];role:string}}>('/organization/context')).data.data});
  useEffect(()=>{
    if(!authority.data) return;
    useAppStore.setState(state=>({user:state.user?{...state.user,permissions:authority.data.permissions,role:authority.data.role}:null}));
    const current=useAppStore.getState();
    if(current.token&&current.activeTenantId&&!useSocketStore.getState().isConnected)useSocketStore.getState().connectSocket(current.token,current.activeTenantId,current.activeBranchId??undefined);
  },[authority.data,authority.dataUpdatedAt]);
  const location = useLocation();
  const items = visibleDestinations(user?.permissions ?? [], entitlements, isPlatformOperator);
  const current = items.find((item) => item.path === location.pathname);
  const membership = user?.memberships?.find((item) => item.organizationId === activeTenantId);
  const branch = membership?.branches.find((item) => item.id === activeBranchId);
  return <div className="app-shell"><AdminSidebar isOpen={open} onClose={closeNavigation} /><div className="workspace">
    <header className="workspace-header"><div className="flex items-center gap-3"><button className="menu-toggle quiet-button" aria-label="Open navigation" onClick={() => setOpen(true)}>☰</button><div><h1 className="font-semibold">{current?.group === 'Platform operations' ? 'Platform operations' : 'Workspace'} / {current?.name ?? 'Home'}</h1><p className="context-label">{membership?.orgName ?? 'Your workspace'} · {branch?.name ?? 'Selected branch'}</p></div></div>
      <div className="flex items-center gap-3"><NotificationBell /><TenantSwitcher /><Link to="/settings?section=profile" className="quiet-button" aria-label="Open my profile">{user?.name ?? 'My profile'}</Link></div></header>
    <main className="workspace-content" key={`${activeTenantId}:${activeBranchId}`}>{children}</main>
    <nav className="mobile-nav" aria-label="Mobile navigation">{['/dashboard','/queue','/customers'].map((path) => { const item = items.find((entry) => entry.path === path); return item ? <NavLink key={path} to={path}>{item.name}</NavLink> : null; })}<button aria-expanded={open} onClick={() => setOpen(true)}>More</button></nav>
  </div></div>;
}
