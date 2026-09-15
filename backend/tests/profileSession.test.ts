import assert from 'node:assert/strict';
import test from 'node:test';
import { createPasswordChange } from '../src/services/accountPersistence.js';

test('successful password change saves the new hash and revokes every user session', async () => {
  let storedHash = 'old-hash';
  const revokedUserIds: string[] = [];
  const changePassword = createPasswordChange({
    repository: {
      findPasswordHash: async () => storedHash,
      replacePasswordHashAndRevokeSessions: async (userId, passwordHash) => {
        storedHash = passwordHash;
        revokedUserIds.push(userId);
        return true;
      },
    },
    verifyPassword: async (password, passwordHash) =>
      password === 'old-password' && passwordHash === 'old-hash',
    hashPassword: async (password) => `hashed:${password}`,
  });

  await changePassword('user-1', 'old-password', 'new-password');

  assert.equal(storedHash, 'hashed:new-password');
  assert.deepEqual(revokedUserIds, ['user-1']);
});
