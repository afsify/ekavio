import { test, expect } from '@playwright/test';
import { fits, pages, visualFixture } from './fixtures';

// Presentation-only screenshots; no submitted mutation or domain proof is mocked.
for (const width of [390, 1440]) for (const theme of ['light', 'dark', 'system']) for (const domain of pages) test(`${domain.title} ${width}px ${theme} reviewed actions and filters`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const fixture = await visualFixture(page);
  await page.addInitScript(mode => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode, primaryColor: '#4F46E5' })), theme);
  await page.goto(domain.path); await expect(page.getByRole('heading', { name: domain.title, exact: true })).toBeVisible();
  const prefix = `test-results/operations-visual/${domain.path.slice(1)}-${width}-${theme}`;
  if (domain.path === '/inventory' || domain.path === '/ledger') {
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await expect(page.getByLabel(domain.path === '/inventory' ? 'Item status' : 'Transaction type', { exact: true })).toBeVisible();
    await fits(page); await page.screenshot({ path: prefix + '-filters.png', fullPage: true });
  }
  await page.getByRole('button', { name: domain.create, exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
  if (domain.path === '/queue' || domain.path === '/appointments') {
    await dialog.getByLabel('Customer', { exact: true }).selectOption(fixture.customer.id);
    await dialog.getByLabel('Branch-available service').selectOption(fixture.service.id);
    if (domain.path === '/appointments') await dialog.getByLabel('Local start time').fill('10:30');
  }
  if (domain.path === '/ledger') { await dialog.getByLabel('Customer', { exact: true }).selectOption(fixture.customer.id); await dialog.getByLabel('Amount (INR decimal)').fill('123.45'); }
  if (domain.path === '/inventory') await dialog.getByLabel('Item name').fill('Disposable reviewed item');
  await expect(dialog.getByRole('button', { name: 'Review', exact: true })).toBeEnabled(); await dialog.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: /^Review ·/ })).toBeVisible(); await fits(page); await page.screenshot({ path: prefix + '-review.png', fullPage: true });
  // Keyboard escape keeps a single dialog/trap and never loses focus to navigation.
  await page.keyboard.press('Escape'); await expect(dialog.getByRole('heading', { name: 'Discard unsaved changes?' })).toBeVisible(); await fits(page);
  await page.screenshot({ path: prefix + '-discard.png', fullPage: true }); await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();
  if (domain.path === '/queue' || domain.path === '/appointments') {
    await page.getByRole('button', { name: domain.path === '/queue' ? 'Serve customer' : 'Check in', exact: true }).click();
    await expect(dialog.getByRole('button', { name: domain.path === '/queue' ? 'Confirm status' : 'Confirm check-in', exact: true })).toBeVisible();
    await fits(page); await page.screenshot({ path: prefix + '-status.png', fullPage: true }); await dialog.getByRole('button', { name: 'Close modal' }).click();
  }
  if (domain.path === '/ledger') {
    await page.getByRole('button', { name: 'Details', exact: true }).click(); await dialog.getByRole('button', { name: 'Reverse transaction', exact: true }).click();
    await page.getByLabel('Reversal reason').fill('Disposable reviewed inverse'); await dialog.getByRole('button', { name: 'Review', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Confirm reversal', exact: true })).toBeVisible(); await fits(page); await page.screenshot({ path: prefix + '-reversal.png', fullPage: true });
  }
  if (domain.path === '/inventory') {
    await page.getByRole('button', { name: 'Details & history', exact: true }).click();
    const receipt = dialog.locator('article').filter({ hasText: 'Disposable Purchasing receipt' }); await expect(receipt).toBeVisible(); await expect(receipt.getByRole('button', { name: 'Reverse movement' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Receive stock', exact: true }).click(); await page.getByLabel('Quantity (Kilogram)').fill('1.125');
    await dialog.getByRole('button', { name: 'Review', exact: true }).click(); await expect(dialog.getByText(/Projected quantity 11.250/)).toBeVisible(); await fits(page); await page.screenshot({ path: prefix + '-stock-review.png', fullPage: true });
  }
});

for (const domain of pages) test(`${domain.title} short phone viewport retains visible review controls`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 430 }); await visualFixture(page); await page.goto(domain.path);
  await page.getByRole('button', { name: domain.create, exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await fits(page);
  await page.screenshot({ path: `test-results/operations-visual/${domain.path.slice(1)}-390-short-form.png` });
});
