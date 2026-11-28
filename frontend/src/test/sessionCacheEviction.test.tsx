import { useEffect } from 'react';
import { act } from '@testing-library/react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { client } from '../api/client';
import { useOrganizationData } from '../hooks/useOrganizationData';
import { useAppStore, type SessionPayload } from '../store/useAppStore';

const transport = vi.hoisted(() => vi.fn<(config: InternalAxiosRequestConfig) => Promise<AxiosResponse>>());
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return { ...actual, default: { ...actual.default, create: (config: Parameters<typeof actual.default.create>[0]) => {
    const instance = actual.default.create(config);
    instance.defaults.adapter = transport;
    return instance;
  } } };
});
vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom/client')>();
  return { ...actual, createRoot: vi.fn(actual.createRoot) };
});
vi.mock('../store/useSocketStore', () => ({
  useSocketStore: { getState: () => ({ connectSocket: vi.fn(), disconnectSocket: vi.fn() }) },
}));
vi.mock('../App.tsx', () => ({ default: WorkspaceProbe }));

const observeWorkspace = vi.fn<(cache: QueryClient, fetchRoles: () => Promise<unknown>) => void>();
function WorkspaceProbe() {
  const cache = useQueryClient();
  useOrganizationData('/organization');
  const { refetch } = useOrganizationData('/roles', false);
  useEffect(() => { observeWorkspace(cache, refetch); }, [cache, refetch]);
  return null;
}

const session: SessionPayload = {
  accessToken: 'synthetic-memory-only',
  organizationId: 'synthetic-org',
  branchId: 'synthetic-branch',
  user: { id: 'synthetic-user', tenantId: 'synthetic-org', role: 'admin' },
  permissions: ['organization.read', 'roles.read'],
  platformOperator: false,
  entitlements: {
    organizationId: 'synthetic-org', subscription: null, modules: [],
    limits: { staff: null, branches: null, storageMb: null, documents: null, automationRuns: null },
  },
};
const scope = ['organization-admin', session.user.id, session.organizationId, session.branchId,
  'organization.read,roles.read', JSON.stringify(session.entitlements), false] as const;
const profileKey = [...scope, '/organization'];
const rolesKey = [...scope, '/roles'];
const profile = { name: 'Synthetic cached organization' };

const reply = (config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse =>
  ({ config, data, status, statusText: '', headers: {} });
const unauthorized = (config: InternalAxiosRequestConfig) =>
  new axios.AxiosError('Synthetic HTTP 401', undefined, config, undefined, reply(config, {}, 401));

function signal() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

it('evicts populated workspace data on refresh rejection and discards a late protected response', async () => {
  const container = document.createElement('div');
  container.id = 'root';
  document.body.append(container);
  const subscribe = vi.spyOn(useAppStore, 'subscribe');
  const get = vi.spyOn(client, 'get');
  const held = signal();
  const requests: string[] = [];
  let pendingQuery: Promise<unknown> | undefined;
  let pendingRead: Promise<unknown> | undefined;
  let cache: QueryClient | undefined;

  transport.mockImplementation(async config => {
    requests.push(`${config.method} ${config.url}`);
    if (config.url === '/organization' && config.method === 'get') return reply(config, { data: profile });
    if (config.url === '/roles') {
      await held.promise;
      return reply(config, { data: { custom: [{ name: 'Synthetic delayed role' }] } });
    }
    if (['/organization', '/audit/actors', '/auth/refresh'].includes(config.url ?? '')) throw unauthorized(config);
    throw new Error('Unexpected synthetic request');
  });

  try {
    useAppStore.getState().establishSession(session);
    await act(async () => { await import('../main'); });
    const [observedCache, fetchRoles] = observeWorkspace.mock.lastCall!;
    cache = observedCache;
    await act(async () => {
      await vi.waitFor(() => expect(observedCache.getQueryData(profileKey)).toEqual(profile));
    });

    await act(async () => {
      pendingQuery = fetchRoles();
      await vi.waitFor(() => expect(requests).toContain('get /roles'));
    });
    const roleCall = get.mock.calls.findIndex(([path]) => path === '/roles');
    expect(roleCall).toBeGreaterThanOrEqual(0);
    pendingRead = Promise.resolve(get.mock.results[roleCall].value).catch(error => error);
    expect(observedCache.getQueryState(rolesKey)?.fetchStatus).toBe('fetching');
    expect(observedCache.getQueryData(rolesKey)).toBeUndefined();
    expect(observedCache.getQueryData(profileKey)).toEqual(profile);
    expect(useAppStore.getState()).toMatchObject({
      isAuthenticated: true, activeTenantId: session.organizationId, activeBranchId: session.branchId,
    });

    await expect(client.put('/organization', { name: 'Synthetic interrupted write' })).rejects.toMatchObject({
      recovery: { outcome: 'unknown', automaticReplay: false },
    });
    expect(requests.filter(request => request === 'put /organization' || request === 'post /auth/refresh'))
      .toEqual(['put /organization']);

    await act(async () => {
      await expect(client.get('/audit/actors')).rejects.toMatchObject({ response: { status: 401 } });
    });
    const rejectedRead = transport.mock.calls.find(([config]) => config.url === '/audit/actors')?.[0];
    expect(rejectedRead?.headers.has('Authorization')).toBe(true);
    expect(requests.slice(-2)).toEqual(['get /audit/actors', 'post /auth/refresh']);
    expect(useAppStore.getState()).toMatchObject({
      isAuthenticated: false, reauthenticationRequired: true, user: null, token: null,
      activeTenantId: null, activeBranchId: null, entitlements: null,
    });
    expect(observedCache.getQueryData(profileKey) === undefined, 'previously populated workspace data was evicted').toBe(true);
    expect(observedCache.getQueryState(profileKey)).toBeUndefined();

    await act(async () => {
      held.release();
      await expect(pendingRead).resolves.toMatchObject({ code: 'ERR_CANCELED' });
      await pendingQuery;
    });
    expect(observedCache.getQueryState(profileKey)).toBeUndefined();
    expect(observedCache.getQueryState(rolesKey)).toBeUndefined();
    expect(requests.filter(request => request === 'put /organization')).toHaveLength(1);
    expect(vi.mocked(createRoot)).toHaveBeenCalledTimes(1);
    expect(observeWorkspace.mock.calls.map(([instance]) => instance).every(instance => instance === observedCache)).toBe(true);
  } finally {
    await act(async () => {
      held.release();
      await Promise.allSettled([pendingQuery, pendingRead]);
    });
    const root = vi.mocked(createRoot).mock.results[0]?.value;
    if (root) act(() => root.unmount());
    subscribe.mock.results[0]?.value();
    vi.restoreAllMocks();
    cache?.clear();
    useAppStore.getState().clearSession();
    transport.mockReset();
    container.remove();
  }
});
