import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
const api = 'http://127.0.0.1:5011';
interface Fixture { phone: string; password: string; organizationId: string; branchId: string }
async function fixture(request: APIRequestContext, data: object = {}) { return await (await request.post(api + '/__test/fixture', { data })).json() as Fixture; }
async function login(page: Page, f: Fixture) { await page.request.post(api + '/__test/client-phase'); await page.goto('/login'); await page.getByLabel('Phone or email').fill(f.phone); await page.getByLabel('Password', { exact: true }).fill(f.password); await page.getByRole('button', { name: 'Sign In to Ekavio' }).click(); await expect(page).toHaveURL(/dashboard/); }
async function authority(request: APIRequestContext, f: Fixture) { const r = await request.post(api + '/api/auth/login', { data: { phone: f.phone, password: f.password } }); expect(r.status()).toBe(200); return { authorization: 'Bearer ' + (await r.json()).accessToken, 'x-tenant-id': f.organizationId, 'x-branch-id': f.branchId }; }
async function review(page: Page) { await page.getByRole('dialog').getByRole('button', { name: 'Review', exact: true }).click(); }
test('profile review sends no early write; pending confirmation prevents close and duplicate command', async ({ page, request }) => {
  const f = await fixture(request); await login(page, f); await page.goto('/admin'); let writes = 0; let release!: () => void;
  await page.route(api + '/api/organization', async r => { if (r.request().method() !== 'PUT') return r.continue(); writes++; await new Promise<void>(resolve => { release = resolve; }); await r.continue(); });
  await page.getByRole('button', { name: 'Edit business profile' }).click(); await page.getByLabel('Organization name').fill('QA D reviewed profile'); await review(page); expect(writes).toBe(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click(); await expect.poll(() => writes).toBe(1);
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(1); await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
  release(); await expect(page.getByRole('dialog')).toHaveCount(0); await page.reload(); await expect(page.getByRole('heading', { name: 'QA D reviewed profile', exact: true })).toBeVisible(); expect(writes).toBe(1);
});
test('bounded branch projection has no fabricated page/sort and enforces dirty discard before context change', async ({ page, request }) => {
  await login(page, await fixture(request)); await page.goto('/branches'); await expect(page.getByRole('button', { name: 'Edit Main' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Record pagination' })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Branch', exact: true })).toHaveCount(0);
  let writes = 0; page.on('request', r => { if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/branches') writes++; });
  await page.getByRole('button', { name: 'Create branch' }).click(); await page.getByLabel('Branch name').fill('QA unsaved branch'); await page.getByLabel('Branch code').fill('qa-unsaved'); await review(page); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible(); await page.getByRole('button', { name: 'Discard changes', exact: true }).click(); expect(writes).toBe(0); await page.goto('/reports'); await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('staff manager without optional branch/role catalogue grants can review unchanged canonical assignments', async ({ page, request }) => {
  const f = await fixture(request, { permissions: ['staff.read', 'staff.manage'] }); await login(page, f); const calls: string[] = [];
  page.on('request', r => { if (r.url().startsWith(api + '/api/')) calls.push(new URL(r.url()).pathname); }); await page.goto('/staff');
  await page.getByRole('button', { name: 'My branch assignments', exact: true }).click(); await expect(page.getByLabel('Staff role')).toBeDisabled(); await expect(page.getByLabel('Main', { exact: true })).toBeChecked();
  await review(page); await expect(page.getByRole('dialog').getByText(/Assigned branches: Main/)).toBeVisible(); await expect(page.getByRole('dialog')).toContainText('Disposable custom role');
  const response = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().includes('/members/')); await page.getByRole('button', { name: 'Save staff access', exact: true }).click(); expect((await response).status()).toBe(200);
  expect(calls).not.toContain('/api/roles'); expect(calls).not.toContain('/api/branches'); await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('report export reviews exact filter/column snapshot and retains fresh server CSV authorization', async ({ page, request }) => {
  const f = await fixture(request), h = await authority(request, f);
  expect((await request.post(api + '/api/customers', { headers: h, data: { name: '=QA D formula' } })).status()).toBe(201); await login(page, f); await page.goto('/reports');
  const filtered = page.waitForResponse(r => new URL(r.url()).pathname === '/api/reports/customers' && new URL(r.url()).searchParams.get('search') === '=QA D');
  await page.getByLabel('Search names', { exact: true }).fill('=QA D'); expect((await filtered).status()).toBe(200); await expect(page.getByRole('cell', { name: '=QA D formula', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Export CSV' })).toBeEnabled(); let exports = 0;
  page.on('request', r => { if (r.url().includes('/reports/customers/export')) exports++; }); await page.getByRole('button', { name: 'Export CSV' }).click(); await review(page); expect(exports).toBe(0);
  await expect(page.getByRole('dialog').getByText('=QA D', { exact: true })).toBeVisible(); const response = page.waitForResponse(r => r.url().includes('/reports/customers/export')); await page.getByRole('button', { name: 'Download CSV', exact: true }).click(); const r = await response;
  expect(r.status()).toBe(200); const url = new URL(r.url()); expect(url.searchParams.get('search')).toBe('=QA D'); expect(url.searchParams.get('columns')).toBeTruthy(); expect(await r.text()).toContain("'=QA D formula"); expect(exports).toBe(1);
});
test('personal bulk read review covers filtered-out categories without changing another tenant inbox', async ({ page, request }) => {
  const f = await fixture(request), other = await fixture(request), h = await authority(request, f), oh = await authority(request, other);
  const member = (await (await request.get(api + '/api/members', { headers: h })).json()).data[0]; expect((await request.patch(api + '/api/members/' + member.membershipId, { headers: h, data: { role: member.role, customRoleId: member.customRoleId, status: 'active', branchIds: member.branchIds, version: member.version } })).status()).toBe(200);
  await login(page, f); await page.goto('/notifications'); await page.getByLabel('Category', { exact: true }).selectOption('crm'); await expect(page.getByText("You're all caught up.")).toBeVisible(); let writes = 0;
  page.on('request', r => { if (r.url().endsWith('/notifications/read-all')) writes++; }); await page.getByRole('button', { name: 'Mark all read', exact: true }).click(); await review(page); expect(writes).toBe(0); await expect(page.getByRole('dialog').getByText(/including other pages and categories/)).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Mark all read', exact: true }).click(); await expect(page.getByText(/0 unread · Updates/)).toBeVisible(); expect(writes).toBe(1);
  expect((await request.get(api + '/api/notifications', { headers: { ...h, 'x-tenant-id': other.organizationId } })).status()).toBe(403);
  expect((await (await request.get(api + '/api/notifications', { headers: oh })).json()).data.unread).toBe(0);
});
test('tenant Billing exposes persisted facts only and cannot reach operator mutation authority', async ({ page, request }) => {
  const f = await fixture(request), h = await authority(request, f); await login(page, f); await page.goto('/billing');
  await expect(page.getByText('No commercial subscription has been assigned.')).toBeVisible(); await expect(page.getByText('No manual payment records are available.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Pay Now|Record payment|Apply renewal/ })).toHaveCount(0);
  expect((await request.get(api + '/api/billing/operator/renewals', { headers: h })).status()).toBe(403); expect((await request.put(api + '/api/billing/operator/public-pricing/plan/pilot_core', { headers: h, data: {} })).status()).toBe(403);
  await page.goto('/commercial/requests'); await expect(page).toHaveURL(/dashboard/);
});
