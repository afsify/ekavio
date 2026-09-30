import { getRuntimeConfig } from '../config/env.js';
import { PostgresAccountRepository } from '../postgres/accountRepository.js';
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
import { PostgresOperationalIdentityBridge } from './operationalIdentity.js';
import { PostgresCustomerRepository } from '../domains/customers/repository.js';
import { PostgresServiceRepository } from '../domains/services/repository.js';
import { PostgresAppointmentRepository } from '../domains/appointments/repository.js';
import { BranchTimezoneRepository } from '../domains/appointments/timezone.js';
import { PostgresQueueRepository } from '../domains/queue/repository.js';
import { PostgresPublicCommercialRepository } from '../postgres/publicCommercialRepository.js';
import { createPublicCommercialService } from '../services/publicCommercialService.js';
import { PostgresManualCommercialRepository } from '../postgres/manualCommercialRepository.js';
import { createManualCommercialService } from '../services/manualCommercialService.js';
import { normalizePhone } from '../domains/customers/normalization.js';
import { AppError } from '../utils/AppError.js';
import { PostgresCommercialRenewalRepository } from '../postgres/commercialRenewalRepository.js';
import { createCommercialRenewalService } from '../services/commercialRenewalService.js';
import { PostgresAttendanceRepository } from '../domains/attendance/repository.js';
import { createAttendanceService } from '../services/attendanceService.js';
import { PostgresCustomerDuesRepository } from '../domains/customerDues/repository.js';
import { createCustomerDuesService } from '../services/customerDuesService.js';
import { PostgresInventoryRepository } from '../domains/inventory/repository.js';
import { createInventoryService } from '../services/inventoryService.js';

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
const publicCommercialRepository = new PostgresPublicCommercialRepository(runtimePostgresDatabase);
const publicCommercial = createPublicCommercialService(publicCommercialRepository);
const manualCommercialRepository = new PostgresManualCommercialRepository(runtimePostgresDatabase);
const manualCommercial = createManualCommercialService(manualCommercialRepository, {
  normalizePhone: (value) => {
    try {
      const normalized = normalizePhone(value, { defaultCallingCode: '91' });
      if (!normalized) throw new Error('Billing phone is required');
      return normalized;
    } catch {
      throw new AppError('Billing phone must be a valid Indian local or E.164 number', 400);
    }
  },
});
const commercialRenewalRepository = new PostgresCommercialRenewalRepository(runtimePostgresDatabase);
const commercialRenewals = createCommercialRenewalService(commercialRenewalRepository);
const branchTimezones = new BranchTimezoneRepository(runtimePostgresDatabase);
const attendanceRepository = new PostgresAttendanceRepository(runtimePostgresDatabase);
const attendanceService = createAttendanceService(attendanceRepository);
const customerRepository = new PostgresCustomerRepository(runtimePostgresDatabase);
const customerDuesRepository = new PostgresCustomerDuesRepository(runtimePostgresDatabase);
const customerDuesService = createCustomerDuesService(customerDuesRepository, customerRepository);
const inventoryRepository = new PostgresInventoryRepository(runtimePostgresDatabase);
const inventoryService = createInventoryService(inventoryRepository);

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
  attendanceAuthority: 'postgresql' as const,
  customerDuesAuthority: 'postgresql' as const,
  inventoryAuthority: 'postgresql' as const,
  accounts: new PostgresAccountRepository(runtimePostgresDatabase),
  attendance: attendanceRepository,
  attendanceService,
  customerDues: customerDuesRepository,
  customerDuesService,
  inventory: inventoryRepository,
  inventoryService,
  authorization: new PostgresAuthorizationContextRepository(runtimePostgresDatabase),
  commercial,
  commercialRepository,
  publicCommercial,
  publicCommercialRepository,
  manualCommercial,
  manualCommercialRepository,
  commercialRenewals,
  commercialRenewalRepository,
  customers: customerRepository,
  idMappings,
  identities: new PostgresIdentityRepository(runtimePostgresDatabase, commercial),
  mongoIdentities,
  services: new PostgresServiceRepository(runtimePostgresDatabase),
  appointments: new PostgresAppointmentRepository(runtimePostgresDatabase),
  queue: new PostgresQueueRepository(runtimePostgresDatabase),
  branchTimezones,
  operationalIdentity: new PostgresOperationalIdentityBridge(idMappings),
  sessions: new PostgresSessionRepository(runtimePostgresDatabase),
  staff: new PostgresStaffRepository(runtimePostgresDatabase),
});
