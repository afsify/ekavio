type StartupMark = 'public-render' | 'bootstrap-start' | 'backend-first-request' |
  'authorization-ready' | 'bootstrap-settled' | 'workspace-shell' | 'workspace-first-data';

/** Development-only, fixed labels, once per page load. No URLs, identity or payloads. */
export function markStartup(name: StartupMark) {
  if (!import.meta.env.DEV || typeof performance === 'undefined' || !performance.mark) return;
  const label = `ekavio:startup:${name}`;
  if (performance.getEntriesByName(label).length === 0) performance.mark(label);
  if (name === 'bootstrap-settled' && performance.getEntriesByName('ekavio:startup:bootstrap-start').length &&
      !performance.getEntriesByName('ekavio:startup:bootstrap-duration').length) {
    performance.measure('ekavio:startup:bootstrap-duration', 'ekavio:startup:bootstrap-start', label);
  }
}
