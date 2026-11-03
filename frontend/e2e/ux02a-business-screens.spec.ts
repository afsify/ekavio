import { expect, test, type Page } from '@playwright/test';
import { workspace } from './fixtures';
import { relationshipFixture } from '../e2e-relationships-visual/fixtures';

const phase = process.env.UX02A_SCREENSHOT_PHASE ?? 'after';
const samples = [
  { key: 'queue', label: 'Waiting customers', value: '8', description: 'Waiting in the selected branch today', path: '/queue' },
  { key: 'crm-overdue', label: 'Overdue follow-ups', value: '3', description: 'Pending follow-ups on active leads', path: '/crm' },
  { key: 'inventory', label: 'Low-stock items', value: '2', description: 'Items below the branch stock threshold', path: '/inventory' },
  { key: 'customers', label: 'Customers', value: '124', description: 'Active organization customer records', path: '/customers' },
];

async function overview(page: Page) {
  await workspace(page, { permissions: ['queue.read', 'crm.read', 'customers.read', 'inventory.read', 'tasks.read_own'], modules: ['queue', 'crm', 'inventory', 'tasks'] });
  await page.route('**/api/analytics/dashboard', route => route.fulfill({ json: { data: { widgets: samples, layout: { order: [], hidden: [], version: 1 }, timezone: 'Asia/Kolkata', businessDate: '2026-10-29' } } }));
}

async function tasks(page: Page, readonly = false) {
  const state = await workspace(page, { permissions: ['tasks.read_own', 'tasks.read', ...(readonly ? [] : ['tasks.manage'])], modules: ['tasks'] });
  const rows = ['Prepare the consultation pack', 'Confirm the supplier delivery', 'Review tomorrow’s appointments'].map((title, i) => ({
    id: `qa-task-${i}`, organizationId: state.session.organizationId, branchId: state.session.branchId,
    creatorMembershipId: state.session.memberships[0].id, assignedMembershipId: state.session.memberships[0].id,
    assigneeName: 'QA Alex Morgan', assigneeStatus: 'active', assigneeBranchAssigned: true,
    title, description: 'Synthetic work item. Confirm the details with the team before completing this task.',
    priority: i === 1 ? 'high' : 'normal', status: i === 1 ? 'in_progress' : 'todo', version: 1,
    dueAt: i === 1 ? '2026-10-28T05:00:00Z' : '2026-10-29T05:00:00Z', dueTimezone: 'Asia/Kolkata',
    createdAt: '2026-10-28T04:00:00Z', updatedAt: '2026-10-28T04:00:00Z', completedAt: null, cancelledAt: null,
    overdue: i === 1, allowedActions: readonly ? [] : ['progress', 'edit', 'cancel'],
  }));
  const queries: URL[] = [];
  await page.route('**/api/tasks**', route => {
    const url = new URL(route.request().url()); queries.push(url);
    const facts = { timezone: 'Asia/Kolkata', businessDate: '2026-10-29', serverNow: '2026-10-29T06:00:00Z' };
    let data: unknown;
    if (url.pathname.endsWith('/assignees')) data = { data: [{ id: state.session.memberships[0].id, name: 'QA Alex Morgan' }], total: 1, page: 1, limit: 20 };
    else if (url.pathname.endsWith('/history')) data = { data: [], total: 0, page: 1, limit: 20 };
    else if (url.pathname === '/api/tasks') {
      const matches = rows.filter(row => row.title.toLowerCase().includes((url.searchParams.get('search') ?? '').toLowerCase()) && (url.searchParams.get('attention') !== 'overdue' || row.overdue));
      data = { ...facts, data: matches, total: matches.length, page: Number(url.searchParams.get('page') ?? 1), limit: 20 };
    } else data = { ...facts, ...rows.find(row => url.pathname.endsWith(row.id)) };
    return route.fulfill({ json: { data } });
  });
  return { rows, queries };
}

async function capture(page: Page, name: string) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const control of await page.locator('main input:not([type=hidden]), main select, [role=dialog] input:not([type=hidden]), [role=dialog] select, [role=dialog] textarea').all()) {
    if (await control.isVisible()) await expect(control).toHaveAccessibleName(/\S/);
  }
  await page.screenshot({ path: `test-results/ux02a-${phase}/${name}.png`, fullPage: true });
  // Fixed drawers need a viewport capture as well: full-page stitching can
  // displace their backdrop/header when the underlying directory is scrolled.
  if (await page.getByRole('dialog').count()) {
    await page.screenshot({ path: `test-results/ux02a-${phase}/${name}-viewport.png`, fullPage: false });
  }
}

for (const width of [320, 768, 1440]) for (const theme of ['light', 'dark', 'system'] as const) {
  for (const screen of ['dashboard', 'crm', 'tasks'] as const) {
    test(`UX02A ${screen} ${width} ${theme}`, async ({ page }) => {
      if (screen === 'dashboard') await overview(page);
      else if (screen === 'crm') await relationshipFixture(page);
      else await tasks(page);
      await page.setViewportSize({ width, height: 960 });
      await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
      await page.addInitScript(mode => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode, primaryColor: '#4F46E5' })), theme);
      await page.goto(`/${screen}`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme === 'system' ? 'dark' : theme);
      if (screen === 'dashboard') await expect(page.getByRole('heading', { name: 'Waiting customers' })).toBeVisible();
      if (screen === 'crm') await expect(page.getByRole('region', { name: 'Lead directory', exact: true })).toBeVisible();
      if (screen === 'tasks') await expect(page.getByRole('button', { name: 'View Prepare the consultation pack', exact: true }).filter({ visible: true })).toBeVisible();
      await capture(page, `${screen}-${width}-${theme}`);
      if (screen === 'crm') {
        await page.getByRole('button', { name: 'pipeline', exact: true }).click();
        await page.getByRole('button', { name: 'Kanban board', exact: true }).click();
        await expect(page.getByText('1 matching leads')).toBeVisible();
        await capture(page, `kanban-${width}-${theme}`);
        await page.getByRole('button', { name: /Open Lead/ }).first().click();
        await expect(page.getByRole('dialog', { name: 'Lead details' })).toBeVisible();
        await capture(page, `lead-${width}-${theme}`);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('button', { name: /Open Lead/ }).first()).toBeFocused();
      }
      if (screen === 'tasks') {
        const trigger = page.getByRole('button', { name: 'View Prepare the consultation pack', exact: true }).filter({ visible: true });
        await trigger.click(); await expect(page.getByRole('heading', { name: 'Task information' })).toBeVisible();
        await capture(page, `task-detail-${width}-${theme}`);
        await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
        await page.getByRole('button', { name: 'Create task', exact: true }).click();
        await expect(page.getByRole('textbox', { name: 'Task title', exact: true })).toBeVisible();
        await capture(page, `task-form-${width}-${theme}`);
      }
      if (theme === 'system') {
        await page.emulateMedia({ colorScheme: 'light' });
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      }
    });
  }
}

test('UX02A task filters stay server authoritative and read-only actions remain restricted', async ({ page }) => {
  const fixture = await tasks(page, true); await page.goto('/tasks');
  await expect(page.getByRole('heading', { name: 'My Tasks', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create task' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Overdue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View Confirm the supplier delivery', exact: true }).filter({ visible: true })).toBeVisible();
  expect(fixture.queries.at(-1)?.searchParams.get('attention')).toBe('overdue');
  expect(fixture.queries.at(-1)?.searchParams.get('limit')).toBe('20');
  await page.getByRole('button', { name: 'View Confirm the supplier delivery', exact: true }).filter({ visible: true }).click();
  await expect(page.getByText('Read-only record. No changes are currently permitted.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit or reassign' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('searchbox', { name: 'Search task titles' }).fill('no match');
  await expect(page.getByRole('heading', { name: 'No matching tasks' })).toBeVisible();
  await page.getByRole('region', { name: 'Task search and filters' }).getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.getByRole('button', { name: 'View Prepare the consultation pack', exact: true }).filter({ visible: true })).toBeVisible();
});

test('UX02A directory is keyboard discoverable and permission aware', async ({ page }) => {
  await overview(page); await page.goto('/dashboard');
  const directory = page.locator('.dashboard-directory');
  await expect(directory).not.toHaveAttribute('open');
  await directory.locator('summary').focus(); await page.keyboard.press('Enter');
  await expect(directory).toHaveAttribute('open');
  await expect(directory.getByRole('link', { name: 'Tasks', exact: true })).toHaveAttribute('href', '/tasks');
  await expect(directory.getByRole('link', { name: 'Organization', exact: true })).toHaveCount(0);
});

test('UX02A lead next actions preserve the unsaved editor', async ({ page }) => {
  const fixture = await relationshipFixture(page); await page.goto('/crm');
  await page.getByRole('button', { name: `View ${fixture.lead.name}`, exact: true }).filter({ visible: true }).click();
  const next = page.getByRole('region', { name: 'Next step for this lead' });
  await expect(next.getByRole('button', { name: 'Add follow-up', exact: true })).toBeVisible();
  await next.getByRole('button', { name: 'Edit lead' }).click();
  await page.getByRole('textbox', { name: 'Lead name', exact: true }).fill('QA unsaved enquiry');
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByRole('textbox', { name: 'Lead name', exact: true })).toHaveValue('QA unsaved enquiry');
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.getByRole('dialog', { name: 'Lead details' })).toBeVisible();
});

test('UX02A read-only lead retains history without management shortcuts', async ({ page }) => {
  const fixture = await relationshipFixture(page, true); await page.goto('/crm');
  await page.getByRole('button', { name: `View ${fixture.lead.name}`, exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole('region', { name: 'Next step for this lead' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit lead', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Go to activity history' }).click();
  await expect(page.getByRole('heading', { name: 'Activity history' })).toBeFocused();
});
