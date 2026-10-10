import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
const api = 'http://127.0.0.1:5011';
interface Fixture { phone: string; password: string; organizationId: string; branchId: string }
let fixture: Fixture, h: Record<string, string>, errors: string[];
test.beforeEach(async ({ page, request }) => {
  fixture = await (await request.post(api + '/__test/fixture', { data: { modules: ['crm', 'purchasing', 'inventory'] } })).json();
  const login = await request.post(api + '/api/auth/login', { data: { phone: fixture.phone, password: fixture.password } });
  expect(login.status()).toBe(200); h = { authorization: 'Bearer ' + (await login.json()).accessToken, 'x-tenant-id': fixture.organizationId, 'x-branch-id': fixture.branchId };
  errors = []; page.on('pageerror', error => errors.push(error.name));
});
test.afterEach(() => expect(errors).toEqual([]));
async function post(request: APIRequestContext, path: string, data: unknown, status = 201) { const r = await request.post(api + '/api' + path, { headers: h, data }); expect(r.status()).toBe(status); return (await r.json()).data; }
async function get(request: APIRequestContext, path: string) { const r = await request.get(api + '/api' + path, { headers: h }); expect(r.status()).toBe(200); return (await r.json()).data; }
async function login(page: Page) { await page.goto('/login'); await page.getByLabel('Phone or email').fill(fixture.phone); await page.getByLabel('Password', { exact: true }).fill(fixture.password); await page.getByRole('button', { name: 'Sign In to Ekavio' }).click(); await expect(page).toHaveURL(/dashboard/); }
async function stages(request: APIRequestContext) { await post(request, '/crm/stages/recommended', {}); return get(request, '/crm/stages'); }
async function order(request: APIRequestContext) {
  const supplier = await post(request, '/suppliers', { name: 'QA relationship supplier' });
  const item = await post(request, '/inventory', { name: 'QA relationship stock', unitCode: 'kg', reorderThreshold: '0', idempotencyKey: crypto.randomUUID() });
  const po = await post(request, '/purchasing/orders', { supplierId: supplier.id, orderDate: '2026-10-10', lines: [{ itemId: item.id, quantity: '10', unitPrice: '1.25' }] });
  await post(request, '/purchasing/orders/' + po.id + '/status', { status: 'ordered', expectedVersion: po.version }, 200);
  return { supplier, item, po: await get(request, '/purchasing/orders/' + po.id) };
}

test('Lead lost/reactivation/archive and explicit existing-Customer conversion retain history', async ({ page, request }) => {
  const pipeline = await stages(request), lead = await post(request, '/crm/leads', { name: 'QA retained relationship', pipelineStageId: pipeline[0].id });
  const customer = await post(request, '/customers', { name: 'QA explicit existing Customer' });
  await login(page); await page.goto('/crm?lead=' + lead.id); const detail = page.getByRole('dialog', { name: 'Lead details' });
  await detail.getByLabel('Lost reason').fill('Not ready yet'); await detail.getByRole('button', { name: 'Mark lost', exact: true }).click();
  await detail.getByRole('button', { name: 'Confirm Lead status', exact: true }).click(); await expect(detail.getByRole('button', { name: 'Reactivate lead' })).toBeVisible();
  await detail.getByRole('button', { name: 'Reactivate lead' }).click(); await detail.getByRole('button', { name: 'Confirm Lead status' }).click(); await expect(detail.getByRole('button', { name: 'Archive lead' })).toBeVisible();
  await detail.getByRole('button', { name: 'Archive lead' }).click(); await detail.getByRole('button', { name: 'Confirm Lead status' }).click(); await expect(detail.getByRole('button', { name: 'Reactivate lead' })).toBeVisible();
  await detail.getByRole('button', { name: 'Reactivate lead' }).click(); await detail.getByRole('button', { name: 'Confirm Lead status' }).click();
  await detail.getByRole('button', { name: 'Convert to Customer' }).click(); await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByLabel('Conversion mode').selectOption('existing'); await page.getByLabel('Search existing Customers').fill('QA explicit existing Customer'); await page.getByRole('combobox', { name: 'Existing Customer', exact: true }).selectOption(customer.id);
  await page.getByRole('dialog').getByRole('button', { name: 'Review', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Confirm permanent Customer link' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm conversion' }).click(); await expect(detail.getByRole('link', { name: 'Open Customer' })).toBeVisible();
  const after = await get(request, '/crm/leads/' + lead.id); expect(after.status).toBe('converted'); expect(after.converted_customer_id).toBe(customer.id);
  await expect(detail.getByText('Marked lost', { exact: false })).toBeVisible(); await expect(detail.getByText('Lead archived', { exact: false })).toBeVisible();
});

test('CRM server pages, sort, filter reset and accessible pipeline selection', async ({ page, request }) => {
  const pipeline = await stages(request);
  for (let i = 0; i < 23; i++) await post(request, '/crm/leads', { name: 'QA page lead ' + String(i).padStart(2, '0'), pipelineStageId: pipeline[0].id });
  await login(page); await page.goto('/crm'); await expect(page.getByRole('navigation', { name: 'Record pagination' })).toContainText('Page 1 of 2');
  await page.getByRole('navigation', { name: 'Record pagination' }).getByRole('button', { name: 'Next', exact: true }).click(); await expect(page.getByRole('navigation', { name: 'Record pagination' })).toContainText('Page 2 of 2');
  const queried = page.waitForResponse(r => r.url().includes('/crm/leads?') && new URL(r.url()).searchParams.get('search') === 'QA page lead 00'); await page.getByLabel('Search leads').fill('QA page lead 00'); const result = await queried; expect(result.ok()).toBe(true); expect(new URL(result.url()).searchParams.get('page')).toBe('1');
  await expect(page.getByRole('heading', { name: 'QA page lead 00', exact: true })).toBeVisible(); await page.getByLabel('Sort leads').selectOption('oldest');
  await page.getByRole('button', { name: 'Clear lead filters' }).click(); await page.getByRole('button', { name: 'pipeline', exact: true }).click();
  await page.getByRole('button', { name: 'View stage Contacted', exact: true }).click(); await expect(page.getByRole('button', { name: 'pipeline', exact: true })).toHaveAttribute('aria-pressed', 'true'); await expect(page.getByRole('heading', { name: 'No matching leads' })).toBeVisible();
});

test('lost receiving response retries identical confirmed command and increases stock once', async ({ page, request }) => {
  const f = await order(request), commands: unknown[] = []; let first = true;
  await login(page); await page.goto('/purchasing?order=' + f.po.id); await page.getByRole('button', { name: 'Receive Goods', exact: true }).click();
  await page.route('**/api/purchasing/orders/' + f.po.id + '/receive', async route => { commands.push(route.request().postDataJSON()); if (first) { first = false; const committed = await route.fetch(); expect(committed.status()).toBe(201); await route.abort('failed'); } else await route.continue(); });
  await page.getByLabel('Quantity actually received — QA relationship stock').fill('4'); await page.getByRole('button', { name: 'Review receipt' }).click(); await page.getByRole('button', { name: 'Confirm Receive Goods' }).click();
  await expect(page.getByRole('button', { name: 'Retry identical receipt' })).toBeEnabled(); await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry identical receipt' }).click(); await expect(page.getByRole('dialog', { name: 'Purchase Order details' }).getByText('Ordered 10.000 · Received 4.000 · Remaining 6.000', { exact: true })).toBeVisible();
  expect(commands).toHaveLength(2); expect(commands[1]).toEqual(commands[0]); const after = await get(request, '/purchasing/orders/' + f.po.id); expect(after.receipts).toHaveLength(1); expect((await get(request, '/inventory/' + f.item.id)).quantity).toBe('4.000');
});

for (const path of ['/crm', '/suppliers', '/purchasing']) test(`${path} branch switching unmounts private details/drafts and refetches canonical scope`, async ({ page, request }) => {
  const pipeline = await stages(request), lead = await post(request, '/crm/leads', { name: 'QA private first branch lead', pipelineStageId: pipeline[0].id }), f = await order(request);
  const branch = await post(request, '/branches', { name: 'QA second relationship branch', code: 'qa-other', timezone: 'America/New_York', status: 'active' }, 200);
  const member = (await get(request, '/members'))[0]; const patched = await request.patch(api + '/api/members/' + member.membershipId, { headers: h, data: { role: member.role, status: 'active', customRoleId: member.customRoleId, branchIds: [fixture.branchId, branch.id], version: member.version } }); expect(patched.ok()).toBe(true);
  await login(page); await page.goto(path === '/crm' ? path + '?lead=' + lead.id : path === '/purchasing' ? path + '?order=' + f.po.id : path);
  if (path === '/suppliers') await page.getByRole('button', { name: 'View QA relationship supplier', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: path === '/crm' ? 'Create lead' : path === '/suppliers' ? 'Add Supplier' : 'Create Purchase Order', exact: true }).click();
  await page.getByLabel(path === '/crm' ? 'Lead name' : path === '/suppliers' ? 'Supplier name' : 'Order notes (optional)', { exact: true }).fill('QA discarded first-branch draft');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByLabel('Active branch', { exact: true }).selectOption(branch.id); await expect(page.getByLabel('Active branch', { exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(0); if (path === '/crm') await expect(page.getByRole('heading', { name: 'No leads yet' })).toBeVisible();
  if (path === '/purchasing') await expect(page.getByRole('heading', { name: 'No Purchase Orders yet' })).toBeVisible();
  if (path === '/suppliers') { await page.getByRole('button', { name: 'View QA relationship supplier', exact: true }).click(); await expect(page.getByRole('dialog').getByText('0 orders · Last ordered: Never', { exact: true })).toBeVisible(); await expect(page.getByRole('dialog').getByText(f.po.human_reference, { exact: true })).toHaveCount(0); }
});
