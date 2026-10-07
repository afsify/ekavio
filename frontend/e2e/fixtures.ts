import { randomUUID } from 'node:crypto';
import { type Page, type Route } from '@playwright/test';
import type { FieldEntity } from '../src/components/forms/formSchema';

// Per-test in-memory HTTP contract fixtures. Never connects to hosted services.
// These prove frontend behavior, not PostgreSQL/session/server-side tenancy.
export async function workspace(page: Page, options: { permissions?: string[]; modules?: string[]; operator?: boolean; authenticated?: boolean; failCustomers?: boolean } = {}) {
  const org = randomUUID(), branch = randomUUID(), user = randomUUID(), membership = randomUUID();
  const permissions = options.permissions ?? ['customers.read','customers.manage','services.read','services.manage','queue.read','queue.manage','staff.read','staff.manage','organization.manage','billing.read','reports.read','ledger.read','inventory.read','attendance.read'];
  const modules = options.modules ?? ['queue','attendance','ledger','inventory'];
  const memberships = [{ id: membership, organizationId: org, tenantId: org, orgName: 'STAGING V208A Workspace', role: 'admin', branchIds: [branch], branches: [{ id: branch, name: 'Main', code: 'main' }] }];
  const session = { accessToken: randomUUID(), organizationId: org, branchId: branch, role: 'admin', permissions, memberships, platformOperator: options.operator ?? false, user: { id: user, tenantId: org, name: 'STAGING V208A Member', role: 'admin' }, entitlements: { organizationId: org, subscription: null, modules: modules.map((key) => ({ key, enabled: true, displayName: key === 'ledger' ? 'Customer Dues' : key, sources: [] })), limits: { staff: null, branches: null, storageMb: null, documents: null, automationRuns: null } } };
  const customers: Array<Record<string, unknown>> = [], services: Array<Record<string, unknown>> = [];
  let authenticated = options.authenticated !== false;
  let failCustomers = options.failCustomers ?? false;
  let savedPricing: Record<string, unknown> | undefined;
  const reply = (route: Route, data: unknown, status = 200) => route.fulfill({ status, json: data });
  await page.route('http://127.0.0.1:5009/**', async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace('/api','');
    if (path.startsWith('/socket.io')) return reply(route, {}, 400);
    if (path==='/organization/context') return reply(route,{data:{permissions,role:'admin'}});
    if (path === '/auth/refresh') return reply(route, authenticated ? session : { message: 'Sign in required' }, authenticated ? 200 : 401);
    if (path === '/auth/logout') { authenticated = false; return reply(route, {}); }
    if (path === '/auth/login') { authenticated = true; return reply(route, session); }
    if(path.startsWith('/forms/')) {
      const entity=path.split('/')[2] as FieldEntity;
      const keys:Record<FieldEntity,string[]>={customer:['name','phone','notes','status'],service:['name','durationMinutes','description','priceMinor','active'],appointment:['customerId','serviceId','localStart','providerMembershipId','notes'],inventory_item:['name','unitCode','sku','barcode','price'],membership:['role','status','branchIds']};
      if(path.endsWith('/schema'))return reply(route,{data:{entity,version:0,definitions:[],sections:[],builtins:(keys[entity]??[]).map(key=>({key,label:key,required:['name','durationMinutes','customerId','serviceId','localStart','unitCode','role','branchIds'].includes(key)}))}});
      return reply(route,{data:{}});
    }
    if (path.startsWith('/customers')) {
      if (failCustomers) return reply(route, { message: 'Fixture temporary failure' }, 503);
      if (request.method() === 'POST') { const row = { id: randomUUID(), status: 'active', ...request.postDataJSON() }; customers.push(row); return reply(route, { data: row }, 201); }
      const id = path.split('/')[2];
      if (id) { const row = customers.find((item) => item.id === id); if (request.method() === 'PATCH' && row) Object.assign(row, request.postDataJSON()); return reply(route, { data: row }); }
      const matching = customers.filter((row) => String(row.name).toLowerCase().includes((url.searchParams.get('search') ?? '').toLowerCase()));
      const pageNumber = Number(url.searchParams.get('page') ?? 1), limit = Number(url.searchParams.get('limit') ?? 20);
      return reply(route, { data: matching.slice((pageNumber - 1) * limit, pageNumber * limit), pagination: { page: pageNumber, limit, total: matching.length, totalPages: Math.ceil(matching.length / limit) } });
    }
    if (path.startsWith('/services')) {
      if (path.endsWith('/providers')) return reply(route, { data: [] });
      if (request.method() === 'POST') { const row = { id: randomUUID(), active: true, ...request.postDataJSON() }; services.push(row); return reply(route, { data: row }, 201); }
      if (request.method() === 'PATCH') { const row = services.find((item) => item.id === path.split('/')[2]); Object.assign(row!, request.postDataJSON()); return reply(route, { data: row }); }
      const matching = services.filter((row) => (url.searchParams.get('scope') !== 'branch' || row.active) && String(row.name).toLowerCase().includes((url.searchParams.get('search') ?? '').toLowerCase()));
      const pageNumber = Number(url.searchParams.get('page') ?? 1), limit = Number(url.searchParams.get('limit') ?? 20);
      return reply(route, { data: matching.slice((pageNumber - 1) * limit, pageNumber * limit), pagination: { page: pageNumber, limit, total: matching.length, totalPages: Math.ceil(matching.length / limit) } });
    }
    if (path === '/queue') return reply(route, { data: [], summary: { active: 0, waiting: 0 }, pagination: { page: 1, totalPages: 0 } });
    if (path === '/appointments') return reply(route, { data: [], pagination: { page: 1, totalPages: 0 } });
    if (path === '/profile' && request.method() === 'PUT') return reply(route, { data: { name: request.postDataJSON().name } });
    if (path === '/billing/operator/public-pricing') return reply(route, { data: [{ offerType: 'plan', key: 'pilot_core', name: 'Pilot Core', status: 'active', available: true, pricing: { monthlyPriceMinor: '12345', yearlyPriceMinor: '100000', published: true, displayOrder: 0 } }] });
    if (path.startsWith('/billing/operator/public-pricing/') && request.method() === 'PUT') { savedPricing = request.postDataJSON(); return reply(route, {}); }
    if (path === '/billing/operator/access-requests') return reply(route, { data: [], pagination: { total: 0 } });
    if (path === '/analytics/dashboard') return reply(route, { data: { widgets:[],layout:{order:[],hidden:[],version:0},timezone:'Asia/Kolkata',businessDate:'2026-10-07' } });
    if (path === '/notifications') return reply(route,{data:{rows:[],unread:0,total:0,page:1,limit:25}});
    return reply(route, { data: [], pagination: { total: 0, totalPages: 0 } });
  });
  // Forbid accidentally sending test data to any hosted API.
  await page.route('https://api.ekavio.afsify.com/**', (route) => route.abort());
  return { org, branch, customers, services, enableCustomers: () => { failCustomers = false; }, pricing: () => savedPricing };
}
