import { expect, test, type Page, type Route } from '@playwright/test';
import { workspace } from './fixtures';
import type { PublicCommercialCatalogue } from '../src/commercial/publicCommercial';

async function holdSession(page: Page) {
  const fixture = await workspace(page);
  let pending: Route | undefined;
  await page.route('**/api/auth/refresh', (route) => { pending = route; });
  return { fixture, pending: () => pending };
}
async function timings(page: Page) {
  return page.evaluate(() => performance.getEntries().filter(entry => entry.name.startsWith('ekavio:startup:')).map(entry => ({ name: entry.name, startTime: entry.startTime, duration: entry.duration })));
}

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark', 'system'] as const) {
  test(`protected startup ${width}px ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.addInitScript(mode => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode, primaryColor: '#4F46E5' })), theme);
    const held = await holdSession(page);
    await page.goto('/customers');
    await expect(page.getByRole('heading', { name: /Checking your session|Connecting to your workspace/ })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Workspace sidebar' })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
    await page.screenshot({ path: info.outputPath(`checking-${width}-${theme}.png`), fullPage: true });
    await expect.poll(() => Boolean(held.pending())).toBe(true);
    await held.pending()!.fulfill({ status: 503, json: { message: 'Synthetic unavailable' } });
    await expect(page.getByRole('heading', { name: 'We couldn’t reach your workspace' })).toBeVisible();
    const retry = page.getByRole('button', { name: 'Try again' });
    await retry.focus(); await expect(retry).toBeFocused();
    await page.screenshot({ path: info.outputPath(`recovery-${width}-${theme}.png`), fullPage: true });
    await page.unroute('**/api/auth/refresh');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Customers', exact: true })).toBeVisible();
    await info.attach('synthetic-startup-timings', { body: JSON.stringify(await timings(page)), contentType: 'application/json' });
  });
}

test('landing renders before a held backend response and never redirects an authorized visitor', async ({ page }, info) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const held = await holdSession(page);
  // The workspace catch-all returns a list; the public landing requires a catalogue object.
  const catalogue: PublicCommercialCatalogue = { currency: 'INR', plans: [], addOns: [] };
  await page.route('**/api/public/commercial/catalogue', route => route.fulfill({ json: { data: catalogue } }));
  const catalogueResponse = page.waitForResponse('**/api/public/commercial/catalogue');
  await page.goto('/');
  expect((await catalogueResponse).status()).toBe(200);
  await expect(page.getByRole('navigation', { name: 'Public navigation' })).toBeVisible();
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Workspace sidebar' })).toHaveCount(0);
  const before = await timings(page);
  expect(before.some(entry => entry.name.endsWith(':public-render'))).toBe(true);
  expect(before.some(entry => entry.name.endsWith(':authorization-ready'))).toBe(false);
  await expect.poll(() => Boolean(held.pending())).toBe(true);
  await held.pending()!.fulfill({ json: held.fixture.session });
  await expect.poll(async () => (await timings(page)).some(entry => entry.name.endsWith(':authorization-ready'))).toBe(true);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('navigation', { name: 'Public navigation' })).toBeVisible();
  await expect(page.locator('h1')).toBeVisible();
  expect(pageErrors).toEqual([]);
  await info.attach('held-backend-timings', { body: JSON.stringify({ fixture: 'manually held until public content assertions pass; not Render cold-start evidence', entries: await timings(page) }), contentType: 'application/json' });
});

test('privacy remains available when the backend network fails', async ({ page }, info) => {
  await workspace(page);
  await page.route('http://127.0.0.1:5009/**', route => route.abort('connectionfailed'));
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Your information has a purpose.' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Workspace sidebar' })).toHaveCount(0);
  await info.attach('network-failure-timings', { body: JSON.stringify(await timings(page)), contentType: 'application/json' });
});

test('warm authorized startup and genuinely expired startup keep their distinct outcomes', async ({ page }, info) => {
  await workspace(page); await page.goto('/customers');
  await expect(page.getByRole('heading', { name: 'Customers', exact: true })).toBeVisible();
  await info.attach('warm-fixture-timings', { body: JSON.stringify({ fixtureDelayMs: 0, entries: await timings(page) }), contentType: 'application/json' });
  await page.route('**/api/auth/refresh', route => route.fulfill({ status: 401, json: { message: 'Synthetic session expired' } }));
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
});
