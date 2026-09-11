/**
 * Global App Store (`useAppStore`)
 * Zustand store with official `persist` middleware managing User session, Auth Token, and Dynamic Theme.
 * Fully typed, functional, and commented for cross-platform and React Native portability.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useSocketStore } from './useSocketStore';

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
    [key: string]: any;
  };
}

export interface ThemeConfig {
  mode: 'light' | 'dark';
  primaryColor: string;
}

export interface AppState {
  user: UserProfile | null;
  token: string | null;
  refreshToken: string | null;
  theme: ThemeConfig;
  isAuthenticated: boolean;
  activeTenantId: string | null;
  login: (
    user: UserProfile,
    token: string,
    refreshToken: string,
    theme?: ThemeConfig
  ) => void;
  logout: () => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setTheme: (mode: 'light' | 'dark', primaryColor?: string) => void;
  setActiveTenant: (tenantId: string) => void;
}

const DEFAULT_THEME: ThemeConfig = {
  mode: 'dark',
  primaryColor: '#4F46E5',
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      theme: DEFAULT_THEME,
      isAuthenticated: false,
      activeTenantId: null,

      login: (user: UserProfile, token: string, refreshToken: string, theme?: ThemeConfig) => {
        const appliedTheme = theme || get().theme || DEFAULT_THEME;
        
        // Parse activeModules from tenant if provided by backend
        const activeModules = user.activeModules || user.tenant?.activeModules || [];
        const enrichedUser = { ...user, activeModules };

        if (typeof window !== 'undefined') {
          localStorage.setItem('accessToken', token);
          localStorage.setItem('token', token);
          localStorage.setItem('refreshToken', refreshToken);
        }

        set({
          user: enrichedUser,
          token,
          refreshToken,
          theme: appliedTheme,
          isAuthenticated: true,
          activeTenantId: user.tenantId, // Default to main tenant on login
        });

        useSocketStore.getState().connectSocket(token);
      },

      setTokens: (accessToken: string, refreshToken: string) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('accessToken', accessToken);
          localStorage.setItem('token', accessToken);
          localStorage.setItem('refreshToken', refreshToken);
        }
        set({ token: accessToken, refreshToken });
      },

      logout: () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
        }

        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          activeTenantId: null,
        });

        useSocketStore.getState().disconnectSocket();
      },

      setActiveTenant: (tenantId: string) => {
        set({ activeTenantId: tenantId });
      },

      setTheme: (mode: 'light' | 'dark', primaryColor?: string) => {
        const nextTheme: ThemeConfig = {
          mode,
          primaryColor: primaryColor || get().theme.primaryColor || '#4F46E5',
        };

        set({ theme: nextTheme });

        const { token } = get();
        if (token) {
          import('../api/client').then(({ client }) => {
            client.put('/auth/theme', nextTheme).catch((err) => {
              console.warn('Failed to sync theme with backend:', err);
            });
          });
        }
      },
    }),
    {
      name: 'ekavio-app-store',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isAuthenticated = Boolean(state.token && state.user);
          if (state.token && typeof window !== 'undefined') {
            localStorage.setItem('accessToken', state.token);
            localStorage.setItem('token', state.token);
            if (state.refreshToken) {
              localStorage.setItem('refreshToken', state.refreshToken);
            }
            useSocketStore.getState().connectSocket(state.token);
          }
        }
      },
    }
  )
);

export default useAppStore;
