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
  test(`Services presentation ${width} ${mode}`, async ({ page }) => {
    const fixture = await workspace(page);
    fixture.services.push(
      { id: 'qa-consultation', name: 'QA consultation and personalized service planning', description: 'Synthetic catalogue entry with a longer description to verify readable wrapping on small screens.', durationMinutes: 30, active: true },
      { id: 'qa-retired', name: 'QA retired service', description: null, durationMinutes: 60, active: false },
    );
    await page.setViewportSize({ width, height: 960 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.addInitScript(mode => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode, primaryColor: '#4F46E5' })), mode);
    await page.goto('/services');
    await expect(page.getByRole('heading', { name: 'QA consultation and personalized service planning' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode === 'system' ? 'dark' : mode);
    const capture = async (name: string) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/services-${process.env.SERVICES_QA_PHASE ?? 'after'}/${width}-${mode}-${name}.png`, fullPage: name === 'catalogue' });
    };
    await capture('catalogue');
    await expectReadableText(page.locator('.services-workspace h1,.services-workspace h2,.services-workspace p,.services-workspace .status-badge'), 8);
    for (const button of await page.locator('.services-workspace button').all()) {
      await expect(button).toHaveAccessibleName(/\S/);
      const label = await button.getAttribute('aria-label');
      if (label) expect(label).toContain((await button.innerText()).trim());
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await page.keyboard.press('Tab'); await expect(page.getByRole('link', { name: 'Skip to workspace content' })).toBeFocused();
    await page.keyboard.press('Enter'); await expect(page.getByRole('main')).toBeFocused();
    const providers = page.getByRole('button', { name: 'Providers for QA consultation and personalized service planning' });
    await providers.focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('No providers assigned. Bookings may remain unassigned.')).toBeVisible();
    await capture('providers'); await page.keyboard.press('Escape'); await expect(providers).toBeFocused();
    await page.getByRole('button', { name: 'Create service', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Service name', exact: true })).toBeVisible();
    for (const name of ['Cancel', 'Review service']) {
      const box = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(box).not.toBeNull(); expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(960);
    }
    await capture('editor');
    expect(await page.getByRole('dialog').evaluate(node => node.contains(document.activeElement))).toBe(true);
    expect(await page.locator('.services-workspace .record-card').first().evaluate(node => parseFloat(getComputedStyle(node).transitionDuration))).toBeLessThanOrEqual(.001);
    if (mode === 'system') {
      await page.keyboard.press('Escape');
      await page.emulateMedia({ colorScheme: 'light' });
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await expectReadableText(page.locator('.services-workspace h2,.services-workspace .status-badge'), 4);
    }
  });
}

test('Services preserves server pagination, search, empty state and unknown branch evidence', async ({ page }) => {
  const fixture = await workspace(page);
  for (let i = 1; i <= 21; i++) fixture.services.push({ id: `qa-${i}`, name: `QA service ${i}`, description: null, durationMinutes: 30, active: true });
  await page.route('**/api/services?**', async route => {
    if (new URL(route.request().url()).searchParams.get('scope') === 'branch') return route.fulfill({ json: { data: [], pagination: { totalPages: 0 } } });
    await route.fallback();
  });
  await page.goto('/services');
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await expect(page.getByText('Branch availability not confirmed', { exact: false })).toHaveCount(20);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'QA service 21', exact: true })).toBeVisible();
  await expect(page.locator('.record-card')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search services' }).fill('no-match');
  await expect(page.getByRole('heading', { name: 'No matching services' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).first().click();
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
});

test('Services read-only user retains provider inspection without write controls', async ({ page }) => {
  const fixture = await workspace(page, { permissions: ['services.read'] });
  fixture.services.push({ id: 'qa-view', name: 'QA read-only service', description: null, durationMinutes: 30, active: true });
  await page.goto('/services');
  await expect(page.getByRole('heading', { name: 'QA read-only service' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create service', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit QA read-only service' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Providers for QA read-only service' }).click();
  await expect(page.getByText('No providers assigned. Bookings may remain unassigned.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Available staff' })).toHaveCount(0);
});

test('Services loading and catalogue failure remain recoverable', async ({ page }) => {
  await workspace(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let failing = true;
  await page.route('**/api/services?**', async route => {
    if (new URL(route.request().url()).searchParams.get('scope') !== 'organization') return route.fallback();
    await pending;
    if (failing) return route.fulfill({ status: 503, json: { message: 'Synthetic catalogue unavailable' } });
    return route.fallback();
  });
  await page.goto('/services');
  await expect(page.getByRole('status').filter({ hasText: 'Loading services' })).toBeVisible();
  release();
  await expect(page.getByRole('button', { name: 'Retry services' })).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: 'Retry services' }).click();
  await expect(page.getByRole('heading', { name: 'No services yet' })).toBeVisible();
});
