import { test, expect, type Page } from '@playwright/test';
import { relationshipFixture } from '../e2e-relationships-visual/fixtures';
import { workspace } from './fixtures';
const screenshotRoot = process.env.V215A_SCREENSHOT_DIR ?? 'test-results/v215a';

async function boardFixture(page: Page, readonly = false) {
  const base = await relationshipFixture(page, readonly);
  const stages = [base.stage, ...['Proposal', 'Decision', 'Legacy enquiries'].map((name, index) => ({ ...base.stage, id: `qa-stage-${index}`, name, position: index + 1, status: index === 2 ? 'archived' : 'active' }))];
  const queries: URL[] = [];
  let failure = false;
  await page.route('http://127.0.0.1:5009/api/crm/stages', route => route.fulfill({ json: { data: stages } }));
  await page.route('http://127.0.0.1:5009/api/crm/leads?**', route => {
    const url = new URL(route.request().url()); queries.push(url);
    const stage = stages.find(stage => stage.id === url.searchParams.get('stageId')) ?? stages[0];
    if (failure && url.searchParams.has('stageId')) return route.fulfill({ status: 503, json: { message: 'QA stage unavailable' } });
    const pageNumber = Number(url.searchParams.get('page') ?? 1);
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const total = url.searchParams.get('search') === 'no match' ? 0 : 12;
    return route.fulfill({ json: { data: { data: Array.from({ length: Math.max(0, Math.min(limit, total - (pageNumber - 1) * limit)) }, (_, index) => ({ ...base.lead, id: index === 0 ? base.lead.id : `qa-lead-${stage.id}-${index}`, name: `${base.lead.name} ${stage.name} ${(pageNumber - 1) * limit + index + 1}`, stage_name: stage.name, pipeline_stage_id: stage.id })), total, page: pageNumber, limit, timezone: 'Asia/Kolkata' } } });
  });
  return { ...base, stages, queries, failBoard: () => { failure = true; }, recoverBoard: () => { failure = false; } };
}
async function openBoard(page: Page) {
  await page.goto('/crm');
  await page.getByRole('button', { name: 'pipeline', exact: true }).click();
  await page.getByRole('button', { name: 'Kanban board', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Qualified stage', exact: true }).getByText('12 matching leads')).toBeVisible();
}
async function fits(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('.crm-board-column,.crm-board-card,.crm-detail-shortcuts').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).every(node => node.scrollWidth <= node.clientWidth))).toBe(true);
}

test('stage pages, filters and drawer return preserve the actual server view', async ({ page }) => {
  const fixture = await boardFixture(page);
  await openBoard(page);
  const stage = page.getByRole('region', { name: 'Qualified stage', exact: true });
  await stage.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(stage.getByText('Page 2 of 3')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Proposal stage', exact: true }).getByText('Page 1 of 3')).toBeVisible();
  const opening = stage.getByRole('button', { name: /Open Lead/ }).first();
  await opening.click();
  const drawer = page.getByRole('dialog', { name: 'Lead details', exact: true });
  await drawer.getByRole('button', { name: 'Go to activity history' }).click();
  await expect(drawer.getByRole('heading', { name: 'Activity history' })).toBeFocused();
  await expect(drawer.getByText('Lead created · QA member')).toBeVisible();
  await drawer.getByRole('button', { name: 'Back to pipeline' }).click();
  await expect(stage.getByText('Page 2 of 3')).toBeVisible();
  await expect(opening).toBeFocused();
  await page.getByRole('searchbox', { name: 'Search leads' }).fill('no match');
  await expect(stage.getByText('0 matching leads')).toBeVisible();
  await expect(stage.getByText('Page 1 of 1')).toBeVisible();
  expect(fixture.queries.at(-1)?.searchParams.get('limit')).toBe('5');
  expect(page.url()).not.toContain('no%20match');
  await page.getByRole('button', { name: 'Clear lead filters' }).click();
  await expect(stage.getByText('12 matching leads')).toBeVisible();
});

test('Lead edit and follow-up edit return to the same Lead and protect unsaved work', async ({ page }) => {
  await boardFixture(page); await openBoard(page);
  await page.getByRole('region', { name: 'Qualified stage', exact: true }).getByRole('button', { name: /Open Lead/ }).first().click();
  const drawer = page.getByRole('dialog', { name: 'Lead details', exact: true });
  await drawer.getByRole('button', { name: 'Edit lead', exact: true }).click();
  await page.getByRole('dialog', { name: 'Edit lead', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: 'Go to follow-ups' }).click();
  await expect(drawer.getByRole('heading', { name: 'Follow-ups', exact: true })).toBeFocused();
  await drawer.getByRole('button', { name: 'Edit follow-up', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit follow-up', exact: true });
  await editor.getByRole('textbox', { name: 'Follow-up subject' }).fill('Synthetic unsaved change');
  await page.keyboard.press('Escape');
  const discard = page.getByRole('dialog', { name: 'Discard unsaved changes?' });
  await expect(discard).toBeVisible();
  await discard.getByRole('button', { name: 'Keep editing' }).click();
  await expect(editor.getByRole('textbox', { name: 'Follow-up subject' })).toHaveValue('Synthetic unsaved change');
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await discard.getByRole('button', { name: 'Discard changes' }).click();
  await expect(drawer).toBeVisible();
});

test('directory search and server page survive Lead edit and return', async ({ page }) => {
  const fixture = await relationshipFixture(page);
  const queries: URL[] = [];
  await page.route('http://127.0.0.1:5009/api/crm/leads?**', route => {
    const url = new URL(route.request().url()); queries.push(url);
    const pageNumber = Number(url.searchParams.get('page') ?? 1);
    return route.fulfill({ json: { data: { data: Array.from({ length: pageNumber === 3 ? 1 : 20 }, (_, index) => ({ ...fixture.lead, id: index ? `qa-${pageNumber}-${index}` : fixture.lead.id, name: index ? `QA enquiry ${pageNumber}-${index}` : fixture.lead.name })), total: 41, page: pageNumber, limit: 20, timezone: 'Asia/Kolkata' } } });
  });
  await page.goto('/crm');
  await page.getByRole('searchbox', { name: 'Search leads' }).fill('QA enquiry');
  const directory = page.getByRole('region', { name: 'Lead directory' });
  await directory.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(directory.getByText('Page 2 of 3')).toBeVisible();
  await directory.getByRole('button', { name: `View ${fixture.lead.name}`, exact: true }).filter({ visible: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Lead details', exact: true });
  await drawer.getByRole('button', { name: 'Edit lead', exact: true }).click();
  await page.getByRole('dialog', { name: 'Edit lead', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click();
  await drawer.getByRole('button', { name: 'Back to Lead directory' }).click();
  await expect(directory.getByText('Page 2 of 3')).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search leads' })).toHaveValue('QA enquiry');
  expect(queries.at(-1)?.searchParams.get('page')).toBe('2');
  expect(queries.at(-1)?.searchParams.get('search')).toBe('QA enquiry');
});

test('Lead follow-up creation retains branch time and Today Upcoming Overdue use server views', async ({ page }) => {
  const fixture = await relationshipFixture(page);
  const views: string[] = [];
  let created: Record<string, unknown> | undefined;
  await page.route('http://127.0.0.1:5009/api/crm/followups**', async route => {
    if (route.request().method() === 'POST') { created = route.request().postDataJSON(); return route.fulfill({ status: 201, json: { data: { id: 'qa-created-followup' } } }); }
    const view = new URL(route.request().url()).searchParams.get('view'); if (view) views.push(view);
    return route.fallback();
  });
  await page.goto(`/crm?lead=${fixture.lead.id}`);
  const drawer = page.getByRole('dialog', { name: 'Lead details', exact: true });
  await drawer.getByRole('button', { name: 'Add follow-up', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Add follow-up', exact: true });
  await editor.getByRole('textbox', { name: 'Follow-up subject' }).fill('QA planned conversation');
  await editor.getByLabel('Due date and time').fill('2026-10-25T10:30');
  await editor.getByRole('button', { name: 'Review', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Review · Add follow-up' });
  await expect(review.getByText('Due: 2026-10-25 10:30 Asia/Kolkata')).toBeVisible();
  await review.getByRole('button', { name: 'Save follow-up', exact: true }).click();
  await expect(drawer).toBeVisible();
  expect(created).toMatchObject({ leadId: fixture.lead.id, localDue: '2026-10-25T10:30', subject: 'QA planned conversation' });
  await drawer.getByRole('button', { name: 'Back to Lead directory' }).click();
  await page.getByRole('button', { name: 'Follow-ups', exact: true }).click();
  for (const view of ['Today', 'Upcoming', 'Overdue']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    await expect.poll(() => views.at(-1)).toBe(view.toLowerCase());
    await expect(page.getByRole('button', { name: view, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
});

test('read-only board keeps drawer keyboard focus contained and restores its opener', async ({ page }) => {
  await boardFixture(page, true); await openBoard(page);
  expect(await page.getByRole('button', { name: 'Create lead', exact: true }).count()).toBe(0);
  const opening = page.getByRole('region', { name: 'Qualified stage', exact: true }).getByRole('button', { name: /Open Lead/ }).first();
  await opening.focus(); await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: 'Lead details', exact: true });
  await expect(drawer.getByRole('heading', { name: 'Lead information' })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Edit lead', exact: true })).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: 'Edit follow-up', exact: true })).toHaveCount(0);
  const close = drawer.getByRole('button', { name: 'Close modal' });
  await close.focus(); await page.keyboard.press('Shift+Tab');
  expect(await drawer.evaluate(node => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab'); await expect(close).toBeFocused();
  await page.keyboard.press('Escape'); await expect(drawer).toHaveCount(0); await expect(opening).toBeFocused();
});

test('board failure remains an error and retries only its bounded read', async ({ page }) => {
  const fixture = await boardFixture(page); fixture.failBoard();
  await page.goto('/crm'); await page.getByRole('button', { name: 'pipeline', exact: true }).click();
  await page.getByRole('button', { name: 'Kanban board' }).click();
  const stage = page.getByRole('region', { name: 'Qualified stage', exact: true });
  await expect(stage.getByRole('heading', { name: 'Stage could not be loaded' })).toBeVisible();
  await expect(stage.getByText('0 matching leads')).toHaveCount(0);
  fixture.recoverBoard(); await stage.getByRole('button', { name: /Retry/ }).click();
  await expect(stage.getByText('12 matching leads')).toBeVisible();
});

for (const missing of ['permission', 'entitlement']) test(`CRM requires its independent ${missing} gate before fetching records`, async ({ page }) => {
  await workspace(page, { permissions: missing === 'permission' ? ['customers.read'] : ['crm.read'], modules: missing === 'entitlement' ? [] : ['crm'] });
  const requests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/crm/')) requests.push(request.url()); });
  await page.goto('/crm');
  if (missing === 'permission') await expect(page).toHaveURL(/\/dashboard$/);
  else await expect(page.getByRole('heading', { name: 'Upgrade Required' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Lead pipeline board' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create lead', exact: true })).toHaveCount(0);
  expect(requests).toEqual([]);
});

for (const width of [390, 768, 1440]) for (const mode of ['light', 'dark', 'system']) {
  test(`CRM workbench visual ${width}px ${mode}`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await boardFixture(page, true);
    await page.setViewportSize({ width, height: 950 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.addInitScript(mode => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode, primaryColor: '#4F46E5' })), mode);
    await openBoard(page); await expect(page.locator('html')).toHaveAttribute('data-theme', mode === 'system' ? 'dark' : mode);
    await fits(page); await page.getByRole('region', { name: 'Qualified stage', exact: true }).getByRole('button', { name: /Open Lead/ }).first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${screenshotRoot}/${width}-${mode}-board.png` });
    await page.getByRole('region', { name: 'Qualified stage', exact: true }).getByRole('button', { name: /Open Lead/ }).first().click();
    const drawer = page.getByRole('dialog', { name: 'Lead details', exact: true });
    await expect(drawer.getByRole('heading', { name: 'Lead information' })).toBeVisible();
    await fits(page); await page.screenshot({ path: `${screenshotRoot}/${width}-${mode}-detail.png` });
    await drawer.getByRole('button', { name: 'Back to pipeline' }).click();
    await page.getByRole('button', { name: 'Follow-ups', exact: true }).click();
    await page.getByRole('button', { name: 'Upcoming', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'QA discuss the next consultation' })).toBeVisible();
    await page.getByRole('heading', { name: 'QA discuss the next consultation' }).scrollIntoViewIfNeeded();
    await fits(page); await page.screenshot({ path: `${screenshotRoot}/${width}-${mode}-followups.png` });
    expect(errors).toEqual([]);
  });
}
