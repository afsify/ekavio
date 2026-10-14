import { expect, test, type Page } from '@playwright/test';
import { workspace } from './fixtures';
import { relationshipFixture } from '../e2e-relationships-visual/fixtures';

// Frontend HTTP-contract fixtures only; never a hosted or database authority proof.
async function overview(page: Page) {
  const state = await workspace(page);
  state.session.user.name = 'QA team member with a long descriptive display name';
  state.session.memberships[0].orgName = 'QA service organization with a longer workspace name';
  state.session.memberships[0].branches[0].name = 'Main consultation and service branch';
  state.customers.push({ id: 'qa-customer', name: 'QA ordinary customer', phone: null, notes: 'Synthetic only', status: 'active' });
  let layout = { order: [] as string[], hidden: [] as string[], version: 0 };
  await page.route('http://127.0.0.1:5009/api/analytics/dashboard**', async route => {
    if (route.request().method() === 'PUT') { layout = { ...route.request().postDataJSON(), version: layout.version + 1 }; return route.fulfill({ json: {} }); }
    return route.fulfill({ json: { data: { widgets: [
      { key: 'customers', label: 'Active customers', value: '0', description: 'Active customers in this organization', path: '/customers' },
      { key: 'queue', label: 'Active queue', value: '2', description: 'Active tokens in the selected branch', path: '/queue' },
      { key: 'inventory', label: 'Low-stock items', value: '3', description: 'Current selected-branch stock', path: '/inventory' },
      { key: 'services', label: 'Available services', value: '12', description: 'Services available in this branch', path: '/services' },
    ], layout, timezone: 'Asia/Kolkata', businessDate: '2026-10-13' } } });
  });
}
async function scan(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('.stat-card,.action-card,.discovery-group').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth))).toBe(true);
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  for (const control of await page.locator('main input:not([type=hidden]),main select,main textarea').all()) {
    if (await control.isVisible()) await expect(control).toHaveAccessibleName(/\S/);
  }
}
async function capture(page: Page, name: string, fullPage = false) {
  await scan(page); await page.screenshot({ path: `test-results/premium-ui/${name}.png`, fullPage });
}
for (const width of [320, 360, 390, 430, 768, 1024, 1440, 1920]) for (const mode of ['light', 'dark', 'system'] as const) {
  test(`premium overview ${width}px ${mode}`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await overview(page); await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.addInitScript(theme => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode: theme, primaryColor: '#4F46E5' })), mode);
    await page.goto('/dashboard'); await expect(page.getByRole('heading', { name: 'Available services', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode === 'system' ? 'dark' : mode);
    await expect(page.getByRole('region', { name: 'Workspace metrics' }).getByText('0', { exact: true })).toBeVisible();
    const prefix = `${width}-${mode}`;
    await capture(page, `${prefix}-dashboard`); await capture(page, `${prefix}-overview-full`, true);
    await page.getByRole('button', { name: 'Customize dashboard' }).click();
    const custom = page.getByRole('region', { name: 'Dashboard customization' }); await expect(custom).toBeVisible();
    await expect(page.getByRole('button', { name: 'Customize dashboard' })).toHaveAttribute('aria-expanded', 'true');
    await capture(page, `${prefix}-customization`, true);
    await custom.getByRole('checkbox', { name: 'Available services' }).uncheck();
    await expect(page.getByRole('region', { name: 'Workspace metrics' }).getByRole('heading', { name: 'Available services' })).toHaveCount(0);
    await expect(custom.getByRole('checkbox', { name: 'Available services' })).toBeEnabled();
    await custom.getByRole('checkbox', { name: 'Available services' }).check();
    await expect(page.getByRole('region', { name: 'Workspace metrics' }).getByRole('heading', { name: 'Available services' })).toBeVisible();
    await page.getByRole('button', { name: 'Customize dashboard' }).click();
    if (width < 1024) {
      const trigger = page.getByRole('button', { name: width < 768 ? 'More' : 'Open navigation', exact: true });
      await trigger.click(); await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
      await page.keyboard.press('Shift+Tab');
      expect(await page.getByRole('complementary', { name: 'Workspace sidebar' }).evaluate(node => node.contains(document.activeElement))).toBe(true);
      await capture(page, `${prefix}-navigation`); await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
    } else {
      await page.getByRole('button', { name: 'Collapse sidebar' }).click();
      await expect.poll(async () => (await page.getByRole('complementary', { name: 'Workspace sidebar' }).boundingBox())?.width).toBe(80);
      await capture(page, `${prefix}-navigation`); await page.getByRole('button', { name: 'Expand sidebar' }).click();
    }
    await page.getByRole('button', { name: 'Account menu' }).click();
    const account = page.getByRole('dialog', { name: 'Your account' }); await expect(account).toBeVisible();
    await capture(page, `${prefix}-account`); await page.keyboard.press('Escape');
    if (mode === 'system') { await page.emulateMedia({ colorScheme: 'light' }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); }
    expect(errors).toEqual([]);
  });
}
// Independently bounded journeys keep each original 30s test deadline; no
// assertion, wait deadline or retry policy is relaxed to accommodate more pages.
for (const width of [390, 768, 1440]) for (const mode of ['light', 'dark', 'system'] as const) {
  for (const [path, title] of [['/customers', 'Customers'], ['/queue', 'Queue Management'], ['/settings?section=appearance', 'Settings'], ['/crm', 'CRM & Follow-ups']]) {
    test(`shared shell ${title} ${width}px ${mode}`, async ({ page }) => {
      const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
      await overview(page); if (path === '/crm') await relationshipFixture(page);
      await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
      await page.addInitScript(theme => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode: theme, primaryColor: '#4F46E5' })), mode);
      await page.goto(path); await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
      if (path === '/crm') await expect(page.getByRole('button', { name: /^View QA relationship/ })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', mode === 'system' ? 'dark' : mode);
      await capture(page, `${width}-${mode}-${path === '/crm' ? 'crm' : title.toLowerCase().replaceAll(' ', '-')}`, true);
      if (mode === 'system') { await page.emulateMedia({ colorScheme: 'light' }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); }
      expect(errors).toEqual([]);
    });
  }
}
test('dashboard loading and terminal failure keep scoped shortcuts and no fabricated metrics', async ({ page }) => {
  await overview(page); await page.setViewportSize({ width: 390, height: 900 });
  let release!: () => void;
  await page.route('http://127.0.0.1:5009/api/analytics/dashboard', async route => {
    await new Promise<void>(resolve => { release = resolve; }); await route.fulfill({ status: 403, json: { message: 'Disposable denied projection' } });
  });
  await page.goto('/dashboard'); await expect(page.getByRole('status').filter({ hasText: 'Loading current activity' })).toBeVisible();
  await capture(page, '390-light-loading', true);
  // Release the first failure; subsequent production retries return promptly.
  await page.unroute('http://127.0.0.1:5009/api/analytics/dashboard');
  await page.route('http://127.0.0.1:5009/api/analytics/dashboard', route => route.fulfill({ status: 403, json: { message: 'Disposable denied projection' } })); release();
  await expect(page.getByRole('button', { name: 'Retry activity' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('region', { name: 'Workspace metrics' })).toHaveCount(0); await capture(page, '390-light-error', true);
});
test('restricted workspace exposes personal destinations only, not inaccessible metrics or operator tools', async ({ page }) => {
  await workspace(page, { permissions: [], modules: [] }); await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/dashboard'); await expect(page.getByText(/No metrics are available/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Operator workspace' })).toHaveCount(0);
  await expect(page.getByRole('main').locator('a[href="/customers"]')).toHaveCount(0);
  await capture(page, '320-light-restricted', true);
});
