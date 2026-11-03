import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { api, fixture, login, noOverflow, openTask, seed } from './helpers';

// Real server due/state facts, not browser-derived aggregate counts.
for (const width of [320, 360, 390, 430, 768, 1024, 1440, 1920]) for (const theme of ['light', 'dark', 'system']) {
  test(`Task attention ${width} ${theme}`, async ({ page, request }) => {
    const account = await fixture(request);
    const { headers } = await seed(request, account, { title: 'QA overdue branch work', assignedMembershipId: account.membershipId, localDue: '2020-01-01T10:30' });
    const { fact } = await seed(request, account, { title: 'QA completed branch work', assignedMembershipId: account.membershipId });
    expect((await request.post(`${api}/api/tasks/${fact.id}/status`, { headers, data: { status: 'completed', expectedVersion: 1, idempotencyKey: randomUUID() } })).status()).toBe(200);
    expect((await request.put(`${api}/api/auth/preferences`, { headers, data: { mode: theme, primaryColor: '#4F46E5' } })).status()).toBe(200);
    await page.setViewportSize({ width, height: 960 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    const directory = process.env.TASKS_QA_SHOTS ?? 'test-results/tasks-attention'; await mkdir(directory, { recursive: true });
    const capture = async (state: string) => { await noOverflow(page); await page.screenshot({ path: `${directory}/${width}-${theme}-${state}.png` }); };
    await login(page, account);
    const work = page.getByRole('navigation', { name: 'Task work views' });
    const overdue = work.getByRole('button', { name: 'Overdue', exact: true });
    // Return from lower records using keyboard focus; the sticky header must
    // not cover the focused control (especially at the 768px breakpoint).
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await overdue.focus(); await page.keyboard.press('Enter');
    await expect(overdue).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'View QA overdue branch work', exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'View QA completed branch work', exact: true }).filter({ visible: true })).toHaveCount(0);
    await overdue.scrollIntoViewIfNeeded();
    expect(await overdue.evaluate(node => { const r = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
    const size = await overdue.boundingBox(); expect(size!.height).toBeGreaterThanOrEqual(44);
    const ratios = await page.locator('.task-work-views button,.task-card .status-badge,.task-directory td .status-badge,.task-deadline').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).map(node => {
      const canvas = document.createElement('canvas').getContext('2d')!;
      const luminance = (color: string) => { canvas.clearRect(0, 0, 1, 1); canvas.fillStyle = color; canvas.fillRect(0, 0, 1, 1); const rgb = Array.from(canvas.getImageData(0, 0, 1, 1).data).slice(0, 3).map(value => { const s = value / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }); return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722; };
      const fg = luminance(getComputedStyle(node).color);
      const surfaces: string[] = []; let ancestor: Element | null = node; let opaque = false;
      while (ancestor) { const color = getComputedStyle(ancestor).backgroundColor; surfaces.push(color); canvas.clearRect(0, 0, 1, 1); canvas.fillStyle = color; canvas.fillRect(0, 0, 1, 1); if (canvas.getImageData(0, 0, 1, 1).data[3] === 255) { opaque = true; break; } ancestor = ancestor.parentElement; }
      if (!opaque) throw new Error('No opaque Task surface found');
      canvas.clearRect(0, 0, 1, 1); for (const color of surfaces.reverse()) { canvas.fillStyle = color; canvas.fillRect(0, 0, 1, 1); }
      const [r, g, b] = canvas.getImageData(0, 0, 1, 1).data, bg = luminance(`rgb(${r},${g},${b})`);
      return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
    }));
    expect(ratios.length).toBeGreaterThanOrEqual(9); for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
    await capture('overdue-view');
    await openTask(page, 'QA overdue branch work'); await expect(page.getByRole('dialog').getByText('Overdue', { exact: true })).toBeVisible(); await capture('overdue');
    await page.keyboard.press('Escape');
    const completed = work.getByRole('button', { name: 'Completed', exact: true }); await completed.focus(); await page.keyboard.press('Space');
    await expect(completed).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'View QA overdue branch work', exact: true }).filter({ visible: true })).toHaveCount(0); await capture('completed-view');
    await openTask(page, 'QA completed branch work'); await expect(page.getByRole('dialog').getByText('Completed', { exact: true })).toBeVisible(); await capture('completed');
    await expect(page.getByRole('button', { name: 'Reopen task', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel task', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
  });
}

test('keyboard-only Task completion retains focus, real history and original deadlines', async ({ page, request }) => {
  const account = await fixture(request); await seed(request, account);
  await page.setViewportSize({ width: 768, height: 960 }); await login(page, account.people.staff);
  const trigger = page.getByRole('button', { name: 'View QA assigned task', exact: true }).filter({ visible: true });
  await trigger.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Task details' }); await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark in progress', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close modal', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Mark in progress', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Mark completed', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Review task', exact: true }).focus(); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Confirm save', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Task completed · Version 2' })).toBeAttached();
  await page.keyboard.press('Shift+Tab'); expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
