import { expect, test, type Page } from '@playwright/test';
import { workspace } from '../e2e/fixtures';

// Sanitized presentation only. No hosted requests, real accounts or invitations.
async function publicFixture(page: Page) {
  await workspace(page, { authenticated: false });
  await page.route('**/api/public/commercial/catalogue', route => route.fulfill({ json: { data: { plans: [], addOns: [] } } }));
  await page.route('**/api/auth/login', route => route.fulfill({ status: 401, json: { message: 'Unable to sign in. Check your phone or verified email and password.' } }));
  await page.route('**/api/auth/forgot-password', route => route.fulfill({ json: { data: { message: 'If eligible, recovery instructions will be sent to your verified email.' } } }));
}
async function capture(page: Page, name: string) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('main')).toHaveCount(1);
  await page.screenshot({ path: `test-results/polish-visual-batch4/${name}.png`, fullPage: true });
}
async function readableAccent(page: Page, selector: string) {
  const ratios = await page.locator(selector).evaluateAll(nodes => nodes.map(node => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    const luminance = (color: string) => {
      context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
      const [r, g, b] = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map(value => {
        const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    // Scoped token-pair regression; screenshot review also checks the rendered
    // gradient/alpha presentation. This does not certify all app contrast.
    let background = getComputedStyle(document.documentElement).getPropertyValue(node.closest('.panel,form') ? '--surface' : '--background');
    if (node.matches('a[href="/forgot-password"]')) {
      // Login intentionally has a dark card in every theme. Composite its real
      // translucent card over the rendered main background, not a light token.
      context.fillStyle = getComputedStyle(node.closest('main')!).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      context.fillStyle = getComputedStyle(node.parentElement!).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      background = `rgb(${r},${g},${b})`;
    }
    const foreground = luminance(getComputedStyle(node).color), backing = luminance(background);
    return (Math.max(foreground, backing) + 0.05) / (Math.min(foreground, backing) + 0.05);
  }));
  expect(ratios.length).toBeGreaterThan(0);
  for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
}
for (const width of [320, 360, 390, 430, 768, 1024, 1440, 1920]) for (const theme of ['light', 'dark', 'system'] as const) {
  test(`${width}px ${theme} public and account accessibility`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.addInitScript(mode => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode, primaryColor: '#4F46E5' })), theme);
    await publicFixture(page);
    const prefix = `${width}-${theme}`;
    await page.goto('/'); await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme === 'system' ? 'dark' : theme);
    await readableAccent(page, '.public-eyebrow,.public-text-link,.public-hero h1>span');
    await capture(page, `${prefix}-public`);
    await page.screenshot({ path: `test-results/polish-visual-batch4/${prefix}-public-viewport.png` });
    const menu = page.getByRole('button', { name: 'Open public navigation' });
    if (await menu.isVisible()) {
      await menu.click(); const dialog = page.getByRole('dialog', { name: 'Public navigation' });
      await expect(dialog).toBeVisible(); await page.keyboard.press('Shift+Tab');
      expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape'); await expect(menu).toBeFocused();
    }
    await page.goto('/login'); await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('autocomplete', 'current-password');
    await readableAccent(page, 'main a[href="/forgot-password"]');
    await capture(page, `${prefix}-login`);
    await page.getByLabel('Phone or email').fill('QA invalid account'); await page.getByLabel('Password', { exact: true }).fill('QA synthetic input');
    await page.getByRole('button', { name: 'Sign In to Ekavio' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Unable to sign in');
    await expect(page.getByText('Unable to sign in. Check your phone or verified email and password.', { exact: true })).toHaveCount(1);
    await capture(page, `${prefix}-login-error`);
    await page.getByRole('link', { name: 'Forgot password?' }).click(); await expect(page.getByRole('heading', { name: 'Forgot password' })).toBeVisible();
    await capture(page, `${prefix}-recovery`);
    await page.getByLabel('Phone or email').fill('qa@example.invalid'); await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('main').getByRole('status')).toContainText('If eligible');
    await capture(page, `${prefix}-recovery-status`);
    await page.goto('/onboarding'); await expect(page.getByRole('main').getByRole('alert')).toContainText('onboarding link is missing');
    await capture(page, `${prefix}-onboarding`);
    await page.goto('/reset-password'); await expect(page.getByRole('alert')).toContainText('link is missing');
    await capture(page, `${prefix}-missing-link`);
    if (theme === 'system') { await page.emulateMedia({ colorScheme: 'light' }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); }
    expect(errors).toEqual([]);
  });
}
test('account controls remain reachable with doubled text and keyboard navigation', async ({ page }) => {
  await publicFixture(page); await page.setViewportSize({ width: 390, height: 700 }); await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  // Text-resize approximation, not a claim of physical device/browser zoom certification.
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await page.getByLabel('Phone or email').focus(); await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Sign In to Ekavio' })).toBeFocused();
  await capture(page, '390-light-login-double-text');
});
