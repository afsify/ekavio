import { useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { client, restoreSession } from '../api/client';
import { SignOutButton } from '../components/layout/SignOutButton';
import Login from '../pages/Login';
import { LOGOUT_INTENT_KEY, SESSION_REQUEST_TIMEOUT_MS } from '../store/sessionLifecycle';
import { useAppStore, type SessionPayload } from '../store/useAppStore';

const { transport, disconnect, toastError, observeCache, closeMenu } = vi.hoisted(() => ({
  transport: vi.fn<(config: InternalAxiosRequestConfig) => Promise<AxiosResponse>>(),
  disconnect: vi.fn(), toastError: vi.fn(), observeCache: vi.fn<(cache: QueryClient) => void>(), closeMenu: vi.fn(),
}));
vi.mock('axios', async importOriginal => {
  const actual = await importOriginal<typeof import('axios')>();
  return { ...actual, default: { ...actual.default, create: (config: Parameters<typeof actual.default.create>[0]) => {
    const instance = actual.default.create(config);
    instance.defaults.adapter = transport;
    return instance;
  } } };
});

vi.mock('react-dom/client', async importOriginal => {
  const actual = await importOriginal<typeof import('react-dom/client')>();
  return { ...actual, createRoot: vi.fn(actual.createRoot) };
});
vi.mock('../store/useSocketStore', () => ({
  useSocketStore: { getState: () => ({ connectSocket: vi.fn(), disconnectSocket: disconnect }) },
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: toastError } }));
vi.mock('../App.tsx', () => ({ default: WorkspaceProbe }));

function WorkspaceProbe() {
  const cache = useQueryClient();
  const signedIn = useAppStore(state => state.isAuthenticated);
  useEffect(() => { observeCache(cache); }, [cache]);
  return <MemoryRouter initialEntries={['/dashboard']}><Routes>
    <Route path="/dashboard" element={signedIn ? <SignOutButton onClose={closeMenu} /> : <Navigate to="/login" replace />} />
    <Route path="/login" element={<Login />} />
  </Routes></MemoryRouter>;
}

function session(label: string): SessionPayload {
  return {
    accessToken: 'synthetic-access-' + label, organizationId: 'synthetic-org-' + label, branchId: 'synthetic-branch-' + label,
    user: { id: 'synthetic-user-' + label, tenantId: 'synthetic-org-' + label, role: 'admin' },
    platformOperator: true,
    entitlements: { organizationId: 'synthetic-org-' + label, subscription: null, modules: [],
      limits: { staff: null, branches: null, storageMb: null, documents: null, automationRuns: null } },
  };
}

function hold() {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  return { pending, release };
}

it('evicts protected cache at logout, gates auth, deduplicates retries and protects the next session', async () => {
  const accountA = session('a'), accountB = session('b');
  const initial = hold(), retry = hold();
  let logoutCalls = 0;
  transport.mockImplementation(async config => {
    let data: unknown;
    if (config.url === '/auth/logout') {
      expect(config.timeout).toBe(SESSION_REQUEST_TIMEOUT_MS);
      expect(config.withCredentials).toBe(true);
      if (++logoutCalls === 1) {
        await initial.pending;
        throw new axios.AxiosError('Synthetic timeout', 'ECONNABORTED');
      }
      await retry.pending;
    } else if (config.url === '/auth/login') {
      data = accountB;
    } else throw new Error('Unexpected synthetic request');
    return { config, data, status: 200, statusText: '', headers: {} };
  });
  const container = document.createElement('div');
  container.id = 'root';
  document.body.append(container);
  const subscribe = vi.spyOn(useAppStore, 'subscribe');
  const routes = () => transport.mock.calls.map(([config]) => config.url);
  sessionStorage.clear();
  useAppStore.getState().establishSession(accountA);

  try {
    await act(async () => { await import('../main'); });
    const [cache] = observeCache.mock.lastCall!;
    const oldKey = ['workspace', 'synthetic-a'];
    cache.setQueryData(oldKey, 'synthetic protected record');
    expect(cache.getQueryData(oldKey)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /^Sign out$/ }));
    const store = useAppStore.getState();
    expect(store).toMatchObject({
      isAuthenticated: false, user: null, token: null, activeTenantId: null, activeBranchId: null,
      entitlements: null, isPlatformOperator: false, logoutStatus: 'pending',
    });
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(cache.getQueryState(oldKey)).toBeUndefined();
    expect(sessionStorage.getItem(LOGOUT_INTENT_KEY)).toBe('1');
    const first = store.logout();
    expect(store.logout()).toBe(first);
    expect(() => store.beginLogin()).toThrow('Finish signing out');
    await expect(client.post('/auth/login', {})).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    await expect(restoreSession()).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    await waitFor(() => expect(routes()).toEqual(['/auth/logout']));
    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('Signing out…');
    expect(document.activeElement).toBe(status);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign In to Ekavio' }).disabled).toBe(true);

    await act(async () => { initial.release(); await first; });
    expect(screen.getByRole('status').textContent).toContain('Server sign-out couldn’t be confirmed.');
    expect(sessionStorage.getItem(LOGOUT_INTENT_KEY)).toBe('1');
    expect(useAppStore.getState().isAuthenticated).toBe(false);
    expect(() => store.beginLogin()).toThrow('Finish signing out');
    expect(routes()).toEqual(['/auth/logout']);

    fireEvent.click(screen.getByRole('button', { name: 'Retry sign-out' }));
    const retryRequest = store.logout();
    expect(store.logout()).toBe(retryRequest);
    expect(screen.queryByRole('button', { name: 'Retry sign-out' })).toBeNull();
    await waitFor(() => expect(routes()).toEqual(['/auth/logout', '/auth/logout']));
    await act(async () => { retry.release(); await retryRequest; });
    expect(sessionStorage.getItem(LOGOUT_INTENT_KEY)).toBeNull();
    const identifier = screen.getByLabelText('Phone or email');
    expect(document.activeElement).toBe(identifier);
    fireEvent.change(identifier, { target: { value: 'synthetic@example.invalid' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'synthetic-input' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In to Ekavio' }));
    await waitFor(() => expect(useAppStore.getState().user?.id).toBe(accountB.user.id));
    expect(routes()).toEqual(['/auth/logout', '/auth/logout', '/auth/login']);
    const newKey = ['workspace', 'synthetic-b'];
    cache.setQueryData(newKey, 'synthetic next record');
    expect(cache.getQueryData(newKey)).toBe('synthetic next record');
    expect(observeCache.mock.lastCall?.[0]).toBe(cache);
    expect(closeMenu).toHaveBeenCalledTimes(1);
    expect(toastError).not.toHaveBeenCalled();
  } finally {
    await act(async () => {
      initial.release();
      retry.release();
      if (useAppStore.getState().logoutStatus === 'pending') await useAppStore.getState().logout();
      vi.mocked(createRoot).mock.results[0]?.value.unmount();
    });
    // The first subscription belongs to the entry point itself.
    subscribe.mock.results[0]?.value();
    vi.restoreAllMocks();
    useAppStore.setState({ logoutStatus: 'idle', logoutIntentUnavailable: false });
    useAppStore.getState().clearSession();
    sessionStorage.clear();
    container.remove();
  }
});

it('requires verified local cleanup after confirmed logout before allowing a new sign-in', async () => {
  const account = session('after-cleanup');
  transport.mockReset();
  transport.mockImplementation(async config => {
    if (config.url !== '/auth/logout' && config.url !== '/auth/login') throw new Error('Unexpected synthetic request');
    return { config, data: config.url === '/auth/login' ? account : {}, status: 200, statusText: '', headers: {} };
  });
  const routes = () => transport.mock.calls.map(([config]) => config.url);
  const cache = new QueryClient();
  sessionStorage.clear();
  useAppStore.getState().establishSession(session('before-cleanup'));
  const view = render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={['/login']}>
    <Login />
  </MemoryRouter></QueryClientProvider>);
  const removeMarker = vi.spyOn(Storage.prototype, 'removeItem')
    .mockImplementationOnce(() => { throw new Error('Storage denied'); })
    .mockImplementationOnce(() => undefined);
  try {
    await act(async () => { await useAppStore.getState().logout(); });
    expect(useAppStore.getState()).toMatchObject({ logoutStatus: 'cleanup-required', isAuthenticated: false, token: null });
    expect(sessionStorage.getItem(LOGOUT_INTENT_KEY)).toBe('1');
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Server sign-out confirmed.');
    expect(status.textContent).toContain('allow site storage in your browser settings');
    expect(document.activeElement).toBe(status);
    expect(screen.queryByRole('button', { name: /^Retry sign-out$/ })).toBeNull();
    const submit = screen.getByRole<HTMLButtonElement>('button', { name: 'Sign In to Ekavio' });
    expect(submit.disabled).toBe(true);
    const retryCleanup = screen.getByRole('button', { name: 'Retry clearing sign-out marker' });
    expect(() => useAppStore.getState().beginLogin()).toThrow('Finish signing out');
    await expect(client.post('/auth/login', {})).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    await expect(restoreSession()).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    await useAppStore.getState().bootstrapSession();
    await useAppStore.getState().logout();
    expect(routes()).toEqual(['/auth/logout']);

    fireEvent.click(retryCleanup);
    expect(sessionStorage.getItem(LOGOUT_INTENT_KEY)).toBe('1');
    expect(submit.disabled).toBe(true);
    expect(routes()).toEqual(['/auth/logout']);
    fireEvent.click(retryCleanup);
    expect(sessionStorage.getItem(LOGOUT_INTENT_KEY)).toBeNull();
    expect(removeMarker.mock.calls).toEqual([[LOGOUT_INTENT_KEY], [LOGOUT_INTENT_KEY], [LOGOUT_INTENT_KEY]]);
    expect(routes()).toEqual(['/auth/logout']);
    expect(screen.queryByRole('status')).toBeNull();
    expect(submit.disabled).toBe(false);
    const identifier = screen.getByLabelText('Phone or email');
    expect(document.activeElement).toBe(identifier);
    fireEvent.change(identifier, { target: { value: 'synthetic@example.invalid' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'synthetic-input' } });
    fireEvent.click(submit);
    await waitFor(() => expect(useAppStore.getState().user?.id).toBe(account.user.id));
    expect(routes()).toEqual(['/auth/logout', '/auth/login']);
  } finally {
    view.unmount();
    cache.clear();
    removeMarker.mockRestore();
    useAppStore.setState({ logoutStatus: 'idle', logoutIntentUnavailable: false });
    useAppStore.getState().clearSession();
    sessionStorage.clear();
  }
});

it.each([200, 503])('does not apply stale sign-out UI effects when an older logout settles with %i', async status => {
  transport.mockReset();
  toastError.mockClear();
  const pending = hold();
  transport.mockImplementation(async config => {
    await pending.pending;
    const response = { config, data: {}, status, statusText: '', headers: {} };
    if (status !== 200) throw new axios.AxiosError('Synthetic server error', undefined, config, undefined, response);
    return response;
  });
  const cache = new QueryClient();
  const close = vi.fn();
  const key = ['workspace', 'new-epoch'];
  function PathProbe() {
    return <output aria-label="Current path">{useLocation().pathname}</output>;
  }
  useAppStore.getState().establishSession(session('old-epoch'));
  const view = render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={['/dashboard']}>
    <PathProbe /><SignOutButton onClose={close} />
  </MemoryRouter></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: /^Sign out$/ }));
  const logout = useAppStore.getState().logout();
  try {
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    act(() => {
      // Inject a newer epoch to verify that obsolete UI work remains inert.
      useAppStore.setState({ logoutStatus: 'idle' });
      useAppStore.getState().establishSession(session('new-epoch'));
      cache.setQueryData(key, 'synthetic next record');
    });
    await act(async () => { pending.release(); await logout; });
    expect(cache.getQueryData(key)).toBe('synthetic next record');
    expect(screen.getByLabelText('Current path').textContent).toBe('/dashboard');
    expect(close).toHaveBeenCalledTimes(1);
    expect(toastError).not.toHaveBeenCalled();
    expect(useAppStore.getState().user?.id).toBe('synthetic-user-new-epoch');
  } finally {
    pending.release();
    await logout;
    view.unmount();
    cache.clear();
    useAppStore.setState({ logoutStatus: 'idle', logoutIntentUnavailable: false });
    useAppStore.getState().clearSession();
    sessionStorage.clear();
  }
});
