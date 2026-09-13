import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPasswordChangeService,
  type PasswordUser,
} from '../src/services/profileService.js';

test('successful password change saves the new hash and revokes every user session', async () => {
  let saveCount = 0;
  const revokedUserIds: string[] = [];
  const user: PasswordUser = {
    password: 'old-hash',
    async save() {
      saveCount += 1;
    },
  };
  const changePassword = createPasswordChangeService({
    findUserById: async () => user,
    verifyPassword: async (password, passwordHash) =>
      password === 'old-password' && passwordHash === 'old-hash',
    hashPassword: async (password) => `hashed:${password}`,
    revokeSessions: async (userId) => {
      revokedUserIds.push(userId);
    },
  });

  await changePassword('user-1', 'old-password', 'new-password');

  assert.equal(user.password, 'hashed:new-password');
  assert.equal(saveCount, 1);
  assert.deepEqual(revokedUserIds, ['user-1']);
});
