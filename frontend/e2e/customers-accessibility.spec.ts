import { test, expect, type Locator } from '@playwright/test';
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


for (const width of [320, 768, 1440]) for (const mode of ['light', 'dark', 'system']) {
  test(`Customers accessible presentation ${width} ${mode}`, async ({ page }) => {
    const state = await workspace(page);
    const name = 'QA Alexandra Customer with a very long descriptive family name for readable records';
    state.customers.push({ id: 'qa-accessibility', name, phone: '+919876543210', notes: 'Synthetic contact information only.', status: 'active' });
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.addInitScript(value => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode: value, primaryColor: '#4F46E5' })), mode);
    await page.goto('/customers');
    const view = page.getByRole('button', { name: `View ${name}`, exact: true }).filter({ visible: true });
    await expect(view).toBeVisible();
    await expectReadableText(page.locator('.customers-workspace h1,.customers-workspace h2,.customers-workspace p,.customers-workspace .status-badge,.customers-workspace .customer-contact'), 5);
    for (const button of await page.locator('.customers-workspace button').filter({ visible: true }).all()) {
      await expect(button).toHaveAccessibleName(/\S/);
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    await view.scrollIntoViewIfNeeded(); await view.focus(); await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Customer details', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('+919876543210', { exact: true })).toBeVisible();
    await expectReadableText(dialog.locator('h2,h3,p,dt,dd,.status-badge'), 5);
    for (const button of await dialog.locator('.dialog-actions button').all()) {
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(await button.evaluate(e => { const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return r.bottom <= innerHeight && Boolean(hit && e.contains(hit)); })).toBe(true);
    }
    await page.keyboard.press('Escape'); await expect(view).toBeFocused();
    expect(await view.evaluate(e => parseFloat(getComputedStyle(e).transitionDuration))).toBeLessThanOrEqual(.001);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (mode === 'system') {
      await page.emulateMedia({ colorScheme: 'light' });
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await expectReadableText(page.locator('.customers-workspace h1,.customers-workspace p'), 3);
    }
  });
}
