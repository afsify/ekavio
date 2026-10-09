import { expect, type Page, type Route } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { workspace } from '../e2e/fixtures';
const permissions = ['customers.read', 'customers.manage', 'services.read', 'services.manage', 'queue.read', 'queue.manage', 'attendance.read', 'attendance.manage', 'ledger.read', 'ledger.manage', 'inventory.read', 'inventory.manage', 'purchasing.read'];
export const pages = [{ path: '/queue', title: 'Queue Management', create: 'New token' }, { path: '/appointments', title: 'Appointments', create: 'New appointment' }, { path: '/attendance', title: 'Daily Attendance', create: 'Mark attendance' }, { path: '/ledger', title: 'Customer Dues', create: 'Record Charge' }, { path: '/inventory', title: 'Inventory', create: 'Create item' }];
// Sanitized DTO fixtures prove presentation only. PostgreSQL workflows are separate.
export async function visualFixture(page: Page) {
  const state = await workspace(page, { permissions, modules: ['queue', 'attendance', 'ledger', 'inventory', 'purchasing'] });
  const customer = { id: randomUUID(), name: 'QA reception customer with a longer descriptive name', phone: null, status: 'active' }, service = { id: randomUUID(), name: 'QA branch consultation', durationMinutes: 30, active: true };
  state.customers.push(customer); state.services.push(service);
  const token = { id: randomUUID(), tokenNumber: '123', status: 'waiting', customer, service, provider: null, createdAt: '2026-10-07T05:00:00Z', version: 1 };
  const appointment = { ...token, id: randomUUID(), customerId: customer.id, serviceId: service.id, startsAt: '2026-10-07T05:00:00.000Z', endsAt: '2026-10-07T05:30:00.000Z', status: 'scheduled', notes: 'Disposable reviewed appointment' };
  const item = { id: randomUUID(), organizationId: state.org, branchId: state.branch, locationId: randomUUID(), locationName: 'Default stock', name: 'QA exact stock with a descriptive catalogue name', sku: 'QA-001', barcode: null, unitCode: 'kg', unit: { code: 'kg', label: 'Kilogram' }, status: 'active', price: '123.45', priceMinor: '12345', currency: 'INR', quantity: '10.125', reorderThreshold: '11.000', isLowStock: true };
  const movement = { id: randomUUID(), itemId: item.id, movementType: 'receive', quantity: '1.125', quantityDelta: '1.125', unit: item.unit, reason: 'Reviewed disposable delivery', reference: 'QA-REF', purchaseReceiptLineId: null, reversedByMovementId: null, reversesMovementId: null, actorName: 'QA member', actorMembershipId: randomUUID(), occurredAt: '2026-10-07T05:00:00Z' };
  const entry = { id: randomUUID(), customerId: customer.id, customerName: customer.name, entryType: 'charge', amountMinor: '12345', signedEffectMinor: '12345', currency: 'INR', dueDate: null, description: 'Disposable exact charge', reversesEntryId: null, reversedByEntryId: null, occurredAt: '2026-10-07T05:00:00Z' };
  let failure = false, empty = false;
  const reply = (r: Route, data: unknown) => r.fulfill({ json: data });
  const pageRows = (rows: object[]) => ({ data: empty ? [] : rows, page: 1, limit: 20, total: empty ? 0 : rows.length, totalPages: 1, pagination: { page: 1, limit: 20, total: empty ? 0 : rows.length, totalPages: 1 } });
  await page.route('http://127.0.0.1:5009/api/**', async r => {
    const path = new URL(r.request().url()).pathname.replace('/api', '');
    if (!['/queue', '/appointments', '/attendance', '/customer-dues', '/inventory'].some(prefix => path.startsWith(prefix))) return r.fallback();
    if (failure) return r.fulfill({ status: 503, json: { message: 'Disposable simulated outage' } });
    if (path === '/queue') return reply(r, { ...pageRows([token]), summary: { active: empty ? 0 : 1, waiting: empty ? 0 : 1, serving: 0 } });
    if (path === '/appointments') return reply(r, pageRows([appointment]));
    if (path.startsWith('/appointments/')) return reply(r, { data: appointment });
    if (path === '/attendance') return reply(r, { data: { attendanceDate: '2026-10-07', branch: { name: 'Main', timezone: 'Asia/Kolkata' }, summary: { total: empty ? 0 : 1, present: 0, absent: 0, half_day: 0, unmarked: empty ? 0 : 1 }, roster: empty ? [] : [{ membershipId: randomUUID(), displayName: 'QA branch member with a longer name', role: 'staff', membershipStatus: 'active', attendance: null, correctionCount: 0 }] } });
    if (path === '/customer-dues/customers') return reply(r, pageRows([customer]));
    if (path.endsWith('/balance')) return reply(r, { data: { organizationBalanceMinor: '9223372036854775807', branchBalanceMinor: '12345' } });
    if (path === '/customer-dues/entries') return reply(r, pageRows([entry]));
    if (path === '/inventory/units') return reply(r, { data: [{ code: 'unit', label: 'Unit' }, item.unit] });
    if (path === '/inventory' || path === '/inventory/low-stock') return reply(r, pageRows([item]));
    if (path.endsWith('/movements')) return reply(r, pageRows([movement, { ...movement, id: randomUUID(), reason: 'Disposable Purchasing receipt', purchaseReceiptLineId: randomUUID() }]));
    if (path.startsWith('/inventory/')) return reply(r, { data: item });
    return r.fallback();
  });
  return { customer, service, setFailure: (value: boolean) => { failure = value; }, setEmpty: (value: boolean) => { empty = value; } };
}
export async function fits(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (await page.getByRole('dialog').count()) {
    expect(await page.getByRole('dialog').evaluate(e => { const rect = e.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight + 1; })).toBe(true);
    await page.keyboard.press('Tab'); expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role=dialog]')))).toBe(true);
    for (const button of await page.getByRole('dialog').locator('.dialog-actions button').all()) {
      await expect(button).toBeVisible();
      expect(await button.evaluate(e => { const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return r.top >= 0 && r.bottom <= innerHeight + 1 && Boolean(hit && e.contains(hit)); })).toBe(true);
    }
  }
}
