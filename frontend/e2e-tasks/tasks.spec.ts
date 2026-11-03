import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { api, auth, confirm, fixture, login, openTask, seed } from './helpers';

test('owner creates with eligible roster, edits partial fields, reassigns, cancels and retains PostgreSQL history', async ({ page, request }) => {
  const account = await fixture(request), headers = await auth(request, account);
  await login(page, account); await page.getByRole('button', { name: 'Team Tasks', exact: true }).click();
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review task' })).toBeDisabled();
  await page.getByLabel('Task title', { exact: true }).fill('QA created through Tasks UI');
  await page.getByLabel('Description (optional)', { exact: true }).fill('Description must survive title-only edit');
  await page.getByLabel('Assign to (required)').selectOption(account.people.staff.membershipId);
  await page.getByRole('dialog').getByRole('combobox', { name: 'Priority', exact: true }).selectOption('high');
  await page.getByLabel('Deadline (optional)', { exact: true }).fill('2026-10-20T10:30'); await confirm(page);
  await expect(page.getByRole('heading', { name: 'Task information', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit or reassign' }).click(); await page.getByLabel('Task title', { exact: true }).fill('QA title edited only');
  const sent = page.waitForRequest(r => r.method() === 'PATCH' && r.url().includes('/api/tasks/')); await confirm(page);
  const body = (await sent).postDataJSON(); expect(Object.keys(body).sort()).toEqual(['expectedVersion', 'idempotencyKey', 'title']);
  await expect(page.getByRole('heading', { name: 'QA title edited only', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Description must survive title-only edit', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit or reassign' }).click(); await page.getByLabel('Assign to (required)').selectOption(account.people.manager.membershipId); await confirm(page);
  await expect(page.getByRole('heading', { name: 'Task information', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel task', exact: true }).click(); await page.getByLabel('Reason (required)').fill('QA explicitly cancelled'); await confirm(page);
  await expect(page.getByRole('dialog').getByText('Cancelled', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reopen task' })).toHaveCount(0);
  const rows = (await (await request.get(`${api}/api/tasks?scope=team&search=QA%20title%20edited%20only`, { headers })).json()).data.data;
  expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ status: 'cancelled', priority: 'high', description: 'Description must survive title-only edit', dueAt: '2026-10-20T05:00:00.000Z', version: 4, assignedMembershipId: account.people.manager.membershipId });
  const history = await request.get(`${api}/api/tasks/${rows[0].id}/history`, { headers }); expect(history.status()).toBe(200); expect((await history.json()).data.total).toBe(4);
});

test('staff own progress, manager reopen, read-only custom role and tenant/branch negatives use real middleware', async ({ page, request }) => {
  const account = await fixture(request), { headers, fact } = await seed(request, account);
  await login(page, account.people.staff); await expect(page.getByRole('button', { name: 'Team Tasks', exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Create task', exact: true })).toHaveCount(0);
  await openTask(page, 'QA assigned task'); await expect(page.getByRole('button', { name: 'Edit or reassign' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mark in progress', exact: true }).click(); await confirm(page); await expect(page.getByRole('heading', { name: 'Task information' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark completed', exact: true }).click(); await confirm(page); await expect(page.getByRole('heading', { name: 'Task information' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reopen task' })).toHaveCount(0);
  const reader = await auth(request, account.people.reader); expect((await request.get(`${api}/api/tasks?scope=team`, { headers: reader })).status()).toBe(200); expect((await request.post(`${api}/api/tasks/${fact.id}/reopen`, { headers: reader, data: { reason: 'Denied', expectedVersion: 3, idempotencyKey: randomUUID() } })).status()).toBe(403);
  await page.context().clearCookies(); await login(page, account.people.reader); await openTask(page, 'QA assigned task'); await expect(page.getByText('Read-only record. No changes are currently permitted.')).toBeVisible();
  await page.context().clearCookies(); await login(page, account.people.manager); await page.getByRole('button', { name: 'Team Tasks', exact: true }).click(); await openTask(page, 'QA assigned task');
  await page.getByRole('button', { name: 'Reopen task', exact: true }).click(); await page.getByLabel('Reason (required)').fill('QA manager restart'); await confirm(page); await expect(page.getByRole('heading', { name: 'Task information' })).toBeVisible();
  expect((await request.get(`${api}/api/tasks/${fact.id}`, { headers: { ...headers, 'x-branch-id': account.otherBranch } })).status()).toBe(404);
  expect((await request.get(`${api}/api/tasks`, { headers: { ...headers, 'x-tenant-id': 'ffffffff-ffff-4fff-8fff-ffffffffffff' } })).status()).toBe(403);
  const staff = await auth(request, account.people.staff); expect((await request.get(`${api}/api/tasks?scope=team`, { headers: staff })).status()).toBe(403);
  expect((await request.get(`${api}/api/tasks`, { headers: { ...staff, 'x-branch-id': account.otherBranch } })).status()).toBe(403);
});

test('lost create response recovers same key exactly once and preserves unsaved draft', async ({ page, request }) => {
  const account = await fixture(request), headers = await auth(request, account); await login(page, account);
  await page.getByRole('button', { name: 'Create task', exact: true }).click(); await page.getByLabel('Task title', { exact: true }).fill('QA uncertain Task create'); await page.getByLabel('Assign to (required)').selectOption(account.people.staff.membershipId);
  const commands: unknown[] = []; let lost = false;
  await page.route(`${api}/api/tasks`, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    commands.push(route.request().postDataJSON());
    if (!lost) { lost = true; const response = await route.fetch(); expect(response.status()).toBe(201); return route.abort('connectionfailed'); }
    return route.continue();
  });
  await confirm(page); await expect(page.getByRole('alert')).toContainText('The server may have saved this command'); await expect(page.getByLabel('Task title', { exact: true })).toBeDisabled(); expect(commands).toHaveLength(1);
  await page.keyboard.press('Escape'); await expect(page.getByRole('heading', { name: 'Discard task draft?' })).toBeVisible(); await page.getByRole('button', { name: 'Keep editing' }).click();
  await page.getByRole('button', { name: 'Retry identical command' }).click(); await expect(page.getByRole('heading', { name: 'Task information' })).toBeVisible(); expect(commands).toHaveLength(2); expect(commands[1]).toEqual(commands[0]);
  const result = await request.get(`${api}/api/tasks?scope=team&search=QA%20uncertain%20Task%20create`, { headers }); expect((await result.json()).data.total).toBe(1);
});

test('stale edit freezes without overwrite, branch switch drops private draft, focus and Escape restore', async ({ page, request }) => {
  const account = await fixture(request), { headers, fact } = await seed(request, account);
  await page.setViewportSize({ width: 390, height: 900 }); await login(page, account); await page.getByRole('button', { name: 'Team Tasks', exact: true }).click(); await openTask(page, 'QA assigned task');
  await page.getByRole('button', { name: 'Edit or reassign' }).click(); await page.getByLabel('Task title', { exact: true }).fill('QA private stale draft');
  expect((await request.patch(`${api}/api/tasks/${fact.id}`, { headers, data: { title: 'QA changed elsewhere', expectedVersion: 1, idempotencyKey: randomUUID() } })).status()).toBe(200);
  await confirm(page); await expect(page.getByRole('alert')).toContainText('Reload current facts'); await expect(page.getByLabel('Task title', { exact: true })).toHaveValue('QA private stale draft');
  await page.getByRole('button', { name: 'Close and reload' }).click(); await page.getByRole('button', { name: 'Discard draft' }).click(); await expect(page.getByRole('heading', { name: 'QA changed elsewhere', exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Create task', exact: true }).click(); await page.getByLabel('Task title', { exact: true }).fill('QA branch-private draft');
  await page.keyboard.press('Shift+Tab'); expect(await page.getByRole('dialog').evaluate(node => node.contains(document.activeElement))).toBe(true);
  await page.getByRole('button', { name: 'Close', exact: true }).click(); await page.getByRole('button', { name: 'Discard draft' }).click();
  await expect(page.getByRole('button', { name: 'Create task', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Create task', exact: true }).click(); await page.getByLabel('Task title', { exact: true }).fill('QA guarded branch draft');
  await page.getByLabel('Active branch').selectOption(account.otherBranch); await expect(page.getByRole('heading', { name: 'Discard task draft?' })).toBeVisible();
  await expect(page.getByLabel('Active branch')).toHaveValue(account.branchId); await page.getByRole('button', { name: 'Discard draft' }).click();
  await expect(page.getByRole('heading', { name: 'No tasks assigned to you' })).toBeVisible(); await expect(page.getByText('QA private stale draft', { exact: true })).toHaveCount(0); await expect(page.getByLabel('Task title', { exact: true })).toHaveCount(0);
});

test('no entitlement, revoked membership and removed branch deny frontend and backend', async ({ page, request }) => {
  const disabled = await fixture(request, { entitled: false }); await page.request.post(`${api}/__test/client-phase`); await page.goto('/login'); await page.getByLabel('Phone or email').fill(disabled.phone); await page.getByLabel('Password', { exact: true }).fill(disabled.password); await page.getByRole('button', { name: 'Sign In to Ekavio' }).click(); await expect(page).toHaveURL(/dashboard/); await page.goto('/tasks'); await expect(page.getByRole('heading', { name: 'Tasks is not enabled' })).toBeVisible();
  const dh = await auth(request, disabled); expect((await request.get(`${api}/api/tasks`, { headers: dh })).status()).toBe(403);
  const account = await fixture(request), { fact } = await seed(request, account), staff = await auth(request, account.people.staff);
  expect((await request.post(`${api}/__test/revoke`, { data: { organizationId: account.organizationId, membershipId: account.people.staff.membershipId, kind: 'branch' } })).status()).toBe(200);
  expect((await request.get(`${api}/api/tasks/${fact.id}`, { headers: staff })).status()).toBe(403);
  const manager = await auth(request, account.people.manager);
  expect((await request.post(`${api}/__test/revoke`, { data: { organizationId: account.organizationId, membershipId: account.people.manager.membershipId, kind: 'membership' } })).status()).toBe(200);
  expect((await request.get(`${api}/api/tasks?scope=team`, { headers: manager })).status()).toBe(403);
});

test('real server pagination, search, priority and eligible assignee filtering never load all work into a page', async ({ page, request }) => {
  const account = await fixture(request), { headers } = await seed(request, account, { title: 'QA paging 00' });
  for (let index = 1; index <= 20; index++) {
    const created = await request.post(`${api}/api/tasks`, { headers, data: { title: `QA paging ${String(index).padStart(2, '0')}`, assignedMembershipId: account.people.staff.membershipId, priority: 'normal', idempotencyKey: randomUUID() } }); expect(created.status()).toBe(201);
  }
  await login(page, account); await page.getByRole('button', { name: 'Team Tasks', exact: true }).click();
  const directory = page.getByRole('region', { name: 'Team Tasks', exact: true }); await expect(directory.getByText('21 records', { exact: true })).toBeVisible();
  await expect(directory.getByRole('button', { name: /^View QA paging/ }).filter({ visible: true })).toHaveCount(20);
  await directory.getByRole('button', { name: 'Next', exact: true }).click(); await expect(directory.getByText('Page 2 of 2', { exact: true })).toBeVisible(); await expect(directory.getByRole('button', { name: /^View QA paging/ }).filter({ visible: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Filters', exact: true }).click(); await page.getByRole('combobox', { name: 'Priority', exact: true }).selectOption('high'); await expect(directory.getByText('1 record', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Filter by eligible assignee', exact: true }).click(); await page.getByLabel('Assign to (required)').selectOption(account.membershipId); await expect(page.getByRole('heading', { name: 'No matching tasks', exact: true })).toBeVisible();
  await page.getByRole('region', { name: 'Task search and filters' }).getByRole('button', { name: 'Reset filters', exact: true }).click();
  await page.getByLabel('Search task titles').fill('QA paging 17'); await expect(directory.getByText('1 record', { exact: true })).toBeVisible(); await expect(directory.getByRole('button', { name: 'View QA paging 17', exact: true }).filter({ visible: true })).toBeVisible();
});
