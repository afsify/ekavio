import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const api = 'http://127.0.0.1:5011';
interface Fixture { phone: string; password: string; organizationId: string; branchId: string; people: Record<string, { membershipId: string }> }
let fixture: Fixture, h: Record<string, string>, errors: string[];
test.beforeEach(async ({ page, request }) => {
  fixture = await (await request.post(api + '/__test/fixture', { data: { modules: ['queue', 'attendance', 'ledger', 'inventory', 'purchasing'], hrFixture: true } })).json();
  const login = await request.post(api + '/api/auth/login', { data: { phone: fixture.phone, password: fixture.password } }); expect(login.status()).toBe(200);
  h = { authorization: 'Bearer ' + (await login.json()).accessToken, 'x-tenant-id': fixture.organizationId, 'x-branch-id': fixture.branchId };
  errors = []; page.on('pageerror', e => errors.push(e.name));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});
test.afterEach(() => expect(errors).toEqual([]));
async function login(page: Page) { await page.goto('/login'); await page.getByLabel('Phone or email').fill(fixture.phone); await page.getByLabel('Password', { exact: true }).fill(fixture.password); await page.getByRole('button', { name: 'Sign In to Ekavio' }).click(); await expect(page).toHaveURL(/dashboard/); }
async function post(request: APIRequestContext, path: string, data: object, status = 201) { const r = await request.post(api + '/api' + path, { headers: h, data }); expect(r.status()).toBe(status); return (await r.json()).data; }
async function catalogue(request: APIRequestContext) { return { customer: await post(request, '/customers', { name: 'QA operations customer' }), service: await post(request, '/services', { name: 'QA operations service', durationMinutes: 30 }) }; }
async function confirm(page: Page, label: string) { await page.getByRole('dialog').getByRole('button', { name: 'Review', exact: true }).click(); await expect(page.getByRole('dialog').getByRole('button', { name: label, exact: true })).toBeEnabled(); await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click(); }
async function get(request: APIRequestContext, path: string) { const r = await request.get(api + '/api' + path, { headers: h }); expect(r.status()).toBe(200); return r.json(); }

test('mobile reception quick-create, reviewed token, realtime and versioned transitions', async ({ page, request }) => {
  const { service } = await catalogue(request);
  expect((await request.post(api + '/api/forms/customer/definitions', { headers: h, data: { key: 'reception_note', label: 'QA reception note', help: 'Disposable reception field', fieldType: 'text', status: 'active', required: true, searchable: false, filterable: false, reportable: false, defaultValue: null, options: [] } })).status()).toBe(200);
  await page.setViewportSize({ width: 390, height: 900 }); await login(page); await page.goto('/queue');
  await page.getByRole('button', { name: 'New token', exact: true }).click(); await page.getByRole('button', { name: 'Quick-create customer', exact: true }).click();
  await page.getByLabel('Customer name', { exact: true }).fill('QA reception quick customer'); await expect(page.getByRole('button', { name: 'Review', exact: true })).toBeDisabled(); await page.getByLabel('QA reception note *').fill('Reviewed reception note'); await confirm(page, 'Create and select');
  await expect(page.getByLabel('Customer', { exact: true }).getByRole('option', { selected: true })).toHaveText('QA reception quick customer');
  await page.getByLabel('Branch-available service').selectOption(service.id); await confirm(page, 'Generate token');
  await expect(page.getByRole('button', { name: 'Serve customer', exact: true })).toBeVisible();
  const queue = await get(request, '/queue'), token = queue.data[0]; expect(queue.summary.active).toBe(1); expect(token.customer.name).toBe('QA reception quick customer');
  await page.getByRole('button', { name: 'Serve customer', exact: true }).click(); await page.getByRole('button', { name: 'Confirm status', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Complete service', exact: true })).toBeVisible();
  expect((await request.patch(api + '/api/queue/' + token.id + '/status', { headers: h, data: { status: 'cancelled', expectedVersion: token.version } })).status()).toBe(409);
  await page.getByRole('button', { name: 'Complete service', exact: true }).click(); await page.getByRole('button', { name: 'Confirm status', exact: true }).click(); await expect(page.getByRole('heading', { name: 'No active tokens' })).toBeVisible();
  await post(request, '/queue', { customerId: token.customer.id, serviceId: service.id, idempotencyKey: randomUUID() });
  await expect(page.getByRole('button', { name: 'Serve customer', exact: true })).toBeVisible(); // committed Socket.IO event, no refresh button
  await page.reload(); expect((await get(request, '/queue')).summary.active).toBe(1);
});
test('uncertain quick-customer response never promises unsupported idempotent replay or submits twice', async ({ page, request }) => {
  await catalogue(request); await login(page); await page.goto('/queue');
  await page.getByRole('button', { name: 'New token', exact: true }).click(); await page.getByRole('button', { name: 'Quick-create customer', exact: true }).click();
  await page.getByLabel('Customer name', { exact: true }).fill('QA uncertain reception customer'); let attempts = 0;
  await page.route(api + '/api/customers', async route => { if (route.request().method() !== 'POST') return route.continue(); attempts++; const committed = await route.fetch(); expect(committed.status()).toBe(201); await route.abort('connectionfailed'); });
  await confirm(page, 'Create and select'); await expect(page.getByRole('alert')).toContainText('no idempotent replay contract');
  await expect(page.getByRole('button', { name: 'Create and select', exact: true })).toBeDisabled(); expect(attempts).toBe(1);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await page.getByLabel('Search customers', { exact: true }).fill('QA uncertain reception customer');
  await expect(page.getByLabel('Customer', { exact: true }).getByRole('option', { name: 'QA uncertain reception customer', exact: true })).toHaveCount(1);
  const persisted = await get(request, '/customers?search=QA%20uncertain%20reception%20customer'); expect(persisted.data).toHaveLength(1); expect((await get(request, '/queue')).data).toHaveLength(0);
});

test('appointment branch date/time, custom fields, detail and exactly-one check-in', async ({ page, request }) => {
  const { customer, service } = await catalogue(request);
  expect((await request.post(api + '/api/forms/appointment/definitions', { headers: h, data: { key: 'visit_note', label: 'QA visit note', help: 'Disposable local note', fieldType: 'text', status: 'active', required: true, searchable: false, filterable: false, reportable: false, defaultValue: null, options: [] } })).status()).toBe(200);
  await page.setViewportSize({ width: 390, height: 900 }); await login(page); await page.goto('/appointments'); await page.getByLabel('Appointment date').fill('2026-10-12');
  await page.getByRole('button', { name: 'New appointment', exact: true }).click(); await page.getByLabel('Customer', { exact: true }).selectOption(customer.id); await page.getByLabel('Branch-available service').selectOption(service.id); await page.getByLabel('Local start time').fill('10:30'); await page.getByLabel('QA visit note *').fill('Reviewed visit'); await confirm(page, 'Create appointment');
  await expect(page.locator('.table-mobile').getByText('10:30–11:00', { exact: true })).toBeVisible(); const appointments = await get(request, '/appointments?date=2026-10-12'); expect(appointments.data).toHaveLength(1); expect(appointments.data[0].startsAt).toBe('2026-10-12T05:00:00.000Z'); expect(appointments.data[0].endsAt).toBe('2026-10-12T05:30:00.000Z');
  await page.getByRole('button', { name: 'Details', exact: true }).click(); await expect(page.getByRole('dialog').getByText('Reviewed visit', { exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Back to schedule', exact: true }).click();
  await page.getByRole('button', { name: 'Check in', exact: true }).click(); await page.getByRole('button', { name: 'Confirm check-in', exact: true }).click(); await expect(page.locator('.table-mobile').getByText('Checked in', { exact: true })).toBeVisible();
  const replay = await post(request, '/appointments/' + appointments.data[0].id + '/check-in', { idempotencyKey: 'check-in:' + appointments.data[0].id }, 200); expect(replay.created).toBe(false); expect((await get(request, '/queue')).data).toHaveLength(1);
  await page.getByLabel('Appointment date').fill('2026-10-13'); await expect(page.getByRole('heading', { name: 'No appointments on this date' })).toBeVisible();
  await page.getByLabel('Appointment date').fill('2026-10-12'); await page.reload(); await page.getByLabel('Appointment date').fill('2026-10-12'); await expect(page.locator('.table-mobile').getByText('10:30–11:00', { exact: true })).toBeVisible();
});
test('attendance keeps unmarked distinct, marks all states, corrects with history and rejects stale writes', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 900 }); await login(page); await page.goto('/attendance'); await page.getByLabel('Business date').fill('2026-10-12');
  const card = (name: string) => page.locator('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
  for (const [name, status] of [['QA employee', 'present'], ['QA colleague', 'absent'], ['QA reviewer', 'half_day']]) {
    await expect(card(name).getByText('Unmarked', { exact: true })).toBeVisible(); await card(name).getByRole('button', { name: 'Mark attendance', exact: true }).click(); await page.getByLabel('Proposed attendance status').selectOption(status); await confirm(page, 'Save attendance'); await expect(card(name).getByRole('button', { name: 'Correct attendance' })).toBeVisible();
  }
  const before = (await get(request, '/attendance?date=2026-10-12')).data; expect(before.summary.present).toBe(1); expect(before.summary.absent).toBe(1); expect(before.summary.half_day).toBe(1); expect(before.summary.unmarked).toBeGreaterThan(0);
  await card('QA employee').getByRole('button', { name: 'Correct attendance' }).click(); await page.getByLabel('Proposed attendance status').selectOption('half_day'); await page.getByLabel('Correction reason').fill('Reviewed corrected status'); await confirm(page, 'Save attendance');
  await card('QA employee').getByRole('button', { name: 'History (1)' }).click(); await expect(page.getByRole('dialog').getByText('Reviewed corrected status', { exact: true })).toBeVisible();
  const entry = before.roster.find((r: { membershipId: string }) => r.membershipId === fixture.people.employee.membershipId); expect((await request.post(api + '/api/attendance', { headers: h, data: { membershipId: entry.membershipId, attendanceDate: '2026-10-12', status: 'absent', expectedVersion: entry.attendance.version, correctionReason: 'Stale correction' } })).status()).toBe(409);
  await page.reload(); await page.getByLabel('Business date').fill('2026-10-12'); await expect(card('QA employee').getByText('Half-day', { exact: true })).toBeVisible();
});
test('dues exact charge/payment/adjustment, overpayment rejection and append-only inverse', async ({ page, request }) => {
  const { customer } = await catalogue(request); await page.setViewportSize({ width: 390, height: 900 }); await login(page); await page.goto('/ledger');
  const record = async (button: string, amount: string, reason?: string) => { await page.getByRole('button', { name: button, exact: true }).click(); await page.getByRole('dialog').getByLabel('Customer', { exact: true }).selectOption(customer.id); await page.getByLabel('Amount (INR decimal)').fill(amount); if (reason) await page.getByLabel('Adjustment reason').fill(reason); await confirm(page, button === 'Record Adjustment' ? 'Record Increase adjustment' : button); await expect(page.getByRole('dialog')).toHaveCount(0); };
  await record('Record Charge', '123.45'); await record('Record Payment', '23.45'); await record('Record Adjustment', '0.01', 'Reviewed increase');
  let balance = (await get(request, '/customer-dues/customers/' + customer.id + '/balance')).data; expect(balance.organizationBalanceMinor).toBe('10001'); expect(balance.branchBalanceMinor).toBe('10001');
  expect((await request.post(api + '/api/customer-dues/entries', { headers: h, data: { customerId: customer.id, entryType: 'payment', amount: '100.02', idempotencyKey: randomUUID() } })).status()).toBe(409);
  await page.getByRole('button', { name: 'Record Payment', exact: true }).click(); await page.getByRole('dialog').getByLabel('Customer', { exact: true }).selectOption(customer.id); await page.getByLabel('Amount (INR decimal)').fill('100.02'); await expect(page.getByRole('button', { name: 'Review', exact: true })).toBeDisabled(); await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await page.getByRole('button', { name: 'Discard changes' }).click();
  const entries = await get(request, '/customer-dues/entries'), adjustment = entries.data.find((e: { entryType: string }) => e.entryType === 'adjustment_increase');
  const transaction = page.locator('.table-mobile article').filter({ hasText: 'Reviewed increase' }); await transaction.getByRole('button', { name: 'Reverse', exact: true }).click(); await page.getByLabel('Reversal reason').fill('Reviewed exact inverse'); await confirm(page, 'Confirm reversal'); await expect(page.getByRole('dialog')).toHaveCount(0);
  const after = await get(request, '/customer-dues/entries'); expect(after.data).toHaveLength(4); const inverse = after.data.find((e: { reversesEntryId: string }) => e.reversesEntryId === adjustment.id); expect(inverse.signedEffectMinor).toBe('-1'); expect(after.data.find((e: { id: string }) => e.id === adjustment.id).reversedByEntryId).toBe(inverse.id);
  balance = (await get(request, '/customer-dues/customers/' + customer.id + '/balance')).data; expect(balance.organizationBalanceMinor).toBe('10000'); await page.reload(); await page.getByLabel('Customer', { exact: true }).selectOption(customer.id); await expect(page.getByRole('heading', { name: 'Organization-wide customer balance' })).toBeVisible();
});
test('inventory reviewed create/receive/consume/adjust and exact inverse preserve permanent facts', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 900 }); await login(page); await page.goto('/inventory'); await page.getByRole('button', { name: 'Create item', exact: true }).click();
  await page.getByLabel('Item name').fill('QA exact stock'); await page.getByLabel('Unit', { exact: true }).selectOption('kg'); await page.getByLabel('Low-stock threshold').fill('11.000'); await page.getByLabel('Opening quantity (optional)').fill('10.125'); await confirm(page, 'Save');
  await page.getByRole('button', { name: 'Details & history', exact: true }).click(); const item = (await get(request, '/inventory')).data[0];
  for (const [button, quantity, reason] of [['Receive stock', '1.125', 'Delivery'], ['Consume stock', '0.250', 'Reviewed use'], ['Adjust stock', '0.001', 'Reviewed count']]) { await page.getByRole('button', { name: button, exact: true }).click(); await page.getByLabel('Quantity (Kilogram)').fill(quantity); await page.getByLabel(/^Reason/).fill(reason); await confirm(page, 'Save'); await expect(page.getByRole('dialog', { name: 'Inventory item details', exact: true })).toBeVisible(); }
  expect((await get(request, '/inventory/' + item.id)).data.quantity).toBe('11.001');
  const movements = await get(request, '/inventory/' + item.id + '/movements'); expect(movements.data).toHaveLength(4); const adjustment = movements.data.find((m: { movementType: string }) => m.movementType === 'adjustment_increase');
  await page.getByRole('dialog').locator('article').filter({ hasText: 'Reviewed count' }).getByRole('button', { name: 'Reverse movement', exact: true }).click(); await page.getByLabel('Reversal reason').fill('Reviewed inverse'); await confirm(page, 'Record reversal'); await expect(page.getByRole('dialog', { name: 'Inventory item details', exact: true })).toBeVisible();
  expect((await get(request, '/inventory/' + item.id)).data.quantity).toBe('11.000'); const after = await get(request, '/inventory/' + item.id + '/movements'); expect(after.data).toHaveLength(5); expect(after.data.find((m: { reversesMovementId: string }) => m.reversesMovementId === adjustment.id).quantityDelta).toBe('-0.001');
  await page.getByRole('dialog').getByRole('button', { name: 'Close modal' }).click(); await page.getByRole('button', { name: 'View low-stock items' }).click(); await expect(page.locator('.table-mobile').getByRole('heading', { name: 'QA exact stock', exact: true })).toBeVisible(); await expect(page.getByRole('link', { name: 'View Purchasing' })).toHaveAttribute('href', '/purchasing');
  await page.reload(); expect((await get(request, '/inventory/' + item.id)).data.quantity).toBe('11.000');
});

test('inventory pagination and search use bounded authoritative server pages, never the received subset', async ({ page, request }) => {
  for (let n = 1; n <= 21; n++) await post(request, '/inventory', { name: `QA bounded ${String(n).padStart(2, '0')}`, unitCode: 'unit', reorderThreshold: '0', idempotencyKey: randomUUID() });
  await page.setViewportSize({ width: 1440, height: 900 }); await login(page); await page.goto('/inventory');
  await expect(page.locator('tbody tr')).toHaveCount(20);
  const second = page.waitForResponse(r => new URL(r.url()).pathname === '/api/inventory' && new URL(r.url()).searchParams.get('page') === '2');
  await page.getByRole('button', { name: 'Next', exact: true }).click(); const response = await second;
  expect(new URL(response.url()).searchParams.get('limit')).toBe('20'); const data = await response.json(); expect(data.data).toHaveLength(1);
  await expect(page.locator('tbody tr')).toHaveCount(1); await expect(page.locator('tbody').getByText(data.data[0].name, { exact: true })).toBeVisible();
  const searched = page.waitForResponse(r => new URL(r.url()).pathname === '/api/inventory' && new URL(r.url()).searchParams.get('search') === 'QA bounded 21');
  await page.getByLabel('Search inventory', { exact: true }).fill('QA bounded 21'); const search = await searched;
  expect(new URL(search.url()).searchParams.get('page')).toBe('1'); expect((await search.json()).data).toHaveLength(1);
  await expect(page.locator('tbody').getByText('QA bounded 21', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await expect(page.locator('th button')).toHaveCount(0);
});

test('all five pages project custom read-only authority and missing entitlement without mutation actions', async ({ page, request }) => {
  const permissions = ['customers.read', 'services.read', 'queue.read', 'attendance.read', 'ledger.read', 'inventory.read'];
  const routes = [['/queue', 'New token'], ['/appointments', 'New appointment'], ['/attendance', 'Mark attendance'], ['/ledger', 'Record Charge'], ['/inventory', 'Create item']];
  for (const entitled of [true, false]) {
    fixture = await (await request.post(api + '/__test/fixture', { data: { modules: entitled ? ['queue', 'attendance', 'ledger', 'inventory'] : [], permissions } })).json();
    await login(page);
    for (const [path, action] of routes) { await page.goto(path); if (entitled) await expect(page.getByText(/Read-only/)).toBeVisible(); else await expect(page.getByText('Upgrade Required')).toBeVisible(); await expect(page.getByRole('button', { name: action, exact: true })).toHaveCount(0); }
    await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(page).toHaveURL(/login/);
  }
});

// Independent journeys preserve the deployed IP budget instead of accumulating
// five complete navigation/refresh journeys in one limiter window.
for (const path of ['/queue', '/appointments', '/attendance', '/ledger', '/inventory']) test(`real ${path} branch switching clears old context and preserves canonical scope`, async ({ page, request }) => {
  fixture = await (await request.post(api + '/__test/fixture', { data: { modules: ['queue', 'attendance', 'ledger', 'inventory'] } })).json();
  const auth = await request.post(api + '/api/auth/login', { data: { phone: fixture.phone, password: fixture.password } }); h = { authorization: 'Bearer ' + (await auth.json()).accessToken, 'x-tenant-id': fixture.organizationId, 'x-branch-id': fixture.branchId };
  const { customer, service } = await catalogue(request), date = '2026-10-12';
  const branch = await post(request, '/branches', { name: 'QA second branch', code: 'qa-second', timezone: 'America/New_York', status: 'active' }, 200);
  const member = (await get(request, '/members')).data[0];
  expect((await request.patch(api + '/api/members/' + member.membershipId, { headers: h, data: { role: member.role, status: 'active', customRoleId: member.customRoleId, branchIds: [fixture.branchId, branch.id], version: member.version } })).ok()).toBe(true);
  await post(request, '/queue', { customerId: customer.id, serviceId: service.id, idempotencyKey: randomUUID() });
  await post(request, '/appointments', { customerId: customer.id, serviceId: service.id, localStart: date + 'T10:30', idempotencyKey: randomUUID() });
  await post(request, '/attendance', { membershipId: member.membershipId, attendanceDate: date, status: 'present', idempotencyKey: randomUUID() }, 200);
  await post(request, '/customer-dues/entries', { customerId: customer.id, entryType: 'charge', amount: '123.45', idempotencyKey: randomUUID() });
  await post(request, '/inventory', { name: 'QA scoped stock', unitCode: 'unit', openingQuantity: '10.125', reorderThreshold: '0', idempotencyKey: randomUUID() });
  await page.setViewportSize({ width: 390, height: 900 }); await login(page);
  {
    await page.goto(path);
    if (path === '/appointments') await page.getByLabel('Appointment date').fill(date);
    if (path === '/attendance') await page.getByLabel('Business date').fill(date);
    await page.getByLabel('Active branch', { exact: true }).selectOption(branch.id); await expect(page.getByLabel('Active branch', { exact: true })).toBeEnabled(); await expect(page.getByLabel('Active branch', { exact: true })).toHaveValue(branch.id);
    if (path === '/queue') await expect(page.getByRole('heading', { name: 'No active tokens' })).toBeVisible();
    if (path === '/appointments') { await page.getByLabel('Appointment date').fill(date); await expect(page.getByRole('heading', { name: 'No appointments on this date' })).toBeVisible(); await expect(page.getByRole('main').getByText(/QA second branch · America\/New_York/)).toBeVisible(); }
    if (path === '/attendance') { await page.getByLabel('Business date').fill(date); await expect(page.locator('article').getByText('Unmarked', { exact: true })).toBeVisible(); await expect(page.locator('article').getByRole('button', { name: 'Correct attendance' })).toHaveCount(0); }
    if (path === '/ledger') { await page.getByLabel('Customer', { exact: true }).selectOption(customer.id); await expect(page.getByRole('heading', { name: 'No matching transactions' })).toBeVisible(); const organization = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Organization-wide customer balance', exact: true }) }); const selected = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Selected branch balance', exact: true }) }); await expect(organization.getByText('₹123.45', { exact: true })).toBeVisible(); await expect(selected.getByText('₹0.00', { exact: true })).toBeVisible(); }
    if (path === '/inventory') { await page.getByRole('button', { name: 'Details & history', exact: true }).click(); await expect(page.getByRole('dialog').getByText('0.000 Unit', { exact: true })).toBeVisible(); await page.getByRole('dialog').getByRole('button', { name: 'Close modal' }).click(); }
    await page.getByLabel('Active branch', { exact: true }).selectOption(fixture.branchId); await expect(page.getByLabel('Active branch', { exact: true })).toBeEnabled();
  }
});
