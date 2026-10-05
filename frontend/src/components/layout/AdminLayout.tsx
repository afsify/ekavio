import { useCallback, useState, type ReactNode } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { AdminSidebar } from './AdminSidebar';
import { TenantSwitcher } from './TenantSwitcher';
import { visibleDestinations } from './navigation';
export function AdminLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const closeNavigation = useCallback(() => setOpen(false), []);
  const { user, entitlements, activeTenantId, activeBranchId, isPlatformOperator } = useAppStore();
  const location = useLocation();
  const items = visibleDestinations(user?.permissions ?? [], entitlements, isPlatformOperator);
  const current = items.find((item) => item.path === location.pathname);
  const membership = user?.memberships?.find((item) => item.organizationId === activeTenantId);
  const branch = membership?.branches.find((item) => item.id === activeBranchId);
  return <div className="app-shell"><AdminSidebar isOpen={open} onClose={closeNavigation} /><div className="workspace">
    <header className="workspace-header"><div className="flex items-center gap-3"><button className="menu-toggle quiet-button" aria-label="Open navigation" onClick={() => setOpen(true)}>☰</button><div><h1 className="font-semibold">{current?.group === 'Platform operations' ? 'Platform operations' : 'Workspace'} / {current?.name ?? 'Home'}</h1><p className="context-label">{membership?.orgName ?? 'Your workspace'} · {branch?.name ?? 'Selected branch'}</p></div></div>
      <div className="flex items-center gap-3"><TenantSwitcher /><Link to="/settings?section=profile" className="quiet-button" aria-label="Open my profile">{user?.name ?? 'My profile'}</Link></div></header>
    <main className="workspace-content" key={`${activeTenantId}:${activeBranchId}`}>{children}</main>
    <nav className="mobile-nav" aria-label="Mobile navigation">{['/dashboard','/queue','/customers'].map((path) => { const item = items.find((entry) => entry.path === path); return item ? <NavLink key={path} to={path}>{item.name}</NavLink> : null; })}<button aria-expanded={open} onClick={() => setOpen(true)}>More</button></nav>
  </div></div>;
}
