import { Link, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { visibleDestinations, navigationGroup, navigationGroups } from './navigation';
import { NavigationIcon } from './NavigationIcon';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { SignOutButton } from './SignOutButton';
import { BrandLockup } from '../brand/Brand';
export function AdminSidebar({ isOpen, onClose, compact = false, onCompact }: { isOpen: boolean; onClose: () => void; compact?: boolean; onCompact?: () => void }) {
  const { user, entitlements, isPlatformOperator } = useAppStore();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const sidebarRef = useRef<HTMLElement>(null);
  const location = useLocation();
  useEffect(() => {
    if (!isOpen || !window.matchMedia('(max-width: 1023px)').matches) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const sidebar = sidebarRef.current;
    const focusable = () => Array.from(sidebar?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), summary') ?? []).filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility === 'visible');
    // The closed drawer retains layout boxes. Wait for the intended first
    // control, not a later descendant whose inherited visibility updates first.
    const initialFocus = sidebar?.querySelector<HTMLElement>('a[href], button:not(:disabled), summary');
    let focusFrame: number;
    const focusWhenVisible = () => {
      if (initialFocus?.getClientRects().length && getComputedStyle(initialFocus).visibility === 'visible') {
        initialFocus.focus(); if (document.activeElement === initialFocus) return;
      }
      focusFrame = requestAnimationFrame(focusWhenVisible);
    };
    focusFrame = requestAnimationFrame(focusWhenVisible);
    document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const items = focusable(), first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (!sidebar?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => { cancelAnimationFrame(focusFrame); document.removeEventListener('keydown', handleKey); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [isOpen, onClose]);
  const items = visibleDestinations(user?.permissions ?? [], entitlements, isPlatformOperator);
  return <>{isOpen && <button className="nav-backdrop" aria-label="Close navigation overlay" onClick={onClose} />}
    <aside ref={sidebarRef} className={`workspace-nav ${isOpen ? 'is-open' : ''} ${compact ? 'is-compact' : ''}`} aria-label="Workspace sidebar">
      <div className="sidebar-brand"><Link className="brand" to="/dashboard" aria-label="EkaVio workspace" onClick={onClose}><BrandLockup /></Link><button className="nav-close icon-button" onClick={onClose} aria-label="Close navigation"><X size={20} aria-hidden="true" /></button></div>
      {onCompact && <button className="sidebar-collapse quiet-button" onClick={onCompact} aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'}>{compact ? <PanelLeftOpen size={18} aria-hidden="true" /> : <><PanelLeftClose size={18} aria-hidden="true" /> <span>Compact navigation</span></>}</button>}
      <nav aria-label="Main navigation">{navigationGroups.map(group => {
        const members = items.filter(item => navigationGroup(item) === group);
        if (!members.length) return null;
        const links = members.map(item => <NavLink key={item.path} className="nav-link" to={item.path} onClick={onClose} title={compact ? item.name : undefined} aria-label={item.name}><NavigationIcon path={item.path} /><span>{item.name}</span></NavLink>);
        const active = members.some(item => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`));
        const expanded = active || !collapsed.has(group);
        return compact ? <section className="nav-group" key={group} aria-label={group}>{links}</section> : <details className="nav-group" key={group} open={expanded}><summary onClick={event => {
          event.preventDefault();
          if (active) return; // The current destination must remain visible.
          setCollapsed(previous => { const next = new Set(previous); if (next.has(group)) next.delete(group); else next.add(group); return next; });
        }}><h2>{group}</h2></summary>{links}</details>;
      })}</nav>
      <SignOutButton className="sidebar-signout" onClose={onClose} />
    </aside></>;
}
