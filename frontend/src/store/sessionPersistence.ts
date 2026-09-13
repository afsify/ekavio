export interface ThemePreference {
  mode: 'light' | 'dark';
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
    (candidate.mode === 'light' || candidate.mode === 'dark') &&
    typeof candidate.primaryColor === 'string'
  );
};

const parseTheme = (serialized: string | null): ThemePreference | undefined => {
  if (!serialized) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (isThemePreference(parsed)) {
      return parsed;
    }

    if (parsed && typeof parsed === 'object' && 'state' in parsed) {
      const state = (parsed as { state?: { theme?: unknown } }).state;
      return isThemePreference(state?.theme) ? state.theme : undefined;
    }
  } catch {
    return undefined;
  }

  return undefined;
};

export const migrateAndClearLegacyAuthStorage = (
  storage: StorageLike,
): ThemePreference | undefined => {
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
};

export const saveThemePreference = (
  storage: StorageLike,
  theme: ThemePreference,
): void => {
  storage.setItem(UI_PREFERENCES_KEY, JSON.stringify(theme));
};
