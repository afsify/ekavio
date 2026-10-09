import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { workspace } from './fixtures';

// Sanitized HTTP fixtures for visual/presentation evidence only. Actual
// PostgreSQL authority is exercised by the existing authenticated suites.
async function loadedWorkspace(page: Page) {
  const state = await workspace(page);
  state.customers.push({ id: randomUUID(), name: 'QA Ordinary Customer', phone: null, notes: 'Disposable ordinary note', status: 'active' });
  await page.route('http://127.0.0.1:5009/api/analytics/dashboard', route => route.fulfill({ json: { data: {
    widgets: [{ key: 'customers', label: 'Active customers', value: '1', description: 'Active customers in this organization', path: '/customers' }, { key: 'queue', label: 'Active queue', value: '2', description: 'Active tokens in the selected branch', path: '/queue' }, { key: 'inventory', label: 'Low-stock items', value: '3', description: 'Current selected-branch stock', path: '/inventory' }],
    layout: { order: [], hidden: [], version: 0 }, timezone: 'Asia/Kolkata', businessDate: '2026-10-09',
  } } }));
  return state;
}
async function capture(page: Page, prefix: string, name: string) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.route-loader')).toHaveCount(0);
  // Chromium full-page resizing can omit paint in a sticky overflow sidebar.
  // Dashboard viewport evidence preserves the actual loaded shell; other
  // captures remain full-page, with separate navigation evidence below.
  await page.screenshot({ path: `test-results/experience-visual/${prefix}-${name}.png`, fullPage: name !== 'dashboard' });
}
for (const width of [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920]) {
  for (const mode of ['light', 'dark', 'system'] as const) test(`V2-11A loaded visual ${width}px ${mode}`, async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.name));
    const prefix = `${width}-${mode}`;
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await loadedWorkspace(page);
    await page.addInitScript(preference => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode: preference, primaryColor: '#4F46E5' })), mode);
    await page.goto('/dashboard'); await expect(page.getByRole('heading', { name: 'Active customers', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode === 'system' ? 'dark' : mode);
    // A card can overflow its own grid track before reaching the document edge.
    // Keep this stricter regression alongside the global overflow assertion.
    await expect.poll(() => page.locator('.action-card').evaluateAll(cards => cards.every(card => card.scrollWidth <= card.clientWidth))).toBe(true);
    await capture(page, prefix, 'dashboard');
    await page.goto('/customers'); await expect(page.getByRole('heading', { name: 'QA Ordinary Customer', exact: true }).filter({ visible: true })).toBeVisible(); await capture(page, prefix, 'customers');
    await page.getByRole('button', { name: 'View QA Ordinary Customer', exact: true }).filter({ visible: true }).click();
    await expect(page.getByText('Disposable ordinary note', { exact: true })).toBeVisible(); await capture(page, prefix, 'detail');
    await page.getByRole('button', { name: 'Back to customers' }).click();
    await page.getByRole('button', { name: 'Create customer', exact: true }).click(); await expect(page.getByLabel('Customer name', { exact: true })).toBeVisible(); await capture(page, prefix, 'create'); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Edit QA Ordinary Customer', exact: true }).filter({ visible: true }).click(); await expect(page.getByLabel('Customer name', { exact: true })).toHaveValue('QA Ordinary Customer'); await capture(page, prefix, 'edit'); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    if (width < 768) await page.getByRole('button', { name: 'More', exact: true }).click();
    else if (width < 1024) await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible(); await capture(page, prefix, 'navigation');
    if (width < 1024) await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Account menu' }).click(); await expect(page.getByRole('dialog', { name: 'Your account' })).toBeVisible(); await capture(page, prefix, 'account'); await page.keyboard.press('Escape');
    await page.goto('/settings?section=appearance'); await expect(page.getByRole('radio', { name: 'System', exact: true })).toBeVisible(); await capture(page, prefix, 'appearance');
    await page.goto('/customers'); await page.getByLabel('Search customers', { exact: true }).fill('No matching fixture'); await expect(page.getByRole('heading', { name: 'No matching customers' })).toBeVisible(); await capture(page, prefix, 'empty');
    await page.route('http://127.0.0.1:5009/api/customers?**', route => route.fulfill({ status: 503, json: { message: 'Disposable temporary failure' } }));
    await page.reload();
    // The production query client deliberately retries three times (1/2/4s).
    // Wait for the genuine terminal error, with a bounded allowance for boot.
    await expect(page.getByRole('button', { name: 'Retry customers' })).toBeVisible({ timeout: 20_000 }); await capture(page, prefix, 'error');
    expect(errors).toEqual([]);
  });
}

test('dirty customer changes require a single confirmation and remain usable at short mobile height', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 430 }); await loadedWorkspace(page); await page.goto('/customers');
  const create = page.getByRole('button', { name: 'Create customer', exact: true }); await create.click(); await page.getByLabel('Customer name', { exact: true }).fill('Unsaved ordinary record');
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible(); expect(await page.getByRole('dialog').count()).toBe(1);
  await page.getByRole('button', { name: 'Keep editing' }).click(); await expect(page.getByLabel('Customer name', { exact: true })).toHaveValue('Unsaved ordinary record');
  await expect(page.getByRole('button', { name: 'Save customer' })).toBeInViewport();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await page.getByRole('button', { name: 'Discard changes' }).click(); await expect(create).toBeFocused();
});

test('desktop compact navigation keeps named destinations usable and expanded groups keyboard operable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await loadedWorkspace(page); await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Active customers', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  const sidebar = page.getByRole('complementary', { name: 'Workspace sidebar' });
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(80);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Customers', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Customers', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/experience-visual/1440-light-compact.png' });
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  const group = sidebar.locator('details').filter({ has: page.getByRole('heading', { name: 'Daily operations', exact: true }) });
  const summary = group.locator('summary'); await summary.focus(); await page.keyboard.press('Enter');
  await expect(group.getByRole('link', { name: 'Queue', exact: true })).toBeHidden();
  await page.keyboard.press('Enter'); await expect(group.getByRole('link', { name: 'Queue', exact: true })).toBeVisible();
});

test('workspace/branch changes blank old content until authoritative refresh and reject unavailable context', async ({ page }) => {
  const state = await loadedWorkspace(page), secondOrg = randomUUID(), secondBranch = randomUUID();
  state.session.memberships.push({ id: randomUUID(), organizationId: secondOrg, tenantId: secondOrg, orgName: 'QA Second Workspace', role: 'admin', branchIds: [secondBranch], branches: [{ id: secondBranch, name: 'Second Main', code: 'second' }] });
  state.session.memberships[0]!.branches.push({ id: randomUUID(), name: 'Second branch', code: 'branch-two' });
  let complete: (() => void) | undefined, reject = false;
  await page.route('http://127.0.0.1:5009/api/auth/refresh', async route => {
    const headers = route.request().headers(), target = headers['x-tenant-id'];
    if (!target) return route.fulfill({ json: state.session });
    await new Promise<void>(resolve => { complete = resolve; });
    if (reject) return route.fulfill({ status: 403, json: { message: 'Access denied' } });
    const member = state.session.memberships.find(m => m.organizationId === target)!;
    return route.fulfill({ json: { ...state.session, organizationId: target, branchId: headers['x-branch-id'] ?? member.branches[0]!.id, user: { ...state.session.user, tenantId: target }, entitlements: { ...state.session.entitlements, organizationId: target } } });
  });
  await page.route('http://127.0.0.1:5009/api/customers?**', route => route.fulfill({ json: { data: route.request().headers()['x-tenant-id'] === state.org ? state.customers : [{ id: randomUUID(), name: 'QA Second Tenant Customer', notes: null, phone: null, status: 'active' }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } }));
  await page.goto('/customers'); await expect(page.getByRole('heading', { name: 'QA Ordinary Customer', exact: true })).toBeVisible();
  await page.getByLabel('Active workspace', { exact: true }).selectOption(secondOrg);
  await expect(page.getByRole('status').filter({ hasText: 'Switching workspace context' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'QA Ordinary Customer', exact: true })).toHaveCount(0); await expect(page.getByLabel('Active workspace', { exact: true })).toBeDisabled();
  await expect.poll(() => Boolean(complete)).toBe(true); complete!();
  await expect(page.getByRole('heading', { name: 'QA Second Tenant Customer', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'QA Ordinary Customer', exact: true })).toHaveCount(0);
  reject = true; complete = undefined; await page.getByLabel('Active workspace', { exact: true }).selectOption(state.org);
  await expect.poll(() => Boolean(complete)).toBe(true); complete!();
  await expect(page.getByLabel('Active workspace', { exact: true })).toHaveValue(secondOrg); await expect(page.getByRole('heading', { name: 'QA Second Tenant Customer', exact: true })).toBeVisible();
});
