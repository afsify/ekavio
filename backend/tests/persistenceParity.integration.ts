import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import mongoose from 'mongoose';
import { emptyEffectiveLimits } from '../src/commercial/catalogue.js';
import { Branch } from '../src/models/Branch.js';
import { Membership } from '../src/models/Membership.js';
import { Organization } from '../src/models/Organization.js';
import { Session } from '../src/models/Session.js';
import { User } from '../src/models/User.js';
import { mongooseAccountRepository } from '../src/persistence/mongoAccountRepository.js';
import { mongooseAttendanceIdentityResolver } from '../src/persistence/mongoAttendance.js';
import { mongooseAuthorizationContextRepository } from '../src/persistence/mongoAuthorizationContextRepository.js';
import { mongooseIdentityRepository } from '../src/persistence/mongoIdentityRepository.js';
import { mongooseOperationalIdentityBridge, PostgresOperationalIdentityBridge } from '../src/persistence/operationalIdentity.js';
import { mongooseSessionRepository } from '../src/persistence/mongoSessionRepository.js';
import { mongooseStaffRepository } from '../src/persistence/mongoStaffRepository.js';
import {
  asLegacyMongoBranchId,
  asLegacyMongoMembershipId,
  asLegacyMongoOrganizationId,
  asLegacyMongoUserId,
} from '../src/persistence/identifiers.js';
import { PostgresAccountRepository } from '../src/postgres/accountRepository.js';
import { PostgresAttendanceIdentityResolver } from '../src/postgres/attendanceIdentityResolver.js';
import { PostgresAuthorizationContextRepository } from '../src/postgres/authorizationContextRepository.js';
import { PostgresDatabase } from '../src/postgres/database.js';
import { PostgresIdMappingRepository } from '../src/postgres/idMappingRepository.js';
import { PostgresIdentityRepository } from '../src/postgres/identityRepository.js';
import { migrate } from '../src/postgres/migrations.js';
import { PostgresSessionRepository } from '../src/postgres/sessionRepository.js';
import { PostgresSharedCoreRepository } from '../src/postgres/sharedCoreRepository.js';
import { PostgresStaffRepository } from '../src/postgres/staffRepository.js';
import type { SharedCoreSnapshot } from '../src/postgres/sharedCoreTypes.js';

const at = new Date('2026-02-03T04:05:06.000Z');
const later = new Date('2027-02-03T04:05:06.000Z');
const ids = {
  organizationA: '110000000000000000000001',
  organizationB: '110000000000000000000002',
  userA: '220000000000000000000001',
  userB: '220000000000000000000002',
  branchA: '330000000000000000000001',
  branchB: '330000000000000000000002',
  membershipA: '440000000000000000000001',
  membershipB: '440000000000000000000002',
} as const;
const passwordHash = '$2b$12$parity-password-hash-not-a-real-credential';

const snapshot = (): SharedCoreSnapshot => ({
  users: [
    { legacyMongoId: ids.userA, legacyTenantMongoId: ids.organizationA, name: 'Parity Owner',
      phone: 'parity-1001', passwordHash, platformRole: 'operator', createdAt: at, updatedAt: at },
    { legacyMongoId: ids.userB, legacyTenantMongoId: ids.organizationB, name: 'Parity Staff',
      phone: 'parity-1002', passwordHash, platformRole: null, createdAt: at, updatedAt: at },
  ],
  parentOrganizations: [],
  organizations: [
    { legacyMongoId: ids.organizationA, parentOrganizationLegacyMongoId: null, name: 'Parity Alpha',
      type: 'shop', themeMode: 'dark', themePrimaryColor: '#123456', createdAt: at, updatedAt: at },
    { legacyMongoId: ids.organizationB, parentOrganizationLegacyMongoId: null, name: 'Parity Beta',
      type: 'clinic', themeMode: 'light', themePrimaryColor: '#654321', createdAt: at, updatedAt: at },
  ],
  branches: [
    { legacyMongoId: ids.branchA, organizationLegacyMongoId: ids.organizationA, name: 'Alpha Main',
      code: 'main', status: 'active', createdAt: at, updatedAt: at },
    { legacyMongoId: ids.branchB, organizationLegacyMongoId: ids.organizationB, name: 'Beta Main',
      code: 'main', status: 'active', createdAt: at, updatedAt: at },
  ],
  memberships: [
    { legacyMongoId: ids.membershipA, userLegacyMongoId: ids.userA,
      organizationLegacyMongoId: ids.organizationA, role: 'owner', status: 'active',
      branchLegacyMongoIds: [ids.branchA], createdAt: at, updatedAt: at },
    { legacyMongoId: ids.membershipB, userLegacyMongoId: ids.userB,
      organizationLegacyMongoId: ids.organizationB, role: 'staff', status: 'active',
      branchLegacyMongoIds: [ids.branchB], createdAt: at, updatedAt: at },
  ],
  moduleDefinitions: [],
  plans: [],
  addOns: [],
  subscriptions: [],
  entitlements: [],
});

const normalizeContext = (context: Awaited<ReturnType<typeof mongooseIdentityRepository.buildContext>>) => ({
  role: context.role,
  permissions: context.permissions,
  platformOperator: context.platformOperator,
  user: { name: context.user.name, phone: context.user.phone, role: context.user.role },
  memberships: context.memberships.map((membership) => ({
    orgName: membership.orgName,
    role: membership.role,
    status: membership.status,
    branches: membership.branches.map(({ name, code }) => ({ name, code })),
  })),
  entitlements: {
    subscription: context.entitlements.subscription,
    modules: context.entitlements.modules,
    limits: context.entitlements.limits,
  },
  theme: context.theme,
});

test('Mongo and PostgreSQL shared-core adapters return equivalent domain results', async (context) => {
  const postgresAdminUrl = process.env.POSTGRES_TEST_URL;
  const mongoAdminUrl = process.env.MONGO_TEST_URL;
  assert.ok(postgresAdminUrl, 'POSTGRES_TEST_URL is required');
  assert.ok(mongoAdminUrl, 'MONGO_TEST_URL is required');
  const parsedPostgres = new URL(postgresAdminUrl);
  const parsedMongo = new URL(mongoAdminUrl);
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(parsedPostgres.hostname));
  assert.ok(['localhost', '127.0.0.1', 'mongo'].includes(parsedMongo.hostname));
  const suffix = randomUUID().replaceAll('-', '');
  const postgresDatabaseName = `ekavio_v205b_parity_${suffix}`;
  const mongoDatabaseName = `ekavio_v205b_parity_${suffix}`;
  const postgresAdmin = new PostgresDatabase(postgresAdminUrl);
  await postgresAdmin.query(`CREATE DATABASE "${postgresDatabaseName}"`);
  const postgresUrl = new URL(postgresAdminUrl);
  postgresUrl.pathname = `/${postgresDatabaseName}`;
  const database = new PostgresDatabase(postgresUrl.toString());
  const mongoUrl = new URL(mongoAdminUrl);
  mongoUrl.pathname = `/${mongoDatabaseName}`;
  await mongoose.connect(mongoUrl.toString(), { serverSelectionTimeoutMS: 10_000 });

  context.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await database.close();
    await postgresAdmin.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
      [postgresDatabaseName],
    );
    await postgresAdmin.query(`DROP DATABASE "${postgresDatabaseName}"`);
    await postgresAdmin.close();
  });

  await migrate(database);
  await new PostgresSharedCoreRepository(database).apply(snapshot());
  const [organizationA, organizationB] = await Organization.create([
    { _id: ids.organizationA, name: 'Parity Alpha', type: 'shop',
      theme: { mode: 'dark', primaryColor: '#123456' }, createdAt: at, updatedAt: at },
    { _id: ids.organizationB, name: 'Parity Beta', type: 'clinic',
      theme: { mode: 'light', primaryColor: '#654321' }, createdAt: at, updatedAt: at },
  ]);
  const [userA, userB] = await User.create([
    { _id: ids.userA, tenantId: organizationA._id, name: 'Parity Owner', phone: 'parity-1001',
      password: passwordHash, role: 'admin', platformRole: 'operator', createdAt: at, updatedAt: at },
    { _id: ids.userB, tenantId: organizationB._id, name: 'Parity Staff', phone: 'parity-1002',
      password: passwordHash, role: 'staff', createdAt: at, updatedAt: at },
  ]);
  const [branchA, branchB] = await Branch.create([
    { _id: ids.branchA, organizationId: organizationA._id, name: 'Alpha Main', code: 'main',
      status: 'active', createdAt: at, updatedAt: at },
    { _id: ids.branchB, organizationId: organizationB._id, name: 'Beta Main', code: 'main',
      status: 'active', createdAt: at, updatedAt: at },
  ]);
  await Membership.create([
    { _id: ids.membershipA, userId: userA._id, organizationId: organizationA._id, role: 'owner',
      status: 'active', branchIds: [branchA._id], createdAt: at, updatedAt: at },
    { _id: ids.membershipB, userId: userB._id, organizationId: organizationB._id, role: 'staff',
      status: 'active', branchIds: [branchB._id], createdAt: at, updatedAt: at },
  ]);

  const mappings = new PostgresIdMappingRepository(database);
  const postgresIds = {
    userA: await mappings.userToPostgres(asLegacyMongoUserId(ids.userA)),
    userB: await mappings.userToPostgres(asLegacyMongoUserId(ids.userB)),
    organizationA: await mappings.organizationToPostgres(asLegacyMongoOrganizationId(ids.organizationA)),
    organizationB: await mappings.organizationToPostgres(asLegacyMongoOrganizationId(ids.organizationB)),
    branchA: await mappings.branchToPostgres(asLegacyMongoBranchId(ids.branchA)),
  };

  await context.test('identity lookup, context, membership, branch, operator, and theme parity', async () => {
    const mongoIdentity = (await mongooseIdentityRepository.findByPhone('parity-1001'))[0];
    assert.ok(mongoIdentity);
    const mongoContext = await mongooseIdentityRepository.buildContext(mongoIdentity);
    const postgresIdentityRepository = new PostgresIdentityRepository(database, {
      getEffective: async (organizationId) => ({ ...mongoContext.entitlements, organizationId }),
    });
    const postgresIdentity = (await postgresIdentityRepository.findByPhone('parity-1001'))[0];
    assert.ok(postgresIdentity);
    const postgresContext = await postgresIdentityRepository.buildContext(postgresIdentity);
    assert.deepEqual(normalizeContext(postgresContext), normalizeContext(mongoContext));

    const postgresAuthorization = new PostgresAuthorizationContextRepository(database);
    const [mongoMembership, postgresMembership] = await Promise.all([
      mongooseAuthorizationContextRepository.findActiveMembership(ids.userA, ids.organizationA),
      postgresAuthorization.findActiveMembership(postgresIds.userA, postgresIds.organizationA),
    ]);
    assert.equal(mongoMembership?.role, postgresMembership?.role);
    assert.equal(mongoMembership?.branchIds.length, postgresMembership?.branchIds.length);
    assert.equal(
      await mongooseAuthorizationContextRepository.isPlatformOperator(ids.userA),
      await postgresAuthorization.isPlatformOperator(postgresIds.userA),
    );
    assert.equal(
      await postgresAuthorization.findActiveMembership(postgresIds.userA, postgresIds.organizationB),
      null,
    );
  });

  await context.test('duplicate-phone ambiguity parity', async () => {
    const mongoDuplicate = await User.create({
      tenantId: organizationB._id,
      name: 'Duplicate',
      phone: 'parity-1001',
      password: passwordHash,
      role: 'staff',
    });
    await database.query(
      `INSERT INTO users (legacy_mongo_id, name, phone, password_hash, created_at, updated_at)
       VALUES ($1, 'Duplicate', 'parity-1001', $2, $3, $3)`,
      [String(mongoDuplicate._id), passwordHash, at],
    );
    const postgresIdentities = new PostgresIdentityRepository(database, {
      getEffective: async (organizationId) => ({
        organizationId,
        subscription: null,
        modules: [],
        limits: emptyEffectiveLimits(),
      }),
    });
    assert.equal((await mongooseIdentityRepository.findByPhone('parity-1001')).length, 2);
    assert.equal((await postgresIdentities.findByPhone('parity-1001')).length, 2);
    await User.deleteOne({ _id: mongoDuplicate._id });
    await database.query('DELETE FROM users WHERE legacy_mongo_id = $1', [String(mongoDuplicate._id)]);
  });

  await context.test('session and authorization-active checks have parity', async () => {
    const sessionId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const record = {
      sessionId,
      refreshTokenHash: 'a'.repeat(64),
      expiresAt: later,
      lastUsedAt: at,
      revokedAt: null,
    };
    await mongooseSessionRepository.create({ ...record, userId: ids.userA });
    const postgresSessions = new PostgresSessionRepository(database);
    await postgresSessions.create({ ...record, userId: postgresIds.userA });
    assert.equal((await mongooseSessionRepository.findBySessionId(sessionId))?.sessionId, sessionId);
    assert.equal((await postgresSessions.findBySessionId(sessionId))?.sessionId, sessionId);
    assert.equal(
      await mongooseAuthorizationContextRepository.isSessionActive(sessionId, ids.userA, at),
      await new PostgresAuthorizationContextRepository(database).isSessionActive(
        sessionId,
        postgresIds.userA,
        at,
      ),
    );
    await mongooseSessionRepository.revoke(sessionId, record.refreshTokenHash, at);
    await postgresSessions.revoke(sessionId, record.refreshTokenHash, at);
    assert.equal(
      await mongooseAuthorizationContextRepository.isSessionActive(sessionId, ids.userA, at),
      await new PostgresAuthorizationContextRepository(database).isSessionActive(
        sessionId,
        postgresIds.userA,
        at,
      ),
    );
  });

  await context.test('staff listing and creation parity without platform-role mutation', async () => {
    const mongoBefore = await mongooseStaffRepository.list(ids.organizationA);
    const postgresStaff = new PostgresStaffRepository(database);
    const postgresBefore = await postgresStaff.list(postgresIds.organizationA);
    const normalize = (records: typeof mongoBefore) => records.map((record) => ({
      name: record.name,
      phone: record.phone,
      role: record.role,
      branchCount: record.branchIds.length,
    }));
    assert.deepEqual(normalize(postgresBefore), normalize(mongoBefore));
    const input = {
      name: 'Parity Created Staff',
      phone: 'parity-created-staff',
      passwordHash,
      role: 'staff' as const,
    };
    const [mongoCreated, postgresCreated] = await Promise.all([
      mongooseStaffRepository.create({
        ...input,
        organizationId: ids.organizationA,
        branchId: ids.branchA,
      }),
      postgresStaff.create({
        ...input,
        organizationId: postgresIds.organizationA,
        branchId: postgresIds.branchA,
      }),
    ]);
    assert.notEqual(mongoCreated, 'phone-conflict');
    assert.notEqual(postgresCreated, 'phone-conflict');
    if (mongoCreated === 'phone-conflict' || postgresCreated === 'phone-conflict') {
      throw new Error('Unexpected parity fixture phone conflict');
    }
    assert.deepEqual(
      { name: postgresCreated.name, phone: postgresCreated.phone, role: postgresCreated.role,
        branchCount: postgresCreated.branchIds.length },
      { name: mongoCreated.name, phone: mongoCreated.phone, role: mongoCreated.role,
        branchCount: mongoCreated.branchIds.length },
    );
    assert.equal((await User.findById(mongoCreated.id).select('+platformRole').lean())?.platformRole, null);
    assert.equal((await database.query<{ platform_role: string | null }>(
      'SELECT platform_role FROM users WHERE id = $1', [postgresCreated.id],
    )).rows[0]?.platform_role, null);
  });

  await context.test('registration, profile, credential, and theme adapter parity', async () => {
    const postgresAccounts = new PostgresAccountRepository(database);
    const registrationInput = {
      orgName: 'Parity Registered Org',
      orgType: 'salon',
      userName: 'Parity Registered Admin',
      phone: 'parity-registration',
      passwordHash,
    };
    const [mongoRegistration, postgresRegistration] = await Promise.all([
      mongooseAccountRepository.registerAdmin(registrationInput),
      postgresAccounts.registerAdmin(registrationInput),
    ]);
    const mongoOrganization = mongoRegistration.organization as { name: string; type: string };
    const postgresOrganization = postgresRegistration.organization as { name: string; type: string };
    const mongoBranch = mongoRegistration.branch as { name: string; code: string; status: string };
    const postgresBranch = postgresRegistration.branch as { name: string; code: string; status: string };
    assert.deepEqual(
      { organization: { name: postgresOrganization.name, type: postgresOrganization.type },
        branch: { name: postgresBranch.name, code: postgresBranch.code, status: postgresBranch.status },
        user: { name: postgresRegistration.user.name, phone: postgresRegistration.user.phone,
          role: postgresRegistration.user.role } },
      { organization: { name: mongoOrganization.name, type: mongoOrganization.type },
        branch: { name: mongoBranch.name, code: mongoBranch.code, status: mongoBranch.status },
        user: { name: mongoRegistration.user.name, phone: mongoRegistration.user.phone,
          role: mongoRegistration.user.role } },
    );

    const [mongoTheme, postgresTheme] = await Promise.all([
      mongooseAccountRepository.updateTheme(ids.organizationB, {
        mode: 'dark',
        primaryColor: '#abcdef',
      }),
      postgresAccounts.updateTheme(postgresIds.organizationB, {
        mode: 'dark',
        primaryColor: '#abcdef',
      }),
    ]);
    assert.deepEqual(
      postgresTheme && { mode: postgresTheme.mode, primaryColor: postgresTheme.primaryColor },
      mongoTheme && { mode: mongoTheme.mode, primaryColor: mongoTheme.primaryColor },
    );
    const [mongoProfile, postgresProfile] = await Promise.all([
      mongooseAccountRepository.updateProfileName(ids.userB, 'Renamed Staff'),
      postgresAccounts.updateProfileName(postgresIds.userB, 'Renamed Staff'),
    ]);
    assert.equal((mongoProfile as { name: string } | null)?.name, 'Renamed Staff');
    assert.equal((postgresProfile as { name: string } | null)?.name, 'Renamed Staff');
    assert.equal(
      await mongooseAccountRepository.findPasswordHash(ids.userB),
      await postgresAccounts.findPasswordHash(postgresIds.userB),
    );
    const replacementHash = '$2b$12$parity-replacement-hash-not-a-real-credential';
    assert.equal(
      await mongooseAccountRepository.replacePasswordHashAndRevokeSessions(ids.userB, replacementHash),
      await postgresAccounts.replacePasswordHashAndRevokeSessions(postgresIds.userB, replacementHash),
    );
    assert.equal(await mongooseAccountRepository.findPasswordHash(ids.userB), replacementHash);
    assert.equal(await postgresAccounts.findPasswordHash(postgresIds.userB), replacementHash);
  });

  await context.test('attendance identity and validated operational mapping parity', async () => {
    const mongoOperational = await mongooseOperationalIdentityBridge.resolve({
      userId: ids.userA,
      sessionId: 'session',
      organizationId: ids.organizationA,
      membershipId: ids.membershipA,
      branchId: ids.branchA,
      role: 'owner',
      permissions: [],
      platformOperator: true,
    });
    const postgresOperational = await new PostgresOperationalIdentityBridge(mappings).resolve({
      userId: postgresIds.userA,
      sessionId: 'session',
      organizationId: postgresIds.organizationA,
      membershipId: await mappings.membershipToPostgres(asLegacyMongoMembershipId(ids.membershipA)),
      branchId: postgresIds.branchA,
      role: 'owner',
      permissions: [],
      platformOperator: true,
    });
    const [mongoTarget, postgresTarget] = await Promise.all([
      mongooseAttendanceIdentityResolver.resolveTarget(ids.userA, mongoOperational),
      new PostgresAttendanceIdentityResolver(database).resolveTarget(postgresIds.userA, postgresOperational),
    ]);
    assert.deepEqual(
      postgresTarget && { legacyMongoUserId: postgresTarget.legacyMongoUserId,
        name: postgresTarget.name, phone: postgresTarget.phone },
      mongoTarget && { legacyMongoUserId: mongoTarget.legacyMongoUserId,
        name: mongoTarget.name, phone: mongoTarget.phone },
    );
    assert.equal(
      await new PostgresAttendanceIdentityResolver(database).resolveTarget(
        postgresIds.userB,
        postgresOperational,
      ),
      null,
    );
  });

  assert.equal(await Session.countDocuments(), 1);
});
