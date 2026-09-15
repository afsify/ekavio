import bcrypt from 'bcryptjs';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import { createPasswordChange } from './accountPersistence.js';

export const changePasswordService = createPasswordChange({
  repository: runtimePersistence.accounts,
  verifyPassword: bcrypt.compare,
  hashPassword: (password) => bcrypt.hash(password, 10),
});
