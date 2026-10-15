// Paint-only bootstrap from the existing UI preference. The React store remains
// authoritative and owns account synchronization and legacy credential cleanup.
(() => {
  const valid = value => value && ['light', 'dark', 'system'].includes(value.mode)
    && typeof value.primaryColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.primaryColor);
  const parse = raw => {
    try { const value = JSON.parse(raw); return valid(value) ? value : valid(value?.state?.theme) ? value.state.theme : null; }
    catch { return null; }
  };
  let theme = null;
  try { theme = parse(localStorage.getItem('ekavio-ui-preferences')) ?? parse(localStorage.getItem('ekavio-app-store')); }
  catch { /* Storage may be unavailable; preserve first-use Light. */ }
  const root = document.documentElement;
  const dark = theme?.mode === 'dark' || (theme?.mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', dark);
  root.dataset.theme = dark ? 'dark' : 'light';
  if (theme) { root.style.setProperty('--color-primary', theme.primaryColor); root.style.setProperty('--primary-color', theme.primaryColor); }
})();
