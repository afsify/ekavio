import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
const api = 'http://127.0.0.1:5011';
interface Account { phone: string; password: string; organizationId: string; branchId: string }
async function fixture(request: APIRequestContext, options = {}) {
  const response = await request.post(`${api}/__test/fixture`, { data: { seedCustomerField: true, ...options } }); expect(response.status()).toBe(200); return await response.json() as Account;
}
async function headers(request: APIRequestContext, account: Account) {
  const response = await request.post(`${api}/api/auth/login`, { data: { phone: account.phone, password: account.password } }); expect(response.status()).toBe(200);
  return { authorization: `Bearer ${(await response.json()).accessToken}`, 'x-tenant-id': account.organizationId, 'x-branch-id': account.branchId };
}
async function login(page: Page, account: Account) {
  await page.goto('/login'); await page.getByLabel('Phone or email').fill(account.phone); await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign In to Ekavio' }).click(); await expect(page).toHaveURL(/dashboard/);
}
test('premium Customer canonical/custom create-edit persist in PostgreSQL with server search, paging and tenant negatives', async ({ page, request }) => {
  const account = await fixture(request), h = await headers(request, account);
  for (let index = 0; index < 21; index++) expect((await request.post(`${api}/api/customers`, { headers: h, data: { name: `QA bounded ${String(index).padStart(2, '0')}`, customFields: { local_note: 'QA page fixture' } } })).status()).toBe(201);
  await login(page, account); await page.goto('/customers'); await expect(page.getByText('21 records', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click(); await expect(page.getByRole('heading', { name: 'QA bounded 20', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'QA bounded 00', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Create customer', exact: true }).click(); await page.getByLabel('Customer name', { exact: true }).fill('QA premium customer');
  await expect(page.getByRole('button', { name: 'Save customer' })).toBeDisabled(); await page.getByLabel('QA ordinary note *').fill('QA first custom value');
  await page.getByLabel('Notes (optional)', { exact: true }).fill('QA first canonical note'); await page.getByRole('button', { name: 'Save customer' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Search customers', { exact: true }).fill('QA premium customer'); await expect(page.getByRole('heading', { name: 'QA premium customer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View QA premium customer', exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole('dialog').getByText('QA first custom value', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Record information', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Edit customer', exact: true }).click();
  await page.getByLabel('Notes (optional)', { exact: true }).fill('QA persisted canonical note'); await page.getByLabel('QA ordinary note *').fill('QA persisted custom value');
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('inactive'); await page.getByRole('button', { name: 'Save customer' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload(); await page.getByLabel('Search customers', { exact: true }).fill('QA premium customer'); await page.getByRole('button', { name: 'View QA premium customer', exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole('dialog').getByText('QA persisted canonical note', { exact: true })).toBeVisible(); await expect(page.getByRole('dialog').getByText('QA persisted custom value', { exact: true })).toBeVisible(); await expect(page.getByRole('dialog').getByText('Inactive', { exact: true })).toBeVisible();
  const result = await request.get(`${api}/api/customers?search=QA%20premium%20customer`, { headers: h }); expect(result.status()).toBe(200); const rows = (await result.json()).data; expect(rows).toHaveLength(1); expect(rows[0].notes).toBe('QA persisted canonical note'); expect(rows[0].status).toBe('inactive');
  const foreign = await fixture(request, { permissions: ['customers.read'], seedCustomerField: false }), fh = await headers(request, foreign);
  for (const path of [`customers/${rows[0].id}`, `forms/customer/values/${rows[0].id}`]) expect((await request.get(`${api}/api/${path}`, { headers: fh })).status()).toBe(404);
  expect((await request.patch(`${api}/api/customers/${rows[0].id}`, { headers: fh, data: { notes: 'Denied' } })).status()).toBe(403);
});
test('lost create response commits once, disables replay and retains the Customer draft', async ({ page, request }) => {
  const account = await fixture(request), h = await headers(request, account); await page.setViewportSize({ width: 390, height: 900 }); await login(page, account); await page.goto('/customers');
  await page.getByRole('button', { name: 'Create customer', exact: true }).click(); await page.getByLabel('Customer name', { exact: true }).fill('QA response-loss customer'); await page.getByLabel('QA ordinary note *').fill('QA retained draft');
  let attempts = 0; await page.route(`${api}/api/customers`, async route => { if (route.request().method() !== 'POST') return route.continue(); attempts++; const committed = await route.fetch(); expect(committed.status()).toBe(201); await route.abort('connectionfailed'); });
  await page.getByRole('button', { name: 'Save customer' }).click(); await expect(page.getByRole('alert')).toContainText('The customer may already have been created'); await expect(page.getByRole('button', { name: 'Save customer' })).toBeDisabled();
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Keep editing' }).click(); await expect(page.getByLabel('QA ordinary note *')).toHaveValue('QA retained draft'); expect(attempts).toBe(1);
  const result = await request.get(`${api}/api/customers?search=QA%20response-loss%20customer`, { headers: h }); expect(result.status()).toBe(200); expect((await result.json()).data).toHaveLength(1);
});
