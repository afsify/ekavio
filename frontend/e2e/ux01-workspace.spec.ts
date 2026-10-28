import { expect, test } from '@playwright/test';
import { workspace } from './fixtures';

for (const width of [320, 360, 390, 768, 1024, 1280, 1440]) for (const theme of ['light', 'dark', 'system'] as const) {
  test(`UX01 shell and account ${width} ${theme}`, async ({ page }) => {
    await workspace(page);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.addInitScript(mode => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode, primaryColor: '#4F46E5' })), theme);
    await page.goto('/dashboard');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme === 'system' ? 'dark' : theme);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    await expect.poll(overflow).toBe(true);
    await page.screenshot({ path: `test-results/ux01/${width}-${theme}-shell.png`, fullPage: true });
    if (width < 1024) {
      const trigger = page.getByRole('button', { name: 'Open navigation', exact: true });
      await trigger.click();
      const sidebar = page.getByRole('complementary', { name: 'Workspace sidebar' });
      await expect(sidebar.getByRole('link', { name: 'EkaVio workspace', exact: true })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(sidebar.getByRole('button', { name: 'Sign out', exact: true })).toBeFocused();
      await page.screenshot({ path: `test-results/ux01/${width}-${theme}-drawer.png` });
      await page.keyboard.press('Escape'); await expect(sidebar).toBeHidden(); await expect(trigger).toBeFocused();
    } else {
      await page.getByRole('button', { name: 'Collapse sidebar' }).click();
      await expect.poll(async () => (await page.getByRole('complementary', { name: 'Workspace sidebar' }).boundingBox())?.width).toBe(80);
      await page.screenshot({ path: `test-results/ux01/${width}-${theme}-rail.png` });
      await page.getByRole('button', { name: 'Expand sidebar' }).click();
    }
    const account = page.getByRole('button', { name: 'Account menu', exact: true });
    await account.click();
    const dialog = page.getByRole('dialog', { name: 'Your account' });
    await expect(dialog.getByRole('link', { name: 'Security & password' })).toHaveAttribute('href', '/settings?section=security');
    await expect(dialog.getByText('STAGING V208A Member', { exact: true })).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(await dialog.evaluate(node => { const rect = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.bottom - 12)); })).toBe(true);
    await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: 'Sign out' })).toBeFocused();
    await page.screenshot({ path: `test-results/ux01/${width}-${theme}-account.png` });
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expect(account).toBeFocused();
    await account.click(); await page.locator('.account-popover-layer .dialog-overlay').click({ position: { x: 2, y: 2 } });
    await expect(dialog).toBeHidden(); await expect(account).toBeFocused();
    if (theme === 'system') { await page.emulateMedia({ colorScheme: 'light' }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); }
    await expect.poll(overflow).toBe(true);
  });
}

test('UX01 preserves collapsed groups across navigation and keeps active destination visible', async ({ page }) => {
  await workspace(page); await page.setViewportSize({ width: 1440, height: 900 }); await page.goto('/dashboard');
  const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  const group = nav.locator('details').filter({ has: page.getByRole('heading', { name: 'Daily operations', exact: true }) });
  await group.locator('summary').click(); await expect(group).not.toHaveAttribute('open');
  await nav.getByRole('link', { name: 'Customers', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Customers', exact: true })).toBeVisible();
  await expect(group).not.toHaveAttribute('open');
  await group.locator('summary').click(); await group.getByRole('link', { name: 'Services', exact: true }).click();
  await expect(group).toHaveAttribute('open'); await group.locator('summary').click();
  await expect(group.getByRole('link', { name: 'Services', exact: true })).toBeVisible();
});

test('UX01 authorized large workspace choices use editable keyboard search at 200 percent text size', async ({ page }) => {
  const fixture = await workspace(page);
  for (let i = 1; i < 8; i++) fixture.session.memberships.push({ ...fixture.session.memberships[0], id: `qa-member-${i}`, organizationId: `qa-org-${i}`, orgName: `Authorized workspace ${i} with a long descriptive name` });
  await page.setViewportSize({ width: 390, height: 900 }); await page.goto('/dashboard');
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  const input = page.getByRole('combobox', { name: 'Active workspace' });
  const options = page.getByRole('listbox', { name: 'Active workspace' }).getByRole('option');
  await input.fill('workspace 7'); await expect(options).toHaveCount(1);
  await input.press('ArrowDown');
  const active = await input.getAttribute('aria-activedescendant'); expect(active).toBeTruthy();
  await expect(input).toBeFocused();
  await expect(options).toContainText('workspace 7');
  await page.screenshot({ path: 'test-results/ux01/390-zoom-combobox.png' });
  await input.press('Escape'); await expect(page.getByRole('listbox')).toBeHidden();
  await expect(input).toHaveValue('STAGING V208A Workspace');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('UX01 short mobile account sheet keeps actions reachable and secure logout canonical', async ({ page }) => {
  await workspace(page); await page.setViewportSize({ width: 320, height: 480 }); await page.goto('/dashboard');
  const trigger = page.getByRole('button', { name: 'Account menu' }); await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Your account' });
  await expect(dialog.getByRole('button', { name: 'Close modal' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  const logout = dialog.getByRole('button', { name: 'Sign out' }); await expect(logout).toBeFocused();
  const rect = await logout.boundingBox(); expect(rect!.y).toBeGreaterThanOrEqual(0); expect(rect!.y + rect!.height).toBeLessThanOrEqual(480);
  expect(await logout.evaluate(node => { const r = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
  await logout.click(); await expect(page).toHaveURL(/\/login$/);
  await page.goto('/customers'); await expect(page).toHaveURL(/\/login$/);
});
