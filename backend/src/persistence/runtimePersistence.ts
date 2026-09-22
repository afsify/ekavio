import { getRuntimeConfig } from '../config/env.js';
import { PostgresAccountRepository } from '../postgres/accountRepository.js';
import { PostgresAttendanceIdentityResolver } from '../postgres/attendanceIdentityResolver.js';
import { PostgresAuthorizationContextRepository } from '../postgres/authorizationContextRepository.js';
import { PostgresCommercialRepository } from '../postgres/commercialRepository.js';
import { PostgresDatabase } from '../postgres/database.js';
import { PostgresIdMappingRepository } from '../postgres/idMappingRepository.js';
import { PostgresIdentityRepository } from '../postgres/identityRepository.js';
import { PostgresSessionRepository } from '../postgres/sessionRepository.js';
import { PostgresStaffRepository } from '../postgres/staffRepository.js';
import { createCommercialAdministrationService } from '../services/commercialAdministrationService.js';
import { createCommercialCatalogueService } from '../services/commercialCatalogueService.js';
import { createEntitlementService } from '../services/entitlementService.js';
import { PostgresMongoLegacyIdentityBridge } from './legacyIdentity.js';
import { mongooseAttendanceStorageRepository } from './mongoAttendance.js';
import { PostgresOperationalIdentityBridge } from './operationalIdentity.js';
import { PostgresCustomerRepository } from '../domains/customers/repository.js';
import { PostgresServiceRepository } from '../domains/services/repository.js';
import { PostgresAppointmentRepository } from '../domains/appointments/repository.js';
import { BranchTimezoneRepository } from '../domains/appointments/timezone.js';
import { PostgresQueueRepository } from '../domains/queue/repository.js';

// The connection URL is resolved lazily after startup has validated configuration.
export const runtimePostgresDatabase = new PostgresDatabase(
  () => getRuntimeConfig().databaseUrl,
);

const idMappings = new PostgresIdMappingRepository(runtimePostgresDatabase);
const commercialRepository = new PostgresCommercialRepository(runtimePostgresDatabase);
const commercialEntitlements = createEntitlementService(commercialRepository);
const commercialCatalogue = createCommercialCatalogueService(commercialRepository);
const commercialAdministration = createCommercialAdministrationService(
  commercialRepository,
  commercialEntitlements,
);
const commercial = Object.freeze({
  getEffective: commercialEntitlements.getEffective,
  getPublicCatalogue: commercialCatalogue.getPublic,
  reconcileCatalogue: commercialCatalogue.reconcile,
  updateSubscription: commercialAdministration.updateSubscription,
  upsertEntitlement: commercialAdministration.upsertEntitlement,
});
const mongoIdentities = new PostgresMongoLegacyIdentityBridge(idMappings);

/**
 * Source-controlled authority decisions. There are deliberately no environment,
 * request, or tenant-selected fallbacks for PostgreSQL identity or commercial state.
 */
export const runtimePersistence = Object.freeze({
  authority: 'postgresql' as const,
  identityAuthority: 'postgresql' as const,
  sessionAuthority: 'postgresql' as const,
  authorizationAuthority: 'postgresql' as const,
  commercialAuthority: 'postgresql' as const,
  operationalAuthority: 'postgresql' as const,
  accounts: new PostgresAccountRepository(runtimePostgresDatabase),
  attendanceIdentities: new PostgresAttendanceIdentityResolver(runtimePostgresDatabase),
  // Attendance records remain an operational MongoDB domain.
  attendanceStorage: mongooseAttendanceStorageRepository,
  authorization: new PostgresAuthorizationContextRepository(runtimePostgresDatabase),
  commercial,
  commercialRepository,
  customers: new PostgresCustomerRepository(runtimePostgresDatabase),
  idMappings,
  identities: new PostgresIdentityRepository(runtimePostgresDatabase, commercial),
  mongoIdentities,
  services: new PostgresServiceRepository(runtimePostgresDatabase),
  appointments: new PostgresAppointmentRepository(runtimePostgresDatabase),
  queue: new PostgresQueueRepository(runtimePostgresDatabase),
  branchTimezones: new BranchTimezoneRepository(runtimePostgresDatabase),
  operationalIdentity: new PostgresOperationalIdentityBridge(idMappings),
  sessions: new PostgresSessionRepository(runtimePostgresDatabase),
  staff: new PostgresStaffRepository(runtimePostgresDatabase),
});
