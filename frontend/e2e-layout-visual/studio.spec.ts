import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { workspace } from '../e2e/fixtures';
import { fits } from '../e2e-operations-visual/fixtures';
import { blankDefinition } from '../src/components/forms/fieldDefinitionUtils';
import type { FormSchema } from '../src/components/forms/formSchema';

// Sanitized presentation contracts only. Actual source/authority tests are separate.
async function fixture(page: Page, readOnly = false, failure = 0) {
  const context = await workspace(page, { permissions: ['fields.read', ...(readOnly ? [] : ['fields.manage'])], modules: [] });
  const definitions = [
    { ...blankDefinition(), id: randomUUID(), key: 'note', label: 'QA long layout label ' + 'L'.repeat(90), help: 'Disposable guidance ' + 'H'.repeat(90) },
    { ...blankDefinition(), id: randomUUID(), key: 'day', label: 'QA calendar date', field_type: 'date' as const },
    { ...blankDefinition(), id: randomUUID(), key: 'instant', label: 'QA UTC instant', field_type: 'datetime' as const },
    { ...blankDefinition(), id: randomUUID(), key: 'choices', label: 'QA multiple choices', field_type: 'multiselect' as const, options: [0, 1, 2].map(i => ({ id: randomUUID(), key: 'choice_' + i, label: 'QA option ' + i + ' ' + 'O'.repeat(60), status: 'active' as const })) },
  ];
  const schema: FormSchema = { entity: 'customer', version: 7, definitions, builtins: [{ key: 'name', label: 'Customer name', required: true }], sections: [{ id: randomUUID(), title: 'General', fields: [{ key: 'name', visible: true }, ...definitions.map(field => ({ key: field.key, visible: true }))] }] };
  let writes = 0;
  await page.route('http://127.0.0.1:5009/api/forms/**', async route => {
    if (failure) return route.fulfill({ status: failure, json: { message: failure === 403 ? 'Permission denied' : 'QA temporary configuration outage' } });
    if (route.request().method() !== 'GET') { writes++; return route.fulfill({ status: 400, json: { message: 'QA validation rejection; draft retained' } }); }
    return route.fulfill({ json: { data: schema } });
  });
  return { schema, context, writes: () => writes };
}
async function show(page: Page, locator: ReturnType<Page['locator']>) {
  await locator.evaluate(element => element.scrollIntoView({ block: 'start' }));
  await locator.evaluate(element => {
    const top = element.getBoundingClientRect().top, header = document.querySelector('.workspace-header')?.getBoundingClientRect().bottom ?? 0;
    if (top < header + 8) scrollBy(0, top - header - 8);
  });
}
for (const width of [320, 360, 390, 430, 768, 1024, 1440, 1920]) for (const theme of ['light', 'dark', 'system']) test(`layout studio ${width}px ${theme}`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.name));
  await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const state = await fixture(page); await page.addInitScript(mode => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode, primaryColor: '#4F46E5' })), theme);
  await page.goto('/custom-fields'); await expect(page.getByLabel('Section 1 title')).toHaveValue('General'); await fits(page);
  const shot = (name: string) => page.screenshot({ path: `test-results/layout-visual-batch2/${width}-${theme}-${name}.png` });
  await show(page, page.getByRole('heading', { name: 'Form layout', exact: true })); await shot('workspace');
  if (theme === 'system') { await page.emulateMedia({ colorScheme: 'light' }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); await page.emulateMedia({ colorScheme: 'dark' }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark'); }
  await page.getByLabel('Section 1 title').fill('QA reviewed draft'); await page.getByRole('button', { name: 'Add section', exact: true }).click();
  await page.getByLabel('Section 2 title').fill('QA additional details');
  await page.getByLabel('Section for QA calendar date').selectOption({ label: 'QA additional details' });
  await page.getByRole('button', { name: 'Move section 2 up', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(page.getByLabel('Section 1 title')).toHaveValue('QA additional details');
  await fits(page); await show(page, page.getByLabel('Section 1 title')); await shot('movement');
  await page.getByRole('button', { name: 'Save layout', exact: true }).click(); await expect(page.getByRole('dialog', { name: 'Review layout changes' })).toBeVisible(); await fits(page); await shot('review');
  await page.getByRole('button', { name: 'Confirm layout save', exact: true }).click(); await expect(page.getByRole('dialog').getByRole('alert')).toContainText('QA validation rejection'); await fits(page); await shot('failed');
  await page.getByRole('button', { name: 'Back to layout', exact: true }).click(); await expect(page.getByLabel('Section 1 title')).toHaveValue('QA additional details');
  await page.getByRole('button', { name: 'Discard layout draft', exact: true }).click(); await fits(page); await shot('dirty'); await page.getByRole('button', { name: 'Keep layout draft', exact: true }).click();
  for (const mode of ['Mobile', 'Desktop']) {
    await page.getByRole('button', { name: mode + ' preview', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('Unsaved layout preview');
    await fits(page);
    for (const label of ['QA calendar date', 'QA UTC instant (UTC)']) {
      const input = page.getByRole('dialog').getByLabel(label, { exact: true }); await input.scrollIntoViewIfNeeded();
      expect(await input.evaluate(element => { const box = element.getBoundingClientRect(), parent = element.parentElement!.getBoundingClientRect(); return box.width >= 200 && box.left >= parent.left - 1 && box.right <= parent.right + 1; })).toBe(true);
    }
    await shot(mode.toLowerCase() + '-native');
    await page.getByRole('dialog').getByText('QA multiple choices', { exact: true }).first().evaluate(element => element.scrollIntoView({ block: 'start' })); await fits(page); await shot(mode.toLowerCase() + '-preview');
    await page.getByRole('button', { name: 'Close preview', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Reset default layout', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('You have unsaved changes'); await fits(page); await shot('reset'); await page.getByRole('button', { name: 'Back to layout', exact: true }).click();
  await page.getByLabel('Section 1 title').fill(''); await expect(page.getByRole('button', { name: 'Save layout', exact: true })).toBeDisabled(); await show(page, page.getByText('Every section needs a title of 1–100 characters.', { exact: true })); await fits(page); await shot('validation');
  expect(state.writes()).toBe(1); expect(errors).toEqual([]);
});
for (const state of ['read-only', 'denied', 'error'] as const) test(`layout studio ${state}`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 }); await fixture(page, state === 'read-only', state === 'denied' ? 403 : state === 'error' ? 503 : 0); await page.goto('/custom-fields');
  if (state === 'read-only') { await expect(page.getByText(/Read-only layout inspection/)).toBeVisible(); await expect(page.getByRole('button', { name: 'Save layout', exact: true })).toHaveCount(0); await expect(page.getByLabel('Section 1 title')).toBeDisabled(); await show(page, page.getByRole('heading', { name: 'Form layout', exact: true })); }
  else { await expect(page.getByText(state === 'denied' ? 'Configuration access denied' : 'Form configuration unavailable', { exact: true })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Form layout', exact: true })).toHaveCount(0); }
  await fits(page); await page.screenshot({ path: `test-results/layout-visual-batch2/320-light-${state}.png` });
});
test('dirty workspace switch is reviewed before authoritative context replacement', async ({ page }) => {
  const { context } = await fixture(page), secondOrg = randomUUID(), secondBranch = randomUUID();
  context.session.memberships.push({ id: randomUUID(), organizationId: secondOrg, tenantId: secondOrg, orgName: 'QA second layout workspace', role: 'admin', branchIds: [secondBranch], branches: [{ id: secondBranch, name: 'Second Main', code: 'second' }] });
  let selections = 0;
  await page.route('http://127.0.0.1:5009/api/auth/refresh', route => {
    const target = route.request().headers()['x-tenant-id'];
    if (!target) return route.fulfill({ json: context.session });
    selections++; return route.fulfill({ json: { ...context.session, organizationId: target, branchId: secondBranch, user: { ...context.session.user, tenantId: target }, entitlements: { ...context.session.entitlements, organizationId: target } } });
  });
  await page.goto('/custom-fields'); await page.getByLabel('Section 1 title').fill('QA old workspace draft'); await page.getByLabel('Active workspace', { exact: true }).selectOption(secondOrg);
  await expect(page.getByRole('dialog', { name: 'Discard unsaved layout changes?' })).toBeVisible(); expect(selections).toBe(0); await page.getByRole('button', { name: 'Keep layout draft', exact: true }).click(); await expect(page.getByLabel('Active workspace', { exact: true })).toHaveValue(context.org); await expect(page.getByLabel('Section 1 title')).toHaveValue('QA old workspace draft');
  await page.getByLabel('Active workspace', { exact: true }).selectOption(secondOrg); await page.getByRole('button', { name: 'Discard and continue', exact: true }).click(); await expect(page.getByLabel('Active workspace', { exact: true })).toHaveValue(secondOrg); await expect(page.getByLabel('Section 1 title')).toHaveValue('General'); expect(selections).toBe(1);
});
test('browser back preserves a dirty layout until explicit discard', async ({ page }) => {
  await fixture(page); await page.goto('/dashboard'); await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Data & Forms', exact: true }).click(); await page.getByLabel('Section 1 title').fill('QA browser back draft');
  await expect(page.getByRole('status').filter({ hasText: 'Unsaved draft' })).toBeVisible();
  await page.goBack(); await expect(page.getByRole('dialog', { name: 'Discard unsaved layout changes?' })).toBeVisible(); await expect(page).toHaveURL(/custom-fields/); await page.getByRole('button', { name: 'Keep layout draft', exact: true }).click(); await expect(page.getByLabel('Section 1 title')).toHaveValue('QA browser back draft');
  await page.goBack(); await expect(page.getByRole('dialog')).toBeVisible(); await expect(page).toHaveURL(/custom-fields/); await page.getByRole('button', { name: 'Discard and continue', exact: true }).click(); await expect(page).toHaveURL(/dashboard/);
});
test('layout studio loading cannot display an old editor', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 }); await fixture(page);
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('http://127.0.0.1:5009/api/forms/**', async route => { await pending; await route.fallback(); });
  await page.goto('/custom-fields');
  try { await expect(page.getByRole('status').filter({ hasText: 'Loading form schema…' })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Form layout', exact: true })).toHaveCount(0); await fits(page); await page.screenshot({ path: 'test-results/layout-visual-batch2/320-light-loading.png' }); }
  finally { release(); }
  await expect(page.getByLabel('Section 1 title')).toHaveValue('General');
});
test('denied schema refresh destroys a dirty editor even during discard confirmation', async ({ page }) => {
  await fixture(page); await page.goto('/custom-fields'); await page.getByLabel('Section 1 title').fill('QA revoked draft'); await page.getByRole('button', { name: 'Discard layout draft', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible();
  await page.route('http://127.0.0.1:5009/api/forms/**', route => route.fulfill({ status: 403, json: { message: 'QA configuration access revoked' } }));
  const denied = page.waitForResponse(response => response.url().endsWith('/forms/customer/schema') && response.status() === 403);
  // Query's focus manager listens on window; a non-bubbling document event
  // never reaches it. Assert the actual denied read before its UI consequence.
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange'))); await denied;
  await expect(page.getByText('Configuration access denied', { exact: true })).toBeVisible(); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByLabel('Section 1 title')).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Settings', exact: true }).click(); await expect(page).toHaveURL(/settings/); await expect(page.getByRole('dialog')).toHaveCount(0);
});
