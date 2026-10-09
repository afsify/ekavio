import { test, expect } from '@playwright/test';
import { fits, pages, visualFixture } from './fixtures';
for (const width of [320, 360, 390, 430, 768, 1024, 1440, 1920]) for (const theme of ['light', 'dark', 'system']) for (const domain of pages) test(`${domain.title} ${width}px ${theme} loaded/forms/detail`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' }); const fixture = await visualFixture(page);
  await page.addInitScript(mode => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode, primaryColor: '#4F46E5' })), theme);
  await page.goto(domain.path); await expect(page.getByRole('heading', { name: domain.title, exact: true })).toBeVisible(); await expect(page.locator('html')).toHaveAttribute('data-theme', theme === 'system' ? 'dark' : theme);
  const loaded = domain.path === '/queue' ? page.getByRole('button', { name: 'Serve customer', exact: true }) : domain.path === '/appointments' || domain.path === '/ledger' ? page.getByRole('button', { name: 'Details', exact: true }) : domain.path === '/inventory' ? page.getByRole('button', { name: 'Details & history', exact: true }) : page.getByRole('button', { name: 'Mark attendance', exact: true });
  await expect(loaded).toBeVisible(); await fits(page); const prefix = 'test-results/operations-visual/' + domain.path.slice(1) + '-' + width + '-' + theme;
  await page.screenshot({ path: prefix + '-loaded.png', fullPage: true });
  if (theme === 'system') { await page.emulateMedia({ colorScheme: 'light' }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); await page.emulateMedia({ colorScheme: 'dark' }); }
  if (width === 390 || width === 1440) {
    if (domain.path !== '/attendance') { await loaded.click(); await expect(page.getByRole('dialog')).toBeVisible(); await fits(page); await page.screenshot({ path: prefix + '-detail.png', fullPage: true }); await page.getByRole('dialog').getByRole('button', { name: 'Close modal' }).click(); }
    await page.getByRole('button', { name: domain.create, exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await fits(page); await page.screenshot({ path: prefix + '-form.png', fullPage: true });
    await page.getByRole('dialog').getByRole('button', { name: 'Close modal' }).click(); if (await page.getByRole('button', { name: 'Discard changes', exact: true }).count()) await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
    fixture.setFailure(true); await page.reload(); await expect(page.getByRole('alert').filter({ hasText: /unavailable|loaded|outage/i }).first()).toBeVisible(); await fits(page); await page.screenshot({ path: prefix + '-error.png', fullPage: true });
    fixture.setFailure(false); fixture.setEmpty(true); await page.reload(); await expect(page.getByText(/No active tokens|No appointments on this date|No staff assigned|No transactions yet|No matching items/)).toBeVisible(); await fits(page); await page.screenshot({ path: prefix + '-empty.png', fullPage: true });
  }
  expect(errors).toEqual([]);
});
