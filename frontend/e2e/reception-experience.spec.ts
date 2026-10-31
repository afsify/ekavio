import { test, expect, type Locator } from '@playwright/test';
import { workspace } from './fixtures';
import { randomUUID } from 'node:crypto';
import { visualFixture, fits } from '../e2e-operations-visual/fixtures';

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

for (const width of [320, 768, 1440]) for (const theme of ['light', 'dark', 'system']) for (const domain of ['queue', 'appointments']) {
  test(`${domain} reception ${width} ${theme}`, async ({ page }) => {
    await visualFixture(page);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.addInitScript(mode => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode, primaryColor: '#4F46E5' })), theme);
    await page.goto(`/${domain}`);
    const details = page.getByRole('button', { name: 'Details', exact: true });
    await expect(details).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme === 'system' ? 'dark' : theme);
    const capture = async (state: string) => {
      await fits(page);
      await page.screenshot({ path: `test-results/reception-${process.env.RECEPTION_QA_PHASE ?? 'after'}/${domain}-${width}-${theme}-${state}.png` });
    };
    await capture('list');
    await expectReadableText(page.locator('.operations-workspace h1,.operations-workspace h2,.operations-workspace p,.operations-workspace .status-badge,.operations-workspace td strong'), 6);
    for (const control of await page.locator('.operations-workspace button').filter({ visible: true }).all()) {
      await expect(control).toHaveAccessibleName(/\S/);
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await details.scrollIntoViewIfNeeded();
    expect(await details.evaluate(element => { const r = element.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return Boolean(hit && element.contains(hit)); })).toBe(true);
    await details.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await capture('details');
    await expectReadableText(page.getByRole('dialog').locator('h2,h3,p'), 3);
    await page.keyboard.press('Escape'); await expect(details).toBeFocused();
    const create = page.getByRole('button', { name: domain === 'queue' ? 'New token' : 'New appointment', exact: true });
    await create.click(); await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('Branch-available service')).toBeVisible();
    await capture('form');
    await page.keyboard.press('Escape'); await expect(create).toBeFocused();
    if (theme === 'system') {
      await page.emulateMedia({ colorScheme: 'light' });
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await expectReadableText(page.locator('.operations-workspace h1,.operations-workspace p'), 3);
    }
    expect(await create.evaluate(element => parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThanOrEqual(.001);
  });
}

for (const domain of ['queue', 'appointments']) {
  test(`${domain} read-only, error/retry and empty states`, async ({ page }) => {
    let fail = true;
    await workspace(page, { permissions: ['queue.read', 'services.read', 'customers.read'] });
    await page.route(`**/api/${domain}?**`, route => fail ? route.fulfill({ status: 503, json: { message: 'Synthetic outage' } }) : route.fallback());
    await page.goto(`/${domain}`);
    await expect(page.getByText(domain === 'queue' ? 'Read-only queue. Your membership does not permit token creation or status changes.' : 'Read-only schedule. Check-in and editing require Queue manage permission.')).toBeVisible();
    await expect(page.getByRole('button', { name: domain === 'queue' ? 'New token' : 'New appointment', exact: true })).toHaveCount(0);
    const retry = page.getByRole('button', { name: domain === 'queue' ? 'Retry queue' : 'Retry appointments', exact: true });
    await expect(retry).toBeVisible(); fail = false; await retry.click();
    await expect(page.getByRole('heading', { name: domain === 'queue' ? 'No active tokens' : 'No appointments on this date', exact: true })).toBeVisible();
  });
}

test('Appointment day navigation uses branch business date and resets server page', async ({ page }) => {
  await workspace(page);
  await page.goto('/appointments');
  await expect(page.getByLabel('Appointment date')).toHaveValue('2026-10-07');
  await page.getByRole('button', { name: 'Next day', exact: true }).click();
  await expect(page.getByLabel('Appointment date')).toHaveValue('2026-10-08');
  await page.getByRole('button', { name: 'Previous day', exact: true }).click();
  await expect(page.getByLabel('Appointment date')).toHaveValue('2026-10-07');
  await page.getByLabel('Appointment date').fill('2026-10-12');
  const request = page.waitForRequest(r => r.url().includes('/appointments?') && new URL(r.url()).searchParams.get('date') === '2026-10-07' && new URL(r.url()).searchParams.get('page') === '1');
  await page.getByRole('button', { name: 'Today', exact: true }).click(); await request;
  await expect(page.getByLabel('Appointment date')).toHaveValue('2026-10-07');
});

for (const domain of ['queue', 'appointments']) test(`${domain} loading and authoritative server pagination`, async ({ page }) => {
  await visualFixture(page);
  let release: (() => void) | undefined;
  await page.route(`**/api/${domain}?**`, async route => {
    const second = new URL(route.request().url()).searchParams.get('page') === '2';
    if (!second) await new Promise<void>(resolve => { release = resolve; });
    const customer = { id: randomUUID(), name: second ? 'Second page customer' : 'First page customer', phone: null };
    const record = { id: randomUUID(), tokenNumber: '123', customer, service: { id: randomUUID(), name: 'Synthetic service' }, provider: null, status: domain === 'queue' ? 'waiting' : 'scheduled', version: 7, createdAt: '2026-10-07T05:00:00Z', startsAt: '2026-10-07T05:00:00Z', endsAt: '2026-10-07T05:30:00Z' };
    await route.fulfill({ json: { data: [record], summary: { active: 21, waiting: 21, serving: 0 }, pagination: { page: second ? 2 : 1, limit: 20, total: 21, totalPages: 2 } } });
  });
  await page.goto(`/${domain}`);
  await expect.poll(() => Boolean(release)).toBe(true);
  await expect(page.getByText('First page customer', { exact: true })).toHaveCount(0);
  release!();
  await expect(page.getByRole('cell', { name: 'First page customer', exact: true })).toBeVisible();
  const request = page.waitForRequest(r => r.url().includes(`/${domain}?`) && new URL(r.url()).searchParams.get('page') === '2');
  await page.getByRole('button', { name: 'Next', exact: true }).click(); await request;
  await expect(page.getByRole('cell', { name: 'Second page customer', exact: true })).toBeVisible();
  await expect(page.getByText('First page customer', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible();
});

test('Queue status confirmation preserves exact version and blocks a conflicted replay', async ({ page }) => {
  await visualFixture(page);
  let submitted: unknown;
  await page.route('**/api/queue/*/status', async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 409, json: { message: 'Status changed elsewhere' } });
  });
  await page.goto('/queue');
  await page.getByRole('button', { name: 'Serve customer', exact: true }).click();
  expect(submitted).toBeUndefined();
  await page.getByRole('button', { name: 'Confirm status', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Status changed elsewhere' })).toBeVisible();
  expect(submitted).toEqual({ status: 'serving', expectedVersion: 1 });
  await expect(page.getByRole('button', { name: 'Confirm status', exact: true })).toBeDisabled();
});
