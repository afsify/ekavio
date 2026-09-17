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
import { PostgresOperationalIdentityBridge } from '../src/persistence/operationalIdentity.js';
import { runtimePersistence } from '../src/persistence/runtimePersistence.js';
import { mongooseAttendanceStorageRepository } from '../src/persistence/mongoAttendance.js';
import { PostgresCommercialRepository } from '../src/postgres/commercialRepository.js';
import { PostgresAccountRepository } from '../src/postgres/accountRepository.js';
import { PostgresAttendanceIdentityResolver } from '../src/postgres/attendanceIdentityResolver.js';
import { PostgresAuthorizationContextRepository } from '../src/postgres/authorizationContextRepository.js';
import { PostgresIdentityRepository } from '../src/postgres/identityRepository.js';
import { PostgresSessionRepository } from '../src/postgres/sessionRepository.js';
import { PostgresStaffRepository } from '../src/postgres/staffRepository.js';
import { createStaff, type StaffRepository } from '../src/services/staffService.js';
import type { AuthorizationContext } from '../src/services/requestContextService.js';
import type { MembershipRole } from '../src/models/Membership.js';

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

test('V2-05D runtime composition selects PostgreSQL identity and commercial authority with Mongo operational storage', () => {
  assert.equal(runtimePersistence.authority, 'postgresql');
  assert.equal(Object.isFrozen(runtimePersistence), true);
  assert.ok(runtimePersistence.accounts instanceof PostgresAccountRepository);
  assert.ok(runtimePersistence.attendanceIdentities instanceof PostgresAttendanceIdentityResolver);
  assert.ok(runtimePersistence.authorization instanceof PostgresAuthorizationContextRepository);
  assert.equal(runtimePersistence.commercialAuthority, 'postgresql');
  assert.equal(runtimePersistence.operationalAuthority, 'mongodb');
  assert.ok(runtimePersistence.commercialRepository instanceof PostgresCommercialRepository);
  assert.ok(runtimePersistence.identities instanceof PostgresIdentityRepository);
  assert.ok(runtimePersistence.operationalIdentity instanceof PostgresOperationalIdentityBridge);
  assert.ok(runtimePersistence.sessions instanceof PostgresSessionRepository);
  assert.ok(runtimePersistence.staff instanceof PostgresStaffRepository);
  assert.equal(runtimePersistence.attendanceStorage, mongooseAttendanceStorageRepository);
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
