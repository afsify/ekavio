/**
 * Global App Store (`useAppStore`)
 * Zustand store managing User session, Auth Token, and Dynamic Theme state.
 * Fully typed and commented for cross-platform support.
 */
import { create } from 'zustand';

export interface UserProfile {
  id: string;
  tenantId: string;
  role: string;
  name?: string;
  phone?: string;
}

export interface ThemeConfig {
  mode: 'light' | 'dark';
  primaryColor: string;
}

export interface AppState {
  user: UserProfile | null;
  token: string | null;
  theme: ThemeConfig;
  isAuthenticated: boolean;
  login: (
    user: UserProfile,
    token: string,
    theme?: ThemeConfig
  ) => void;
  logout: () => void;
  setTheme: (mode: 'light' | 'dark', primaryColor?: string) => void;
}

const DEFAULT_THEME: ThemeConfig = {
  mode: 'dark',
  primaryColor: '#4F46E5',
};

const getSavedUser = (): UserProfile | null => {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const getSavedTheme = (): ThemeConfig => {
  try {
    const raw = localStorage.getItem('theme');
    return raw ? JSON.parse(raw) : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

const initialToken =
  localStorage.getItem('accessToken') || localStorage.getItem('token') || null;
const initialUser = getSavedUser();
const initialTheme = getSavedTheme();

export const useAppStore = create<AppState>((set, get) => ({
  user: initialUser,
  token: initialToken,
  theme: initialTheme,
  isAuthenticated: Boolean(initialToken && initialUser),

  login: (user: UserProfile, token: string, theme?: ThemeConfig) => {
    const appliedTheme = theme || get().theme || DEFAULT_THEME;

    localStorage.setItem('accessToken', token);
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('theme', JSON.stringify(appliedTheme));

    set({
      user,
      token,
      theme: appliedTheme,
      isAuthenticated: true,
    });
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    set({
      user: null,
      token: null,
      isAuthenticated: false,
    });
  },

  setTheme: (mode: 'light' | 'dark', primaryColor?: string) => {
    const nextTheme: ThemeConfig = {
      mode,
      primaryColor: primaryColor || get().theme.primaryColor || '#4F46E5',
    };
    localStorage.setItem('theme', JSON.stringify(nextTheme));
    set({ theme: nextTheme });
  },
}));

export default useAppStore;
