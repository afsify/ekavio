import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PostgresCorporateRepository } from '../src/postgres/corporateRepository.js';
import { PostgresDatabase } from '../src/postgres/database.js';
import { migrate } from '../src/postgres/migrations.js';

const legacyId = (): string => randomBytes(12).toString('hex');

test('V2-06F corporate runtime is canonical, owner-scoped, and PostgreSQL-only', async (context) => {
  const adminUrl = process.env.POSTGRES_TEST_URL;
  assert.ok(adminUrl, 'POSTGRES_TEST_URL is required');
  const parsed = new URL(adminUrl);
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(parsed.hostname)
    || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(parsed.hostname));
  assert.equal(parsed.pathname, '/postgres');

  const databaseName = `ekavio_v206f_corporate_${randomUUID().replaceAll('-', '')}`;
  const admin = new PostgresDatabase(adminUrl);
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const database = new PostgresDatabase(databaseUrl.toString());
  context.after(async () => {
    await database.close();
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]);
    await admin.query(`DROP DATABASE "${databaseName}"`);
    await admin.close();
  });
  await migrate(database);
  const repository = new PostgresCorporateRepository(database);
  const now = new Date('2026-09-30T00:00:00.000Z');
  const ownerId = randomUUID();
  const otherOwnerId = randomUUID();
  const childId = randomUUID();
  const foreignChildId = randomUUID();
  await database.query(`
    INSERT INTO users (id, legacy_mongo_id, name, phone, created_at, updated_at)
    VALUES
      ($1, $3, 'Corporate Owner', '+910000000001', $5, $5),
      ($2, $4, 'Other Owner', '+910000000002', $5, $5)
  `, [ownerId, otherOwnerId, legacyId(), legacyId(), now]);
  await database.query(`
    INSERT INTO organizations
      (id, legacy_mongo_id, name, type, theme_mode, theme_primary_color, created_at, updated_at)
    VALUES
      ($1, $3, 'Authorized Child', 'clinic', 'light', '#4F46E5', $5, $5),
      ($2, $4, 'Foreign Child', 'shop', 'light', '#4F46E5', $5, $5)
  `, [childId, foreignChildId, legacyId(), legacyId(), now]);
  await database.query(`
    INSERT INTO memberships (user_id, organization_id, role, status, created_at, updated_at)
    VALUES
      ($1, $2, 'owner', 'active', $4, $4),
      ($3, $2, 'staff', 'active', $4, $4)
  `, [ownerId, childId, otherOwnerId, now]);

  const parent = await repository.createParent({
    ownerUserId: ownerId,
    name: 'Canonical Group',
    consolidatedBilling: true,
  });
  assert.match(parent.id, /^[0-9a-f-]{36}$/);
  assert.equal(parent.owner_user_id, ownerId);
  assert.equal((await repository.listParents(ownerId)).length, 1);
  assert.equal((await repository.listParents(otherOwnerId)).length, 0);

  const linked = await repository.linkChild({
    actorUserId: ownerId,
    parentId: parent.id,
    childOrganizationId: childId,
  });
  assert.equal(linked.id, childId);
  assert.deepEqual((await repository.listChildren(ownerId, parent.id)).map(({ id }) => id), [childId]);
  const stored = await database.query<{ parent_organization_id: string | null }>(
    'SELECT parent_organization_id FROM organizations WHERE id = $1',
    [childId],
  );
  assert.equal(stored.rows[0]?.parent_organization_id, parent.id);

  await assert.rejects(repository.linkChild({
    actorUserId: otherOwnerId, parentId: parent.id, childOrganizationId: childId,
  }), (error: unknown) => Boolean(error && typeof error === 'object' && 'statusCode' in error
    && (error as { statusCode: number }).statusCode === 404));
  await assert.rejects(repository.linkChild({
    actorUserId: ownerId, parentId: randomUUID(), childOrganizationId: childId,
  }), /Corporate relationship not found/);
  await assert.rejects(repository.linkChild({
    actorUserId: ownerId, parentId: parent.id, childOrganizationId: randomUUID(),
  }), /Child organization not found/);
  await assert.rejects(repository.linkChild({
    actorUserId: ownerId, parentId: parent.id, childOrganizationId: foreignChildId,
  }), (error: unknown) => Boolean(error && typeof error === 'object' && 'statusCode' in error
    && (error as { statusCode: number }).statusCode === 403));

  const [controller, routes] = await Promise.all([
    readFile(new URL('../src/controllers/corporateController.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/corporateRoutes.ts', import.meta.url), 'utf8'),
  ]);
  for (const forbidden of [
    'models/ParentOrganization', 'models/Organization', 'mongoIdentities',
    'idMappings', 'legacy_mongo_id', 'defaultParent', '/billing/:parentId',
  ]) assert.equal(`${controller}\n${routes}`.includes(forbidden), false, forbidden);
  for (const required of ["'/parents'", "'/links'", "'/parents/:parentId/summary'"]){
    assert.ok(routes.includes(required), required);
  }
  assert.match(controller, /commercial\.getEffective\(organization\.id\)/);
});
