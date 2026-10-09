import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { workspace } from './fixtures';

test.beforeEach(async ({ page }) => { const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message)); await page.exposeFunction('qaPageErrors', () => errors); });
test.afterEach(async ({ page }) => { const errors = await page.evaluate(() => (window as unknown as { qaPageErrors: () => Promise<string[]> }).qaPageErrors()); expect(errors).toEqual([]); });

for (const width of [390,768,1440]) {
  for (const mode of ['light','dark'] as const) test(`${width}px ${mode} shell has no document overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await workspace(page);
    if (mode === 'dark') await page.addInitScript(() => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode: 'dark', primaryColor: '#4F46E5' })));
    await page.goto('/customers');
    await expect(page.getByRole('heading', { name: 'Customers', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/shell-${width}-${mode}.png`, fullPage: true });
    if (width === 390) { await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible(); await page.getByRole('button', { name: 'More', exact: true }).click(); await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible(); }
    if (width === 768) { await page.getByRole('button', { name: 'Open navigation' }).click(); await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible(); }
    if (width === 1440) { await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Open navigation' })).toBeHidden(); await expect(page.getByRole('button', { name: 'Close navigation', exact: true })).toBeHidden(); }
  });
}
test('first-time Light and live System theme follow OS changes and persist preference', async ({ page }) => {
  await workspace(page); await page.emulateMedia({ colorScheme: 'dark' }); await page.goto('/settings?section=appearance');
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.getByRole('radio', { name: 'System', exact: true }).check(); await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.emulateMedia({ colorScheme: 'light' }); await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.reload(); await expect(page.getByRole('radio', { name: 'System', exact: true })).toBeChecked();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['ekavio-ui-preferences']);
});
test('permissions hide operational navigation and direct protected routes', async ({ page }) => {
  await workspace(page, { permissions: [] }); await page.goto('/settings');
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Customers', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Commercial Intake', exact: true })).toHaveCount(0);
  await page.goto('/customers'); await expect(page).toHaveURL(/\/dashboard$/);
});
test('entitlement hiding is independent of permission', async ({ page }) => {
  await workspace(page, { modules: [] }); await page.goto('/settings');
  await expect(page.getByRole('link', { name: 'Queue', exact: true })).toHaveCount(0);
  await page.goto('/queue'); await expect(page.getByText('Upgrade Required')).toBeVisible();
});
test('Customers empty, create, edit, detail and search', async ({ page }) => {
  const state = await workspace(page); await page.goto('/customers'); await expect(page.getByRole('heading', { name: 'No customers yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Create your first customer' }).click(); await page.getByLabel('Customer name', { exact: true }).fill('STAGING V208A Customer'); await page.getByLabel('Notes (optional)').fill('Disposable fixture'); await page.getByRole('button', { name: 'Save customer' }).click();
  await expect(page.getByRole('heading', { name: 'STAGING V208A Customer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit STAGING V208A Customer' }).click(); await page.getByLabel('Customer name', { exact: true }).fill('STAGING V208A Updated'); await page.getByLabel('Notes (optional)').fill('Updated note'); await page.getByRole('button', { name: 'Save customer' }).click();
  await page.getByRole('button', { name: 'View STAGING V208A Updated' }).click(); await expect(page.getByText('Updated note', { exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Close modal' }).click();
  await page.getByLabel('Search customers', { exact: true }).fill('Missing'); await expect(page.getByRole('heading', { name: 'No matching customers' })).toBeVisible();
  expect(state.customers).toHaveLength(1); expect(state.customers[0].notes).toBe('Updated note');
});
test('Services empty, create/edit, Queue and Appointment consume same catalogue', async ({ page }) => {
  const state = await workspace(page); await page.goto('/services'); await expect(page.getByRole('heading', { name: 'No services yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Create your first service' }).click(); await page.getByLabel('Service name', { exact: true }).fill('STAGING V208A Service'); await page.getByLabel('Duration (minutes)').fill('45'); await page.getByRole('button', { name: 'Save service' }).click();
  await page.getByRole('button', { name: 'Edit STAGING V208A Service' }).click(); await page.getByLabel('Service name', { exact: true }).fill('STAGING V208A Updated Service'); await page.getByRole('button', { name: 'Save service' }).click();
    await expect(page.getByRole('heading', { name: 'STAGING V208A Updated Service', exact: true })).toBeVisible();
  await page.goto('/queue'); await page.getByRole('button', { name: 'New token', exact: true }).click(); await expect(page.getByLabel('Branch-available service').getByRole('option', { name: 'STAGING V208A Updated Service · 45 min', exact: true })).toHaveCount(1); await page.getByRole('button', { name: 'Close modal' }).click();
  await page.goto('/appointments'); await page.getByRole('button', { name: 'New appointment', exact: true }).click(); await expect(page.getByLabel('Branch-available service').getByRole('option', { name: 'STAGING V208A Updated Service · 45 min', exact: true })).toHaveCount(1);
  expect(state.services).toHaveLength(1); expect(state.services[0].durationMinutes).toBe(45);
});
test('read-only membership has no customer/service mutations', async ({ page }) => {
  await workspace(page, { permissions: ['customers.read','services.read'] }); await page.goto('/customers'); await expect(page.getByRole('button', { name: 'Create customer', exact: true })).toHaveCount(0); await page.goto('/services'); await expect(page.getByRole('button', { name: 'Create service', exact: true })).toHaveCount(0);
});
test('Customer load failure has a working retry', async ({ page }) => {
  const state = await workspace(page, { failCustomers: true }); await page.goto('/customers'); await expect(page.getByRole('button', { name: 'Retry customers' })).toBeVisible(); state.enableCustomers(); await page.getByRole('button', { name: 'Retry customers' }).click(); await expect(page.getByRole('heading', { name: 'No customers yet' })).toBeVisible();
});

test('Customer pagination uses API pages and search resets the page', async ({ page }) => {
  const state = await workspace(page);
  for (let index = 1; index <= 21; index++) state.customers.push({ id: randomUUID(), name: `Disposable Customer ${index}`, phone: null, notes: null, status: 'active' });
  await page.goto('/customers'); await expect(page.getByText('Page 1 of 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Disposable Customer 21', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Disposable Customer 1', exact: true })).toHaveCount(0);
  await page.getByLabel('Search customers', { exact: true }).fill('Customer 1'); await expect(page.getByText('Page 1 of 1', { exact: true })).toBeVisible();
});

test('mobile drawer and customer dialog support keyboard focus and Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 }); await workspace(page); await page.goto('/customers');
  const more = page.getByRole('button', { name: 'More', exact: true }); await more.click(); await page.keyboard.press('Escape'); await expect(more).toBeFocused();
  const create = page.getByRole('button', { name: 'Create customer', exact: true }); await create.click();
  const dialog = page.getByRole('dialog', { name: 'Create customer', exact: true }); await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close modal' })).toBeFocused(); await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role=dialog]')))).toBe(true);
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(create).toBeFocused();
});
test('Settings uses human context, hides UUID, and saves profile', async ({ page }) => {
  const state = await workspace(page); await page.goto('/settings'); await expect(page.getByLabel('Your name')).toHaveValue('STAGING V208A Member'); await expect(page.getByText(state.org, { exact: true })).not.toBeVisible();
  await page.getByLabel('Your name').fill('STAGING V208A Profile'); await page.getByRole('button', { name: 'Save profile' }).click(); await expect(page.getByRole('link', { name: 'Open my profile' })).toHaveText('STAGING V208A Profile');
  await page.getByRole('button', { name: 'Organization', exact: true }).click(); await expect(page.getByRole('main').getByText('STAGING V208A Workspace', { exact: true })).toBeVisible(); await expect(page.getByRole('main').getByText('Main', { exact: true })).toHaveCount(1); await expect(page.getByRole('link',{name:'Open organization administration'})).toHaveAttribute('href','/admin');
});
test('commercial operator navigation stays separate and pricing uses exact rupees', async ({ page }) => {
  const state = await workspace(page, { operator: true }); await page.goto('/commercial/requests'); await expect(page.getByRole('heading', { name: 'Platform operations', exact: true })).toBeVisible();
  await expect(page.getByLabel('Monthly price ₹')).toHaveValue('123.45'); await expect(page.getByLabel('Yearly price ₹')).toHaveValue('1000.00'); await page.getByLabel('Monthly price ₹').fill('199.99'); await page.getByRole('button', { name: 'Save pricing' }).click(); await expect.poll(() => state.pricing()?.monthlyPriceMinor).toBe('19999');
});
test('anonymous protected route and logout return to Login', async ({ page }) => {
  await workspace(page, { authenticated: false }); await page.goto('/customers'); await expect(page).toHaveURL(/\/login$/);
});
test('logout clears memory session and protected destinations', async ({ page }) => {
  await workspace(page); await page.goto('/settings'); await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(page).toHaveURL(/\/login$/); await page.goto('/customers'); await expect(page).toHaveURL(/\/login$/);
});
