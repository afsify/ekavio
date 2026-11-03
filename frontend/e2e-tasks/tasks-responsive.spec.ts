import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { api, fixture, login, noOverflow, openTask, seed } from './helpers';

const widths = [320, 360, 390, 430, 768, 1024, 1440, 1920];
for (const width of widths) for (const theme of ['light', 'dark', 'system'] as const) {
  test(`Tasks responsive ${width} ${theme}`, async ({ page, request }) => {
    const account = await fixture(request);
    const title = 'QA clear ownership ' + 'LongUnbrokenTaskTitle'.repeat(7);
    const { headers } = await seed(request, account, { title, description: 'QA ordinary description. '.repeat(100), assignedMembershipId: account.membershipId });
    expect((await request.put(`${api}/api/auth/preferences`, { headers, data: { mode: theme, primaryColor: '#4F46E5' } })).status()).toBe(200);
    await page.setViewportSize({ width, height: 960 }); await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.addInitScript(mode => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode, primaryColor: '#4F46E5' })), theme);
    const directory = process.env.TASKS_QA_SHOTS ?? 'test-results/tasks-screenshots'; await mkdir(directory, { recursive: true });
    const capture = async (state: string) => { await noOverflow(page); await page.screenshot({ path: `${directory}/${width}-${theme}-${state}.png`, fullPage: false }); };
    await login(page, account); if (width === 320 && theme === 'light') await page.screenshot({ path: `${directory}/compact-initial-viewport.png`, fullPage: false }); await expect(page.getByRole('button', { name: `View ${title}`, exact: true }).filter({ visible: true })).toBeInViewport({ ratio: 0.5 });
    expect(await page.locator('html').getAttribute('data-theme')).toBe(theme === 'light' ? 'light' : 'dark'); await capture('my-tasks');
    await page.getByRole('button', { name: 'Team Tasks', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Team Tasks', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: `View ${title}`, exact: true }).filter({ visible: true })).toBeVisible(); await capture('team-tasks');
    await page.getByRole('button', { name: 'Filters', exact: true }).click(); await expect(page.getByRole('region', { name: 'Task filters', exact: true })).toBeVisible(); await capture('filters'); await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await openTask(page, title); await expect(page.getByRole('heading', { name: 'Task created · Version 1', exact: true })).toBeVisible(); await capture('detail-history');
    await page.getByRole('button', { name: 'Edit or reassign', exact: true }).click(); await expect(page.getByLabel('Assign to (required)')).toBeEnabled(); await capture('edit');
    await page.getByLabel('Deadline (optional)', { exact: true }).scrollIntoViewIfNeeded(); await capture('edit-schedule');
    await page.keyboard.press('Escape'); await expect(page.getByRole('heading', { name: 'Task information', exact: true })).toBeVisible(); await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: `View ${title}`, exact: true }).filter({ visible: true })).toBeFocused();
    await page.getByRole('button', { name: 'Create task', exact: true }).click(); await expect(page.getByLabel('Assign to (required)')).toBeEnabled(); await capture('create');
    await page.getByLabel('Assign to (required)').scrollIntoViewIfNeeded(); await capture('create-assignment');
    await page.getByLabel('Task title', { exact: true }).fill('QA unsaved draft'); await page.keyboard.press('Escape'); await expect(page.getByRole('heading', { name: 'Discard task draft?' })).toBeVisible(); await capture('unsaved');
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click(); await expect(page.getByLabel('Task title', { exact: true })).toHaveValue('QA unsaved draft');
    await page.getByRole('button', { name: 'Close', exact: true }).click(); await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
    await page.getByLabel('Search task titles', { exact: true }).fill('QA no matching record'); await expect(page.getByRole('heading', { name: 'No matching tasks', exact: true })).toBeVisible(); await capture('empty');
    await page.route(`${api}/api/tasks?**`, route => route.fulfill({ status: 503, json: { message: 'QA simulated service unavailable' } }));
    await page.getByRole('region', { name: 'Task search and filters' }).getByRole('button', { name: 'Reset filters', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('QA simulated service unavailable'); await capture('error');
    await page.unroute(`${api}/api/tasks?**`); await page.getByRole('button', { name: 'Retry', exact: true }).click(); await expect(page.getByRole('button', { name: `View ${title}`, exact: true }).filter({ visible: true })).toBeVisible();
    if (width < 1024) {
      const trigger = page.getByRole('button', { name: 'Open navigation', exact: true }); await trigger.click();
      const sidebar = page.getByRole('complementary', { name: 'Workspace sidebar' }); await expect(sidebar.getByRole('link', { name: 'EkaVio workspace', exact: true })).toBeFocused();
      await page.keyboard.press('Shift+Tab'); expect(await sidebar.evaluate(node => node.contains(document.activeElement))).toBe(true); await capture('navigation');
      await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
    }
  });
}
