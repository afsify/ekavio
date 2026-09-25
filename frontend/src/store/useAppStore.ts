import { create } from 'zustand';
import { useSocketStore } from './useSocketStore';
import {
  migrateAndClearLegacyAuthStorage,
  saveThemePreference,
  type ThemePreference,
} from './sessionPersistence';
import type { EffectiveEntitlements } from '../commercial/catalogue';

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
  activeTenantId: string | null;
  activeBranchId: string | null;
  entitlements: EffectiveEntitlements | null;
  isPlatformOperator: boolean;
  establishSession: (payload: SessionPayload) => void;
  bootstrapSession: () => Promise<void>;
  clearSession: () => void;
  logout: () => Promise<void>;
  setTheme: (mode: 'light' | 'dark', primaryColor?: string) => void;
  setActiveTenant: (tenantId: string) => Promise<boolean>;
  setActiveBranch: (branchId: string) => Promise<boolean>;
  refreshEntitlements: () => Promise<EffectiveEntitlements>;
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
  entitlements: null,
  isPlatformOperator: false,

  establishSession: (payload) => {
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
      user: enrichedUser,
      token: payload.accessToken,
      ...(payload.theme ? { theme: payload.theme } : {}),
      isAuthenticated: true,
      isBootstrapping: false,
      activeTenantId: organizationId,
      activeBranchId,
      entitlements: payload.entitlements,
      isPlatformOperator: payload.platformOperator === true,
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
      entitlements: null,
      isPlatformOperator: false,
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

  refreshEntitlements: async () => {
    const organizationId = get().activeTenantId;
    if (!organizationId) throw new Error('No active organization');
    const { client } = await import('../api/client');
    const response = await client.get<{ data: EffectiveEntitlements }>('/billing/subscription');
    if (response.data.data.organizationId !== organizationId) {
      throw new Error('Commercial response organization mismatch');
    }
    set({ entitlements: response.data.data });
    return response.data.data;
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
