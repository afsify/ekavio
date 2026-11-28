import { create } from 'zustand';
import { useSocketStore } from './useSocketStore';
import {
  migrateAndClearLegacyAuthStorage,
  saveThemePreference,
  type ThemePreference,
} from './sessionPersistence';
import type { EffectiveEntitlements } from '../commercial/catalogue';
import {
  advanceSessionRevision, classifyStartupError, clearLogoutIntent, LOGOUT_BLOCKED_MESSAGE, persistLogoutIntent, readLogoutIntent,
  sessionErrorStatus, sessionRevision, sessionSignal, type LogoutStatus, type StartupError,
} from './sessionLifecycle';
import { markStartup } from '../utils/startupDiagnostics';

export interface UserAssignment {
  tenantId: string;
  role: string;
  orgName?: string;
}

export interface BranchContext {
  id: string;
  name: string;
  code: string;
}

export interface MembershipContext {
  id: string;
  organizationId: string;
  tenantId: string;
  orgName?: string;
  role: string;
  status: 'active';
  branchIds: string[];
  branches: BranchContext[];
}

export interface UserProfile {
  roleName?: string;
  customRoleId?: string;
  id: string;
  tenantId: string;
  organizationId?: string;
  membershipId?: string;
  branchId?: string;
  role: string;
  permissions?: string[];
  name?: string;
  phone?: string;
  assignments?: UserAssignment[];
  memberships?: MembershipContext[];
}

export type ThemeConfig = ThemePreference;

export interface SessionPayload {
  preferences?: ThemeConfig;
  accessToken: string;
  organizationId?: string;
  branchId?: string;
  role?: string;
  permissions?: string[];
  memberships?: MembershipContext[];
  user: UserProfile;
  entitlements: EffectiveEntitlements;
  platformOperator: boolean;
  theme?: ThemeConfig;
}

export interface AppState {
  user: UserProfile | null;
  token: string | null;
  theme: ThemeConfig;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  startupError: StartupError | null;
  reauthenticationRequired: boolean;
  logoutStatus: LogoutStatus;
  logoutIntentUnavailable: boolean;
  activeTenantId: string | null;
  activeBranchId: string | null;
  entitlements: EffectiveEntitlements | null;
  isPlatformOperator: boolean;
  establishSession: (payload: SessionPayload) => void;
  bootstrapSession: () => Promise<void>;
  beginLogin: () => number;
  clearSession: (reason?: 'refresh-rejected') => void;
  logout: () => Promise<void>;
  retryLogoutCleanup: () => void;
  setTheme: (mode: ThemeConfig['mode'], primaryColor?: string) => void;
  setActiveTenant: (tenantId: string) => Promise<boolean>;
  setActiveBranch: (branchId: string) => Promise<boolean>;
  refreshEntitlements: (signal?:AbortSignal) => Promise<EffectiveEntitlements>;
}

const DEFAULT_THEME: ThemeConfig = { mode: 'light', primaryColor: '#4F46E5' };
const browserStorage = (() => { try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return undefined; } })();
const initialTheme = browserStorage
  ? migrateAndClearLegacyAuthStorage(browserStorage) ?? DEFAULT_THEME
  : DEFAULT_THEME;
let bootstrapRequest: { revision: number; promise: Promise<void> } | undefined;
let logoutRequest: Promise<void> | undefined;
let preferenceSave: Promise<unknown> = Promise.resolve();
let preferenceRevision = 0;

function revokeLocalAuthority(
  set: (state: Partial<AppState>) => void,
  changes: Pick<AppState, 'reauthenticationRequired'> & Partial<Pick<AppState, 'logoutStatus' | 'logoutIntentUnavailable'>>,
): number {
  const revision = advanceSessionRevision();
  set({
    user: null, token: null, isAuthenticated: false, isBootstrapping: false, startupError: null,
    activeTenantId: null, activeBranchId: null, entitlements: null, isPlatformOperator: false,
    ...changes,
  });
  useSocketStore.getState().disconnectSocket();
  return revision;
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  token: null,
  theme: initialTheme,
  isAuthenticated: false,
  isBootstrapping: true,
  startupError: null,
  reauthenticationRequired: false,
  logoutStatus: 'idle',
  logoutIntentUnavailable: false,
  activeTenantId: null,
  activeBranchId: null,
  entitlements: null,
  isPlatformOperator: false,

  establishSession: (payload) => {
    if (get().logoutStatus !== 'idle') return;
    advanceSessionRevision();
    const organizationId =
      payload.organizationId ?? payload.user.organizationId ?? payload.user.tenantId;
    const membership = (payload.memberships ?? payload.user.memberships ?? []).find(
      (candidate) => candidate.organizationId === organizationId,
    );
    const activeBranchId = payload.branchId ?? payload.user.branchId ?? membership?.branchIds[0] ?? null;
    const enrichedUser: UserProfile = {
      ...payload.user,
      tenantId: organizationId,
      organizationId,
      ...(membership ? { membershipId: membership.id } : {}),
      ...(activeBranchId ? { branchId: activeBranchId } : {}),
      role: payload.role ?? membership?.role ?? payload.user.role,
      permissions: payload.permissions ?? payload.user.permissions ?? [],
      memberships: payload.memberships ?? payload.user.memberships ?? [],
    };

    set({
      ...(payload.preferences ? { theme: payload.preferences } : {}),
      user: enrichedUser,
      token: payload.accessToken,
      isAuthenticated: true,
      isBootstrapping: false,
      startupError: null,
      reauthenticationRequired: false,
      activeTenantId: organizationId,
      activeBranchId,
      entitlements: payload.entitlements,
      isPlatformOperator: payload.platformOperator === true,
    });
    markStartup('authorization-ready');
    if (payload.preferences && browserStorage) saveThemePreference(browserStorage, payload.preferences);
    useSocketStore
      .getState()
      .connectSocket(payload.accessToken, organizationId, activeBranchId ?? undefined);
  },

  bootstrapSession: async () => {
    if (get().logoutStatus !== 'idle') return;
    const currentRevision = sessionRevision();
    if (bootstrapRequest?.revision === currentRevision) return bootstrapRequest.promise;
    if (!get().isBootstrapping && !get().startupError) return;
    const intent = readLogoutIntent();
    if (intent !== 'none') {
      revokeLocalAuthority(set, {
        reauthenticationRequired: false, logoutStatus: 'unconfirmed',
        logoutIntentUnavailable: intent === 'unavailable',
      });
      return;
    }
    const revision = advanceSessionRevision();
    const signal = sessionSignal();
    set({ isBootstrapping: true, startupError: null });
    markStartup('bootstrap-start');
    const promise = (async () => {
      try {
        const { restoreSession } = await import('../api/client');
        if (revision !== sessionRevision()) return;
        const payload = await restoreSession({}, signal);
        if (revision === sessionRevision()) get().establishSession(payload);
      } catch (error) {
        if (revision !== sessionRevision()) return;
        if (sessionErrorStatus(error) === 401) get().clearSession('refresh-rejected');
        else set({ isBootstrapping: false, startupError: classifyStartupError(error) });
      } finally {
        if (bootstrapRequest?.revision === revision) bootstrapRequest = undefined;
        markStartup('bootstrap-settled');
      }
    })();
    bootstrapRequest = { revision, promise };
    return promise;
  },

  beginLogin: () => {
    if (get().logoutStatus !== 'idle') throw new Error(LOGOUT_BLOCKED_MESSAGE);
    const revision = advanceSessionRevision();
    set({ isBootstrapping: false, startupError: null });
    return revision;
  },

  clearSession: (reason) => {
    if (get().logoutStatus !== 'idle') return;
    revokeLocalAuthority(set, { reauthenticationRequired: reason === 'refresh-rejected' });
  },

  logout: () => {
    if (logoutRequest) return logoutRequest;
    if (get().logoutStatus === 'cleanup-required') return Promise.resolve();
    const logoutIntentUnavailable = !persistLogoutIntent();
    // Defer transport until the shared operation and revoked state are in place.
    const request = Promise.resolve().then(async () => {
      let confirmed = false;
      try {
        const { requestLogout } = await import('../api/client');
        await requestLogout();
        confirmed = true;
      } catch {
        // Keep the intent after a timeout or failure. Retry is user-initiated.
      }
      if (logoutRequest !== request) return;
      logoutRequest = undefined;
      if (sessionRevision() !== revision) return;
      if (!confirmed) {
        set({ logoutStatus: 'unconfirmed' });
        return;
      }
      set({ logoutStatus: clearLogoutIntent() ? 'idle' : 'cleanup-required', logoutIntentUnavailable: false });
    });
    logoutRequest = request;
    const revision = revokeLocalAuthority(set, { reauthenticationRequired: false, logoutStatus: 'pending', logoutIntentUnavailable });
    return request;
  },

  retryLogoutCleanup: () => {
    if (get().logoutStatus === 'cleanup-required' && clearLogoutIntent()) set({ logoutStatus: 'idle' });
  },

  setActiveTenant: async (organizationId) => {
    if (get().logoutStatus !== 'idle') return false;
    const revision = advanceSessionRevision();
    const signal = sessionSignal();
    try {
      const { restoreSession } = await import('../api/client');
      if (revision !== sessionRevision()) return false;
      const payload = await restoreSession({ organizationId }, signal);
      if (revision !== sessionRevision()) return false;
      get().establishSession(payload);
      return true;
    } catch (error) {
      if (revision === sessionRevision() && sessionErrorStatus(error) === 401) get().clearSession('refresh-rejected');
      return false;
    }
  },

  setActiveBranch: async (branchId) => {
    if (get().logoutStatus !== 'idle') return false;
    const organizationId = get().activeTenantId;
    if (!organizationId) return false;
    const revision = advanceSessionRevision();
    const signal = sessionSignal();
    try {
      const { restoreSession } = await import('../api/client');
      if (revision !== sessionRevision()) return false;
      const payload = await restoreSession({ organizationId, branchId }, signal);
      if (revision !== sessionRevision()) return false;
      get().establishSession(payload);
      return true;
    } catch (error) {
      if (revision === sessionRevision() && sessionErrorStatus(error) === 401) get().clearSession('refresh-rejected');
      return false;
    }
  },

  refreshEntitlements: async (signal) => {
    const organizationId = get().activeTenantId;
    const authority=JSON.stringify([get().user?.id,organizationId,get().activeBranchId,get().user?.permissions,get().isPlatformOperator]);
    if (!organizationId) throw new Error('No active organization');
    const { client } = await import('../api/client');
    const response = await client.get<{ data: EffectiveEntitlements }>('/billing/subscription',{signal});
    if (response.data.data.organizationId !== organizationId) {
      throw new Error('Commercial response organization mismatch');
    }
    if(signal?.aborted||authority!==JSON.stringify([get().user?.id,get().activeTenantId,get().activeBranchId,get().user?.permissions,get().isPlatformOperator]))throw new Error('Commercial workspace changed');
    set({ entitlements: response.data.data });
    return response.data.data;
  },

  setTheme: (mode, primaryColor) => {
    const revision = ++preferenceRevision;
    const nextTheme = { mode, primaryColor: primaryColor && /^#[0-9a-f]{6}$/i.test(primaryColor) ? primaryColor : get().theme.primaryColor };
    set({ theme: nextTheme });
    if (browserStorage) saveThemePreference(browserStorage, nextTheme);
    const userId = get().user?.id;
    if (userId) {
      // Serialize rapid toggles; an older save cannot overwrite a newer choice.
      preferenceSave = preferenceSave.catch(() => undefined).then(async () => {
        if (get().user?.id !== userId) return;
        const { client } = await import('../api/client');
        await client.put('/auth/preferences', nextTheme);
        if (get().user?.id === userId && preferenceRevision === revision) {
          set({ theme: nextTheme });
          if (browserStorage) saveThemePreference(browserStorage, nextTheme);
        }
      }).catch(async () => {
        const { default: toast } = await import('react-hot-toast');
        toast.error('Appearance is saved on this device only. Select it again to retry syncing.');
      });
    }
  },
}));

export default useAppStore;
