import { create } from 'zustand';
import { useSocketStore } from './useSocketStore';
import {
  migrateAndClearLegacyAuthStorage,
  saveThemePreference,
  type ThemePreference,
} from './sessionPersistence';

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
  activeModules: string[];
}

export interface UserProfile {
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
  activeModules?: string[];
  tenant?: { activeModules?: string[]; [key: string]: unknown };
}

export type ThemeConfig = ThemePreference;

export interface SessionPayload {
  accessToken: string;
  organizationId?: string;
  branchId?: string;
  role?: string;
  permissions?: string[];
  memberships?: MembershipContext[];
  user: UserProfile;
  theme?: ThemeConfig;
}

export interface AppState {
  user: UserProfile | null;
  token: string | null;
  theme: ThemeConfig;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  activeTenantId: string | null;
  activeBranchId: string | null;
  establishSession: (payload: SessionPayload) => void;
  bootstrapSession: () => Promise<void>;
  clearSession: () => void;
  logout: () => Promise<void>;
  setTheme: (mode: 'light' | 'dark', primaryColor?: string) => void;
  setActiveTenant: (tenantId: string) => Promise<boolean>;
  setActiveBranch: (branchId: string) => Promise<boolean>;
}

const DEFAULT_THEME: ThemeConfig = { mode: 'dark', primaryColor: '#4F46E5' };
const browserStorage = typeof window === 'undefined' ? undefined : window.localStorage;
const initialTheme = browserStorage
  ? migrateAndClearLegacyAuthStorage(browserStorage) ?? DEFAULT_THEME
  : DEFAULT_THEME;
let bootstrapPromise: Promise<void> | undefined;

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  token: null,
  theme: initialTheme,
  isAuthenticated: false,
  isBootstrapping: true,
  activeTenantId: null,
  activeBranchId: null,

  establishSession: (payload) => {
    const organizationId =
      payload.organizationId ?? payload.user.organizationId ?? payload.user.tenantId;
    const membership = (payload.memberships ?? payload.user.memberships ?? []).find(
      (candidate) => candidate.organizationId === organizationId,
    );
    const activeBranchId = payload.branchId ?? payload.user.branchId ?? membership?.branchIds[0] ?? null;
    const activeModules = membership?.activeModules ?? payload.user.activeModules ?? [];
    const enrichedUser: UserProfile = {
      ...payload.user,
      tenantId: organizationId,
      organizationId,
      ...(membership ? { membershipId: membership.id } : {}),
      ...(activeBranchId ? { branchId: activeBranchId } : {}),
      role: payload.role ?? membership?.role ?? payload.user.role,
      permissions: payload.permissions ?? payload.user.permissions ?? [],
      memberships: payload.memberships ?? payload.user.memberships ?? [],
      activeModules,
    };

    set({
      user: enrichedUser,
      token: payload.accessToken,
      ...(payload.theme ? { theme: payload.theme } : {}),
      isAuthenticated: true,
      isBootstrapping: false,
      activeTenantId: organizationId,
      activeBranchId,
    });
    if (browserStorage && payload.theme) saveThemePreference(browserStorage, payload.theme);
    useSocketStore
      .getState()
      .connectSocket(payload.accessToken, organizationId, activeBranchId ?? undefined);
  },

  bootstrapSession: async () => {
    if (bootstrapPromise) return bootstrapPromise;
    bootstrapPromise = (async () => {
      try {
        const { restoreSession } = await import('../api/client');
        get().establishSession(await restoreSession());
      } catch {
        get().clearSession();
      } finally {
        set({ isBootstrapping: false });
        bootstrapPromise = undefined;
      }
    })();
    return bootstrapPromise;
  },

  clearSession: () => {
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isBootstrapping: false,
      activeTenantId: null,
      activeBranchId: null,
    });
    useSocketStore.getState().disconnectSocket();
  },

  logout: async () => {
    try {
      const { requestLogout } = await import('../api/client');
      await requestLogout();
    } finally {
      get().clearSession();
    }
  },

  setActiveTenant: async (organizationId) => {
    try {
      const { restoreSession } = await import('../api/client');
      get().establishSession(await restoreSession({ organizationId }));
      return true;
    } catch {
      return false;
    }
  },

  setActiveBranch: async (branchId) => {
    const organizationId = get().activeTenantId;
    if (!organizationId) return false;
    try {
      const { restoreSession } = await import('../api/client');
      get().establishSession(await restoreSession({ organizationId, branchId }));
      return true;
    } catch {
      return false;
    }
  },

  setTheme: (mode, primaryColor) => {
    const nextTheme = { mode, primaryColor: primaryColor ?? get().theme.primaryColor };
    set({ theme: nextTheme });
    if (browserStorage) saveThemePreference(browserStorage, nextTheme);
    if (get().token) {
      void import('../api/client').then(({ client }) => {
        void client.put('/auth/theme', nextTheme).catch(() => undefined);
      });
    }
  },
}));

export default useAppStore;
