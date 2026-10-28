import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore, type SessionPayload } from '../store/useAppStore';
import { sessionRevision, classifyStartupError } from '../store/sessionLifecycle';

const api = vi.hoisted(() => ({ restoreSession: vi.fn(), requestLogout: vi.fn(), connect: vi.fn(), disconnect: vi.fn() }));
vi.mock('../api/client', () => ({ restoreSession: api.restoreSession, requestLogout: api.requestLogout }));
vi.mock('../store/useSocketStore', () => ({ useSocketStore: { getState: () => ({ connectSocket: api.connect, disconnectSocket: api.disconnect }) } }));

const payload = (organizationId = 'synthetic-org'): SessionPayload => ({
  accessToken: 'synthetic-memory-only', organizationId, branchId: `${organizationId}-branch`,
  user: { id: 'synthetic-user', tenantId: organizationId, role: 'admin' },
  permissions: ['customers.read'], platformOperator: false,
  entitlements: { organizationId, subscription: null, modules: [], limits: { staff: null, branches: null, storageMb: null, documents: null, automationRuns: null } },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function started() { await vi.waitFor(() => expect(api.restoreSession).toHaveBeenCalled()); }
beforeEach(() => {
  useAppStore.getState().clearSession();
  useAppStore.setState({ isBootstrapping: true, startupError: null });
  vi.clearAllMocks();
  api.requestLogout.mockResolvedValue(undefined);
  window.localStorage.clear();
});

describe('server-verified startup authority', () => {
  it('deduplicates pending bootstrap and establishes only server-returned authority', async () => {
    const pending = deferred<SessionPayload>(); api.restoreSession.mockReturnValue(pending.promise);
    const first = useAppStore.getState().bootstrapSession();
    const second = useAppStore.getState().bootstrapSession();
    await started();
    expect(api.restoreSession).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().isAuthenticated).toBe(false);
    pending.resolve(payload()); await Promise.all([first, second]);
    expect(useAppStore.getState()).toMatchObject({ isAuthenticated: true, isBootstrapping: false, startupError: null, activeTenantId: 'synthetic-org' });
    expect(api.connect).toHaveBeenCalledTimes(1);
    expect(window.localStorage.length).toBe(0);
    await useAppStore.getState().bootstrapSession();
    expect(api.restoreSession).toHaveBeenCalledTimes(1);
  });
  it('treats a genuine 401 as an anonymous session', async () => {
    api.restoreSession.mockRejectedValue({ response: { status: 401 } });
    await useAppStore.getState().bootstrapSession();
    expect(useAppStore.getState()).toMatchObject({ isAuthenticated: false, isBootstrapping: false, startupError: null, token: null });
  });
  it.each([new Error('offline'), { code: 'ECONNABORTED' }, { response: { status: 503 } }])('offers recovery instead of claiming session expiry for %j', async (error) => {
    api.restoreSession.mockRejectedValue(error);
    await useAppStore.getState().bootstrapSession();
    expect(useAppStore.getState()).toMatchObject({ isAuthenticated: false, isBootstrapping: false, startupError: 'unavailable' });
    expect(api.disconnect).not.toHaveBeenCalled();
  });
  it('does not misclassify a context-forbidden 403 as a session 401', () => {
    expect(classifyStartupError({ response: { status: 403 } })).toBe('recoverable');
  });
  it('supports one explicit retry after unavailable startup', async () => {
    api.restoreSession.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(payload());
    await useAppStore.getState().bootstrapSession();
    await useAppStore.getState().bootstrapSession();
    expect(api.restoreSession).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().isAuthenticated).toBe(true);
  });
  it('aborts bootstrap and ignores a late success after explicit logout', async () => {
    const pending = deferred<SessionPayload>(); api.restoreSession.mockReturnValue(pending.promise);
    const bootstrap = useAppStore.getState().bootstrapSession(); await started();
    const signal = api.restoreSession.mock.calls[0][1] as AbortSignal;
    await useAppStore.getState().logout();
    expect(signal.aborted).toBe(true);
    pending.resolve(payload()); await bootstrap;
    expect(useAppStore.getState().isAuthenticated).toBe(false);
    expect(api.connect).not.toHaveBeenCalled();
  });
  it('clears local authority even while the logout request is pending', async () => {
    useAppStore.getState().establishSession(payload());
    const pending = deferred<void>(); api.requestLogout.mockReturnValue(pending.promise);
    const logout = useAppStore.getState().logout();
    expect(useAppStore.getState().token).toBeNull();
    pending.resolve(); await logout;
  });
  it.each(['success', 'failure'])('ignores stale bootstrap %s after newer login', async (outcome) => {
    const pending = deferred<SessionPayload>(); api.restoreSession.mockReturnValue(pending.promise);
    const bootstrap = useAppStore.getState().bootstrapSession(); await started();
    const revision = useAppStore.getState().beginLogin();
    expect(sessionRevision()).toBe(revision);
    useAppStore.getState().establishSession(payload('new-login-org'));
    if (outcome === 'success') pending.resolve(payload('old-org'));
    else pending.reject({ response: { status: 401 } });
    await bootstrap;
    expect(useAppStore.getState().activeTenantId).toBe('new-login-org');
    expect(useAppStore.getState().isAuthenticated).toBe(true);
  });
  it('does not let an older organization selection overwrite a newer one', async () => {
    useAppStore.getState().establishSession(payload());
    const older = deferred<SessionPayload>(); const newer = deferred<SessionPayload>();
    api.restoreSession.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const first = useAppStore.getState().setActiveTenant('older'); await started();
    const second = useAppStore.getState().setActiveTenant('newer');
    await vi.waitFor(() => expect(api.restoreSession).toHaveBeenCalledTimes(2));
    newer.resolve(payload('newer')); expect(await second).toBe(true);
    older.resolve(payload('older')); expect(await first).toBe(false);
    expect(useAppStore.getState().activeTenantId).toBe('newer');
  });
  it('ignores a branch selection response after logout', async () => {
    useAppStore.getState().establishSession(payload());
    const pending = deferred<SessionPayload>(); api.restoreSession.mockReturnValue(pending.promise);
    const switchBranch = useAppStore.getState().setActiveBranch('other'); await started();
    await useAppStore.getState().logout(); pending.resolve(payload());
    expect(await switchBranch).toBe(false);
    expect(useAppStore.getState().activeBranchId).toBeNull();
  });
});
