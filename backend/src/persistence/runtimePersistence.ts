import { getRuntimeConfig } from '../config/env.js';
import { PostgresAccountRepository } from '../postgres/accountRepository.js';
import { PostgresAttendanceIdentityResolver } from '../postgres/attendanceIdentityResolver.js';
import { PostgresAuthorizationContextRepository } from '../postgres/authorizationContextRepository.js';
import { PostgresDatabase } from '../postgres/database.js';
import { PostgresIdMappingRepository } from '../postgres/idMappingRepository.js';
import { PostgresIdentityRepository } from '../postgres/identityRepository.js';
import { PostgresSessionRepository } from '../postgres/sessionRepository.js';
import { PostgresStaffRepository } from '../postgres/staffRepository.js';
import { entitlementService as mongoEntitlementService } from '../services/entitlementService.js';
import { PostgresMongoCommercialIdentityBridge } from './commercialIdentity.js';
import { mongooseAttendanceStorageRepository } from './mongoAttendance.js';
import { PostgresOperationalIdentityBridge } from './operationalIdentity.js';

// The connection URL is resolved lazily after startup has validated configuration.
export const runtimePostgresDatabase = new PostgresDatabase(
  () => getRuntimeConfig().databaseUrl,
);

const idMappings = new PostgresIdMappingRepository(runtimePostgresDatabase);
const commercial = new PostgresMongoCommercialIdentityBridge(
  idMappings,
  mongoEntitlementService,
);

/**
 * The source-controlled V2-05C authority decision. There is deliberately no
 * environment, request, or tenant-selected fallback to MongoDB identity state.
 */
export const runtimePersistence = Object.freeze({
  authority: 'postgresql' as const,
  accounts: new PostgresAccountRepository(runtimePostgresDatabase),
  attendanceIdentities: new PostgresAttendanceIdentityResolver(runtimePostgresDatabase),
  // Attendance records remain an operational MongoDB domain.
  attendanceStorage: mongooseAttendanceStorageRepository,
  authorization: new PostgresAuthorizationContextRepository(runtimePostgresDatabase),
  commercial,
  idMappings,
  identities: new PostgresIdentityRepository(runtimePostgresDatabase, commercial),
  operationalIdentity: new PostgresOperationalIdentityBridge(idMappings),
  sessions: new PostgresSessionRepository(runtimePostgresDatabase),
  staff: new PostgresStaffRepository(runtimePostgresDatabase),
});
