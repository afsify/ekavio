export interface ThemePreference {
  mode: 'light' | 'dark' | 'system';
  primaryColor: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const UI_PREFERENCES_KEY = 'ekavio-ui-preferences';

const LEGACY_AUTH_KEYS = [
  'accessToken',
  'token',
  'refreshToken',
  'ekavio-app-store',
] as const;

const isThemePreference = (value: unknown): value is ThemePreference => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ThemePreference>;
  return (
    (candidate.mode === 'light' || candidate.mode === 'dark' || candidate.mode === 'system') &&
    typeof candidate.primaryColor === 'string' && /^#[0-9a-f]{6}$/i.test(candidate.primaryColor)
  );
};

const parseTheme = (serialized: string | null): ThemePreference | undefined => {
  if (!serialized) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (isThemePreference(parsed)) {
      return { mode: parsed.mode, primaryColor: parsed.primaryColor };
    }

    if (parsed && typeof parsed === 'object' && 'state' in parsed) {
      const state = (parsed as { state?: { theme?: unknown } }).state;
      return isThemePreference(state?.theme)
        ? { mode: state.theme.mode, primaryColor: state.theme.primaryColor }
        : undefined;
    }
  } catch {
    return undefined;
  }

  return undefined;
};

export const migrateAndClearLegacyAuthStorage = (
  storage: StorageLike,
): ThemePreference | undefined => {
  try {
    const theme =
      parseTheme(storage.getItem(UI_PREFERENCES_KEY)) ??
      parseTheme(storage.getItem('ekavio-app-store'));

    for (const key of LEGACY_AUTH_KEYS) {
      storage.removeItem(key);
    }

    if (theme) {
      storage.setItem(UI_PREFERENCES_KEY, JSON.stringify(theme));
    }

    return theme;
  } catch {
    return undefined;
  }
};

export const saveThemePreference = (
  storage: StorageLike,
  theme: ThemePreference,
): void => {
  try { storage.setItem(UI_PREFERENCES_KEY, JSON.stringify({ mode: theme.mode, primaryColor: theme.primaryColor })); } catch { /* Private browsing may deny storage. */ }
};
