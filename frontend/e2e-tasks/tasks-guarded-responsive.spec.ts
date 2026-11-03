import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { api, auth, confirm, fixture, login, noOverflow, openTask, seed } from './helpers';

// Complements (does not repeat) the directory/form matrix: real stale-version,
// immutable history and read-only record states at every required size/theme.
for (const width of [320, 360, 390, 430, 768, 1024, 1440, 1920]) for (const theme of ['light', 'dark', 'system'] as const) {
  test(`Tasks guarded responsive ${width} ${theme}`, async ({ page, request }) => {
    const account = await fixture(request), title = 'QA guarded work ' + 'LongTaskTitle'.repeat(10);
    const { headers, fact } = await seed(request, account, { title, description: 'QA retained description. '.repeat(70) });
    for (const actor of [account, account.people.reader]) {
      const h = actor === account ? headers : await auth(request, actor);
      expect((await request.put(`${api}/api/auth/preferences`, { headers: h, data: { mode: theme, primaryColor: '#4F46E5' } })).status()).toBe(200);
    }
    await page.setViewportSize({ width, height: 960 }); await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    const directory = process.env.TASKS_QA_SHOTS ?? 'test-results/tasks-screenshots'; await mkdir(directory, { recursive: true });
    const capture = async (state: string) => { await noOverflow(page); await page.screenshot({ path: `${directory}/${width}-${theme}-${state}.png`, fullPage: false }); };
    await login(page, account); await page.getByRole('button', { name: 'Team Tasks', exact: true }).click(); await expect(page.getByRole('button', { name: `View ${title}`, exact: true }).filter({ visible: true })).toBeVisible(); await capture('team-tasks'); await openTask(page, title);
    await page.getByRole('button', { name: 'Edit or reassign', exact: true }).click(); await page.getByLabel('Task title', { exact: true }).fill('QA retained conflicting draft');
    expect((await request.patch(`${api}/api/tasks/${fact.id}`, { headers, data: { description: 'QA changed in another client', expectedVersion: 1, idempotencyKey: randomUUID() } })).status()).toBe(200);
    await confirm(page); await expect(page.getByRole('alert')).toContainText('Reload current facts'); await expect(page.getByLabel('Task title', { exact: true })).toHaveValue('QA retained conflicting draft'); await capture('conflict');
    await page.getByRole('button', { name: 'Close and reload', exact: true }).click(); await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
    const event = page.getByRole('heading', { name: 'Details updated · Version 2', exact: true }); await expect(event).toBeAttached(); await event.scrollIntoViewIfNeeded(); await expect(event).toBeVisible(); await capture('history');
    await page.context().clearCookies(); await login(page, account.people.reader); await openTask(page, title); await expect(page.getByText('Read-only record. No changes are currently permitted.')).toBeAttached();
    await expect(page.getByRole('button', { name: 'Edit or reassign' })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Cancel task', exact: true })).toHaveCount(0); await capture('read-only');
  });
}
