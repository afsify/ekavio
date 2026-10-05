import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useAppStore } from '../../store/useAppStore';
import { visibleDestinations } from './navigation';
import { useQueryClient } from '@tanstack/react-query';
export function AdminSidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user, entitlements, isPlatformOperator, logout } = useAppStore();
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const cache = useQueryClient();
  const sidebarRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!isOpen || !window.matchMedia('(max-width: 1023px)').matches) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const sidebar = sidebarRef.current;
    const focusable = () => Array.from(sidebar?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)') ?? []).filter((element) => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const items = focusable(), first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    sidebar?.addEventListener('keydown', handleKey);
    return () => { sidebar?.removeEventListener('keydown', handleKey); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [isOpen, onClose]);
  const items = visibleDestinations(user?.permissions ?? [], entitlements, isPlatformOperator);
  return <>{isOpen && <button className="nav-backdrop" aria-label="Close navigation overlay" onClick={onClose} />}
    <aside ref={sidebarRef} className={`workspace-nav ${isOpen ? 'is-open' : ''}`} aria-label="Workspace sidebar">
      <div className="flex items-center justify-between"><Link className="brand" to="/dashboard">EkaVio</Link><button className="nav-close quiet-button" onClick={onClose} aria-label="Close navigation">×</button></div>
      <nav aria-label="Main navigation">{(['Workspace','Operations','Administration','Platform operations'] as const).map((group) => items.some((item) => item.group === group) && <section className="nav-group" key={group}><h2>{group}</h2>{items.filter((item) => item.group === group).map((item) => <NavLink key={item.path} className="nav-link" to={item.path} onClick={onClose}>{item.name}</NavLink>)}</section>)}</nav>
      <button className="quiet-button w-full" disabled={busy} onClick={() => { setBusy(true); void logout().catch(() => toast.error('Signed out locally; server revocation unavailable')).finally(() => { cache.clear(); setBusy(false); onClose(); navigate('/login', { replace: true }); }); }}>{busy ? 'Signing out…' : 'Sign out'}</button>
    </aside></>;
}
