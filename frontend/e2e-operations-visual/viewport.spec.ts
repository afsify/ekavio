import { test, expect } from '@playwright/test';
import { pages, visualFixture } from './fixtures';

// Full-page captures include the fixed nav at its viewport position. These
// complementary viewport images prove scrolled record actions remain reachable.
for (const width of [390, 1440]) for (const theme of ['light', 'dark']) for (const domain of pages) test(`${domain.title} ${width}px ${theme} loaded viewport action remains above navigation`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await visualFixture(page);
  await page.addInitScript(mode => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode, primaryColor: '#4F46E5' })), theme);
  await page.goto(domain.path); await expect(page.getByRole('heading', { name: domain.title, exact: true })).toBeVisible();
  if (width >= 1024) { await expect(page.getByRole('link', { name: 'EkaVio workspace', exact: true })).toBeVisible(); await expect(page.getByRole('navigation', { name: 'Main navigation', exact: true })).toBeVisible(); }
  await page.evaluate(() => document.fonts.ready);
  const action = page.getByRole('button', { name: domain.path === '/attendance' ? 'Mark attendance' : domain.path === '/queue' ? 'Serve customer' : domain.path === '/inventory' ? 'Details & history' : 'Details', exact: true });
  await action.scrollIntoViewIfNeeded(); await expect(action).toBeInViewport();
  expect(await action.evaluate(element => { const r = element.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return Boolean(hit && element.contains(hit)); })).toBe(true);
  await page.screenshot({ path: `test-results/operations-visual/${domain.path.slice(1)}-${width}-${theme}-viewport.png`, animations: 'disabled' });
});
