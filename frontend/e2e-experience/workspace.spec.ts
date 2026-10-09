import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
const api = 'http://127.0.0.1:5011';
interface Fixture { phone: string; password: string; organizationId: string; branchId: string }
const headings: Record<string, string | RegExp> = {
  '/dashboard': /^Welcome,/, '/customers': 'Customers', '/services': 'Services', '/queue': 'Queue Management',
  '/appointments': 'Appointments', '/attendance': 'Daily Attendance', '/ledger': 'Customer Dues', '/inventory': 'Inventory',
  '/crm': 'CRM & Follow-ups', '/purchasing': 'Purchasing', '/suppliers': 'Suppliers', '/hr': 'HR Plus', '/reports': 'Reports',
  '/notifications': 'Notifications', '/staff': 'Staff', '/admin': 'Organization administration', '/branches': 'Branches', '/roles': 'Roles & permissions',
  '/custom-fields': 'Data & Forms', '/billing': 'Subscription & Modules', '/platform': 'Platform Operations',
  '/commercial/requests': 'Commercial Intake', '/commercial/renewals': 'Subscriptions & Renewals', '/corporate': 'Corporate HQ',
  '/audit': 'Audit history', '/help': 'Help & Support', '/settings': 'Settings',
};
async function fixture(request: APIRequestContext, options = {}) {
  const response = await request.post(`${api}/__test/fixture`, { data: { modules: ['queue', 'attendance', 'ledger', 'inventory', 'crm', 'purchasing', 'hr_plus'], operator: true, ...options } });
  expect(response.status()).toBe(200); return await response.json() as Fixture;
}
async function login(page: Page, account: Fixture) {
  await page.goto('/login'); await page.getByLabel('Phone or email').fill(account.phone); await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign In to Ekavio' }).click(); await expect(page).toHaveURL(/dashboard/);
}
async function headers(request: APIRequestContext, account: Fixture) {
  const response = await request.post(`${api}/api/auth/login`, { data: { phone: account.phone, password: account.password } }); expect(response.status()).toBe(200);
  return { authorization: `Bearer ${(await response.json()).accessToken}`, 'x-tenant-id': account.organizationId, 'x-branch-id': account.branchId };
}
for (const width of [320, 768, 1440]) for (const mode of ['light', 'dark', 'system']) test(`all existing modules under loaded shell ${width}px ${mode}`, async ({ page, request }) => {
  const account = await fixture(request), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.name)); await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: 'dark' }); await login(page, account);
  await page.goto('/settings?section=appearance'); await page.getByRole('radio', { name: new RegExp(`^${mode}$`, 'i') }).check();
  for (const path of ['/dashboard', '/customers', '/services', '/queue', '/appointments', '/attendance', '/ledger', '/inventory', '/crm', '/purchasing', '/suppliers', '/hr', '/reports', '/notifications', '/staff', '/admin', '/branches', '/roles', '/custom-fields', '/billing', '/platform', '/commercial/requests', '/commercial/renewals', '/corporate', '/audit', '/help', '/settings']) {
    // Exercise actual SPA navigation, not 27 consecutive cold refreshes that
    // artificially exhaust the deployed session-refresh limiter.
    const navigation = page.getByRole('navigation', { name: 'Main navigation' });
    if (!await navigation.isVisible()) await page.getByRole('button', { name: width < 768 ? 'More' : 'Open navigation', exact: true }).click();
    await navigation.locator(`a[href="${path}"]`).click();
    await expect(page).toHaveURL(new RegExp(path + '(?:\\?|$)'));
    await expect(page.getByRole('heading', { level: 1, name: headings[path], exact: path !== '/dashboard' })).toBeVisible(); await expect(page.locator('.route-loader')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
    // Every visible editable field must have an accessible name. Ordinary
    // domain controls keep their existing semantics; no forced UI rewrite.
    for (const control of await page.locator('main input:not([type=hidden]), main select, main textarea').all()) {
      if (await control.isVisible()) await expect(control).toHaveAccessibleName(/\S/);
    }
  }
  expect(errors).toEqual([]);
});

test('real branch switch, server custom filter, customer detail, read-only and cross-tenant negatives', async ({ page, request }) => {
  const account = await fixture(request, { seedCustomerField: true }), h = await headers(request, account);
  const customerResponse = await request.post(`${api}/api/customers`, { headers: h, data: { name: 'QA scoped customer', customFields: { local_note: 'QA scoped value' } } }); expect(customerResponse.status()).toBe(201);
  const customer = (await customerResponse.json()).data;
  const created = await request.post(`${api}/api/branches`, { headers: h, data: { name: 'QA second branch', code: 'qa-second', timezone: 'Asia/Kolkata', status: 'active' } }); expect(created.status()).toBe(200); const branch = (await created.json()).data;
  const member = (await (await request.get(`${api}/api/members`, { headers: h })).json()).data[0];
  expect((await request.patch(`${api}/api/members/${member.membershipId}`, { headers: h, data: { role: member.role, status: 'active', customRoleId: member.customRoleId, branchIds: [account.branchId, branch.id], version: member.version } })).ok()).toBe(true);
  await login(page, account); await page.goto('/customers'); await expect(page.getByRole('heading', { level: 1, name: 'Customers', exact: true })).toBeVisible();
  await page.getByLabel('Active branch', { exact: true }).selectOption(branch.id);
  await expect(page.getByLabel('Active branch', { exact: true })).toBeEnabled();
  await expect(page.getByLabel('Active branch', { exact: true })).toHaveValue(branch.id); await expect(page.getByRole('heading', { name: 'QA scoped customer', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Custom field filter', exact: true }).selectOption('local_note');
  const filtered = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/customers' && url.searchParams.get('field') === 'local_note' && url.searchParams.get('value') === 'QA scoped value';
  });
  await page.getByLabel('Filter value', { exact: true }).fill('QA scoped value'); expect((await filtered).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'QA scoped customer', exact: true })).toBeVisible();
  await page.getByLabel('Filter value', { exact: true }).fill('Not matched'); await expect(page.getByRole('heading', { name: 'No matching customers' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click(); await page.getByRole('button', { name: 'View QA scoped customer' }).click(); await expect(page.getByText('QA scoped value', { exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Back to customers' }).click();
  await expect(page.getByLabel('Active branch', { exact: true })).toHaveValue(branch.id);
  const foreign = await fixture(request, { permissions: ['customers.read'], operator: false }), fh = await headers(request, foreign);
  for (const path of [`customers/${customer.id}`, `forms/customer/values/${customer.id}`]) expect((await request.get(`${api}/api/${path}`, { headers: fh })).status()).toBe(404);
  expect((await request.get(`${api}/api/customers`, { headers: { ...fh, 'x-tenant-id': account.organizationId } })).status()).toBe(403);
  expect((await request.get(`${api}/api/customers`, { headers: { ...fh, 'x-branch-id': account.branchId } })).status()).toBe(403);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await login(page, foreign); await page.goto('/customers');
  await expect(page.getByRole('heading', { level: 1, name: 'Customers', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create customer', exact: true })).toHaveCount(0); await expect(page.getByRole('heading', { name: 'QA scoped customer', exact: true })).toHaveCount(0);
});
