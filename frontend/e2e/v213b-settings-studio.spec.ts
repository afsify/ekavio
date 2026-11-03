import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { workspace } from './fixtures';
import { fits } from '../e2e-operations-visual/fixtures';
import { blankDefinition } from '../src/components/forms/fieldDefinitionUtils';
import type { FormSchema } from '../src/components/forms/formSchema';

// Synthetic local HTTP contracts only: no hosted auth, records or database proof.
const grants = ['fields.read', 'fields.manage', 'organization.read', 'branches.read', 'staff.read', 'roles.read', 'billing.read', 'audit.read', 'crm.read', 'crm.manage', 'services.read', 'services.manage', 'hr_plus.manage'];
async function fixture(page: Page, permissions = [...grants], modules = ['crm', 'hr_plus']) {
  const state = await workspace(page, { permissions, modules });
  await page.route('https://**/*', route => route.abort());
  const schema: FormSchema = {
    entity: 'customer', version: 7,
    builtins: [{ key: 'name', label: 'Customer name', required: true }],
    definitions: [
      { ...blankDefinition(), id: randomUUID(), key: 'qa_note', label: 'QA disposable note', help: 'Synthetic text; never use real customer information.' },
      { ...blankDefinition(), id: randomUUID(), key: 'qa_long', label: 'QA long field label ' + 'L'.repeat(65), field_type: 'textarea' },
    ],
    sections: [{ id: randomUUID(), title: 'QA general information', fields: [{ key: 'name', visible: true }, { key: 'qa_note', visible: true }, { key: 'qa_long', visible: true }] }],
  };
  let writes = 0;
  await page.route('http://127.0.0.1:5009/api/forms/**', route => {
    if (route.request().method() !== 'GET') {
      writes++;
      return route.fulfill({ status: 400, json: { message: 'Synthetic fixture does not accept writes' } });
    }
    return route.fulfill({ json: { data: schema } });
  });
  return { state, schema, permissions, writes: () => writes };
}
const hub = (page: Page) => page.getByRole('region', { name: 'Settings hub', exact: true });
async function theme(page: Page, mode: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: mode, reducedMotion: 'reduce' });
  await page.addInitScript(value => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode: value, primaryColor: '#4F46E5' })), mode);
}
async function shot(page: Page, label: string) {
  await fits(page);
  await page.screenshot({ path: join(test.info().project.outputDir, 'screenshots', `${label}.png`) });
}
async function contrast(locator: Locator, property = 'color') {
  return locator.evaluate((node, name) => {
    const rgb = (value: string) => value.match(/[\d.]+/g)!.map(Number);
    const luminance = (color: number[]) => color.slice(0, 3).map(channel => { const c = channel / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index]!, 0);
    let ancestor: Element | null = node, background: number[] = [];
    while (ancestor) {
      const candidate = rgb(getComputedStyle(ancestor).backgroundColor);
      if (candidate.length === 3 || candidate[3] === 1) { background = candidate; break; }
      ancestor = ancestor.parentElement;
    }
    if (!background.length) throw new Error('No opaque background for contrast check');
    const foreground = luminance(rgb(getComputedStyle(node).getPropertyValue(name))), behind = luminance(background);
    return (Math.max(foreground, behind) + .05) / (Math.min(foreground, behind) + .05);
  }, property);
}

test('V2-13B hub grouping, local search, authorized navigation and account deep links', async ({ page }) => {
  const f = await fixture(page);
  await page.goto('/settings?section=hub');
  for (const name of ['Account', 'Organization', 'Configuration', 'Administration']) await expect(hub(page).getByRole('region', { name: `${name} settings`, exact: true })).toBeVisible();
  await hub(page).getByRole('searchbox', { name: 'Search settings' }).fill('Data');
  await expect(hub(page).getByRole('link')).toHaveCount(1);
  await hub(page).getByRole('link', { name: /Data & Forms/ }).click();
  await expect(page).toHaveURL(/\/custom-fields$/);
  await expect(page.getByLabel('Section 1 title')).toHaveValue('QA general information');
  await page.goto('/settings?section=hub');
  await hub(page).getByRole('searchbox', { name: 'Search settings' }).fill('missing destination');
  await expect(hub(page).getByRole('heading', { name: 'No matching settings' })).toBeVisible();
  await hub(page).getByRole('button', { name: 'Clear settings search' }).click();
  await hub(page).getByRole('link', { name: /Appearance/ }).click();
  await expect(page).toHaveURL(/section=appearance/);
  await expect(page.getByRole('heading', { name: 'Appearance', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'System', exact: true }).check();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.goBack();
  await expect(page).toHaveURL(/section=hub/);
  await hub(page).getByRole('link', { name: /Security/ }).click();
  await expect(page).toHaveURL(/section=security/);
  await expect(page.getByRole('button', { name: 'Change password', exact: true })).toBeVisible();
  expect(f.writes()).toBe(0);
});

test('V2-13B employee and unentitled module configuration restrictions', async ({ page }) => {
  await fixture(page, ['crm.read', 'crm.manage', 'hr_plus.manage', 'services.manage'], []);
  await page.goto('/settings?section=hub');
  await expect(hub(page).getByRole('link')).toHaveCount(4);
  for (const name of ['CRM configuration', 'HR configuration', 'Services configuration', 'Data & Forms', 'Billing', 'Roles & permissions']) await expect(hub(page).getByRole('link', { name: new RegExp(name) })).toHaveCount(0);
  await expect(hub(page).getByText(/No organization configuration destinations/)).toBeVisible();
});

test('V2-13B hub workspace replacement and live authority revocation clear scoped search', async ({ page }) => {
  const f = await fixture(page), org = randomUUID(), branch = randomUUID();
  f.state.session.memberships.push({ id: randomUUID(), organizationId: org, tenantId: org, orgName: 'QA second settings workspace', role: 'admin', branchIds: [branch], branches: [{ id: branch, name: 'Second Main', code: 'second' }] });
  await page.route('http://127.0.0.1:5009/api/auth/refresh', route => {
    const selected = route.request().headers()['x-tenant-id'];
    return route.fulfill({ json: selected ? { ...f.state.session, organizationId: selected, branchId: branch, user: { ...f.state.session.user, tenantId: selected }, entitlements: { ...f.state.session.entitlements, organizationId: selected } } : f.state.session });
  });
  await page.goto('/settings?section=hub');
  await hub(page).getByRole('searchbox', { name: 'Search settings' }).fill('Data');
  await page.getByLabel('Active workspace', { exact: true }).selectOption(org);
  await expect(page.getByLabel('Active workspace', { exact: true })).toHaveValue(org);
  await expect(hub(page).getByText('QA second settings workspace', { exact: true })).toBeVisible();
  await expect(hub(page).getByRole('searchbox', { name: 'Search settings' })).toHaveValue('');
  await hub(page).getByRole('searchbox', { name: 'Search settings' }).fill('Data');
  f.permissions.splice(0);
  const refreshed = page.waitForResponse(response => response.url().endsWith('/organization/context') && response.status() === 200);
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await refreshed;
  await expect(hub(page).getByRole('link', { name: /Data & Forms/ })).toHaveCount(0);
  await expect(hub(page).getByRole('searchbox', { name: 'Search settings' })).toHaveValue('');
  await expect(hub(page).getByRole('link')).toHaveCount(4);
});

test('V2-13B layout navigation retains unsaved edits until explicit discard', async ({ page }) => {
  const f = await fixture(page);
  await page.goto('/custom-fields');
  await page.getByLabel('Section 1 title').fill('QA unsaved layout draft');
  await page.getByLabel('Record type', { exact: true }).selectOption('service');
  const dialog = page.getByRole('dialog', { name: 'Discard unsaved layout changes?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep layout draft', exact: true }).click();
  await expect(page.getByLabel('Record type', { exact: true })).toHaveValue('customer');
  await expect(page.getByLabel('Section 1 title')).toHaveValue('QA unsaved layout draft');
  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Review layout changes' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to layout', exact: true }).click();
  await page.getByRole('button', { name: 'Discard layout draft', exact: true }).click();
  await dialog.getByRole('button', { name: 'Discard and continue', exact: true }).click();
  await expect(page.getByLabel('Section 1 title')).toHaveValue('QA general information');
  await expect(page.getByRole('button', { name: 'Save layout', exact: true })).toBeDisabled();
  expect(f.writes()).toBe(0);
});

test('V2-13B field readers can inspect, locate and preview but cannot edit', async ({ page }) => {
  await fixture(page, ['fields.read'], []);
  await page.goto('/settings?section=hub');
  await expect(hub(page).getByRole('link', { name: /Data & Forms/ })).toContainText('View only');
  await hub(page).getByRole('link', { name: /Data & Forms/ }).click();
  await expect(page.getByText(/Read-only layout inspection/)).toBeVisible();
  await expect(page.getByLabel('Section 1 title')).toBeDisabled();
  for (const name of ['Save layout', 'Add section', 'Reset default layout', 'Add field']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Find placement for QA disposable note' }).click();
  await expect(page.locator('.studio-field-focus').filter({ hasText: 'QA disposable note' })).toBeFocused();
  await page.getByRole('button', { name: 'Desktop preview', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Desktop form preview' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Desktop preview', exact: true })).toBeFocused();
});

test('V2-13B denied schema refresh destroys an open disposable preview', async ({ page }) => {
  const f = await fixture(page);
  await page.goto('/custom-fields');
  await page.getByRole('button', { name: 'Desktop preview', exact: true }).click();
  await page.getByRole('dialog').getByLabel('QA disposable note', { exact: true }).fill('QA never persisted');
  await page.route('http://127.0.0.1:5009/api/forms/**', route => route.fulfill({ status: 403, json: { message: 'QA configuration authority revoked' } }));
  const denied = page.waitForResponse(response => response.url().endsWith('/forms/customer/schema') && response.status() === 403);
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await denied;
  await expect(page.getByText('Configuration access denied', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Section 1 title')).toHaveCount(0);
  expect(f.writes()).toBe(0);
});

for (const width of [390, 768, 1440]) for (const mode of ['light', 'dark'] as const) test(`V2-13B responsive settings studio ${width}px ${mode}`, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.name));
  await page.setViewportSize({ width, height: 900 });
  await theme(page, mode);
  const f = await fixture(page);
  await page.goto('/settings?section=hub');
  await expect(hub(page).getByRole('heading', { name: 'Find the right setting' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
  expect(await contrast(hub(page).locator('.settings-eyebrow'))).toBeGreaterThanOrEqual(4.5);
  await hub(page).getByRole('searchbox', { name: 'Search settings' }).focus();
  await page.keyboard.press('Tab');
  const profileLink = hub(page).getByRole('link', { name: /My Profile/ });
  await expect(profileLink).toBeFocused();
  expect(await contrast(profileLink, 'outline-color')).toBeGreaterThanOrEqual(3);
  await shot(page, `${width}-${mode}-hub`);
  await hub(page).getByRole('link', { name: /Data & Forms/ }).click();
  const placements = page.getByRole('complementary', { name: 'Layout field placements' });
  await expect(placements.getByRole('region', { name: 'Built-in fields' })).toBeVisible();
  await expect(placements.getByRole('region', { name: 'Custom fields' })).toBeVisible();
  await placements.getByRole('searchbox', { name: 'Search field placements' }).fill('QA disposable');
  await placements.getByLabel('Placement source').selectOption('Custom');
  await expect(placements.getByRole('button', { name: /Find placement for/ })).toHaveCount(1);
  const locate = placements.getByRole('button', { name: 'Find placement for QA disposable note' });
  await locate.focus();
  await page.keyboard.press('Enter');
  const row = page.locator('.studio-field-focus').filter({ hasText: 'QA disposable note' });
  await expect(row).toBeFocused();
  expect(await row.evaluate(node => getComputedStyle(node).outlineStyle)).toBe('solid');
  expect(await contrast(row, 'outline-color')).toBeGreaterThanOrEqual(3);
  await shot(page, `${width}-${mode}-placement-focus`);
  await placements.getByRole('button', { name: 'Clear placement filters' }).click();
  await expect(placements.getByRole('button', { name: /Find placement for/ })).toHaveCount(3);
  await page.getByLabel('Section 1 title').fill('QA reviewed layout draft');
  await page.getByRole('button', { name: 'Desktop preview', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('QA disposable note', { exact: true }).fill('QA disposable sample');
  await dialog.getByRole('button', { name: 'Mobile width', exact: true }).click();
  await expect(dialog).toHaveAccessibleName('Mobile form preview');
  await expect(dialog.getByRole('button', { name: 'Mobile width', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await contrast(dialog.getByRole('button', { name: 'Mobile width', exact: true }))).toBeGreaterThanOrEqual(4.5);
  await expect(dialog.getByLabel('QA disposable note', { exact: true })).toHaveValue('QA disposable sample');
  expect(await dialog.locator('.layout-preview').evaluate(node => node.getBoundingClientRect().width)).toBeLessThanOrEqual(390);
  await shot(page, `${width}-${mode}-mobile-preview`);
  await dialog.getByRole('button', { name: 'Desktop width', exact: true }).click();
  await expect(dialog).toHaveAccessibleName('Desktop form preview');
  await expect(dialog.getByLabel('QA disposable note', { exact: true })).toHaveValue('QA disposable sample');
  await shot(page, `${width}-${mode}-desktop-preview`);
  await dialog.getByRole('button', { name: 'Clear preview samples', exact: true }).click();
  await expect(dialog.getByLabel('QA disposable note', { exact: true })).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Desktop preview', exact: true })).toBeFocused();
  await expect(page.getByLabel('Section 1 title')).toHaveValue('QA reviewed layout draft');
  expect(f.writes()).toBe(0);
  expect(errors).toEqual([]);
});
