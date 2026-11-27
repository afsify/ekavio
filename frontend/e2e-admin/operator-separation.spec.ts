import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const api = 'http://127.0.0.1:5011';
const platformPaths = ['/commercial/requests', '/platform', '/commercial/renewals', '/corporate'];
const platformEndpoints = ['/platform/overview', '/platform/organizations', '/billing/operator/public-pricing'];

async function createActor(request: APIRequestContext, data: { role?: string; operator?: boolean; permissions?: string[] }) {
  const response = await request.post(api + '/__test/fixture', { data });
  expect(response.status()).toBe(200);
  return response.json() as Promise<{ phone: string; password: string; organizationId: string; branchId: string }>;
}

async function signIn(page: Page, actor: Awaited<ReturnType<typeof createActor>>, operator: boolean) {
  await page.goto('/login');
  await page.getByLabel('Phone or email').fill(actor.phone);
  await page.getByLabel('Password', { exact: true }).fill(actor.password);
  const login = page.waitForResponse(response => response.url() === api + '/api/auth/login' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Sign In to Ekavio' }).click();
  const response = await login;
  expect(response.status()).toBe(200);
  const session = await response.json();
  expect(session.platformOperator).toBe(operator);
  await expect(page).toHaveURL(/\/dashboard$/);
  return {
    authorization: 'Bearer ' + session.accessToken,
    'x-tenant-id': actor.organizationId,
    'x-branch-id': actor.branchId,
  };
}

for (const role of ['staff', 'admin', 'owner']) {
  test(`${role} has no platform destinations or operator API access`, async ({ page, request }) => {
    const actor = await createActor(request, { role });
    const headers = await signIn(page, actor, false);
    await page.goto('/settings?section=hub');
    await expect(page.getByRole('heading', { name: 'Find the right setting' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Platform operations settings' })).toHaveCount(0);
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav.getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
    for (const path of platformPaths) {
      await expect(nav.locator(`a[href="${path}"]`)).toHaveCount(0);
      await page.goto(path);
      await expect(page).toHaveURL(/\/dashboard$/);
    }
    for (const endpoint of platformEndpoints) {
      expect((await request.get(api + '/api' + endpoint, { headers })).status()).toBe(403);
    }
  });
}

test('signed-out requests retain the login redirect and API denial', async ({ page, request }) => {
  await page.goto('/platform');
  await expect(page).toHaveURL(/\/login$/);
  for (const endpoint of platformEndpoints) {
    expect((await request.get(api + '/api' + endpoint)).status()).toBe(401);
  }
});

test('operator access still requires independent tenant grants and ends on logout', async ({ page, request }) => {
  const foreign = await createActor(request, { role: 'owner' });
  const actor = await createActor(request, { operator: true, permissions: ['customers.read', 'queue.read'] });
  const headers = await signIn(page, actor, true);
  await page.goto('/settings?section=hub');
  const section = page.getByRole('region', { name: 'Platform operations settings' });
  await expect(section.getByRole('link')).toHaveCount(3);
  await expect(section.getByRole('link', { name: /Commercial Intake/ })).toHaveAttribute('href', '/commercial/requests');
  await expect(section.getByRole('link', { name: /Renewals/ })).toHaveAttribute('href', '/commercial/renewals');
  await expect(section.getByRole('link', { name: /Corporate HQ/ })).toHaveCount(0);
  await section.getByRole('link', { name: /Platform Operations/ }).click();
  await expect(page.getByRole('heading', { name: 'Platform Operations', exact: true })).toBeVisible();
  for (const endpoint of platformEndpoints) {
    expect((await request.get(api + '/api' + endpoint, { headers })).status()).toBe(200);
  }
  expect((await request.get(api + '/api/organization', { headers })).status()).toBe(403);
  expect((await request.get(api + '/api/organization/context', {
    headers: { ...headers, 'x-tenant-id': foreign.organizationId, 'x-branch-id': foreign.branchId },
  })).status()).toBe(403);
  expect((await request.get(api + '/api/organization/context', {
    headers: { ...headers, 'x-branch-id': foreign.branchId },
  })).status()).toBe(403);
  await page.goto('/corporate');
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/queue');
  await expect(page.getByRole('heading', { name: 'Upgrade Required' })).toBeVisible();
  const logout = page.waitForResponse(response => response.url() === api + '/api/auth/logout' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  expect((await logout).status()).toBe(200);
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/platform');
  await expect(page).toHaveURL(/\/login$/);
  expect((await request.get(api + '/api/platform/overview', { headers })).status()).toBe(401);
});

for (const theme of ['Light', 'Dark', 'System']) {
  test(`operator settings fit the viewport matrix in ${theme} with keyboard and reduced motion`, async ({ page, request }) => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await signIn(page, await createActor(request, { operator: true }), true);
    await page.goto('/settings?section=appearance');
    await page.getByRole('radio', { name: theme, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme === 'Light' ? 'light' : 'dark');
    await page.getByRole('button', { name: 'All settings', exact: true }).click();
    const section = page.getByRole('region', { name: 'Platform operations settings' });
    const card = section.getByRole('link', { name: /Platform Operations/ });
    const heading = card.getByRole('heading', { name: 'Platform Operations', exact: true });
    for (const width of [320, 390, 768, 1440]) {
      await test.step(`${width}px`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await expect(heading).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        const bounds = await card.boundingBox();
        expect(bounds?.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        expect(await card.locator('h4, p').evaluateAll(nodes =>
          nodes.every(node => node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight))).toBe(true);
        const ratios = await card.locator('h4, p').evaluateAll(nodes => nodes.map(node => {
          const canvas = document.createElement('canvas').getContext('2d')!;
          const luminance = (color: string) => {
            canvas.clearRect(0, 0, 1, 1);
            canvas.fillStyle = color;
            canvas.fillRect(0, 0, 1, 1);
            const [r, g, b] = Array.from(canvas.getImageData(0, 0, 1, 1).data).slice(0, 3).map(channel => {
              const value = channel / 255;
              return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          const foreground = luminance(getComputedStyle(node).color);
          const background = luminance(getComputedStyle(node.closest('a')!).backgroundColor);
          return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
        }));
        expect(ratios).toHaveLength(2);
        for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
        if (width < 1024) {
          const opener = page.getByRole('button', { name: 'Open navigation', exact: true });
          await opener.focus();
          await page.keyboard.press('Enter');
          await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Platform Operations', exact: true })).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(opener).toBeFocused();
        }
        await section.getByRole('link', { name: /Commercial Intake/ }).focus();
        await page.keyboard.press('Tab');
        await expect(card).toBeFocused();
        await expect(card).toHaveCSS('outline-style', 'solid');
        await expect(card).toHaveCSS('transition-duration', '0s');
      });
    }
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/platform$/);
  });
}
