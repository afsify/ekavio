import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandLockup } from '../brand/Brand';
import { ThemeMenu } from '../ui/ThemeControl';
const destinations = [['Product', 'product'], ['Modules', 'modules'], ['Pricing', 'pricing'], ['FAQ', 'faq']];
export function PublicLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const menu = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState<string | null>(null);
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
  useEffect(() => {
    // Mark the landing section in view for navigation; absent observers (tests) simply skip it.
    if (window.location.pathname !== '/' || typeof IntersectionObserver === 'undefined') return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) { if (entry.isIntersecting) visible.set(entry.target.id, entry.intersectionRatio); else visible.delete(entry.target.id); }
      setCurrent([...visible.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null);
    }, { rootMargin: '-96px 0px -55% 0px', threshold: [0, .25, .5, 1] });
    for (const [, id] of destinations) { const section = document.getElementById(id); if (section) observer.observe(section); }
    return () => observer.disconnect();
  }, []);
  const links = <>{destinations.map(([label, id]) => <a key={id} href={`/#${id}`} aria-current={current === id ? 'location' : undefined} onClick={close}>{label}</a>)}<Link to="/login" onClick={close}>Login</Link><a className="action-link" href="/#pricing" onClick={close}>Request Access</a></>;
  return <div className="public-site"><a className="skip-link" href="#public-main">Skip to content</a>
    <header className="public-header"><div className="public-container public-header-inner">
      <Link to="/" aria-label="EkaVio home"><BrandLockup /></Link><nav className="public-desktop-nav" aria-label="Public navigation">{links}</nav>
      <div className="public-appearance"><ThemeMenu /></div>
      <button className="quiet-button public-menu-toggle" aria-label="Open public navigation" aria-expanded={open} onClick={() => setOpen(true)}>Menu</button>
    </div></header>
    {open && <div className="public-menu-backdrop"><nav ref={menu} className="public-mobile-nav panel" role="dialog" aria-modal="true" aria-label="Public navigation"><button className="quiet-button" onClick={close}>Close navigation</button>{links}</nav></div>}
    <main id="public-main" tabIndex={-1}>{children}</main></div>;
}
