import { expect, test } from '@playwright/test';
import { workspace } from './fixtures';

const widths = [320, 375, 639, 640, 767];
for (const mode of ['light', 'dark', 'system'] as const) test(`mobile bottom navigation ${mode}`, async ({ page }) => {
  await workspace(page);
  await page.emulateMedia({ colorScheme: mode === 'system' ? 'dark' : mode });
  await page.addInitScript(value => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode: value, primaryColor: '#4F46E5' })), mode);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 }); await page.goto('/customers');
    const nav = page.getByRole('navigation', { name: 'Mobile navigation' }); await expect(nav).toBeVisible();
    const measured = await nav.locator('a,button').evaluateAll(nodes => {
      const context = document.createElement('canvas').getContext('2d')!;
      const luminance = (rgba: Uint8ClampedArray) => { const c = Array.from(rgba).slice(0, 3).map(v => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }); return c[0] * .2126 + c[1] * .7152 + c[2] * .0722; };
      return nodes.map(node => {
        const chain: Element[] = []; for (let e: Element | null = node; e; e = e.parentElement) chain.unshift(e);
        for (const e of chain) { context.fillStyle = getComputedStyle(e).backgroundColor; context.fillRect(0, 0, 1, 1); }
        const background = luminance(context.getImageData(0, 0, 1, 1).data); context.fillStyle = getComputedStyle(node).color; context.fillRect(0, 0, 1, 1);
        const foreground = luminance(context.getImageData(0, 0, 1, 1).data), box = node.getBoundingClientRect();
        return { text: node.textContent, width: box.width, height: box.height, left: box.left, right: box.right, ratio: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) };
      });
    });
    expect(measured.length).toBeGreaterThanOrEqual(2);
    for (const item of measured) {
      expect(item.width, `${item.text} width at ${width}`).toBeGreaterThanOrEqual(44); expect(item.height, `${item.text} height at ${width}`).toBeGreaterThanOrEqual(44);
      expect(item.left).toBeGreaterThanOrEqual(0); expect(item.right).toBeLessThanOrEqual(width);
      expect(item.ratio, `${item.text} contrast at ${width} ${mode}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(nav.locator('[aria-current=page]')).toHaveCount(1);
  }
});

test('More trigger controls the real drawer and keyboard returns focus', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await workspace(page); await page.goto('/customers');
  const more = page.getByRole('button', { name: 'More', exact: true }), drawer = page.getByRole('complementary', { name: 'Workspace sidebar' });
  const target = await more.getAttribute('aria-controls'); expect(target).toBeTruthy();
  await expect(page.locator(`#${target}`)).toHaveAttribute('aria-label', 'Workspace sidebar');
  await expect(more).not.toHaveAttribute('aria-haspopup', /.*/); await expect(more).toHaveAttribute('aria-expanded', 'false');
  for (const key of ['Enter', 'Space']) {
    await more.focus(); await page.keyboard.press(key);
    await expect(more).toHaveAttribute('aria-expanded', 'true'); await expect(drawer.getByRole('link', { name: 'EkaVio workspace' })).toBeFocused();
    await page.keyboard.press('Escape'); await expect(more).toBeFocused(); await expect(more).toHaveAttribute('aria-expanded', 'false');
  }
  expect(await page.locator(`[id="${target}"]`).count()).toBe(1);
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  await expect(menu).toHaveAttribute('aria-controls', target!); await expect(menu).not.toHaveAttribute('aria-haspopup', /.*/); await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.focus(); await page.keyboard.press('Enter'); await expect(menu).toHaveAttribute('aria-expanded', 'true');
  for (let step = 0; step < 40; step++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('aside.workspace-nav')))).toBe(true);
  for (let step = 0; step < 40; step++) await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('aside.workspace-nav')))).toBe(true);
  await page.keyboard.press('Escape'); await expect(menu).toBeFocused(); await expect(menu).toHaveAttribute('aria-expanded', 'false');
});

test('bottom navigation hands over to the header menu at 768px and the sidebar at 1024px', async ({ page }) => {
  await workspace(page);
  await page.setViewportSize({ width: 767, height: 800 }); await page.goto('/customers'); await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
  await page.setViewportSize({ width: 768, height: 800 }); await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeVisible(); await expect(page.getByRole('complementary', { name: 'Workspace sidebar' })).toBeHidden();
  await page.setViewportSize({ width: 1024, height: 800 }); await expect(page.getByRole('complementary', { name: 'Workspace sidebar' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeHidden();
});
