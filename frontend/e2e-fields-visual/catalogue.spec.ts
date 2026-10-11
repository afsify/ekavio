import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { workspace } from '../e2e/fixtures';
import { fits } from '../e2e-operations-visual/fixtures';
import { blankDefinition } from '../src/components/forms/fieldDefinitionUtils';
// Sanitized DTOs: layout evidence only, not PostgreSQL/permission authority proof.
async function fixture(page: Page, readOnly = false, state: 'loaded' | 'empty' | 'error' | 'denied' = 'loaded') {
  await workspace(page, { permissions: ['fields.read', ...(readOnly ? [] : ['fields.manage'])], modules: [] });
  const choice = { ...blankDefinition(), id: randomUUID(), key: 'long_choices', label: 'QA descriptive field label with readable organization guidance ' + 'L'.repeat(30), help: 'Plain guidance with a long uninterrupted label ' + 'H'.repeat(120), field_type: 'select' as const, version: 7, options: [{ id: randomUUID(), key: 'stable_one', label: 'QA long option ' + 'O'.repeat(75), status: 'active' as const }, { id: randomUUID(), key: 'historical', label: 'QA archived historical option', status: 'archived' as const }] };
  const definitions = [choice, { ...blankDefinition(), id: randomUUID(), key: 'exact_amount', label: 'QA exact INR value', field_type: 'currency' as const, default_value: '123456789012345678', reportable: true }, { ...blankDefinition(), id: randomUUID(), key: 'archived_note', label: 'QA archived note', status: 'archived' as const }];
  await page.route('http://127.0.0.1:5009/api/forms/**', async route => {
    if (state === 'error' || state === 'denied') return route.fulfill({ status: state === 'denied' ? 403 : 503, json: { message: state === 'denied' ? 'Permission denied' : 'QA temporary configuration outage' } });
    if (route.request().method() !== 'GET') throw new Error('Visual fixtures must not write configuration');
    return route.fulfill({ json: { data: { entity: 'customer', version: 0, definitions: state === 'empty' ? [] : definitions, sections: [], builtins: [{ key: 'name', label: 'Customer name', required: true }] } } });
  });
  return choice;
}
async function controlsFit(page: Page) {
  await fits(page);
  expect(await page.locator('.field-setting').first().evaluate(element => getComputedStyle(element).display)).toBe('flex');
  expect(await page.getByRole('dialog').locator('input:not([type=checkbox]),select').evaluateAll(elements => elements.every(element => {
    const rect = element.getBoundingClientRect(), parent = element.parentElement!.getBoundingClientRect();
    return rect.width >= 200 && rect.left >= parent.left - 1 && rect.right <= parent.right + 1;
  }))).toBe(true);
}
for (const width of [320, 360, 390, 430, 768, 1024, 1440, 1920]) for (const theme of ['light', 'dark', 'system']) test(`field catalogue and editor ${width}px ${theme}`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.name));
  await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const field = await fixture(page);
  await page.addInitScript(mode => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode, primaryColor: '#4F46E5' })), theme);
  await page.goto('/custom-fields'); await expect(page.getByRole('heading', { name: 'Field catalogue', exact: true })).toBeVisible(); await fits(page);
  await expect(page.getByRole('button', { name: 'Edit ' + field.label, exact: true })).toHaveText('Edit field');
  const shot = async (state: string) => page.screenshot({ path: `test-results/fields-visual-batch1/${width}-${theme}-${state}.png`, fullPage: false });
  await page.locator('.field-catalogue-card').first().evaluate(element => element.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => scrollBy(0, -(document.querySelector('.workspace-header')?.getBoundingClientRect().height ?? 0) - 8)); await shot('catalogue');
  if (theme === 'system') { await page.emulateMedia({ colorScheme: 'light' }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); await page.emulateMedia({ colorScheme: 'dark' }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark'); }
  await page.getByRole('button', { name: 'Edit ' + field.label, exact: true }).click(); await expect(page.getByRole('dialog', { name: 'Edit field' })).toBeVisible(); await controlsFit(page); await shot('editor');
  await page.getByLabel('Option 2 label').scrollIntoViewIfNeeded(); await controlsFit(page); await page.getByLabel('Option 1 label').scrollIntoViewIfNeeded(); await shot('long-options');
  await page.getByRole('dialog').getByLabel('Field label', { exact: true }).fill(''); await page.getByRole('button', { name: 'Review field', exact: true }).click(); await expect(page.getByRole('dialog').getByLabel('Field label', { exact: true })).toHaveAttribute('aria-invalid', 'true'); await page.getByRole('dialog').getByLabel('Field label', { exact: true }).scrollIntoViewIfNeeded(); await controlsFit(page); await shot('validation');
  await page.getByRole('dialog').getByLabel('Field label', { exact: true }).fill('QA revised label'); await page.getByRole('button', { name: 'Review field', exact: true }).click(); await expect(page.getByRole('dialog', { name: 'Review field definition' })).toBeVisible(); await fits(page); await shot('review');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible(); await fits(page); await shot('dirty');
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click(); await expect(page.getByRole('dialog').getByLabel('Field label', { exact: true })).toHaveValue('QA revised label');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit ' + field.label, exact: true })).toBeFocused();
  await fixture(page, true); await page.reload(); await expect(page.getByRole('button', { name: 'Add field', exact: true })).toHaveCount(0);
  await expect(page.getByText('Read-only configuration.', { exact: false })).toBeVisible(); await fits(page); await shot('read-only');
  await page.getByRole('button', { name: /^Inspect QA descriptive field label/ }).click(); await expect(page.getByRole('dialog', { name: 'Field definition' })).toBeVisible(); await expect(page.getByText('QA archived historical option', { exact: false })).toBeVisible(); await fits(page); await shot('inspect');
  expect(errors).toEqual([]);
});
for (const state of ['empty', 'error', 'denied'] as const) test(`field catalogue ${state} feedback`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 }); await fixture(page, false, state); await page.goto('/custom-fields');
  await expect(page.getByText(state === 'empty' ? 'No custom fields yet' : state === 'denied' ? 'Configuration access denied' : 'Form configuration unavailable', { exact: true })).toBeVisible();
  if (state !== 'empty') await expect(page.getByText('Loading form schema…', { exact: true })).toHaveCount(0);
  await fits(page);
  if (state === 'empty') await page.getByText('No custom fields yet', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/fields-visual-batch1/320-light-${state}.png` });
});
test('field catalogue loading feedback', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 }); await fixture(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('http://127.0.0.1:5009/api/forms/**', async route => { await pending; await route.fallback(); });
  await page.goto('/custom-fields');
  try {
    await expect(page.getByRole('status').filter({ hasText: 'Loading form schema…' })).toBeVisible();
    await fits(page); await page.screenshot({ path: 'test-results/fields-visual-batch1/320-light-loading.png' });
  } finally { release(); }
  await expect(page.getByRole('heading', { name: 'Field catalogue', exact: true })).toBeVisible();
});
