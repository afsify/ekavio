import { expect, test } from '@playwright/test';
import { workspace } from './fixtures';

// Complements domain PostgreSQL-backed suites; these are FRONTEND contract
// fixtures, not evidence of server authorization or hosted deployment.
for (const width of [360, 390, 768, 1440]) {
  for (const mode of ['light', 'dark', 'system'] as const) {
    test(`final shell ${width}px ${mode}: visible routes, no overflow or uncaught errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.name));
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: 'dark' });
      await workspace(page);
      await page.addInitScript(preference => localStorage.setItem('ekavio-ui-preferences',
        JSON.stringify({ mode: preference, primaryColor: '#4F46E5' })), mode);
      for (const [path, heading] of [['/customers', 'Customers'], ['/services', 'Services'],
        ['/queue', 'Queue Management'], ['/appointments', 'Appointments'], ['/settings', 'Settings']]) {
        await page.goto(path!);
        await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', mode === 'system' ? 'dark' : mode);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      expect(errors).toEqual([]);
    });
  }
}
