import { test, expect, type Locator } from '@playwright/test';
import { workspace } from './fixtures';
import type { PublicCommercialCatalogue } from '../src/commercial/publicCommercial';

async function expectReadableText(elements: Locator, minimumCount: number) {
  const measurements = await elements.filter({ visible: true }).evaluateAll(nodes => nodes.map(node => {
    const context = document.createElement('canvas').getContext('2d')!;
    const luminance = (rgba: Uint8ClampedArray) => {
      const channels = Array.from(rgba).slice(0, 3).map(v => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    // Composite real CSS backgrounds from root to text, including translucent layers.
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

const catalogue: PublicCommercialCatalogue = { currency: 'INR', plans: [], addOns: [] };
const prepare = async (page: import('@playwright/test').Page, width: number, mode: string, reducedMotion: 'reduce' | 'no-preference' = 'reduce') => {
  await workspace(page, { authenticated: false });
  await page.route('**/api/public/commercial/catalogue', route => route.fulfill({ json: { data: catalogue } }));
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion });
  await page.addInitScript(value => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode: value, primaryColor: '#4F46E5' })), mode);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
};

for (const width of [320, 390, 768, 1440]) for (const mode of ['light', 'dark', 'system']) {
  test(`Landing accessible presentation ${width} ${mode}`, async ({ page }, info) => {
    await prepare(page, width, mode);
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode === 'light' ? 'light' : 'dark');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Illustrative EkaVio workspace' }).or(page.getByRole('figure', { name: 'Illustrative EkaVio workspace' }))).toBeVisible();
    await expectReadableText(page.locator('.public-hero h1,.public-hero .public-lead,.public-hero .public-eyebrow,.public-reassurance li,.public-actions a,.public-section h2,.public-section p.muted,.public-module li,.public-audience span,.public-core p'), 12);
    for (const control of await page.locator('.public-actions a, .public-header .quiet-button').filter({ visible: true }).all()) {
      const box = (await control.boundingBox())!;
      expect(box.height, await control.innerText().catch(() => 'control')).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    // Reduced motion: no entrance animation is running.
    expect(await page.locator('.public-hero-copy').evaluate(e => getComputedStyle(e).animationName)).toBe('none');
    await page.getByRole('button', { name: /^Appearance:/ }).click();
    const appearance = page.getByRole('dialog', { name: 'Appearance', exact: true });
    await expect(appearance.getByRole('radio', { name: mode, exact: false })).toBeChecked();
    await expectReadableText(appearance.locator('legend,.theme-mode-option>span,p,button'), 6);
    for (const radio of await appearance.locator('.theme-mode-option').all()) {
      const box = (await radio.boundingBox())!; expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`appearance-${width}-${mode}.png`) });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /^Appearance:/ })).toBeFocused();
    await page.screenshot({ path: info.outputPath(`landing-${width}-${mode}.png`), fullPage: true });
    await info.attach(`landing-${width}-${mode}`, { path: info.outputPath(`landing-${width}-${mode}.png`), contentType: 'image/png' });
  });
}

test('public appearance keyboard, saved preference, live System and login entry', async ({ page }) => {
  await workspace(page, { authenticated: false });
  await page.route('**/api/public/commercial/catalogue', route => route.fulfill({ json: { data: catalogue } }));
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: /^Appearance:/ });
  await trigger.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('radio', { name: 'Light', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'System', exact: true })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  await page.reload(); await expect(trigger).toHaveAccessibleName('Appearance: System');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await trigger.click(); await page.getByRole('button', { name: 'Done', exact: true }).focus();
  await page.keyboard.press('Tab'); await expect(page.getByRole('dialog', { name: 'Appearance' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open public navigation' }).click();
  await page.getByRole('dialog', { name: 'Public navigation' }).getByRole('link', { name: 'Login', exact: true }).click();
  await expect(page.getByLabel('Phone or email', { exact: true })).toBeVisible();
});

test('Landing keyboard: skip link, visible focus, menu focus return and section state', async ({ page }) => {
  await prepare(page, 390, 'light');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  expect(await skip.evaluate(e => parseFloat(getComputedStyle(e).outlineWidth))).toBeGreaterThanOrEqual(2);
  const menu = page.getByRole('button', { name: 'Open public navigation' });
  await menu.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Public navigation' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(menu).toBeFocused();
  await menu.focus(); await page.keyboard.press('Enter');
  await dialog.getByRole('link', { name: 'Modules' }).focus(); await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#modules')).toBeInViewport();
  await expect.poll(() => page.locator('.public-site nav a[aria-current="location"]').first().innerText()).toBe('Modules');
  for (const cta of await page.locator('.public-actions a').all()) { await cta.focus(); await expect(cta).toBeFocused(); expect(await cta.evaluate(e => parseFloat(getComputedStyle(e).outlineWidth))).toBeGreaterThanOrEqual(2); }
});

test('Landing keeps calls to action truthful and entrance motion is allowed only without reduced-motion', async ({ page }) => {
  await prepare(page, 1440, 'light', 'no-preference');
  const hero = page.locator('.public-hero');
  await expect(hero.getByRole('link', { name: /Request Access/ })).toHaveAttribute('href', '#pricing');
  await expect(hero.getByRole('link', { name: 'See what is included' })).toHaveAttribute('href', '#modules');
  await expect(page.getByText(/trusted by|testimonial|ISO ?27001|SOC ?2/i)).toHaveCount(0);
  await expect(page.getByText('Illustration only. Not live customer data.')).toBeVisible();
  expect(await page.locator('.public-hero-copy').evaluate(e => getComputedStyle(e).animationName)).toBe('public-rise');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.public-hero-copy').evaluate(e => getComputedStyle(e).animationName)).toBe('none');
});
