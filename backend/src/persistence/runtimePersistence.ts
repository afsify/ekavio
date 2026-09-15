import { mongooseAccountRepository } from './mongoAccountRepository.js';
import {
  mongooseAttendanceIdentityResolver,
  mongooseAttendanceStorageRepository,
} from './mongoAttendance.js';
import { mongooseAuthorizationContextRepository } from './mongoAuthorizationContextRepository.js';
import { mongooseIdentityRepository } from './mongoIdentityRepository.js';
import { mongooseOperationalIdentityBridge } from './operationalIdentity.js';
import { mongooseSessionRepository } from './mongoSessionRepository.js';
import { mongooseStaffRepository } from './mongoStaffRepository.js';

/**
 * The only production runtime persistence composition for V2-05B.
 * PostgreSQL counterparts are intentionally absent: activating them requires the
 * reviewed V2-05C cutover sequence, not an environment or request-time toggle.
 */
export const runtimePersistence = Object.freeze({
  authority: 'mongodb' as const,
  accounts: mongooseAccountRepository,
  attendanceIdentities: mongooseAttendanceIdentityResolver,
  attendanceStorage: mongooseAttendanceStorageRepository,
  authorization: mongooseAuthorizationContextRepository,
  identities: mongooseIdentityRepository,
  operationalIdentity: mongooseOperationalIdentityBridge,
  sessions: mongooseSessionRepository,
  staff: mongooseStaffRepository,
});
