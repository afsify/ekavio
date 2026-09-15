import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { moduleKeys } from '../src/commercial/catalogue.js';
import { ActivityLog } from '../src/models/ActivityLog.js';
import { Attendance } from '../src/models/Attendance.js';
import { Entitlement } from '../src/models/Entitlement.js';
import { Inventory } from '../src/models/Inventory.js';
import { Ledger } from '../src/models/Ledger.js';
import { Membership } from '../src/models/Membership.js';
import { ModuleDefinition } from '../src/models/ModuleDefinition.js';
import { Organization } from '../src/models/Organization.js';
import { Queue } from '../src/models/Queue.js';
import { Session } from '../src/models/Session.js';
import { User } from '../src/models/User.js';
import { PostgresMongoCommercialIdentityBridge } from '../src/persistence/commercialIdentity.js';
import { mongooseAttendanceStorageRepository } from '../src/persistence/mongoAttendance.js';
import {
  legacyOrganizationScope,
  PostgresOperationalIdentityBridge,
} from '../src/persistence/operationalIdentity.js';
import {
  asPostgresUserId,
  isLegacyMongoId,
  isUuid,
} from '../src/persistence/identifiers.js';
import { PostgresAccountRepository } from '../src/postgres/accountRepository.js';
import { PostgresAttendanceIdentityResolver } from '../src/postgres/attendanceIdentityResolver.js';
import { PostgresAuthorizationContextRepository } from '../src/postgres/authorizationContextRepository.js';
import { PostgresDatabase } from '../src/postgres/database.js';
import { PostgresIdMappingRepository } from '../src/postgres/idMappingRepository.js';
import { PostgresIdentityRepository } from '../src/postgres/identityRepository.js';
import { migrate } from '../src/postgres/migrations.js';
import { PostgresSessionRepository } from '../src/postgres/sessionRepository.js';
import { PostgresStaffRepository } from '../src/postgres/staffRepository.js';
import { createPasswordChange } from '../src/services/accountPersistence.js';
import {
  createAttendanceReader,
  createAttendanceWriter,
} from '../src/services/attendanceService.js';
import {
  createAuthService,
} from '../src/services/authService.js';
import { permissions, permissionsForRole } from '../src/services/authorizationPolicy.js';
import { upsertOrganizationEntitlement } from '../src/services/commercialAdministrationService.js';
import { entitlementService } from '../src/services/entitlementService.js';
import { createAuthorizationContextResolver } from '../src/services/requestContextService.js';
import { createSecurityAuditRecorder } from '../src/services/securityAuditService.js';
import { createRefreshSessionManager } from '../src/services/sessionService.js';
import { createRealtimeAuthorizer } from '../src/config/socket.js';

const registrationIds = (result: Awaited<ReturnType<PostgresAccountRepository['registerAdmin']>>) => ({
  organizationId: String((result.organization as { id: string }).id),
  branchId: String((result.branch as { id: string }).id),
  userId: String(result.user.id),
});

test('V2-05C PostgreSQL identity authority preserves Mongo compatibility and tenant isolation', async (context) => {
  const postgresAdminUrl = process.env.POSTGRES_TEST_URL;
  const mongoAdminUrl = process.env.MONGO_TEST_URL;
  assert.ok(postgresAdminUrl, 'POSTGRES_TEST_URL is required');
  assert.ok(mongoAdminUrl, 'MONGO_TEST_URL is required');
  const parsedPostgres = new URL(postgresAdminUrl);
  const parsedMongo = new URL(mongoAdminUrl);
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(parsedPostgres.hostname));
  assert.ok(['localhost', '127.0.0.1', 'mongo'].includes(parsedMongo.hostname));

  const suffix = randomUUID().replaceAll('-', '');
  const postgresDatabaseName = `ekavio_v205c_cutover_${suffix}`;
  const mongoDatabaseName = `ekavio_v205c_cutover_${suffix}`;
  const admin = new PostgresDatabase(postgresAdminUrl);
  await admin.query(`CREATE DATABASE "${postgresDatabaseName}"`);
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
    await admin.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
      [postgresDatabaseName],
    );
    await admin.query(`DROP DATABASE "${postgresDatabaseName}"`);
    await admin.close();
  });

  await migrate(database);
  const accounts = new PostgresAccountRepository(database);
  const staff = new PostgresStaffRepository(database);
  const mappings = new PostgresIdMappingRepository(database);
  const commercial = new PostgresMongoCommercialIdentityBridge(mappings, entitlementService);
  const identities = new PostgresIdentityRepository(database, commercial);
  const sessionRepository = new PostgresSessionRepository(database);
  const sessions = createRefreshSessionManager({
    repository: sessionRepository,
    getHashSecret: () => 'v2-05c-disposable-session-secret',
  });
  const authorizationRepository = new PostgresAuthorizationContextRepository(database);
  const resolveContext = createAuthorizationContextResolver(authorizationRepository);
  const operationalBridge = new PostgresOperationalIdentityBridge(mappings);
  const attendanceIdentities = new PostgresAttendanceIdentityResolver(database);
  const tokens = new Map<string, { userId: string; defaultOrganizationId: string; sessionId: string }>();
  let tokenSequence = 0;
  const auth = createAuthService({
    identities,
    sessions,
    verifyPassword: bcrypt.compare,
    signAccessToken(authContext, sessionId) {
      const token = `cutover-token-${++tokenSequence}`;
      tokens.set(token, {
        userId: authContext.userId,
        defaultOrganizationId: authContext.organizationId,
        sessionId,
      });
      return token;
    },
  });
  const tokenClaims = (token: string) => {
    const claims = tokens.get(token);
    if (!claims) throw new Error('Invalid test token');
    return claims;
  };

  const [passwordA, passwordB] = await Promise.all([
    bcrypt.hash('owner-a-password', 4),
    bcrypt.hash('owner-b-password', 4),
  ]);
  const registrationA = await accounts.registerAdmin({
    orgName: 'Cutover Organization A',
    orgType: 'shop',
    userName: 'Owner A',
    phone: 'cutover-owner-a',
    passwordHash: passwordA,
  });
  const registrationB = await accounts.registerAdmin({
    orgName: 'Cutover Organization B',
    orgType: 'clinic',
    userName: 'Owner B',
    phone: 'cutover-owner-b',
    passwordHash: passwordB,
  });
  const idsA = registrationIds(registrationA);
  const idsB = registrationIds(registrationB);
  await database.query("UPDATE users SET platform_role = 'operator' WHERE id = $1", [idsA.userId]);

  const staffAResult = await staff.create({
    organizationId: idsA.organizationId,
    branchId: idsA.branchId,
    name: 'Staff A',
    phone: 'cutover-staff-a',
    passwordHash: await bcrypt.hash('staff-a-password', 4),
    role: 'staff',
  });
  const staffBResult = await staff.create({
    organizationId: idsB.organizationId,
    branchId: idsB.branchId,
    name: 'Staff B',
    phone: 'cutover-staff-b',
    passwordHash: await bcrypt.hash('staff-b-password', 4),
    role: 'staff',
  });
  assert.notEqual(staffAResult, 'phone-conflict');
  assert.notEqual(staffBResult, 'phone-conflict');
  if (staffAResult === 'phone-conflict' || staffBResult === 'phone-conflict') {
    throw new Error('Unexpected staff fixture conflict');
  }

  await ModuleDefinition.create(moduleKeys.map((key) => ({
    key,
    displayName: key,
    description: `${key} cutover test module`,
    category: 'operations',
    commercialType: 'purchasable',
    status: 'active',
    version: 1,
  })));
  const [legacyOrganizationA, legacyOrganizationB, legacyOwnerA, legacyOwnerB] = await Promise.all([
    commercial.organizationToLegacy(idsA.organizationId),
    commercial.organizationToLegacy(idsB.organizationId),
    commercial.userToLegacy(idsA.userId),
    commercial.userToLegacy(idsB.userId),
  ]);
  await Entitlement.create([
    ...moduleKeys.map((moduleKey) => ({
      organizationId: legacyOrganizationA,
      moduleKey,
      effect: 'grant' as const,
      status: 'active' as const,
      source: 'pilot' as const,
      reason: 'Organization A cutover fixture',
      actorUserId: legacyOwnerA,
    })),
    {
      organizationId: legacyOrganizationB,
      moduleKey: 'queue',
      effect: 'grant',
      status: 'active',
      source: 'pilot',
      reason: 'Organization B isolated fixture',
      actorUserId: legacyOwnerB,
    },
  ]);

  let ownerALogin = await auth.login({ phone: 'cutover-owner-a', password: 'owner-a-password' });
  let ownerBLogin = await auth.login({ phone: 'cutover-owner-b', password: 'owner-b-password' });

  await context.test('login and refresh-session authority are PostgreSQL only', async () => {
    assert.equal(ownerALogin.response.platformOperator, true);
    assert.equal(ownerBLogin.response.platformOperator, false);
    assert.equal((await database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM auth_sessions',
    )).rows[0]?.count, '2');
    assert.equal(await Session.countDocuments({}), 0);
    assert.equal(await User.countDocuments({}), 0);
    assert.equal(await Organization.countDocuments({}), 0);
    assert.equal(await Membership.countDocuments({}), 0);
  });

  await context.test('commercial entitlements map canonical organizations and remain isolated', async () => {
    assert.equal(ownerALogin.response.entitlements.organizationId, idsA.organizationId);
    assert.equal(ownerBLogin.response.entitlements.organizationId, idsB.organizationId);
    assert.deepEqual(
      ownerALogin.response.entitlements.modules.filter((module) => module.enabled).map(({ key }) => key),
      [...moduleKeys],
    );
    assert.deepEqual(
      ownerBLogin.response.entitlements.modules.filter((module) => module.enabled).map(({ key }) => key),
      ['queue'],
    );
  });

  await context.test('duplicate phone remains ambiguous without choosing an identity', async () => {
    const duplicateLegacyId = new mongoose.Types.ObjectId().toHexString();
    await database.query(
      `INSERT INTO users (legacy_mongo_id, name, phone, password_hash, created_at, updated_at)
       VALUES ($1, 'Duplicate Owner A', 'cutover-owner-a', $2, NOW(), NOW())`,
      [duplicateLegacyId, passwordA],
    );
    await assert.rejects(
      auth.login({ phone: 'cutover-owner-a', password: 'owner-a-password' }),
      /Multiple accounts use this phone number/,
    );
    await database.query('DELETE FROM users WHERE legacy_mongo_id = $1', [duplicateLegacyId]);
  });

  await context.test('refresh rotation has one winner, rejects replay, and logout revokes PostgreSQL', async () => {
    const firstCredential = ownerALogin.refreshCredential;
    const rotated = await auth.refresh(firstCredential);
    await assert.rejects(auth.refresh(firstCredential), /Invalid or expired refresh session/);
    const concurrent = await Promise.allSettled([
      auth.refresh(rotated.refreshCredential),
      auth.refresh(rotated.refreshCredential),
    ]);
    assert.equal(concurrent.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.equal(concurrent.filter(({ status }) => status === 'rejected').length, 1);
    const winner = concurrent.find((result) => result.status === 'fulfilled');
    assert.ok(winner?.status === 'fulfilled');
    await auth.logout(winner.value.refreshCredential);
    await assert.rejects(
      resolveContext(tokenClaims(winner.value.response.accessToken)),
      /Authentication session is no longer active/,
    );
    ownerALogin = await auth.login({ phone: 'cutover-owner-a', password: 'owner-a-password' });
  });

  await context.test('legacy Mongo refresh sessions are rejected by PostgreSQL authority', async () => {
    const legacySessionId = 'b'.repeat(32);
    const legacyCredential = `${legacySessionId}.${'A'.repeat(43)}`;
    await Session.create({
      sessionId: legacySessionId,
      userId: legacyOwnerA,
      refreshTokenHash: 'c'.repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
      lastUsedAt: new Date(),
      revokedAt: null,
    });
    await assert.rejects(auth.refresh(legacyCredential), /Invalid or expired refresh session/);
  });

  await context.test('PostgreSQL request authorization enforces organization and branch isolation', async () => {
    const claimsA = tokenClaims(ownerALogin.response.accessToken);
    const contextA = await resolveContext(claimsA);
    assert.equal(contextA.organizationId, idsA.organizationId);
    assert.equal(contextA.branchId, idsA.branchId);
    await assert.rejects(
      resolveContext(claimsA, { organizationId: idsB.organizationId }),
      /Access denied to this organization/,
    );
    await assert.rejects(
      resolveContext(claimsA, { branchId: idsB.branchId }),
      /Access denied to this branch/,
    );
  });

  await context.test('inactive membership and staff-role privilege escalation are denied', async () => {
    const inactive = await staff.create({
      organizationId: idsA.organizationId,
      branchId: idsA.branchId,
      name: 'Inactive Staff A',
      phone: 'cutover-inactive-a',
      passwordHash: await bcrypt.hash('inactive-password', 4),
      role: 'staff',
    });
    assert.notEqual(inactive, 'phone-conflict');
    if (inactive === 'phone-conflict') throw new Error('Unexpected inactive fixture conflict');
    await database.query(
      "UPDATE memberships SET status = 'inactive' WHERE user_id = $1 AND organization_id = $2",
      [inactive.id, idsA.organizationId],
    );
    await assert.rejects(
      auth.login({ phone: 'cutover-inactive-a', password: 'inactive-password' }),
      /No active organization membership/,
    );
    assert.equal(permissionsForRole('staff').includes(permissions.STAFF_MANAGE), false);
    assert.equal(ownerBLogin.response.platformOperator, false);
  });

  await context.test('Socket.IO authorization uses PostgreSQL session and tenant state', async () => {
    const authorizeSocket = createRealtimeAuthorizer({
      verifyToken: tokenClaims,
      resolveContext,
    });
    assert.equal((await authorizeSocket({ token: ownerALogin.response.accessToken })).organizationId, idsA.organizationId);
    await assert.rejects(
      authorizeSocket({ token: ownerALogin.response.accessToken, organizationId: idsB.organizationId }),
      /Access denied to this organization/,
    );
    await assert.rejects(
      authorizeSocket({ token: ownerALogin.response.accessToken, branchId: idsB.branchId }),
      /Access denied to this branch/,
    );
  });

  const contextA = await resolveContext(tokenClaims(ownerALogin.response.accessToken));
  const contextB = await resolveContext(tokenClaims(ownerBLogin.response.accessToken));

  await context.test('operational Queue, Inventory, and Ledger scopes use mapped legacy IDs only', async () => {
    const [operationalA, operationalB] = await Promise.all([
      operationalBridge.resolve(contextA),
      operationalBridge.resolve(contextB),
    ]);
    assert.equal(operationalA.legacyMongoOrganizationId, legacyOrganizationA);
    assert.notEqual(operationalA.legacyMongoOrganizationId, operationalB.legacyMongoOrganizationId);
    await Promise.all([
      Queue.create({ tenantId: operationalA.legacyMongoOrganizationId, tokenNumber: '#A', customerName: 'A', phone: '1', serviceType: 'test' }),
      Queue.create({ tenantId: operationalB.legacyMongoOrganizationId, tokenNumber: '#B', customerName: 'B', phone: '2', serviceType: 'test' }),
      Inventory.create({ tenantId: operationalA.legacyMongoOrganizationId, itemName: 'A item', currentStock: 1, lowStockThreshold: 2, price: 10 }),
      Inventory.create({ tenantId: operationalB.legacyMongoOrganizationId, itemName: 'B item', currentStock: 2, lowStockThreshold: 2, price: 20 }),
      Ledger.create({ tenantId: operationalA.legacyMongoOrganizationId, customerName: 'A customer', phone: '1', amount: 10, type: 'credit' }),
      Ledger.create({ tenantId: operationalB.legacyMongoOrganizationId, customerName: 'B customer', phone: '2', amount: 20, type: 'credit' }),
    ]);
    assert.equal(await Queue.countDocuments(legacyOrganizationScope(operationalA)), 1);
    assert.equal(await Inventory.countDocuments(legacyOrganizationScope(operationalA)), 1);
    assert.equal(await Ledger.countDocuments(legacyOrganizationScope(operationalA)), 1);
    assert.equal(isLegacyMongoId(operationalA.legacyMongoOrganizationId), true);
    assert.notEqual(operationalA.legacyMongoOrganizationId, idsA.organizationId);
  });

  await context.test('attendance identity is PostgreSQL while records remain isolated in MongoDB', async () => {
    const dependencies = {
      storage: mongooseAttendanceStorageRepository,
      identities: attendanceIdentities,
      operationalIdentity: operationalBridge,
    };
    const writeAttendance = createAttendanceWriter(dependencies);
    const readAttendance = createAttendanceReader(dependencies);
    await writeAttendance(contextA, {
      userId: staffAResult.id,
      date: '2026-09-15',
      status: 'present',
    });
    await assert.rejects(
      writeAttendance(contextA, {
        userId: staffBResult.id,
        date: '2026-09-15',
        status: 'present',
      }),
      /Attendance target not found/,
    );
    const records = await readAttendance(contextA, new Date('2026-09-15T12:00:00.000Z')) as Array<{
      userId: { _id: string; name: string; phone: string } | null;
    }>;
    assert.equal(records.length, 1);
    assert.equal(records[0]?.userId?.name, 'Staff A');
    assert.equal(isLegacyMongoId(String(records[0]?.userId?._id)), true);
    assert.equal(await Attendance.countDocuments({ tenantId: legacyOrganizationB }), 0);
  });

  await context.test('staff creation and organization-scoped revocation are PostgreSQL only', async () => {
    const staffALogin = await auth.login({ phone: 'cutover-staff-a', password: 'staff-a-password' });
    const countB = (await staff.list(idsB.organizationId)).length;
    const revoked = await staff.revoke(idsA.organizationId, staffAResult.id);
    assert.ok(revoked);
    await sessions.revokeAllForUser(staffAResult.id);
    assert.equal(await staff.list(idsB.organizationId).then((records) => records.length), countB);
    assert.equal(await authorizationRepository.isSessionActive(
      tokenClaims(staffALogin.response.accessToken).sessionId,
      staffAResult.id,
      new Date(),
    ), false);
    assert.equal(await User.countDocuments({}), 0);
    assert.equal(await Membership.countDocuments({}), 0);
  });

  await context.test('password update is PostgreSQL-only and revokes all PostgreSQL sessions', async () => {
    const passwordChange = createPasswordChange({
      repository: accounts,
      verifyPassword: bcrypt.compare,
      hashPassword: (password) => bcrypt.hash(password, 4),
    });
    await passwordChange(idsB.userId, 'owner-b-password', 'owner-b-new-password');
    await assert.rejects(
      resolveContext(tokenClaims(ownerBLogin.response.accessToken)),
      /Authentication session is no longer active/,
    );
    await assert.rejects(
      auth.login({ phone: 'cutover-owner-b', password: 'owner-b-password' }),
      /Invalid credentials/,
    );
    ownerBLogin = await auth.login({ phone: 'cutover-owner-b', password: 'owner-b-new-password' });
    assert.equal(await User.countDocuments({}), 0);
  });

  await context.test('security audit events retain mapped Mongo compatibility without identity mirrors', async () => {
    const recordAudit = createSecurityAuditRecorder({
      identities: commercial,
      repository: { create: (record) => ActivityLog.create(record) },
    });
    await recordAudit(contextA, 'membership.created', { targetUserId: staffAResult.id }, '127.0.0.1');
    const audit = await ActivityLog.findOne({ action: 'membership.created' }).lean();
    assert.equal(String(audit?.tenantId), legacyOrganizationA);
    assert.equal(String(audit?.userId), legacyOwnerA);
  });

  await context.test('new organization registration needs no Mongo identity mirror', async () => {
    const registrationC = await accounts.registerAdmin({
      orgName: 'Cutover Organization C',
      orgType: 'salon',
      userName: 'Owner C',
      phone: 'cutover-owner-c',
      passwordHash: await bcrypt.hash('owner-c-password', 4),
    });
    const idsC = registrationIds(registrationC);
    assert.equal(isUuid(idsC.organizationId), true);
    assert.equal(isUuid(idsC.userId), true);
    assert.equal(isUuid(idsC.branchId), true);
    const [legacyOrganizationC, legacyOwnerC] = await Promise.all([
      commercial.organizationToLegacy(idsC.organizationId),
      commercial.userToLegacy(idsC.userId),
    ]);
    assert.equal(isLegacyMongoId(legacyOrganizationC), true);
    assert.equal(isLegacyMongoId(legacyOwnerC), true);
    const beforeGrant = await commercial.getEffective(idsC.organizationId);
    assert.equal(beforeGrant.modules.some((module) => module.enabled), false);
    await upsertOrganizationEntitlement(
      legacyOrganizationC,
      legacyOwnerA,
      'queue',
      {
        effect: 'grant',
        status: 'active',
        source: 'pilot',
        reason: 'New registration compatibility smoke',
      },
    );
    assert.equal(
      (await commercial.getEffective(idsC.organizationId)).modules.find(({ key }) => key === 'queue')?.enabled,
      true,
    );
    const loginC = await auth.login({ phone: 'cutover-owner-c', password: 'owner-c-password' });
    assert.equal(loginC.response.organizationId, idsC.organizationId);
    assert.equal(loginC.response.branchId, idsC.branchId);
    const operationalC = await operationalBridge.resolve(
      await resolveContext(tokenClaims(loginC.response.accessToken)),
    );
    await Queue.create({
      tenantId: operationalC.legacyMongoOrganizationId,
      tokenNumber: '#C',
      customerName: 'C',
      phone: '3',
      serviceType: 'test',
    });
    assert.equal(await Queue.countDocuments(legacyOrganizationScope(operationalC)), 1);
    assert.equal(await User.countDocuments({}), 0);
    assert.equal(await Organization.countDocuments({}), 0);
    assert.equal(await Membership.countDocuments({}), 0);
  });

  assert.equal((await identities.findById(asPostgresUserId(idsA.userId)))?.id, idsA.userId);
});
