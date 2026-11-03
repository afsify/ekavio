import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
export const api = 'http://127.0.0.1:5013';
export interface Account { phone: string; password: string; organizationId: string; branchId: string; membershipId: string; userId: string }
export interface Fixture extends Account { otherBranch: string; people: Record<'staff' | 'manager' | 'reader', Account> }
export async function fixture(request: APIRequestContext, options = {}): Promise<Fixture> {
  const response = await request.post(`${api}/__test/fixture`, { data: options }); expect(response.status()).toBe(200); return response.json();
}
export async function auth(request: APIRequestContext, account: Account) {
  await request.post(`${api}/__test/client-phase`);
  const response = await request.post(`${api}/api/auth/login`, { data: { phone: account.phone, password: account.password } }); expect(response.status()).toBe(200);
  return { authorization: `Bearer ${(await response.json()).accessToken}`, 'x-tenant-id': account.organizationId, 'x-branch-id': account.branchId };
}
export async function login(page: Page, account: Account) {
  await page.request.post(`${api}/__test/client-phase`);
  await page.goto('/login'); await page.getByLabel('Phone or email').fill(account.phone); await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign In to Ekavio' }).click(); await expect(page).toHaveURL(/dashboard/);
  await page.goto('/tasks'); await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
}
export async function seed(request: APIRequestContext, owner: Fixture, extra: object = {}) {
  const headers = await auth(request, owner);
  const response = await request.post(`${api}/api/tasks`, { headers, data: { title: 'QA assigned task', description: 'Disposable local task description', assignedMembershipId: owner.people.staff.membershipId, priority: 'high', localDue: '2026-10-20T10:30', idempotencyKey: randomUUID(), ...extra } });
  expect(response.status()).toBe(201); return { headers, fact: (await response.json()).data as { id: string; version: number } };
}
export async function openTask(page: Page, title: string) {
  const open = page.getByRole('button', { name: `View ${title}`, exact: true }).filter({ visible: true });
  await open.click(); await expect(page.getByRole('heading', { name: 'Task information', exact: true })).toBeVisible();
}
export async function confirm(page: Page) { await page.getByRole('button', { name: 'Review task', exact: true }).click(); await page.getByRole('button', { name: 'Confirm save', exact: true }).click(); }
export async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  const dialog = page.getByRole('dialog');
  if (await dialog.count()) {
    const dialogs = await dialog.evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return { x: box.x, right: box.right, top: box.top, bottom: box.bottom }; }));
    for (const box of dialogs) { expect(box.x).toBeGreaterThanOrEqual(-1); expect(box.right).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1); expect(box.top).toBeGreaterThanOrEqual(-1); expect(box.bottom).toBeLessThanOrEqual((page.viewportSize()?.height ?? 0) + 1); }
    const bounds = await dialog.locator('input,select,textarea,.dialog-actions button').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length > 0).map(node => { const box = node.getBoundingClientRect(); return { x: box.x, right: box.right }; }));
    for (const box of bounds) { expect(box.x).toBeGreaterThanOrEqual(-1); expect(box.right).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1); }
    const footers = await dialog.locator('.dialog-actions').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().bottom));
    for (const bottom of footers) expect(bottom).toBeLessThanOrEqual((page.viewportSize()?.height ?? 0) + 1);
  }
}
