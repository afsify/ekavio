import { expect, test } from '@playwright/test';
import { workspace } from './fixtures';

async function manyContexts(page: import('@playwright/test').Page) {
  const fixture = await workspace(page), member = fixture.session.memberships[0];
  for (let i = 1; i < 8; i++) fixture.session.memberships.push({ ...member, id: `qa-member-${i}`, organizationId: `qa-org-${i}`, orgName: `Authorized workspace ${i}` });
}

test('searchable select: Space reopens the full list and Enter keeps keyboard focus on the control', async ({ page }) => {
  await manyContexts(page); await page.setViewportSize({ width: 375, height: 800 }); await page.goto('/dashboard');
  const input = page.getByRole('combobox', { name: 'Active workspace' }), options = page.getByRole('listbox', { name: 'Active workspace' }).getByRole('option');
  await input.focus(); await expect(options).toHaveCount(8);
  await page.keyboard.press('Escape'); await expect(input).toBeFocused(); await expect(input).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Space'); await expect(input).toHaveAttribute('aria-expanded', 'true'); await expect(options).toHaveCount(8);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(input).toBeFocused({ timeout: 10_000 }); await expect(input).toHaveAttribute('aria-expanded', 'false');
});

test('searchable select list stays above the bottom navigation on a short viewport', async ({ page }) => {
  await manyContexts(page); await page.setViewportSize({ width: 375, height: 300 }); await page.goto('/dashboard');
  await page.getByRole('combobox', { name: 'Active workspace' }).focus();
  const popover = page.locator('.search-select-popover'); await expect(popover).toBeVisible();
  const [pop, nav] = await Promise.all([popover.boundingBox(), page.locator('.mobile-nav').boundingBox()]);
  expect(pop!.y + pop!.height).toBeLessThanOrEqual(nav!.y + 1);
  const covered = await page.evaluate(() => { const last = Array.from(document.querySelectorAll('.search-select-popover [role=option]')).filter(o => { const r = o.getBoundingClientRect(), p = document.querySelector('.search-select-popover')!.getBoundingClientRect(); return r.bottom <= p.bottom && r.top >= p.top; }); return last.every(o => { const r = o.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return Boolean(hit && o.contains(hit)); }); });
  expect(covered).toBe(true);
});
