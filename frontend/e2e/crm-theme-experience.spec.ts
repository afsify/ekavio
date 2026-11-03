import { test, expect, type Page } from '@playwright/test';
import { relationshipFixture } from '../e2e-relationships-visual/fixtures';
import { workspace } from './fixtures';
import { expectAccountAppearance } from './accountAppearance';

async function fits(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('.crm-record-identity,.crm-lead-actions,.crm-detail-facts,.crm-followup-card,.theme-mode-options').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).every(node => node.scrollWidth <= node.clientWidth))).toBe(true);
}
async function shot(page: Page, file: string) { await fits(page); await page.screenshot({ path: `test-results/crm-theme/${file}.png` }); }
for (const width of [320,360,390,430,768,1024,1440,1920]) for (const mode of ['light','dark','system']) {
  test(`premium CRM records and manual follow-ups ${width}px ${mode}`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    const f = await relationshipFixture(page); f.lead.name = 'QA Alexandra enquiry with a long company and descriptive customer name'; f.lead.assignee_name = 'QA assigned team member with a long display name';
    await page.addInitScript(mode => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode, primaryColor: '#4F46E5' })), mode);
    await page.goto('/crm'); await expect(page.getByRole('heading', { name: f.lead.name, exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode === 'system' ? 'dark' : mode); await shot(page, `${width}-${mode}-directory`);
    const view = page.getByRole('button', { name: 'View ' + f.lead.name, exact: true }).filter({ visible: true }); await view.click();
    const drawer = page.getByRole('dialog', { name: 'Lead details' }); await expect(drawer.getByText('Lead created', { exact: false })).toBeVisible(); await shot(page, `${width}-${mode}-detail`);
    await page.keyboard.press('Escape'); await expect(drawer).toBeHidden(); await expect(view).toBeFocused();
    await page.getByRole('button', { name: 'pipeline', exact: true }).click();
    const stage = width < 768 ? page.getByLabel('Pipeline stage for this branch') : page.getByRole('button', { name: 'View stage ' + f.stage.name, exact: true });
    await stage.scrollIntoViewIfNeeded(); await shot(page, `${width}-${mode}-pipeline`);
    await page.getByRole('button', { name: 'View due today', exact: true }).click(); await expect(page.getByRole('combobox', { name: 'Follow-up view', exact: true })).toHaveValue('today');
    await page.getByRole('heading', { name: 'Manual follow-ups', exact: true }).scrollIntoViewIfNeeded(); await shot(page, `${width}-${mode}-followups`);
    await page.getByRole('heading', { name: 'QA discuss the next consultation', exact: true }).scrollIntoViewIfNeeded(); await shot(page, `${width}-${mode}-followup-record`);
    expect(errors).toEqual([]);
  });
  test(`animated theme persistence and account choice ${width}px ${mode}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' }); await workspace(page);
    await page.addInitScript(mode => { if (!localStorage.getItem('ekavio-ui-preferences')) localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode, primaryColor: '#087443' })); }, mode);
    await page.goto('/customers'); const toggle = page.getByRole('switch', { name: 'Dark appearance' });
    await expect(toggle).toHaveAttribute('aria-checked', mode === 'light' ? 'false' : 'true');
    const box = await toggle.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
    await toggle.focus(); await page.keyboard.press('Space'); await expect(page.locator('html')).toHaveAttribute('data-theme', mode === 'light' ? 'dark' : 'light');
    await page.keyboard.press('Enter'); await expect(page.locator('html')).toHaveAttribute('data-theme', mode === 'light' ? 'light' : 'dark');
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim())).toBe('#087443');
    await page.getByRole('button', { name: 'Account menu', exact: true }).click(); const account = page.getByRole('dialog', { name: 'Your account' });
    await account.getByRole('radio', { name: 'System', exact: true }).check(); await expect(toggle).toHaveAttribute('data-mode', 'system');
    await page.emulateMedia({ colorScheme: 'light' }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expectAccountAppearance(account);
    await page.emulateMedia({ colorScheme: 'dark' }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expectAccountAppearance(account);
    await shot(page, `${width}-${mode}-account`);
    await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Account menu', exact: true })).toBeFocused();
    await page.goto('/settings?section=appearance'); await expect(page.getByRole('radio', { name: 'System', exact: true })).toBeChecked(); await shot(page, `${width}-${mode}-appearance`);
    await page.reload(); await expect(page.getByRole('radio', { name: 'System', exact: true })).toBeChecked(); await expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(await toggle.locator('.theme-switch-thumb').evaluate(node => parseFloat(getComputedStyle(node).transitionDuration))).toBe(0);
  });
}
test('persisted Dark is applied by the blocking bootstrap even before the React entry executes', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode: 'dark', primaryColor: '#7040BC' })));
  let intercepted = false; await page.route(url => url.pathname === '/src/main.tsx', route => { intercepted = true; return route.abort(); }); await page.goto('/'); expect(intercepted).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark'); expect(await page.locator('#root').innerHTML()).toBe('');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-primary'))).toBe('#7040BC');
});
test('theme motion is bounded without reduced motion and never changes control geometry', async ({ page }) => {
  await workspace(page); await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.goto('/customers');
  const toggle = page.getByRole('switch', { name: 'Dark appearance' }); const before = await toggle.boundingBox();
  const duration = await toggle.locator('.theme-switch-thumb').evaluate(node => parseFloat(getComputedStyle(node).transitionDuration));
  expect(duration).toBeGreaterThanOrEqual(.16); expect(duration).toBeLessThanOrEqual(.25);
  await toggle.click(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark'); const after = await toggle.boundingBox();
  expect(after?.width).toBe(before?.width); expect(after?.height).toBe(before?.height);
});
test('CRM stage filters and paginated leads remain server-owned; custom criteria stay private', async ({ page }) => {
  const f = await relationshipFixture(page); const queries: URL[] = [];
  await page.route('http://127.0.0.1:5009/api/crm/leads?**', route => {
    const url = new URL(route.request().url()); queries.push(url); const number = Number(url.searchParams.get('page'));
    return route.fulfill({ json: { data: { data: [{ ...f.lead, id: 'qa-page-' + number, name: 'QA server page ' + number }], total: 41, page: number, limit: 20, timezone: 'Asia/Kolkata' } } });
  });
  await page.goto('/crm'); await page.getByRole('button', { name: 'Next', exact: true }).click(); await expect(page.getByRole('heading', { name: 'QA server page 2', exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'pipeline', exact: true }).click(); await page.getByRole('button', { name: 'View stage ' + f.stage.name }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.get('stageId')).toBe(f.stage.id); await expect.poll(() => queries.at(-1)?.searchParams.get('page')).toBe('1'); expect(queries.at(-1)?.searchParams.get('limit')).toBe('20'); expect(queries.at(-1)?.searchParams.get('status')).toBe('active');
  await page.getByLabel('Search leads', { exact: true }).fill('QA private criterion'); await expect.poll(() => queries.at(-1)?.searchParams.get('search')).toBe('QA private criterion');
  await page.getByRole('button', { name: 'Remove Stage filter' }).click(); await expect.poll(() => queries.at(-1)?.searchParams.has('stageId')).toBe(false); expect(queries.at(-1)?.searchParams.get('search')).toBe('QA private criterion');
  await page.getByRole('button', { name: 'Clear lead filters', exact: true }).click(); await expect(page.getByLabel('Search leads', { exact: true })).toHaveValue('');
  expect(page.url()).not.toContain('criterion'); expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain('criterion');
});
