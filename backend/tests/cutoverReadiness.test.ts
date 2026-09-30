import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  asLegacyMongoOrganizationId,
  asLegacyMongoUserId,
  generateLegacyMongoId,
  isLegacyMongoId,
  isUuid,
} from '../src/persistence/identifiers.js';
import { mongooseOperationalIdentityBridge } from '../src/persistence/operationalIdentity.js';
import { runtimePersistence } from '../src/persistence/runtimePersistence.js';
import { PostgresCommercialRepository } from '../src/postgres/commercialRepository.js';
import { PostgresAccountRepository } from '../src/postgres/accountRepository.js';
import { PostgresAuthorizationContextRepository } from '../src/postgres/authorizationContextRepository.js';
import { PostgresIdentityRepository } from '../src/postgres/identityRepository.js';
import { PostgresSessionRepository } from '../src/postgres/sessionRepository.js';
import { PostgresStaffRepository } from '../src/postgres/staffRepository.js';
import { createStaff, type StaffRepository } from '../src/services/staffService.js';
import type { AuthorizationContext } from '../src/services/requestContextService.js';
import type { MembershipRole } from '../src/models/Membership.js';
import { PostgresAttendanceRepository } from '../src/domains/attendance/repository.js';
import { PostgresCorporateRepository } from '../src/postgres/corporateRepository.js';

test('canonical UUID and legacy Mongo identifier namespaces validate independently', () => {
  const uuid = randomUUID();
  const legacy = generateLegacyMongoId();
  assert.equal(isUuid(uuid), true);
  assert.equal(isLegacyMongoId(uuid), false);
  assert.equal(isLegacyMongoId(legacy), true);
  assert.equal(isUuid(legacy), false);
  assert.equal(new Set(Array.from({ length: 128 }, generateLegacyMongoId)).size, 128);
  assert.throws(() => asLegacyMongoOrganizationId(uuid));
});

test('runtime composition selects PostgreSQL authority for every active domain', () => {
  assert.equal(runtimePersistence.authority, 'postgresql');
  assert.equal(Object.isFrozen(runtimePersistence), true);
  assert.ok(runtimePersistence.accounts instanceof PostgresAccountRepository);
  assert.equal(runtimePersistence.attendanceAuthority, 'postgresql');
  assert.ok(runtimePersistence.attendance instanceof PostgresAttendanceRepository);
  assert.ok(runtimePersistence.authorization instanceof PostgresAuthorizationContextRepository);
  assert.equal(runtimePersistence.commercialAuthority, 'postgresql');
  assert.equal(runtimePersistence.operationalAuthority, 'postgresql');
  assert.ok(runtimePersistence.commercialRepository instanceof PostgresCommercialRepository);
  assert.ok(runtimePersistence.identities instanceof PostgresIdentityRepository);
  assert.equal(runtimePersistence.corporateAuthority, 'postgresql');
  assert.equal(runtimePersistence.securityAuditAuthority, 'postgresql');
  assert.equal(runtimePersistence.mongoRuntimeAuthority, 'offline-only');
  assert.ok(runtimePersistence.corporate instanceof PostgresCorporateRepository);
  assert.ok(runtimePersistence.sessions instanceof PostgresSessionRepository);
  assert.ok(runtimePersistence.staff instanceof PostgresStaffRepository);
  assert.equal('attendanceStorage' in runtimePersistence, false);
  assert.equal('attendanceIdentities' in runtimePersistence, false);
  assert.equal('mongoIdentities' in runtimePersistence, false);
  assert.equal('operationalIdentity' in runtimePersistence, false);
  assert.equal('select' in runtimePersistence, false);
});

test('Mongo operational bridge accepts only validated legacy IDs', async () => {
  const context: AuthorizationContext = {
    userId: '200000000000000000000001',
    sessionId: 'session',
    organizationId: '100000000000000000000001',
    membershipId: '400000000000000000000001',
    branchId: '300000000000000000000001',
    role: 'staff',
    permissions: [],
    platformOperator: false,
  };
  const result = await mongooseOperationalIdentityBridge.resolve(context);
  assert.equal(result.legacyMongoOrganizationId, asLegacyMongoOrganizationId(context.organizationId));
  assert.equal(result.legacyMongoUserId, asLegacyMongoUserId(context.userId));
  await assert.rejects(
    mongooseOperationalIdentityBridge.resolve({ ...context, organizationId: randomUUID() }),
    /Legacy Mongo organization ID/,
  );
});

test('staff role mutation cannot grant platform operator or owner authority', async () => {
  let createCalls = 0;
  const repository: StaffRepository = {
    list: async () => [],
    create: async () => { createCalls += 1; return 'phone-conflict'; },
    revoke: async () => null,
  };
  const context: AuthorizationContext = {
    userId: '200000000000000000000001',
    sessionId: 'session',
    organizationId: '100000000000000000000001',
    membershipId: '400000000000000000000001',
    role: 'admin',
    permissions: [],
    platformOperator: false,
  };
  await assert.rejects(
    createStaff(repository, context, {
      name: 'Unsafe',
      phone: '1',
      password: 'secret',
      role: 'operator' as MembershipRole,
    }),
    /Unsupported organization role/,
  );
  await assert.rejects(
    createStaff(repository, context, {
      name: 'Unsafe',
      phone: '1',
      password: 'secret',
      role: 'owner',
    }),
    /Unsupported organization role/,
  );
  assert.equal(createCalls, 0);
});
