import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandLockup } from '../brand/Brand';
import { useAppStore } from '../../store/useAppStore';
const destinations = [['Product', 'product'], ['Modules', 'modules'], ['Pricing', 'pricing'], ['FAQ', 'faq']];
export function PublicLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const menu = useRef<HTMLElement>(null);
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('a,button') ?? []);
    items()[0]?.focus(); document.body.style.overflow = 'hidden';
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab') {
        const first = items()[0], last = items().at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = overflow; previous?.focus(); };
  }, [open, close]);
  const links = <>{destinations.map(([label, id]) => <a key={id} href={`/#${id}`} onClick={close}>{label}</a>)}<Link to="/login" onClick={close}>Login</Link><a className="action-link" href="/#pricing" onClick={close}>Request Access</a></>;
  return <div className="public-site"><a className="skip-link" href="#public-main">Skip to content</a>
    <header className="public-header"><div className="public-container public-header-inner">
      <Link to="/" aria-label="EkaVio home"><BrandLockup /></Link><nav className="public-desktop-nav" aria-label="Public navigation">{links}</nav>
      <label className="public-appearance"><span className="sr-only">Appearance</span><select aria-label="Appearance" value={theme.mode} onChange={(event) => setTheme(event.target.value as typeof theme.mode)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></label>
      <button className="quiet-button public-menu-toggle" aria-label="Open public navigation" aria-expanded={open} onClick={() => setOpen(true)}>Menu</button>
    </div></header>
    {open && <div className="public-menu-backdrop"><nav ref={menu} className="public-mobile-nav panel" role="dialog" aria-modal="true" aria-label="Public navigation"><button className="quiet-button" onClick={close}>Close navigation</button>{links}</nav></div>}
    <main id="public-main" tabIndex={-1}>{children}</main></div>;
}
