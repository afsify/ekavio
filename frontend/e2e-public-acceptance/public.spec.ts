import { expect, test } from '@playwright/test';

test.beforeEach(() => {
  if (process.env.EKAVIO_HOSTED_PUBLIC_QA !== '1') throw new Error('Read-only hosted public QA requires explicit opt-in');
});

for (const width of [360, 390, 768, 1440]) {
  for (const mode of ['light', 'dark', 'system'] as const) {
    test(`hosted public ${width}px ${mode}: brand, public UI, no overflow/errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.name));
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.addInitScript(preference => localStorage.setItem('ekavio-ui-preferences',
        JSON.stringify({ mode: preference, primaryColor: '#4F46E5' })), mode);
      // Guard all requests: no form submission, login, or business mutation.
      // Anonymous bootstrap refresh is also blocked; it is not acceptance evidence.
      await page.route('https://api.ekavio.afsify.com/**', async route => {
        if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.abort();
        return route.continue();
      });
      for (const path of ['/', '/onboarding', '/privacy', '/login']) {
        const response = await page.goto(path);
        expect(response?.status()).toBe(200);
        await expect(page.locator('h1').first()).toBeVisible();
        await expect(page).toHaveTitle(/EkaVio/);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (path === '/') {
          await expect(page.locator('#pricing')).toBeVisible();
          await expect(page.getByRole('heading', { name: 'Request Access', exact: true })).toBeVisible();
          if (width === 360 && mode === 'light') await page.screenshot({ path: 'test-results/public-acceptance/hosted-home-360-light.png', fullPage: true });
        }
        if (path === '/login') await expect(page.getByLabel('Phone or email')).toBeVisible();
      }
      expect(errors).toEqual([]);
    });
  }
}
