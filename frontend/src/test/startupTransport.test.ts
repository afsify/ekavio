import { beforeEach, expect, it, vi } from 'vitest';
import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { client, restoreSession, isMutationRecoveryError } from '../api/client';
import { useAppStore, type SessionPayload } from '../store/useAppStore';
import { SESSION_REQUEST_TIMEOUT_MS } from '../store/sessionLifecycle';

const transport = vi.hoisted(() => vi.fn<(config: InternalAxiosRequestConfig) => Promise<AxiosResponse>>());
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return { ...actual, default: { ...actual.default, create: (config: Parameters<typeof actual.default.create>[0]) => {
    const instance = actual.default.create(config);
    instance.defaults.adapter = transport;
    return instance;
  } } };
});
vi.mock('../store/useSocketStore', () => ({ useSocketStore: { getState: () => ({ connectSocket: vi.fn(), disconnectSocket: vi.fn() }) } }));
const session = (organizationId = 'synthetic-org'): SessionPayload => ({
  accessToken: `synthetic-${organizationId}`, organizationId, branchId: 'synthetic-branch',
  user: { id: 'synthetic-user', tenantId: organizationId, role: 'admin' }, platformOperator: false,
  permissions: ['customers.read'],
  entitlements: { organizationId, subscription: null, modules: [], limits: { staff: null, branches: null, storageMb: null, documents: null, automationRuns: null } },
});
const reply = (config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse => ({ config, data, status, statusText: '', headers: {} });
const failure = (config: InternalAxiosRequestConfig, status: number) => new axios.AxiosError('Synthetic HTTP failure', undefined, config, undefined, reply(config, {}, status));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
beforeEach(() => { useAppStore.getState().clearSession(); transport.mockReset(); });

it('passes the bounded timeout, credentials, context and cancellation to refresh transport', async () => {
  transport.mockImplementation(async config => reply(config, session()));
  const controller = new AbortController();
  await restoreSession({ organizationId: 'synthetic-org', branchId: 'synthetic-branch' }, controller.signal);
  const config = transport.mock.calls[0][0];
  expect(config.timeout).toBe(SESSION_REQUEST_TIMEOUT_MS);
  expect(config.timeout).toBe(20_000);
  expect(config.withCredentials).toBe(true);
  expect(config.signal).toBe(controller.signal);
  expect(config.headers.get('x-tenant-id')).toBe('synthetic-org');
  expect(config.headers.get('x-branch-id')).toBe('synthetic-branch');
});

it('shares one refresh for concurrent 401s and retries in the renewed scope', async () => {
  useAppStore.getState().establishSession(session());
  const pending = deferred<SessionPayload>();
  let refreshes = 0;
  const attempts = new Map<string, number>();
  transport.mockImplementation(async config => {
    if (config.url === '/auth/refresh') { refreshes++; return reply(config, await pending.promise); }
    const count = (attempts.get(config.url!) ?? 0) + 1; attempts.set(config.url!, count);
    if (count === 1) throw failure(config, 401);
    return reply(config, { ok: true });
  });
  const requests = Promise.all([client.get('/synthetic-one'), client.get('/synthetic-two')]);
  await vi.waitFor(() => { expect(refreshes).toBe(1); expect(attempts.size).toBe(2); });
  pending.resolve(session());
  expect((await requests).map(response => response.data)).toEqual([{ ok: true }, { ok: true }]);
  expect(refreshes).toBe(1);
});

it('does not deliver old successful data after a workspace boundary changes', async () => {
  useAppStore.getState().establishSession(session());
  const pending = deferred<void>();
  transport.mockImplementation(async config => { await pending.promise; return reply(config, { privateRecord: 'synthetic-old-scope' }); });
  const request = client.get('/synthetic-record');
  const rejected = expect(request).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  useAppStore.getState().establishSession(session('new-scope')); pending.resolve();
  await rejected;
});

it('a stale refresh cannot overwrite a newer login', async () => {
  useAppStore.getState().establishSession(session());
  const pending = deferred<SessionPayload>(); let refreshing = false;
  transport.mockImplementation(async config => {
    if (config.url === '/auth/refresh') { refreshing = true; return reply(config, await pending.promise); }
    throw failure(config, 401);
  });
  const request = client.get('/synthetic-record');
  const rejected = expect(request).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  await vi.waitFor(() => expect(refreshing).toBe(true));
  useAppStore.getState().establishSession(session('new-login')); pending.resolve(session());
  await rejected;
  expect(useAppStore.getState().activeTenantId).toBe('new-login');
});

it.each([401, 503])('handles refresh HTTP %i without conflating expiry and availability', async (status) => {
  useAppStore.getState().establishSession(session());
  transport.mockImplementation(async config => { throw failure(config, config.url === '/auth/refresh' ? status : 401); });
  await expect(client.get('/synthetic-record')).rejects.toMatchObject({ response: { status } });
  expect(useAppStore.getState().isAuthenticated).toBe(status !== 401);
  expect(transport).toHaveBeenCalledTimes(2);
});

it('does not refresh or clear newer authority for an old request returning 401', async () => {
  useAppStore.getState().establishSession(session());
  const pending = deferred<void>();
  transport.mockImplementation(async config => { await pending.promise; throw failure(config, 401); });
  const request = client.get('/synthetic-record');
  const rejected = expect(request).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  useAppStore.getState().establishSession(session('new-scope')); pending.resolve(); await rejected;
  expect(transport).toHaveBeenCalledTimes(1);
  expect(useAppStore.getState().activeTenantId).toBe('new-scope');
});

it.each(['post', 'patch', 'put', 'delete'] as const)('never automatically replays a %s mutation after a 401', async method => {
  useAppStore.getState().establishSession(session());
  let writes = 0;
  transport.mockImplementation(async config => {
    if (config.url === '/auth/refresh') return reply(config, session());
    writes++;
    if (writes === 1) throw failure(config, 401);
    return reply(config, { incorrectlyReplayed: true });
  });
  await expect(client.request({ method, url: '/synthetic-mutation' })).rejects.toMatchObject({ response: { status: 401 } });
  expect(writes).toBe(1);
  expect(transport).toHaveBeenCalledTimes(1);
});

it('workspace selection during refresh keeps only the newly authorized scope', async () => {
  useAppStore.getState().establishSession(session());
  const old = deferred<SessionPayload>(); let refreshing = false;
  transport.mockImplementation(async config => {
    if (config.url !== '/auth/refresh') throw failure(config, 401);
    if (config.headers.get('x-tenant-id') === 'new-workspace') return reply(config, session('new-workspace'));
    refreshing = true; return reply(config, await old.promise);
  });
  const pending = client.get('/synthetic-record');
  const rejected = expect(pending).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  await vi.waitFor(() => expect(refreshing).toBe(true));
  expect(await useAppStore.getState().setActiveTenant('new-workspace')).toBe(true);
  old.resolve(session()); await rejected;
  expect(useAppStore.getState().activeTenantId).toBe('new-workspace');
});

it.each(['get', 'head'] as const)('retries an authorized %s once, never loops on another 401', async method => {
  useAppStore.getState().establishSession(session());
  let reads = 0, refreshes = 0;
  transport.mockImplementation(async config => {
    if (config.url === '/auth/refresh') { refreshes++; return reply(config, session()); }
    reads++; throw failure(config, 401);
  });
  await expect(client.request({ method, url: '/synthetic-record' })).rejects.toMatchObject({ response: { status: 401 } });
  expect(reads).toBe(2); expect(refreshes).toBe(1);
});

it.each(['identity', 'organization', 'branch', 'permissions'] as const)('does not replay a read when refreshed %s changes', async change => {
  useAppStore.getState().establishSession(session());
  const next = session();
  if (change === 'identity') next.user.id = 'different-user';
  if (change === 'organization') next.organizationId = 'different-org';
  if (change === 'branch') next.branchId = 'different-branch';
  if (change === 'permissions') next.permissions = [];
  let reads = 0;
  transport.mockImplementation(async config => {
    if (config.url === '/auth/refresh') return reply(config, next);
    if (++reads === 1) throw failure(config, 401);
    return reply(config, { protectedRecord: 'must-not-deliver' });
  });
  await expect(client.get('/synthetic-record')).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  expect(reads).toBe(1);
  if (change === 'permissions') expect(useAppStore.getState().user?.permissions).toEqual([]);
});

it.each(['logout', 'branch'] as const)('%s during shared refresh invalidates both queued reads', async boundary => {
  useAppStore.getState().establishSession(session());
  const pending = deferred<SessionPayload>(); let refreshes = 0, reads = 0;
  transport.mockImplementation(async config => {
    if (config.url === '/auth/logout') return reply(config, {});
    if (config.url === '/auth/refresh') {
      if (config.headers.get('x-branch-id') === 'next-branch') return reply(config, { ...session(), branchId: 'next-branch' });
      refreshes++; return reply(config, await pending.promise);
    }
    reads++; throw failure(config, 401);
  });
  const first = expect(client.get('/synthetic-one')).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  const second = expect(client.get('/synthetic-two')).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  await vi.waitFor(() => { expect(refreshes).toBe(1); expect(reads).toBe(2); });
  if (boundary === 'logout') await useAppStore.getState().logout();
  else expect(await useAppStore.getState().setActiveBranch('next-branch')).toBe(true);
  pending.resolve(session()); await Promise.all([first, second]);
  expect(reads).toBe(2);
  if (boundary === 'logout') expect(useAppStore.getState().isAuthenticated).toBe(false);
  else expect(useAppStore.getState().activeBranchId).toBe('next-branch');
});

it('an aborted caller is not replayed while another caller can finish the shared refresh', async () => {
  useAppStore.getState().establishSession(session());
  const pending = deferred<SessionPayload>(); const controller = new AbortController();
  let refreshes = 0; const reads = new Map<string, number>();
  transport.mockImplementation(async config => {
    if (config.url === '/auth/refresh') { refreshes++; return reply(config, await pending.promise); }
    const count = (reads.get(config.url!) ?? 0) + 1; reads.set(config.url!, count);
    if (count === 1) throw failure(config, 401);
    return reply(config, { ok: true });
  });
  const aborted = expect(client.get('/synthetic-aborted', { signal: controller.signal })).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  const other = client.get('/synthetic-other');
  await vi.waitFor(() => { expect(refreshes).toBe(1); expect(reads.size).toBe(2); });
  controller.abort(); pending.resolve(session());
  await aborted; expect((await other).data).toEqual({ ok: true });
  expect(reads.get('/synthetic-aborted')).toBe(1); expect(reads.get('/synthetic-other')).toBe(2);
});

it('a mutation fails once without joining an in-flight read refresh or clearing its draft', async () => {
  useAppStore.getState().establishSession(session());
  const pending = deferred<SessionPayload>(); let refreshing = false, reads = 0, writes = 0;
  const draft = { amount: 10, version: 3, commandId: 'synthetic-command' };
  let originalError: unknown;
  transport.mockImplementation(async config => {
    if (config.url === '/auth/refresh') { refreshing = true; return reply(config, await pending.promise); }
    if (config.method === 'post') { writes++; originalError = failure(config, 401); throw originalError; }
    if (++reads === 1) throw failure(config, 401);
    return reply(config, { ok: true });
  });
  const read = client.get('/synthetic-record');
  await vi.waitFor(() => expect(refreshing).toBe(true));
  const mutation = client.post('/synthetic-inventory-adjustment', draft);
  const outcome = mutation.then(() => { throw new Error('Mutation unexpectedly succeeded'); }, error => error);
  // Release the refresh even on the old defective implementation; do not leave a hanging test.
  await vi.waitFor(() => expect(writes).toBe(1)); pending.resolve(session());
  expect(await outcome).toBe(originalError);
  expect(originalError).toMatchObject({ recovery: { kind: 'explicit-action-required', outcome: 'unknown', automaticReplay: false } });
  expect(isMutationRecoveryError(originalError)).toBe(true);
  expect(draft).toEqual({ amount: 10, version: 3, commandId: 'synthetic-command' });
  await read; expect(writes).toBe(1);
});

it('HEAD refreshes once and returns only the safe read result', async () => {
  useAppStore.getState().establishSession(session()); let reads = 0;
  transport.mockImplementation(async config => {
    if (config.url === '/auth/refresh') return reply(config, session());
    if (++reads === 1) throw failure(config, 401);
    return reply(config, undefined);
  });
  expect((await client.head('/synthetic-record')).status).toBe(200);
  expect(reads).toBe(2); expect(transport).toHaveBeenCalledTimes(3);
});

it.each(['https://synthetic.invalid/read', '/auth/preferences'])('does not infer retry safety for %s', async url => {
  useAppStore.getState().establishSession(session());
  transport.mockImplementation(async config => { throw failure(config, 401); });
  await expect(client.get(url)).rejects.toMatchObject({ response: { status: 401 } });
  expect(transport).toHaveBeenCalledTimes(1);
});

it('does not refresh for a read with an overridden API origin', async () => {
  useAppStore.getState().establishSession(session());
  transport.mockImplementation(async config => { throw failure(config, 401); });
  await expect(client.get('/synthetic-record', { baseURL: 'https://synthetic.invalid/api' })).rejects.toMatchObject({ response: { status: 401 } });
  expect(transport).toHaveBeenCalledTimes(1);
});

it('a live authority update cannot be overwritten by an older refresh even without a revision change', async () => {
  useAppStore.getState().establishSession(session());
  const pending = deferred<SessionPayload>(); let refreshing = false, reads = 0;
  transport.mockImplementation(async config => {
    if (config.url === '/auth/refresh') { refreshing = true; return reply(config, await pending.promise); }
    if (++reads === 1) throw failure(config, 401);
    return reply(config, { forbidden: true });
  });
  const request = expect(client.get('/synthetic-record')).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  await vi.waitFor(() => expect(refreshing).toBe(true));
  useAppStore.setState({ user: { ...useAppStore.getState().user!, permissions: [] } });
  pending.resolve(session()); await request;
  expect(reads).toBe(1);
  expect(useAppStore.getState().user?.permissions).toEqual([]);
});
