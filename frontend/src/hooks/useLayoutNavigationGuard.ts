import { useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';

// BrowserRouter's window-target listener can commit a route synchronously.
// App imports this relay before mounting the router; the active page alone
// owns its callback, which is removed on unmount/authority replacement.
let activeHistoryGuard: ((event: PopStateEvent) => void) | undefined;
if (typeof window !== 'undefined') window.addEventListener('popstate', event => activeHistoryGuard?.(event), true);

/** Data & Forms guard; forced authority replacement/revocation never waits. */
export function useLayoutNavigationGuard(protect: boolean, busy: boolean, request: (leave: () => void) => void) {
  const navigate = useNavigate(), bypass = useRef(false);
  useLayoutEffect(() => {
    if (!protect && !busy) return;
    const ask = (leave: () => void) => { if (!busy) request(() => { bypass.current = true; leave(); bypass.current = false; }); };
    const click = (event: MouseEvent) => {
      if (bypass.current || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const element = event.target instanceof Element ? event.target : null;
      const anchor = element?.closest<HTMLAnchorElement>('a[href]'), signout = element?.closest<HTMLButtonElement>('.sidebar-signout');
      if (anchor && anchor.origin === location.origin && !anchor.target && !anchor.hasAttribute('download') && (anchor.pathname !== location.pathname || anchor.search !== location.search)) {
        event.preventDefault(); event.stopImmediatePropagation(); ask(() => navigate(anchor.pathname + anchor.search + anchor.hash));
      } else if (signout) { event.preventDefault(); event.stopImmediatePropagation(); ask(() => signout.click()); }
    };
    const change = (event: Event) => {
      if (bypass.current || !(event.target instanceof HTMLSelectElement) || !event.target.hasAttribute('data-layout-context')) return;
      const select = event.target, next = select.value, state = useAppStore.getState();
      event.stopImmediatePropagation();
      select.value = select.getAttribute('data-layout-context') === 'workspace' ? state.activeTenantId ?? '' : state.activeBranchId ?? '';
      ask(() => { select.value = next; select.dispatchEvent(new Event('change', { bubbles: true })); });
    };
    const unload = (event: BeforeUnloadEvent) => event.preventDefault();
    const index = history.state?.idx as number | undefined;
    let restoring = false, replaying = false;
    const pop = (event: PopStateEvent) => {
      if (replaying) { replaying = false; return; }
      event.stopImmediatePropagation();
      if (restoring) { restoring = false; return; }
      const target = event.state?.idx as number | undefined;
      if (index === undefined || target === undefined || target === index) { location.reload(); return; }
      restoring = true; history.go(index - target);
      ask(() => { replaying = true; history.go(target - index); });
    };
    document.addEventListener('click', click, true); document.addEventListener('change', change, true);
    window.addEventListener('beforeunload', unload); activeHistoryGuard = pop;
    return () => { document.removeEventListener('click', click, true); document.removeEventListener('change', change, true); window.removeEventListener('beforeunload', unload); if (activeHistoryGuard === pop) activeHistoryGuard = undefined; };
  }, [protect, busy, request, navigate]);
}
