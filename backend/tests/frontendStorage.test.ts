import assert from 'node:assert/strict';
import test from 'node:test';
import {
  migrateAndClearLegacyAuthStorage,
  saveThemePreference,
  UI_PREFERENCES_KEY,
  type StorageLike,
} from '../../frontend/src/store/sessionPersistence.ts';

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

test('frontend persistence migrates only theme preferences and removes all legacy auth secrets', () => {
  const storage = new MemoryStorage();
  storage.setItem('accessToken', 'legacy-access-secret');
  storage.setItem('token', 'legacy-token-secret');
  storage.setItem('refreshToken', 'legacy-refresh-secret');
  storage.setItem(
    'ekavio-app-store',
    JSON.stringify({
      state: {
        user: { id: 'user-1' },
        token: 'nested-access-secret',
        refreshToken: 'nested-refresh-secret',
        theme: { mode: 'light', primaryColor: '#123456' },
      },
    }),
  );

  const theme = migrateAndClearLegacyAuthStorage(storage);
  saveThemePreference(storage, theme ?? { mode: 'dark', primaryColor: '#4F46E5' });

  assert.deepEqual(theme, { mode: 'light', primaryColor: '#123456' });
  assert.deepEqual([...storage.values.keys()], [UI_PREFERENCES_KEY]);
  const persisted = storage.getItem(UI_PREFERENCES_KEY) ?? '';
  assert.doesNotMatch(
    persisted,
    /legacy-access-secret|legacy-token-secret|legacy-refresh-secret|nested-access-secret|nested-refresh-secret/,
  );
  assert.deepEqual(JSON.parse(persisted), {
    mode: 'light',
    primaryColor: '#123456',
  });
});
