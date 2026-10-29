import { expect, test, type Locator } from '@playwright/test';
import { workspace } from './fixtures';

async function expectReadableText(elements: Locator, minimumCount: number) {
  const measurements = await elements.filter({ visible: true }).evaluateAll(nodes => nodes.map(node => {
    const context = document.createElement('canvas').getContext('2d')!;
    const luminance = (rgba: Uint8ClampedArray) => {
      const channels = Array.from(rgba).slice(0, 3).map(v => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    // Composite real CSS backgrounds from root to text, including translucent
    // layers. Never substitute a card class, guessed token or passing fallback.
    const ancestors: Element[] = [];
    for (let element: Element | null = node; element; element = element.parentElement) ancestors.unshift(element);
    for (const element of ancestors) {
      const style = getComputedStyle(element);
      if (style.backgroundImage !== 'none' || Number(style.opacity) !== 1 || style.mixBlendMode !== 'normal') {
        throw new Error('Contrast measurement needs review for image, opacity or blend effects');
      }
      context.fillStyle = style.backgroundColor; context.fillRect(0, 0, 1, 1);
    }
    const backgroundPixel = context.getImageData(0, 0, 1, 1).data;
    if (backgroundPixel[3] !== 255) throw new Error('No opaque effective text background was resolved');
    const background = luminance(backgroundPixel);
    context.fillStyle = getComputedStyle(node).color; context.fillRect(0, 0, 1, 1);
    const foreground = luminance(context.getImageData(0, 0, 1, 1).data);
    return { text: node.textContent, ratio: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) };
  }));
  expect(measurements.length).toBeGreaterThanOrEqual(minimumCount);
  for (const { text, ratio } of measurements) expect(ratio, `Contrast for ${text}`).toBeGreaterThanOrEqual(4.5);
}
for (const mode of ['light', 'dark', 'system'] as const) test(`overview scoped accessibility ${mode}`, async ({ page }) => {
  await workspace(page);
  await page.route('http://127.0.0.1:5009/api/analytics/dashboard', route => route.fulfill({ json: { data: {
    widgets: [{ key: 'customers', label: 'Active customers', value: '0', description: 'Organization-wide existing scope', path: '/customers' }],
    layout: { order: [], hidden: [], version: 0 }, timezone: 'Asia/Kolkata', businessDate: '2026-10-13',
  } } }));
  await page.setViewportSize({ width: 390, height: 900 }); await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(theme => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode: theme, primaryColor: '#4F46E5' })), mode);
  await page.goto('/dashboard'); await expect(page.getByRole('heading', { name: 'Active customers', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', mode === 'system' ? 'dark' : mode);
  await expectReadableText(page.locator('.stat-heading h2,.stat-value,.stat-link'), 3);
  for (const control of await page.locator('.mobile-nav a,.mobile-nav button,.context-control select,.intro-actions button').all()) {
    await expect(control).toHaveAccessibleName(/\S/); const box = await control.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await page.keyboard.press('Tab'); await expect(page.getByRole('link', { name: 'Skip to workspace content' })).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.getByRole('main')).toBeFocused();
  expect(await page.locator('.stat-card').evaluate(node => parseFloat(getComputedStyle(node).transitionDuration))).toBeLessThanOrEqual(.001);
  const directory = page.locator('.dashboard-directory'), headings = directory.locator('.discovery-group h3');
  expect(await headings.count()).toBeGreaterThan(0);
  await expect(directory).not.toHaveAttribute('open');
  for (const heading of await headings.all()) await expect(heading).toBeHidden();
  const summary = directory.locator('summary');
  await expect(summary).toHaveAccessibleName(/Your workspace.*Browse all workflows/);
  expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await summary.focus(); await page.keyboard.press('Enter');
  await expect(directory).toHaveAttribute('open');
  for (const heading of await headings.all()) await expect(heading).toBeVisible();
  await expectReadableText(headings, await headings.count());
  for (const link of await directory.getByRole('link').all()) {
    await expect(link).toHaveAccessibleName(/\S/);
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: `test-results/ux02a-accessibility/directory-${mode}.png`, fullPage: true });
  if (mode === 'system') {
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expectReadableText(page.locator('.stat-heading h2,.stat-value,.stat-link'), 3);
    await expectReadableText(headings, await headings.count());
  }
  await summary.focus(); await page.keyboard.press('Enter');
  await expect(directory).not.toHaveAttribute('open'); await expect(summary).toBeFocused();
});
