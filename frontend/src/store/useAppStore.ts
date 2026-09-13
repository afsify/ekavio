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

export interface UserProfile {
  id: string;
  tenantId: string;
  role: string;
  name?: string;
  phone?: string;
  assignments?: UserAssignment[];
  activeModules?: string[];
  tenant?: {
    activeModules?: string[];
    [key: string]: unknown;
  };
}

export type ThemeConfig = ThemePreference;

export interface SessionPayload {
  accessToken: string;
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
  establishSession: (payload: SessionPayload) => void;
  bootstrapSession: () => Promise<void>;
  clearSession: () => void;
  logout: () => Promise<void>;
  setTheme: (mode: 'light' | 'dark', primaryColor?: string) => void;
  setActiveTenant: (tenantId: string) => void;
}

const DEFAULT_THEME: ThemeConfig = {
  mode: 'dark',
  primaryColor: '#4F46E5',
};

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

  establishSession: ({ accessToken, user, theme }) => {
    const activeModules = user.activeModules ?? user.tenant?.activeModules ?? [];
    const enrichedUser = { ...user, activeModules };
    const allowedTenantIds = new Set([
      user.tenantId,
      ...(user.assignments ?? []).map((assignment) => assignment.tenantId),
    ]);
    const currentTenantId = get().activeTenantId;
    const activeTenantId =
      currentTenantId && allowedTenantIds.has(currentTenantId)
        ? currentTenantId
        : user.tenantId;

    set({
      user: enrichedUser,
      token: accessToken,
      ...(theme ? { theme } : {}),
      isAuthenticated: true,
      isBootstrapping: false,
      activeTenantId,
    });

    if (browserStorage && theme) {
      saveThemePreference(browserStorage, theme);
    }

    useSocketStore.getState().connectSocket(accessToken);
  },

  bootstrapSession: async () => {
    if (bootstrapPromise) {
      return bootstrapPromise;
    }

    bootstrapPromise = (async () => {
      try {
        const { restoreSession } = await import('../api/client');
        const payload = await restoreSession();
        get().establishSession(payload);
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

  setActiveTenant: (tenantId) => {
    const user = get().user;
    const allowedTenantIds = new Set([
      ...(user ? [user.tenantId] : []),
      ...(user?.assignments ?? []).map((assignment) => assignment.tenantId),
    ]);

    if (allowedTenantIds.has(tenantId)) {
      set({ activeTenantId: tenantId });
    }
  },

  setTheme: (mode, primaryColor) => {
    const nextTheme: ThemeConfig = {
      mode,
      primaryColor: primaryColor ?? get().theme.primaryColor,
    };
    set({ theme: nextTheme });

    if (browserStorage) {
      saveThemePreference(browserStorage, nextTheme);
    }

    if (get().token) {
      import('../api/client').then(({ client }) => {
        client.put('/auth/theme', nextTheme).catch((error: unknown) => {
          console.warn('Failed to sync theme with backend:', error);
        });
      });
    }
  },
}));

export default useAppStore;
