import { expect, test } from '@playwright/test';
import { workspace } from './fixtures';
for (const mode of ['light', 'dark', 'system'] as const) test(`overview scoped accessibility ${mode}`, async ({ page }) => {
  await workspace(page);
  await page.route('http://127.0.0.1:5009/api/analytics/dashboard', route => route.fulfill({ json: { data: {
    widgets: [{ key: 'customers', label: 'Active customers', value: '0', description: 'Organization-wide existing scope', path: '/customers' }],
    layout: { order: [], hidden: [], version: 0 }, timezone: 'Asia/Kolkata', businessDate: '2026-10-13',
  } } }));
  await page.setViewportSize({ width: 390, height: 900 }); await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(theme => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode: theme, primaryColor: '#4F46E5' })), mode);
  await page.goto('/dashboard'); await expect(page.getByRole('heading', { name: 'Active customers', exact: true })).toBeVisible();
  const measurements = await page.locator('.stat-heading h2,.stat-value,.stat-link,.discovery-group h3').evaluateAll(nodes => nodes.map(node => {
    const context = document.createElement('canvas').getContext('2d')!;
    const luminance = (color: string) => {
      context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
      const channels = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map(v => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    const foreground = luminance(getComputedStyle(node).color), background = luminance(getComputedStyle(node.closest('.panel')!).backgroundColor);
    return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
  }));
  expect(measurements.length).toBeGreaterThanOrEqual(3); for (const ratio of measurements) expect(ratio).toBeGreaterThanOrEqual(4.5);
  for (const control of await page.locator('.mobile-nav a,.mobile-nav button,.context-control select,.intro-actions button').all()) {
    await expect(control).toHaveAccessibleName(/\S/); const box = await control.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await page.keyboard.press('Tab'); await expect(page.getByRole('link', { name: 'Skip to workspace content' })).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.getByRole('main')).toBeFocused();
  expect(await page.locator('.stat-card').evaluate(node => parseFloat(getComputedStyle(node).transitionDuration))).toBeLessThanOrEqual(.001);
});
