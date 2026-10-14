import { expect, test, type Page } from '@playwright/test';
import { workspace } from './fixtures';

// Sanitized HTTP fixtures: frontend presentation, not database/hosted authority.
const longName = 'QA Alexandra Customer with a very long descriptive family name for readable records';
async function customers(page: Page, permissions?: string[]) {
  const state = await workspace(page, { permissions });
  state.customers.push({ id: 'qa-long', name: longName, phone: null, notes: 'Disposable note\nSecond line', status: 'active', createdAt: '2026-10-13T05:00:00Z', updatedAt: '2026-10-14T05:30:00Z' });
  state.customers.push({ id: 'qa-empty', name: 'QA Missing contact', phone: null, notes: null, status: 'inactive' });
  const schema = { entity: 'customer', version: 1, builtins: ['name','phone','notes','status'].map(key => ({ key, label: key, required: key === 'name' })), definitions: [{ id: 'qa-field', key: 'reference', label: 'Customer reference', help: 'An existing organization-defined field.', field_type: 'text', status: 'active', required: false, searchable: true, filterable: true, reportable: false, default_value: null, version: 0, options: [] }], sections: [{ id: 'qa-contact', title: 'Customer essentials', fields: ['name','phone','status','notes'].map(key => ({ key, visible: true })) }, { id: 'qa-custom', title: 'Organization information', fields: [{ key: 'reference', visible: true }] }] };
  await page.route('http://127.0.0.1:5009/api/forms/customer/**', route => route.fulfill({ json: { data: route.request().url().endsWith('/schema') ? schema : { reference: 'QA retained reference' } } }));
  return state;
}
async function scan(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('.customer-name,.customer-details,.customer-form,.customer-tools,.dialog-actions').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth))).toBe(true);
  expect(await page.locator('.customer-row-actions>.quiet-button').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length > 0).every(node => { const range = document.createRange(); range.selectNodeContents(node); return range.getBoundingClientRect().height <= parseFloat(getComputedStyle(node).lineHeight) + 1; }))).toBe(true);
  for (const input of await page.locator('main input,main select,[role=dialog] input,[role=dialog] select,[role=dialog] textarea').all()) if (await input.isVisible()) await expect(input).toHaveAccessibleName(/\S/);
}
async function shot(page: Page, name: string) {
  await scan(page); await page.screenshot({ path: `test-results/customer-experience/${process.env.CUSTOMER_CAPTURE_PHASE ?? 'after'}/${name}.png` });
  const body = page.locator('.customer-editor .dialog-body,.customer-detail-drawer .dialog-body');
  if (await body.count() === 1) {
    await body.evaluate(node => { node.scrollTop = node.scrollHeight; });
    await page.screenshot({ path: `test-results/customer-experience/${process.env.CUSTOMER_CAPTURE_PHASE ?? 'after'}/${name}-bottom.png` });
  } else if (name.endsWith('-directory')) await page.screenshot({ path: `test-results/customer-experience/${process.env.CUSTOMER_CAPTURE_PHASE ?? 'after'}/${name}-full.png`, fullPage: true });
}
async function theme(page: Page, width: number, mode: string) {
  await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(value => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode: value, primaryColor: '#4F46E5' })), mode);
}
for (const width of [320,360,390,430,768,1024,1440,1920]) for (const mode of ['light','dark','system']) {
  test(`customer directory and detail ${width}px ${mode}`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await customers(page); await theme(page, width, mode); await page.goto('/customers');
    await expect(page.getByRole('heading', { name: longName, exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode === 'system' ? 'dark' : mode);
    await shot(page, `${width}-${mode}-directory`);
    const view = page.getByRole('button', { name: `View ${longName}`, exact: true }).filter({ visible: true }); await view.click();
    const drawer = page.getByRole('dialog', { name: 'Customer details', exact: true });
    await expect(drawer.getByText('QA retained reference', { exact: true })).toBeVisible();
    await expect(drawer.getByRole('heading', { name: longName, exact: true })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Close modal' })).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(drawer.getByRole('button', { name: 'Edit customer', exact: true })).toBeFocused();
    await page.keyboard.press('Tab'); await expect(drawer.getByRole('button', { name: 'Close modal' })).toBeFocused();
    await shot(page, `${width}-${mode}-detail`);
    await page.keyboard.press('Escape'); await expect(drawer).toBeHidden(); await expect(view).toBeFocused();
    if (mode === 'system') { await page.emulateMedia({ colorScheme: 'light' }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); }
    expect(errors).toEqual([]);
  });
  test(`customer create and edit ${width}px ${mode}`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await customers(page); await theme(page, width, mode); await page.goto('/customers');
    const create = page.getByRole('button', { name: 'Create customer', exact: true }); await create.click();
    const dialog = page.getByRole('dialog', { name: 'Create customer', exact: true });
    await expect(dialog.getByLabel('Customer reference', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Save customer' })).toBeDisabled();
    await shot(page, `${width}-${mode}-create`); await page.keyboard.press('Escape'); await expect(create).toBeFocused();
    const edit = page.getByRole('button', { name: 'Edit QA Missing contact', exact: true }).filter({ visible: true }); await edit.click();
    await expect(page.getByLabel('Customer name', { exact: true })).toHaveValue('QA Missing contact');
    await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue('inactive');
    await shot(page, `${width}-${mode}-edit`); await page.keyboard.press('Escape'); await expect(edit).toBeFocused();
    expect(errors).toEqual([]);
  });
  test(`customer expanded filters and unsaved confirmation ${width}px ${mode}`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await customers(page); await theme(page, width, mode); await page.goto('/customers');
    const toggle = page.getByRole('button', { name: 'Filters', exact: true });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false'); await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('combobox', { name: 'Custom field filter', exact: true }).selectOption('reference');
    await page.getByLabel('Filter value', { exact: true }).fill('QA synthetic filter');
    await page.getByLabel('Search customers', { exact: true }).fill('QA');
    await expect(page.getByRole('button', { name: 'Remove Customer reference filter' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove Customer search filter' })).toBeVisible();
    await expect(page.getByRole('heading', { name: longName, exact: true }).filter({ visible: true })).toBeVisible();
    await shot(page, `${width}-${mode}-expanded-filters`);
    await page.getByRole('button', { name: 'Reset all', exact: true }).click();
    await expect(page.getByLabel('Search customers', { exact: true })).toHaveValue('');
    await expect(page.getByRole('combobox', { name: 'Custom field filter', exact: true })).toHaveValue('');
    await expect(page.getByLabel('Filter value', { exact: true })).toHaveCount(0);
    const create = page.getByRole('button', { name: 'Create customer', exact: true }); await create.click();
    await page.getByLabel('Customer name', { exact: true }).fill('QA retained draft'); await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?', exact: true })).toBeVisible();
    await shot(page, `${width}-${mode}-discard-confirmation`);
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(page.getByLabel('Customer name', { exact: true })).toHaveValue('QA retained draft');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await page.getByRole('button', { name: 'Discard changes', exact: true }).click(); await expect(create).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test('server paging, search and independent filter reset keep response scope and private criteria ephemeral', async ({ page }) => {
  await customers(page);
  const requests: URL[] = [];
  await page.route('http://127.0.0.1:5009/api/customers?**', route => {
    const url = new URL(route.request().url()); requests.push(url);
    const number = Number(url.searchParams.get('page'));
    return route.fulfill({ json: { data: [{ id: `page-${number}`, name: `QA server page ${number}`, phone: null, notes: null, status: 'active' }], pagination: { page: number, limit: 20, total: 41, totalPages: 3 } } });
  });
  await page.goto('/customers'); await expect(page.getByRole('heading', { name: 'QA server page 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click(); await expect(page.getByRole('heading', { name: 'QA server page 2' })).toBeVisible();
  await page.getByLabel('Search customers', { exact: true }).fill('Private search'); await expect(page.getByRole('heading', { name: 'QA server page 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('combobox', { name: 'Custom field filter', exact: true }).selectOption('reference'); await page.getByLabel('Filter value', { exact: true }).fill('Private field');
  await expect.poll(() => requests.at(-1)?.searchParams.get('value')).toBe('Private field');
  await page.getByRole('button', { name: 'Filters (1)', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Customer filters', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Remove Customer reference filter' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove Customer search filter' })).toBeVisible();
  await page.getByRole('button', { name: 'Filters (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Customer search filter' }).click();
  await expect(page.getByLabel('Search customers', { exact: true })).toHaveValue(''); await expect(page.getByLabel('Filter value', { exact: true })).toHaveValue('Private field');
  await page.getByRole('button', { name: 'Remove Customer reference filter' }).click(); await expect(page.getByRole('combobox', { name: 'Custom field filter', exact: true })).toHaveValue('');
  await expect.poll(() => requests.at(-1)?.searchParams.has('field')).toBe(false);
  expect(page.url()).not.toContain('Private'); expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain('Private');
  await expect(page.getByRole('button', { name: 'Customer', exact: true })).toHaveCount(0); // no invented sorting
});

test('uncertain create is not replayed even after changing the retained draft', async ({ page }) => {
  await customers(page); await page.setViewportSize({ width: 390, height: 900 }); let attempts = 0;
  await page.route('http://127.0.0.1:5009/api/customers', route => { attempts++; return route.fulfill({ status: 503, json: { message: 'Disposable uncertain outcome' } }); });
  await page.goto('/customers'); await page.getByRole('button', { name: 'Create customer', exact: true }).click();
  await page.getByLabel('Customer name', { exact: true }).fill('QA uncertain create'); await page.getByRole('button', { name: 'Save customer' }).click();
  await expect(page.getByRole('alert')).toContainText('The customer may already have been created');
  await page.getByLabel('Customer name', { exact: true }).fill('QA changed retained draft'); await expect(page.getByRole('button', { name: 'Save customer' })).toBeDisabled();
  expect(attempts).toBe(1); await shot(page, '390-light-uncertain-create'); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toContainText('Discarding this local draft does not undo a possibly saved record');
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByLabel('Customer name', { exact: true })).toHaveValue('QA changed retained draft'); await expect(page.getByRole('button', { name: 'Save customer' })).toBeDisabled();
});

test('customer deep link and detail-to-edit return to the directory trigger without losing identity', async ({ page }) => {
  await customers(page); await page.setViewportSize({ width: 390, height: 900 }); await page.goto('/customers?customer=qa-empty&limit=10');
  const drawer = page.getByRole('dialog', { name: 'Customer details', exact: true }); await expect(drawer.getByRole('heading', { name: 'QA Missing contact' })).toBeVisible();
  await drawer.getByRole('button', { name: 'Back to customers' }).click();
  const view = page.getByRole('button', { name: 'View QA Missing contact', exact: true }).filter({ visible: true }); await view.click();
  await page.getByRole('button', { name: 'Edit customer', exact: true }).click(); await expect(page.getByLabel('Customer name', { exact: true })).toHaveValue('QA Missing contact');
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(view).toBeFocused();
  expect(new URL(page.url()).searchParams.get('customer')).toBe('qa-empty');
});

test('unavailable authorized form configuration blocks saving and provides a genuine retry', async ({ page }) => {
  await customers(page); await page.route('http://127.0.0.1:5009/api/forms/customer/schema', route => route.fulfill({ status: 503, json: { message: 'Disposable schema failure' } }));
  await page.goto('/customers'); await page.getByRole('button', { name: 'Create customer', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create customer', exact: true }); await expect(dialog.getByRole('button', { name: 'Save customer' })).toBeDisabled();
  await expect(dialog.getByRole('heading', { name: 'Form configuration unavailable' })).toBeVisible({ timeout: 20_000 });
  await page.unroute('http://127.0.0.1:5009/api/forms/customer/schema'); await dialog.getByRole('button', { name: 'Retry fields' }).click(); await expect(dialog.getByLabel('Customer reference', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save customer' })).toBeDisabled(); await dialog.getByLabel('Customer name', { exact: true }).fill('QA recovered form'); await expect(dialog.getByRole('button', { name: 'Save customer' })).toBeEnabled();
});

test('loading, terminal directory error and empty states keep filters and clear recovery actions', async ({ page }) => {
  const state = await customers(page); await page.setViewportSize({ width: 390, height: 900 }); state.customers.splice(0); let release!: () => void;
  await page.route('http://127.0.0.1:5009/api/customers?**', async route => { await new Promise<void>(resolve => { release = resolve; }); await route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } }); });
  await page.goto('/customers'); await expect(page.getByRole('status').filter({ hasText: 'Loading records' })).toBeVisible();
  await shot(page, '390-light-loading');
  await page.unroute('http://127.0.0.1:5009/api/customers?**'); release(); await expect(page.getByRole('heading', { name: 'No customers yet' })).toBeVisible();
  await shot(page, '390-light-empty');
  await page.getByLabel('Search customers', { exact: true }).fill('No match'); await expect(page.getByRole('heading', { name: 'No matching customers' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click(); await expect(page.getByLabel('Search customers', { exact: true })).toHaveValue('');
  await page.route('http://127.0.0.1:5009/api/customers?**', route => route.fulfill({ status: 503, json: { message: 'Disposable directory failure' } }));
  await page.reload(); await expect(page.getByRole('button', { name: 'Retry customers' })).toBeVisible({ timeout: 20_000 });
  await shot(page, '390-light-error'); await page.unroute('http://127.0.0.1:5009/api/customers?**'); await page.getByRole('button', { name: 'Retry customers' }).click(); await expect(page.getByRole('heading', { name: 'No customers yet' })).toBeVisible();
});

test('without Customer read authority the route and navigation remain restricted', async ({ page }) => {
  await workspace(page, { permissions: [], modules: [] }); await page.goto('/customers'); await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByRole('heading', { name: 'Customers', exact: true })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Customers', exact: true })).toHaveCount(0);
});

test('failed save retains draft, invalid phone prevents save and explicit discard restores focus on short mobile', async ({ page }) => {
  await customers(page); await page.setViewportSize({ width: 320, height: 430 }); await page.goto('/customers');
  const trigger = page.getByRole('button', { name: 'Create customer', exact: true }); await trigger.click();
  await page.getByLabel('Customer name', { exact: true }).fill('QA unsaved customer');
  await page.getByLabel('Customer phone (optional)', { exact: true }).fill('12');
  await expect(page.getByRole('button', { name: 'Save customer' })).toBeDisabled(); await expect(page.getByRole('alert')).toContainText('valid phone');
  await page.getByLabel('Customer phone (optional)', { exact: true }).fill('');
  await page.getByLabel('Customer reference', { exact: true }).fill('QA unsaved field');
  await page.route('http://127.0.0.1:5009/api/customers', route => route.fulfill({ status: 400, json: { message: 'Disposable validation rejection' } }));
  await page.getByRole('button', { name: 'Save customer' }).click(); await expect(page.getByRole('alert')).toContainText('Disposable validation rejection');
  await expect(page.getByLabel('Customer name', { exact: true })).toHaveValue('QA unsaved customer');
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click(); await expect(page.getByLabel('Customer reference', { exact: true })).toHaveValue('QA unsaved field');
  await expect(page.getByRole('button', { name: 'Save customer' })).toBeInViewport();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await page.getByRole('button', { name: 'Discard changes' }).click(); await expect(trigger).toBeFocused();
});

test('read-only empty contact and notes, missing record and restricted navigation do not invent editing authority', async ({ page }) => {
  await customers(page, ['customers.read']); await page.setViewportSize({ width: 390, height: 900 }); await page.goto('/customers');
  await expect(page.getByRole('button', { name: 'Create customer', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'View QA Missing contact' }).filter({ visible: true }).click();
  const drawer = page.getByRole('dialog'); await expect(drawer.getByText('No phone supplied', { exact: true })).toBeVisible(); await expect(drawer.getByText('No notes added', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Edit customer', exact: true })).toHaveCount(0); await page.keyboard.press('Escape');
  await page.route('http://127.0.0.1:5009/api/customers/qa-empty', route => route.fulfill({ status: 404, json: { message: 'Customer not found' } }));
  await page.getByRole('button', { name: 'View QA Missing contact' }).filter({ visible: true }).click();
  await expect(page.getByRole('heading', { name: 'Customer details could not be loaded' })).toBeVisible({ timeout: 20_000 });
  await shot(page, '390-light-missing-record');
});
