import { expect, test, type Page } from '@playwright/test';
import { workspace } from './fixtures';

// Local HTTP contract fixtures only; not PostgreSQL/hosted authority evidence.
async function configuration(page: Page, readonly = false) {
  const permissions = ['crm.read', 'fields.read', 'roles.read', 'customers.read', ...(readonly ? [] : ['crm.manage', 'fields.manage', 'roles.manage', 'customers.manage'])];
  const state = await workspace(page, { permissions, modules: ['crm'] });
  state.session.memberships[0].branches.push({ id: 'qa-other-branch', name: 'QA other branch', code: 'other' });
  state.session.memberships[0].branchIds.push('qa-other-branch');
  const stage = { id: 'qa-stage', name: 'QA enquiry', description: 'Synthetic stage', status: 'active', position: 0, version: 4 };
  const catalogue = [
    { key: 'customers.read', label: 'View customers', description: 'Read customer records', category: 'Customers' },
    { key: 'customers.manage', label: 'Manage customers', description: 'Change customer records', category: 'Customers' },
    { key: 'crm.read', label: 'View CRM', description: 'Read leads', category: 'CRM' },
  ];
  const role = { id: 'qa-role', name: 'QA reviewer', description: 'Synthetic replacement role', status: 'active', permissions: ['customers.read'], version: 3 };
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  let conflict = false, revoked = false;
  await page.route('http://127.0.0.1:5009/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/api', '');
    if (path === '/auth/refresh') {
      const branch = request.headers()['x-branch-id'];
      if (branch && state.session.memberships[0].branchIds.includes(branch)) state.session.branchId = branch;
      return route.fulfill({ json: state.session });
    }
    if (path === '/organization/context') return route.fulfill({ json: { data: { permissions: revoked ? permissions.filter(key => key !== 'crm.manage') : permissions, role: 'admin' } } });
    if (path.startsWith('/roles') && request.method() !== 'GET') {
      writes.push({ path, body: request.postDataJSON() });
      return route.fulfill({ status: conflict ? 409 : 200, json: conflict ? { message: 'Role changed; reload before saving' } : { data: role } });
    }
    if (path.startsWith('/crm/stages') && request.method() !== 'GET') { writes.push({ path, body: request.postDataJSON() }); return route.fulfill({ json: { data: stage } }); }
    if (path === '/roles') return route.fulfill({ json: { data: { catalogue, system: [{ name: 'staff', permissions: ['customers.read'] }], custom: [role] } } });
    if (path.startsWith('/forms/') && path.endsWith('/schema')) { const entity = path.split('/')[2]; return route.fulfill({ json: { data: { entity, version: 0, definitions: [], sections: [], builtins: (entity === 'lead' ? ['name', 'pipelineStageId'] : ['name']).map(key => ({ key, label: key, required: true })) } } }); }
    const data = path === '/crm/overview' ? { active: 0, unassigned: 0, today: 0, overdue: 0, timezone: 'Asia/Kolkata', businessDate: '2026-10-20', stages: [stage] } :
      path === '/crm/stages' ? [stage] : path === '/crm/assignees' ? [] : path === '/crm/leads' ? { data: [], total: 0, page: 1, limit: 20, timezone: 'Asia/Kolkata' } : undefined;
    if (data !== undefined) return route.fulfill({ json: { data } });
    return route.fallback();
  });
  return { writes, conflict: () => { conflict = true; }, revoke: () => { revoked = true; } };
}
async function fits(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const dialog = page.getByRole('dialog');
  if (await dialog.count()) expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
}
async function snapshot(page: Page, name: string) { await fits(page); await page.screenshot({ path: `test-results/v213a-final-split/${name}.png` }); }

async function prepare(page: Page, width: number, mode: 'light' | 'dark') {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const fixture = await configuration(page);
  await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: mode, reducedMotion: 'reduce' });
  await page.addInitScript(theme => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode: theme, primaryColor: '#4F46E5' })), mode);
  return { ...fixture, errors };
}
// Independent workflows retain the original 30s deadline, fixtures and assertions.
// They do not share one cumulative multi-route timeout or state from another test.
for (const width of [390, 768, 1440]) for (const mode of ['light', 'dark'] as const) {
test(`Lead Forms navigation and history ${width}px ${mode}`, async ({ page }) => {
  const fixture = await prepare(page, width, mode);
  await page.goto('/crm'); await expect(page.getByRole('heading', { name: 'No leads yet' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
  await page.getByText('How CRM works', { exact: true }).click();
  await page.getByRole('link', { name: 'Lead Data & Forms' }).click();
  await expect(page.getByLabel('Record type')).toHaveValue('lead');
  await expect(page.getByRole('region', { name: 'Form layout studio' })).toBeVisible();
  await snapshot(page, `${width}-${mode}-lead-studio`);
  await page.getByLabel('Section 1 title').fill('QA retained draft');
  await page.getByLabel('Record type').selectOption('service');
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Discard unsaved layout changes?');
  await page.getByRole('button', { name: 'Keep layout draft' }).click();
  await expect(page.getByLabel('Record type')).toHaveValue('lead'); await expect(page.getByLabel('Section 1 title')).toHaveValue('QA retained draft');
  await page.getByLabel('Record type').selectOption('service'); await page.getByRole('button', { name: 'Discard and continue' }).click();
  await expect(page.getByLabel('Record type')).toHaveValue('service');
  await page.goBack(); await expect(page.getByLabel('Record type')).toHaveValue('lead');
  await page.goForward(); await expect(page.getByLabel('Record type')).toHaveValue('service');
  expect(fixture.writes).toEqual([]); expect(fixture.errors).toEqual([]);
});
test(`role permissions and replacement ${width}px ${mode}`, async ({ page }) => {
  const fixture = await prepare(page, width, mode);
  await page.goto('/roles'); const opener = page.getByRole('button', { name: 'Edit QA reviewer', exact: true }); await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(page.getByRole('button', { name: 'Review', exact: true })).toBeDisabled();
  await expect.poll(() => dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Shift+Tab'); await expect.poll(() => dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  await page.getByRole('searchbox', { name: 'Search permissions' }).fill('manage');
  await page.getByRole('checkbox', { name: /Manage customers/ }).check();
  await page.getByRole('searchbox', { name: 'Search permissions' }).fill('');
  await page.getByRole('checkbox', { name: 'Show selected permissions only' }).check();
  await expect(page.getByRole('checkbox', { name: /View CRM/ })).toHaveCount(0);
  // Selected-only intentionally removes an unchecked row from the DOM. Use
  // its real click and assert removal rather than asking uncheck() to verify
  // the checked state of an element that no longer exists.
  await page.getByRole('checkbox', { name: /View customers/ }).click();
  await expect(page.getByRole('checkbox', { name: /View customers/ })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /Manage customers/ })).toBeChecked();
  await snapshot(page, `${width}-${mode}-role-editor`);
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Added permissions' })).toContainText('Manage customers');
  await expect(page.getByRole('region', { name: 'Removed permissions' })).toContainText('View customers');
  await snapshot(page, `${width}-${mode}-role-review`);
  expect(fixture.writes).toEqual([]);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await expect(dialog).toHaveCount(0);
  expect(fixture.writes).toEqual([{ path: '/roles/qa-role', body: { name: 'QA reviewer', description: 'Synthetic replacement role', status: 'active', version: 3, permissions: ['customers.manage'] } }]);
  await expect(opener).toBeFocused();
  expect(fixture.errors).toEqual([]);
});
test(`pipeline order presentation ${width}px ${mode}`, async ({ page }) => {
  const fixture = await prepare(page, width, mode);
  const dialog = page.getByRole('dialog');
  await page.goto('/crm'); await page.getByRole('button', { name: 'Pipeline settings', exact: true }).click();
  await page.getByRole('button', { name: 'Edit stage QA enquiry' }).click(); await expect(page.getByLabel('Stage order (1–50)')).toHaveValue('1');
  await page.getByLabel('Stage description').fill('QA clarified'); await snapshot(page, `${width}-${mode}-stage`);
  await page.getByRole('button', { name: 'Review', exact: true }).click(); await page.getByRole('button', { name: 'Save stage', exact: true }).click(); await expect(dialog).toHaveCount(0);
  expect(fixture.writes.at(-1)).toEqual({ path: '/crm/stages/qa-stage', body: { name: 'QA enquiry', description: 'QA clarified', status: 'active', position: 0, expectedVersion: 4 } });
  expect(fixture.writes).toHaveLength(1); expect(fixture.errors).toEqual([]);
});
test(`CRM draft keyboard and branch context ${width}px ${mode}`, async ({ page }) => {
  const fixture = await prepare(page, width, mode);
  const dialog = page.getByRole('dialog');
  await page.goto('/crm');
  await page.getByRole('button', { name: 'Create lead', exact: true }).click(); await page.getByLabel('Lead name', { exact: true }).fill('QA draft');
  await page.keyboard.press('Escape'); await expect(dialog).toHaveAccessibleName('Discard unsaved changes?');
  await page.getByRole('button', { name: 'Keep editing' }).click(); await expect(page.getByLabel('Lead name', { exact: true })).toHaveValue('QA draft');
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Discard changes', exact: true }).click(); await expect(dialog).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Active branch', exact: true }).selectOption('qa-other-branch');
  await expect(page.getByRole('combobox', { name: 'Active branch', exact: true })).toHaveValue('qa-other-branch');
  await expect(page.getByRole('heading', { name: 'No leads yet' })).toBeVisible(); await expect(dialog).toHaveCount(0);
  expect(fixture.writes).toHaveLength(0); expect(fixture.errors).toEqual([]);
});
}
test('live permission revocation closes the old CRM editor without submitting its draft', async ({ page }) => {
  const fixture = await configuration(page); await page.goto('/crm');
  await page.getByRole('button', { name: 'Create lead', exact: true }).click();
  await page.getByLabel('Lead name', { exact: true }).fill('QA old-authority draft');
  fixture.revoke();
  // Exercise the same visible-page event used by React Query authority refresh;
  // do not reach into the application's store or overwrite client permissions.
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('button', { name: 'Create lead', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0); expect(fixture.writes).toEqual([]);
});
test('role conflict preserves reviewed version and read-only catalogue has no edit controls', async ({ page }) => {
  const fixture = await configuration(page); fixture.conflict(); await page.goto('/roles');
  await page.getByRole('button', { name: 'Edit QA reviewer', exact: true }).click();
  await page.getByRole('checkbox', { name: /Manage customers/ }).check();
  await page.getByRole('button', { name: 'Review', exact: true }).click(); await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Role changed; reload before saving');
  expect(fixture.writes[0].body).toMatchObject({ version: 3, permissions: ['customers.read', 'customers.manage'] });
  await expect(page.getByRole('region', { name: 'Added permissions' })).toContainText('Manage customers');
  await snapshot(page, 'role-conflict');
  await configuration(page, true); await page.goto('/roles'); await expect(page.getByText('Read-only role catalogue.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create role', exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Edit QA reviewer', exact: true })).toHaveCount(0);
});
