import { test, expect } from '@playwright/test';
import { workspace } from './fixtures';
import type { PublicCommercialOffer } from '../src/commercial/publicCommercial';

const offer: PublicCommercialOffer = { offerType: 'plan', key: 'qa-core', name: 'Synthetic Core', description: 'Illustrative queue package', available: true, moduleKeys: ['queue'], capabilities: ['Queue & Appointments'], category: 'package', marketingLabel: null, pricing: { currency: 'INR', pricingMode: 'fixed', monthlyPriceMinor: '10000', yearlyPriceMinor: '100000', billingCycles: ['monthly', 'yearly'] } };

for (const [width, mode] of [[320, 'light'], [390, 'dark'], [768, 'system'], [1440, 'dark']] as const) {
  test(`UX04A synthetic request review and receipt ${width} ${mode}`, async ({ page }, info) => {
    await workspace(page, { authenticated: false });
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.addInitScript(mode => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode, primaryColor: '#4F46E5' })), mode);
    await page.route('**/api/public/commercial/catalogue', route => route.fulfill({ json: { data: { currency: 'INR', plans: [offer], addOns: [] } } }));
    await page.route('**/api/public/commercial/quote', route => route.fulfill({ json: { data: { billingCycle: 'monthly', currency: 'INR', subtotalMinor: '10000', contactRequired: false, quoteFingerprint: 'a'.repeat(64), items: [{ offerType: 'plan', key: offer.key, name: offer.name, priceMinor: '10000' }] } } }));
    let submitted: Record<string, unknown> | undefined;
    await page.route('**/api/public/access-requests', route => {
      submitted = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { data: { publicReference: 'EV-REQ-ABCDEF0123456789ABCDEF0123456789', billingCycle: 'monthly', subtotalMinor: '10000', contactRequired: false, message: 'Synthetic request recorded for review.' } } });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Select Synthetic Core' }).click();
    await page.getByRole('button', { name: 'Continue to business details' }).click();
    await expect(page.getByRole('heading', { name: 'Step 2 of 3 — Business & contact' })).toBeFocused();
    await page.getByLabel('Business name', { exact: true }).fill('SYNTHETIC UX04A Example');
    await page.getByLabel('Contact name', { exact: true }).fill('QA Owner');
    if (width === 320) {
      const country = page.getByLabel('Phone number country', { exact: true });
      await country.focus(); await expect(country).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByLabel('Phone number', { exact: true })).toBeFocused();
      await page.getByLabel('Phone number', { exact: true }).fill('123');
      await page.getByRole('button', { name: 'Review request' }).click();
      await expect(page.getByText('Enter a valid phone number', { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Step 2 of 3 — Business & contact' })).toBeVisible();
    }
    await page.getByLabel('Phone number', { exact: true }).fill('9876543210');
    if (width < 480) {
      const phone = await page.getByLabel('Phone number', { exact: true }).boundingBox();
      const country = await page.getByLabel('Phone number country', { exact: true }).boundingBox();
      expect(phone!.width).toBeGreaterThanOrEqual(150);
      expect(phone!.y).toBeGreaterThanOrEqual(country!.y + country!.height);
      expect(phone!.height).toBeGreaterThanOrEqual(44);
      expect(country!.height).toBeGreaterThanOrEqual(44);
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.public-request').screenshot({ path: info.outputPath(`request-${width}-${mode}.png`) });
    await page.getByRole('button', { name: 'Review request' }).click();
    await expect(page.getByRole('heading', { name: 'Step 3 of 3 — Review your request' })).toBeFocused();
    await expect(page.getByText('Submitting does not charge you, create a subscription or grant access.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Edit business details' }).click();
    await expect(page.getByLabel('Business name', { exact: true })).toHaveValue('SYNTHETIC UX04A Example');
    await page.getByRole('button', { name: 'Review request' }).click();
    await page.getByRole('button', { name: 'Submit access request' }).click();
    await expect(page.getByRole('heading', { name: 'Request received' })).toBeVisible();
    expect(submitted).toMatchObject({ planKey: 'qa-core', billingCycle: 'monthly', phone: '+919876543210', quoteFingerprint: 'a'.repeat(64) });
    expect(submitted).not.toHaveProperty('subtotalMinor');
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('SYNTHETIC UX04A Example');
    await expect(page.getByText('Your workspace is not activated by this request.', { exact: false })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('UX04A pricing loading, retry and honest empty state', async ({ page }) => {
  await workspace(page, { authenticated: false });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let first = true;
  await page.route('**/api/public/commercial/catalogue', async route => {
    if (first) { first = false; await held; await route.fulfill({ status: 503, json: { message: 'Synthetic unavailable' } }); }
    else await route.fulfill({ json: { data: { currency: 'INR', plans: [], addOns: [] } } });
  });
  await page.goto('/');
  try { await expect(page.getByText('Loading current offers…')).toBeVisible(); } finally { release(); }
  await expect(page.getByRole('alert')).toContainText('Pricing is unavailable');
  await page.getByRole('button', { name: 'Retry pricing' }).click();
  await expect(page.getByText('No packages are currently published.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to business details' })).toBeDisabled();
});
