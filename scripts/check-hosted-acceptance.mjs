// Read-only hosted acceptance. Requires two distinct disposable staging tenants.
// Never log response bodies, identifiers, credentials, cookies, or tokens.
const origin = 'https://api.ekavio.afsify.com';
const names = [
  'EKAVIO_STAGING_PRIMARY_PHONE',
  'EKAVIO_STAGING_PRIMARY_PASSWORD',
  'EKAVIO_STAGING_FOREIGN_PHONE',
  'EKAVIO_STAGING_FOREIGN_PASSWORD',
];
const missing = names.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Hosted acceptance not run: missing ${missing.join(', ')}. Use STAGING V207C disposable accounts.`);
  process.exitCode = 2;
} else {
  const results = [];
  const record = (name, passed, detail = '') => {
    results.push({ name, status: passed ? 'PASS' : 'FAIL', ...(detail ? { detail } : {}) });
  };
  const request = async (path, { method = 'GET', token, tenant, branch, cookie, body } = {}) => {
    const headers = { origin: 'https://ekavio.afsify.com' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (tenant) headers['x-tenant-id'] = tenant;
    if (branch) headers['x-branch-id'] = branch;
    if (cookie) headers.cookie = cookie;
    if (body) headers['content-type'] = 'application/json';
    const response = await fetch(new URL(path, origin), {
      method, headers, ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error', signal: AbortSignal.timeout(20_000),
    });
    let data;
    if (response.headers.get('content-type')?.includes('application/json')) {
      data = await response.json();
    }
    return { status: response.status, data, setCookie: response.headers.get('set-cookie') ?? '' };
  };
  const cookieFrom = (setCookie) => /^ekavio_refresh=[^;]+/.exec(setCookie)?.[0];
  const login = async (phone, password) => {
    const response = await request('/api/auth/login', { method: 'POST', body: { phone, password } });
    if (response.status !== 200 || !response.data?.accessToken ||
      !response.data?.organizationId || !response.data?.branchId || !cookieFrom(response.setCookie)) {
      throw new Error(`login failed (HTTP ${response.status} or missing session context)`);
    }
    return { ...response.data, cookie: cookieFrom(response.setCookie), cookieAttributes: response.setCookie };
  };
  const scoped = (actor) => ({ token: actor.accessToken, tenant: actor.organizationId, branch: actor.branchId });
  const dataRows = (response) => Array.isArray(response.data?.data) ? response.data.data : [];
  let primary;
  let foreign;
  try {
    primary = await login(process.env.EKAVIO_STAGING_PRIMARY_PHONE, process.env.EKAVIO_STAGING_PRIMARY_PASSWORD);
    foreign = await login(process.env.EKAVIO_STAGING_FOREIGN_PHONE, process.env.EKAVIO_STAGING_FOREIGN_PASSWORD);
    record('two staging logins', primary.organizationId !== foreign.organizationId);
    record('organization and branch membership',
      [primary, foreign].every((actor) => actor.memberships?.some((membership) =>
        membership.organizationId === actor.organizationId && membership.branchIds?.includes(actor.branchId))));
    record('secure refresh cookie', [primary, foreign].every((actor) =>
      /;\s*Secure(?:;|$)/i.test(actor.cookieAttributes) &&
      /;\s*HttpOnly(?:;|$)/i.test(actor.cookieAttributes) &&
      /;\s*SameSite=Lax(?:;|$)/i.test(actor.cookieAttributes) &&
      /;\s*Path=\/api\/auth(?:;|$)/i.test(actor.cookieAttributes)));
    const refreshed = await request('/api/auth/refresh', {
      method: 'POST', cookie: primary.cookie, tenant: primary.organizationId, branch: primary.branchId,
    });
    record('refresh rotation', refreshed.status === 200 && Boolean(refreshed.data?.accessToken) &&
      Boolean(cookieFrom(refreshed.setCookie)) && cookieFrom(refreshed.setCookie) !== primary.cookie);
    if (refreshed.status === 200 && cookieFrom(refreshed.setCookie)) {
      primary.accessToken = refreshed.data.accessToken;
      primary.cookie = cookieFrom(refreshed.setCookie);
    }
    const date = /^\d{4}-\d{2}-\d{2}$/.test(process.env.EKAVIO_STAGING_BUSINESS_DATE ?? '')
      ? process.env.EKAVIO_STAGING_BUSINESS_DATE : new Date().toISOString().slice(0, 10);
    const paths = [
      ['Customer', '/api/customers?limit=1'],
      ['Service', '/api/services?scope=branch&limit=1'],
      ['Appointment', `/api/appointments?date=${date}&limit=1`],
      ['Queue', '/api/queue?limit=1'],
      ['Attendance', `/api/attendance?date=${date}`],
      ['Customer Dues', '/api/customer-dues/entries?limit=1'],
      ['Inventory', '/api/inventory?limit=1'],
      ['Billing/subscription', '/api/billing/subscription'],
    ];
    for (const [label, path] of paths) {
      const result = await request(path, scoped(primary));
      record(label, result.status === 200, `HTTP ${result.status}`);
    }
    const protectedPath = '/api/customers?limit=1';
    const wrongOrg = await request(protectedPath, { ...scoped(primary), tenant: foreign.organizationId });
    record('foreign organization rejected', wrongOrg.status === 403, `HTTP ${wrongOrg.status}`);
    const wrongBranch = await request(protectedPath, { ...scoped(primary), branch: foreign.branchId });
    record('foreign branch rejected', wrongBranch.status === 403, `HTTP ${wrongBranch.status}`);
    for (const [label, listPath, resourcePath] of [
      ['foreign Customer', '/api/customers?limit=1', (id) => `/api/customers/${id}`],
      ['foreign financial resource', '/api/customer-dues/entries?limit=1',
        (_id, row) => `/api/customer-dues/customers/${row.customerId}/balance`],
      ['foreign Inventory resource', '/api/inventory?limit=1', (id) => `/api/inventory/${id}`],
    ]) {
      const source = await request(listPath, scoped(foreign));
      const row = dataRows(source)[0];
      if (source.status !== 200 || !row?.id || (label === 'foreign financial resource' && !row.customerId)) {
        record(`${label} rejected`, false, 'foreign positive fixture unavailable; use STAGING V207C data');
        continue;
      }
      const path = resourcePath(row.id, row);
      const positive = await request(path, scoped(foreign));
      const negative = await request(path, scoped(primary));
      record(`${label} rejected`, positive.status === 200 && [403, 404].includes(negative.status),
        `positive HTTP ${positive.status}; cross-tenant HTTP ${negative.status}`);
    }
    const logout = await request('/api/auth/logout', { method: 'POST', cookie: primary.cookie });
    const revoked = await request('/api/auth/refresh', { method: 'POST', cookie: primary.cookie });
    record('logout and refresh revocation', logout.status === 200 && revoked.status === 401,
      `logout HTTP ${logout.status}; refresh HTTP ${revoked.status}`);
  } catch (error) {
    // Deliberately suppress provider/network error text; it may include request details.
    record('hosted acceptance execution', false, error instanceof Error && error.message.startsWith('login failed')
      ? error.message : 'request failed or timed out');
  } finally {
    if (primary?.cookie) {
      try { await request('/api/auth/logout', { method: 'POST', cookie: primary.cookie }); } catch { /* best effort */ }
    }
    if (foreign?.cookie) {
      try { await request('/api/auth/logout', { method: 'POST', cookie: foreign.cookie }); } catch { /* best effort */ }
    }
  }
  for (const result of results) console.log(JSON.stringify(result));
  if (results.some((result) => result.status !== 'PASS')) process.exitCode = 1;
}
