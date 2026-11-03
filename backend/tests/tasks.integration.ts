import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { PostgresDatabase } from '../src/postgres/database.js';
import { migrate, getMigrationStatus } from '../src/postgres/migrations.js';
import { PostgresAccountRepository } from '../src/postgres/accountRepository.js';
import { PostgresCommercialRepository } from '../src/postgres/commercialRepository.js';
import { PostgresSessionRepository } from '../src/postgres/sessionRepository.js';
import { OrganizationAdministrationService } from '../src/services/organizationAdministrationService.js';
import { permissionsForRole, type Permission } from '../src/services/authorizationPolicy.js';
import type { AuthorizationContext } from '../src/services/requestContextService.js';
import { TaskService } from '../src/domains/tasks/service.js';
import type { TaskCommandResult } from '../src/domains/tasks/repository.js';
import { verifyRestoredDatabase } from '../src/postgres/restoreIntegrity.js';
import { initializeRuntimeConfig } from '../src/config/env.js';
import { runtimePostgresDatabase } from '../src/persistence/runtimePersistence.js';
import { createApp } from '../src/app.js';
import { AppError } from '../src/utils/AppError.js';
import { setTimeout as delay } from 'node:timers/promises';

test('Tasks PostgreSQL migration, API, authority, concurrency and recovery acceptance', async t => {
  const url = new URL(process.env.POSTGRES_TEST_URL ?? '');
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(url.hostname) && url.pathname === '/postgres', 'Disposable local PostgreSQL admin only');
  const admin = new PostgresDatabase(url.href), name = 'ekavio_v212c_tasks_' + randomUUID().replaceAll('-', '');
  await admin.query('CREATE DATABASE ' + name); url.pathname = '/' + name;
  const db = new PostgresDatabase(url.href);
  t.after(async () => {
    await runtimePostgresDatabase.close(); await db.close();
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [name]);
    await admin.query('DROP DATABASE ' + name); await admin.close();
  });
  await t.test('020 upgrade, historical checksum preservation, repeat migration and fresh 021', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ekavio-v212c-migrations-'));
    try {
      for (const file of (await readdir('postgres/migrations')).filter(f => f.endsWith('.sql') && Number(f.slice(0, 3)) <= 20)) {
        await copyFile(path.join('postgres/migrations', file), path.join(dir, file));
      }
      await migrate(db, dir);
      const before = (await db.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;
      assert.equal(before.length, 20);
      await migrate(db); await migrate(db);
      assert.equal((await getMigrationStatus(db)).length, 21);
      assert.deepEqual((await db.query("SELECT name,checksum FROM schema_migrations WHERE name<'021' ORDER BY name")).rows, before);
      const freshName = 'ekavio_v212c_fresh_' + randomUUID().replaceAll('-', '');
      await admin.query('CREATE DATABASE ' + freshName);
      const freshUrl = new URL(url.href); freshUrl.pathname = '/' + freshName;
      const fresh = new PostgresDatabase(freshUrl.href);
      try { await migrate(fresh); assert.equal((await getMigrationStatus(fresh)).length, 21); }
      finally { await fresh.close(); await admin.query('DROP DATABASE ' + freshName); }
    } finally {
      const resolved = path.resolve(dir);
      assert.ok(resolved.startsWith(path.resolve(tmpdir()) + path.sep) && path.basename(resolved).startsWith('ekavio-v212c-migrations-'));
      await rm(resolved, { recursive: true });
    }
  });

  const makeOrg = async (phone: string): Promise<AuthorizationContext> => {
    const account = await new PostgresAccountRepository(db).registerAdmin({ orgName: 'STAGING V212C Tasks', orgType: 'shop', userName: 'Synthetic task owner', phone, passwordHash: 'fixture-no-login' });
    const organizationId = String(account.user.tenantId), userId = String(account.user.id);
    await db.query("UPDATE branches SET timezone='Asia/Kolkata' WHERE organization_id=$1", [organizationId]);
    return { organizationId, userId, membershipId: (await db.query('SELECT id FROM memberships WHERE user_id=$1', [userId])).rows[0]!.id,
      branchId: String((account.branch as { id: string }).id), sessionId: 'fixture', role: 'admin', permissions: permissionsForRole('admin'), platformOperator: false };
  };
  const owner = await makeOrg('+919876542001'), foreign = await makeOrg('+919876542002');
  const commercial = new PostgresCommercialRepository(db); await commercial.reconcileCatalogue();
  const tasks = new TaskService(db, () => new Date('2026-09-26T06:00:00Z'));
  const grant = (effect: 'grant' | 'revoke', c = owner) => commercial.upsertEntitlement(c.organizationId, c.userId, 'tasks',
    { effect, status: 'active', source: 'pilot', reason: 'STAGING V212C disposable synthetic fixtures only' });
  const makeMember = async (label: string, role: 'staff' | 'manager' | 'hr' = 'staff'): Promise<AuthorizationContext> => {
    const userId = (await db.query('INSERT INTO users(name,phone,created_at,updated_at) VALUES($1,$2,now(),now()) RETURNING id', [label, 'qa-' + randomUUID()])).rows[0]!.id;
    const membershipId = (await db.query("INSERT INTO memberships(user_id,organization_id,role,status,created_at,updated_at) VALUES($1,$2,$3,'active',now(),now()) RETURNING id", [userId, owner.organizationId, role])).rows[0]!.id;
    await db.query('INSERT INTO membership_branch_assignments(membership_id,branch_id,organization_id) VALUES($1,$2,$3)', [membershipId, owner.branchId, owner.organizationId]);
    return { ...owner, userId, membershipId, role, permissions: permissionsForRole(role) };
  };
  const staff = await makeMember('Synthetic assignee'), colleague = await makeMember('Synthetic colleague'), manager = await makeMember('Synthetic manager', 'manager');
  const denied = (status: number) => (error: unknown) => error instanceof AppError && error.statusCode === status;
  const payload = (extra: Record<string, unknown> = {}) => ({ title: 'Synthetic work', assignedMembershipId: staff.membershipId, idempotencyKey: randomUUID(), ...extra });
  const create = (extra: Record<string, unknown> = {}, c = owner) => tasks.create(c, payload(extra));
  const progress = (task: TaskCommandResult, status: string, c = staff, key = randomUUID()) => tasks.progress(c, task.id, { status, expectedVersion: task.version, idempotencyKey: key });
  const lifecycle = (task: TaskCommandResult, action: 'cancel' | 'reopen', c = owner) => tasks.lifecycle(c, task.id, action, { expectedVersion: task.version, idempotencyKey: randomUUID(), reason: 'Synthetic lifecycle reason' });
  const counts = async () => (await db.query(`SELECT (SELECT count(*) FROM work_tasks)::text AS tasks,
    (SELECT count(*) FROM work_task_events)::text AS events,(SELECT count(*) FROM work_task_commands)::text AS commands`)).rows[0];
  const waitForLocks = async (minimum: number) => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const waiting = Number((await db.query("SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'")).rows[0]!.n);
      if (waiting >= minimum) return;
      await delay(20);
    }
    assert.fail('Expected deterministic fixture lock barrier was not reached');
  };

  await t.test('Optional, unpriced and no implicit entitlement or Pilot Core inclusion', async () => {
    await assert.rejects(() => create(), denied(403));
    assert.equal((await db.query("SELECT count(*) AS n FROM plan_modules pm JOIN module_definitions m ON m.id=pm.module_definition_id WHERE m.key='tasks'")).rows[0]!.n, '0');
    assert.equal((await db.query("SELECT count(*) AS n FROM public_offer_pricing p JOIN add_ons a ON a.id=p.add_on_id WHERE a.key='module-tasks'")).rows[0]!.n, '0');
    await grant('grant');
    assert.equal((await tasks.list(owner, { scope: 'team' })).total, 0);
  });
  let first: TaskCommandResult;
  await t.test('Manager creates one canonical todo task with one event and one command', async () => {
    first = await create({ localDue: '2026-09-26T10:30', priority: 'high' }, manager);
    const detail = await tasks.detail(staff, first.id);
    assert.equal(detail.status, 'todo'); assert.equal(detail.version, 1);
    assert.equal(detail.dueAt, '2026-09-26T05:00:00.000Z'); assert.equal(detail.overdue, true);
    assert.deepEqual(detail.allowedActions, ['progress']);
    assert.deepEqual(await counts(), { tasks: '1', events: '1', commands: '1' });
    assert.equal((await tasks.history(staff, first.id, {})).total, 1);
  });
  await t.test('Own/team scope, sibling privacy and manager read coverage', async () => {
    assert.equal((await tasks.list(staff, {})).total, 1);
    assert.equal((await tasks.list(colleague, {})).total, 0);
    await assert.rejects(() => tasks.detail(colleague, first.id), denied(404));
    await assert.rejects(() => tasks.history(colleague, first.id, {}), denied(404));
    await assert.rejects(() => tasks.list(staff, { scope: 'team' }), denied(403));
    assert.equal((await tasks.list(manager, { scope: 'team' })).total, 1);
    await assert.rejects(() => tasks.create(staff, payload()), denied(403));
  });
  await t.test('Cross-tenant/foreign-ID access and all mutation/history paths fail closed', async () => {
    await grant('grant', foreign);
    for (const op of [() => tasks.detail(foreign, first.id), () => tasks.history(foreign, first.id, {}),
      () => tasks.update(foreign, first.id, { title: 'Foreign', expectedVersion: 1, idempotencyKey: randomUUID() }),
      () => progress(first, 'completed', foreign), () => lifecycle(first, 'cancel', foreign)]) {
      await assert.rejects(op, denied(404));
    }
    assert.equal((await tasks.list(foreign, { scope: 'team' })).total, 0);
    await assert.rejects(() => create({ assignedMembershipId: foreign.membershipId }), denied(400));
    await assert.rejects(() => tasks.detail({ ...owner, membershipId: foreign.membershipId }, first.id), denied(403));
  });
  const branch2 = (await db.query("INSERT INTO branches(organization_id,name,code,status,timezone,created_at,updated_at) VALUES($1,'Synthetic branch 2','two','active','Asia/Kolkata',now(),now()) RETURNING id", [owner.organizationId])).rows[0]!.id;
  await db.query('INSERT INTO membership_branch_assignments(membership_id,organization_id,branch_id) VALUES($1,$2,$3)', [owner.membershipId, owner.organizationId, branch2]);
  await t.test('Cross-branch context, assignment and branch-body selectors never transfer tasks', async () => {
    const c2 = { ...owner, branchId: branch2 };
    await assert.rejects(() => tasks.detail(c2, first.id), denied(404));
    await assert.rejects(() => tasks.history(c2, first.id, {}), denied(404));
    await assert.rejects(() => tasks.update(c2, first.id, { title: 'Wrong branch', expectedVersion: 1, idempotencyKey: randomUUID() }), denied(404));
    assert.equal((await tasks.list(c2, { scope: 'team' })).total, 0);
    await assert.rejects(() => create({}, c2), denied(400));
    await assert.rejects(() => tasks.detail({ ...staff, branchId: branch2 }, first.id), denied(403));
    await assert.rejects(() => create({ branchId: branch2 }));
  });
  await t.test('Staff progress transitions, version conflict and terminal freeze are explicit', async () => {
    const initial = await create();
    const started = await progress(initial, 'in_progress');
    await assert.rejects(() => progress(initial, 'completed'), denied(409));
    const reset = await progress(started, 'todo');
    const completed = await progress(reset, 'completed');
    assert.ok((await tasks.detail(staff, initial.id)).completedAt);
    await assert.rejects(() => progress(completed, 'todo'), denied(409));
    await assert.rejects(() => tasks.update(owner, initial.id, { title: 'Silent edit', expectedVersion: completed.version, idempotencyKey: randomUUID() }), denied(409));
    await assert.rejects(() => lifecycle(completed, 'reopen', staff), denied(403));
    const reopened = await lifecycle(completed, 'reopen');
    assert.equal((await tasks.detail(staff, initial.id)).completedAt, null);
    assert.equal((await tasks.history(staff, initial.id, {})).total, 5);
    const cancelled = await lifecycle(reopened, 'cancel');
    await assert.rejects(() => progress(cancelled, 'in_progress'), denied(409));
    await assert.rejects(() => lifecycle(cancelled, 'reopen'), denied(409));
    await assert.rejects(() => lifecycle(cancelled, 'cancel'), denied(409));
  });
  await t.test('Staff cannot edit, reassign, cancel, reopen or update another assignee', async () => {
    await assert.rejects(() => tasks.update(staff, first.id, { assignedMembershipId: colleague.membershipId, expectedVersion: 1, idempotencyKey: randomUUID() }), denied(403));
    await assert.rejects(() => lifecycle(first, 'cancel', staff), denied(403));
    await assert.rejects(() => progress(first, 'completed', colleague), denied(404));
  });
  await t.test('Partial edit preserves omitted canonical values and identical update retries', async () => {
    const initial = await create({ description: 'Retained description', priority: 'high', localDue: '2026-09-27T10:00' });
    const value = { title: 'Renamed only', expectedVersion: 1, idempotencyKey: randomUUID() };
    const a = await tasks.update(owner, initial.id, value), b = await tasks.update(owner, initial.id, value);
    assert.deepEqual(a, b);
    const row = await tasks.detail(staff, initial.id);
    assert.equal(row.description, 'Retained description'); assert.equal(row.priority, 'high');
    assert.equal(row.dueAt, '2026-09-27T04:30:00.000Z');
    await assert.rejects(() => tasks.update(owner, initial.id, { title: 'Renamed only', expectedVersion: a.version, idempotencyKey: randomUUID() }));
  });
  await t.test('Description/priority/deadline-only patches preserve omitted fields; explicit null clears only due', async () => {
    let fact = await create({ title: 'Independent partial fields', description: 'Original description', priority: 'high', localDue: '2026-09-27T10:00' });
    const patch = async (edit: Record<string, unknown>) => {
      fact = await tasks.update(owner, fact.id, { ...edit, expectedVersion: fact.version, idempotencyKey: randomUUID() });
      return tasks.detail(staff, fact.id);
    };
    let row = await patch({ description: 'Changed description' });
    assert.equal(row.title, 'Independent partial fields'); assert.equal(row.priority, 'high');
    assert.equal(row.dueAt, '2026-09-27T04:30:00.000Z'); assert.equal(row.assignedMembershipId, staff.membershipId);
    row = await patch({ priority: 'low' });
    assert.equal(row.description, 'Changed description'); assert.equal(row.title, 'Independent partial fields');
    assert.equal(row.dueAt, '2026-09-27T04:30:00.000Z');
    row = await patch({ localDue: '2026-09-28T11:00' });
    assert.equal(row.dueAt, '2026-09-28T05:30:00.000Z'); assert.equal(row.dueTimezone, 'Asia/Kolkata');
    assert.equal(row.priority, 'low'); assert.equal(row.description, 'Changed description');
    row = await patch({ localDue: null });
    assert.equal(row.dueAt, null); assert.equal(row.dueTimezone, null);
    assert.equal(row.description, 'Changed description'); assert.equal(row.priority, 'low');
    row = await patch({ description: '' });
    assert.equal(row.description, ''); assert.equal(row.priority, 'low'); assert.equal(row.dueAt, null);
    const before = await counts();
    for (const bad of [{ description: null }, { priority: null }, { assignedMembershipId: null }]) {
      await assert.rejects(() => tasks.update(owner, fact.id, { ...bad, expectedVersion: fact.version, idempotencyKey: randomUUID() }));
    }
    await assert.rejects(() => tasks.update(owner, fact.id, { description: 'Stale', expectedVersion: 1, idempotencyKey: randomUUID() }), denied(409));
    assert.deepEqual(await counts(), before);
    assert.equal((await tasks.history(owner, fact.id, {})).total, 6);
  });
  await t.test('Identical creation keys replay minimal result; altered payload/actor/scope conflicts', async () => {
    const value = payload(), before = await counts();
    const a = await tasks.create(owner, value), b = await tasks.create(owner, { ...value });
    assert.deepEqual(a, b); assert.deepEqual(Object.keys(a).sort(), ['eventId', 'id', 'version']);
    await assert.rejects(() => tasks.create(owner, { ...value, title: 'Changed' }), denied(409));
    await assert.rejects(() => tasks.create(manager, value), denied(409));
    await assert.rejects(() => tasks.create({ ...owner, branchId: branch2 }, value), denied(409));
    const after = await counts(); for (const key of ['tasks', 'events', 'commands']) assert.equal(Number(after![key]), Number(before![key]) + 1);
  });
  await t.test('Concurrent duplicate creation commits once, without duplicate history', async () => {
    const before = await counts(), value = payload();
    const results = await Promise.all([tasks.create(owner, value), tasks.create(owner, value)]);
    assert.deepEqual(results[0], results[1]);
    const after = await counts(); for (const key of ['tasks', 'events', 'commands']) assert.equal(Number(after![key]), Number(before![key]) + 1);
  });
  await t.test('Concurrent progress yields one winner; identical-key progress retries one result', async () => {
    const initial = await create();
    const outcome = await Promise.allSettled([progress(initial, 'in_progress'), progress(initial, 'completed')]);
    assert.equal(outcome.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(outcome.filter(r => r.status === 'rejected' && denied(409)(r.reason)).length, 1);
    const other = await create(), key = randomUUID();
    const results = await Promise.all([progress(other, 'in_progress', staff, key), progress(other, 'in_progress', staff, key)]);
    assert.deepEqual(results[0], results[1]); assert.equal((await tasks.history(staff, other.id, {})).total, 2);
  });
  await t.test('Concurrent reassignment and progress share version authority with one winner', async () => {
    const initial = await create();
    const results = await Promise.allSettled([progress(initial, 'completed'), tasks.update(manager, initial.id,
      { assignedMembershipId: colleague.membershipId, expectedVersion: 1, idempotencyKey: randomUUID() })]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal((await tasks.detail(owner, initial.id)).version, 2);
    assert.equal((await tasks.history(owner, initial.id, {})).total, 2);
  });
  await t.test('Queued progress rechecks membership revocation after the administration lock', async () => {
    const initial = await create();
    await db.withClient(async client => {
      await client.query('BEGIN');
      try {
        await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [owner.organizationId]);
        await client.query("UPDATE memberships SET status='revoked' WHERE id=$1", [staff.membershipId]);
        const pending = progress(initial, 'completed').then(() => null, error => error);
        await waitForLocks(1); await client.query('COMMIT');
        assert.ok(denied(403)(await pending));
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    });
    await db.query("UPDATE memberships SET status='active' WHERE id=$1", [staff.membershipId]);
    assert.equal((await tasks.detail(owner, initial.id)).version, 1);
  });
  await t.test('In-flight command protects commercial inputs until atomic commit, then revocation denies', async () => {
    const lock = 2121201;
    await db.query(`CREATE FUNCTION qa_task_authority_barrier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.title='Synthetic authority barrier' THEN PERFORM pg_advisory_xact_lock(${lock}); END IF; RETURN NEW; END $$`);
    await db.query('CREATE TRIGGER qa_task_authority_barrier BEFORE INSERT ON work_tasks FOR EACH ROW EXECUTE FUNCTION qa_task_authority_barrier()');
    try {
      await db.withClient(async blocker => {
        await blocker.query('SELECT pg_advisory_lock($1)', [lock]);
        let pending: Promise<TaskCommandResult> | undefined, revoking: Promise<void> | undefined;
        try {
          pending = create({ title: 'Synthetic authority barrier' });
          await waitForLocks(1);
          revoking = grant('revoke');
          await waitForLocks(2);
        } finally { await blocker.query('SELECT pg_advisory_unlock($1)', [lock]); }
        const fact = await pending!; await revoking!;
        await assert.rejects(() => tasks.detail(staff, fact.id), denied(403));
        await assert.rejects(() => create(), denied(403));
      });
    } finally {
      await db.query('DROP TRIGGER qa_task_authority_barrier ON work_tasks');
      await db.query('DROP FUNCTION qa_task_authority_barrier()'); await grant('grant');
    }
  });
  await t.test('Reassignment removes old own/detail/history/replay authority immediately', async () => {
    const initial = await create(), key = randomUUID();
    const started = await progress(initial, 'in_progress', staff, key);
    const moved = await tasks.update(manager, initial.id, { assignedMembershipId: colleague.membershipId, expectedVersion: started.version, idempotencyKey: randomUUID() });
    for (const op of [() => tasks.detail(staff, initial.id), () => tasks.history(staff, initial.id, {}),
      () => progress(initial, 'in_progress', staff, key), () => progress(moved, 'completed')]) await assert.rejects(op, denied(404));
    assert.equal((await tasks.detail(colleague, initial.id)).assignedMembershipId, colleague.membershipId);
    await progress(moved, 'completed', colleague);
  });
  await t.test('Inactive or removed assignee is retained but cannot act or receive new work', async () => {
    const initial = await create();
    await db.query("UPDATE memberships SET status='inactive' WHERE id=$1", [staff.membershipId]);
    await assert.rejects(() => tasks.detail(staff, initial.id), denied(403));
    await assert.rejects(() => create(), denied(400));
    assert.equal((await tasks.detail(owner, initial.id)).assigneeStatus, 'inactive');
    await db.query("UPDATE memberships SET status='active' WHERE id=$1", [staff.membershipId]);
    await db.query('DELETE FROM membership_branch_assignments WHERE membership_id=$1 AND branch_id=$2', [staff.membershipId, owner.branchId]);
    await assert.rejects(() => progress(initial, 'completed'), denied(403));
    await assert.rejects(() => create(), denied(400));
    assert.equal((await tasks.detail(owner, initial.id)).assigneeBranchAssigned, false);
    await db.query('INSERT INTO membership_branch_assignments(membership_id,branch_id,organization_id) VALUES($1,$2,$3)', [staff.membershipId, owner.branchId, owner.organizationId]);
  });
  await t.test('Custom roles replace built-ins, archived roles deny and grant subsets cannot escalate', async () => {
    const role = (await db.query("INSERT INTO organization_roles(organization_id,name) VALUES($1,'Synthetic Task reader') RETURNING id", [owner.organizationId])).rows[0]!.id;
    await db.query("INSERT INTO organization_role_permissions(role_id,permission) VALUES($1,'tasks.read')", [role]);
    await db.query('UPDATE memberships SET custom_role_id=$1 WHERE id=$2', [role, manager.membershipId]);
    assert.ok((await tasks.list(manager, { scope: 'team' })).total > 0);
    await assert.rejects(() => create({}, manager), denied(403));
    await assert.rejects(() => tasks.assignees(manager, {}), denied(403));
    await assert.rejects(() => create({ assignedMembershipId: manager.membershipId }), denied(400));
    const administration = new OrganizationAdministrationService(db);
    await assert.rejects(() => administration.saveRole(manager, undefined, { name: 'Escalated', description: '', permissions: ['tasks.manage'] as Permission[] }), denied(403));
    await db.query("UPDATE organization_roles SET status='archived' WHERE id=$1", [role]);
    await assert.rejects(() => tasks.detail(manager, first.id), denied(403));
    await db.query('UPDATE memberships SET custom_role_id=NULL WHERE id=$1', [manager.membershipId]);
  });
  await t.test('Revoked Task grants and operator flags do not bypass current authority', async () => {
    const initial = await create();
    await grant('revoke');
    for (const c of [owner, { ...owner, platformOperator: true }]) {
      await assert.rejects(() => tasks.detail(c, initial.id), denied(403));
      await assert.rejects(() => create({}, c), denied(403));
    }
    await grant('grant');
    await db.query("UPDATE memberships SET status='revoked' WHERE id=$1", [staff.membershipId]);
    await assert.rejects(() => tasks.list(staff, {}), denied(403));
    await db.query("UPDATE memberships SET status='active' WHERE id=$1", [staff.membershipId]);
  });
  await t.test('Literal search, stable server pagination, filters and same predicate totals', async () => {
    for (let i = 0; i < 5; i++) await create({ title: `Bounded needle ${i}` });
    await create({ title: 'Literal 50%_ work', priority: 'low' });
    const a = await tasks.list(owner, { scope: 'team', search: 'Bounded needle', limit: 2, page: 1 });
    const b = await tasks.list(owner, { scope: 'team', search: 'Bounded needle', limit: 2, page: 2 });
    assert.equal(a.total, 5); assert.equal(b.total, 5); assert.equal(a.data.length, 2);
    assert.equal(new Set([...a.data, ...b.data].map(r => r.id)).size, 4);
    assert.equal((await tasks.list(owner, { scope: 'team', search: '%_', priority: 'low' })).total, 1);
    assert.equal((await tasks.list(owner, { scope: 'team', search: "'; DROP TABLE work_tasks; --" })).total, 0);
    const roster = await tasks.assignees(owner, { limit: 1 });
    assert.equal(roster.data.length, 1); assert.ok(roster.total >= 4);
    assert.deepEqual(Object.keys(roster.data[0]!).sort(), ['id', 'name']);
  });
  await t.test('Today/upcoming/overdue use branch UTC bounds, exact now and active states', async () => {
    const prefix = 'Time boundary ';
    await create({ title: prefix + 'overdue', localDue: '2026-09-26T10:30' });
    await create({ title: prefix + 'equal-now', localDue: '2026-09-26T11:30' });
    await create({ title: prefix + 'tomorrow', localDue: '2026-09-27T00:00' });
    await create({ title: prefix + 'null' });
    const done = await create({ title: prefix + 'done', localDue: '2026-09-25T10:30' }); await progress(done, 'completed');
    const query = { scope: 'team', search: prefix };
    assert.equal((await tasks.list(owner, { ...query, attention: 'today' })).total, 2);
    assert.equal((await tasks.list(owner, { ...query, attention: 'overdue' })).total, 1);
    assert.equal((await tasks.list(owner, { ...query, attention: 'upcoming' })).total, 1);
    assert.equal((await tasks.list(owner, query)).total, 5);
    await assert.rejects(() => create({ localDue: '2026-02-30T10:00' }), denied(400));
    await db.query("UPDATE branches SET timezone='America/New_York' WHERE id=$1", [owner.branchId]);
    await assert.rejects(() => create({ localDue: '2026-03-08T02:30' }), denied(400));
    await assert.rejects(() => create({ localDue: '2026-11-01T01:30' }), denied(400));
    await db.query("UPDATE branches SET timezone='Asia/Kolkata' WHERE id=$1", [owner.branchId]);
  });
  await t.test('History paging retains versions and never copies private descriptions', async () => {
    const initial = await create({ description: 'PRIVATE SYNTHETIC TASK DESCRIPTION' });
    const started = await progress(initial, 'in_progress'); await progress(started, 'completed');
    const a = await tasks.history(staff, initial.id, { limit: 1, page: 1 });
    assert.equal(a.total, 3); assert.equal(a.data[0]!.resulting_version, 3);
    assert.equal((await tasks.history(staff, initial.id, { limit: 1, page: 3 })).data[0]!.resulting_version, 1);
    assert.ok(!JSON.stringify(a).includes('PRIVATE SYNTHETIC TASK DESCRIPTION'));
  });
  await t.test('Database guards reject hard deletion, event/command mutation and identity/version bypass', async () => {
    for (const sql of ['DELETE FROM work_tasks WHERE id=$1', 'UPDATE work_tasks SET version=version+2 WHERE id=$1',
      'UPDATE work_tasks SET branch_id=$2,version=version+1 WHERE id=$1']) {
      await assert.rejects(() => db.query(sql, sql.includes('$2') ? [first.id, branch2] : [first.id]));
    }
    for (const table of ['work_task_events', 'work_task_commands']) {
      await assert.rejects(() => db.query(`DELETE FROM ${table} WHERE task_id=$1`, [first.id]));
      await assert.rejects(() => db.query(`UPDATE ${table} SET resulting_version=99 WHERE task_id=$1`, [first.id]));
    }
  });
  await t.test('History or command failure rolls back the Task fact, events and replay result', async () => {
    const before = await counts();
    await db.query(`CREATE FUNCTION qa_reject_task_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic event failure'; END $$`);
    await db.query('CREATE TRIGGER qa_reject_event BEFORE INSERT ON work_task_events FOR EACH ROW EXECUTE FUNCTION qa_reject_task_event()');
    try { await assert.rejects(() => create(), /Synthetic event failure/); }
    finally { await db.query('DROP TRIGGER qa_reject_event ON work_task_events'); await db.query('DROP FUNCTION qa_reject_task_event()'); }
    assert.deepEqual(await counts(), before);
    await db.query(`CREATE FUNCTION qa_reject_task_command() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic command failure'; END $$`);
    await db.query('CREATE TRIGGER qa_reject_command BEFORE INSERT ON work_task_commands FOR EACH ROW EXECUTE FUNCTION qa_reject_task_command()');
    try { await assert.rejects(() => create(), /Synthetic command failure/); }
    finally { await db.query('DROP TRIGGER qa_reject_command ON work_task_commands'); await db.query('DROP FUNCTION qa_reject_task_command()'); }
    assert.deepEqual(await counts(), before);
  });

  await t.test('Real Express routes enforce JWT/session/context, strict input and all command contracts', async () => {
    const config = initializeRuntimeConfig({ NODE_ENV: 'test', DATABASE_URL: url.href, JWT_SECRET: randomUUID(), REFRESH_TOKEN_SECRET: randomUUID(), HTTP_ALLOWED_ORIGINS: 'http://localhost', SOCKET_ALLOWED_ORIGINS: 'http://localhost' });
    const sessions = new PostgresSessionRepository(db);
    const token = async (c: AuthorizationContext) => {
      const sessionId = randomUUID().replaceAll('-', '');
      await sessions.create({ sessionId, userId: c.userId, refreshTokenHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + 3600000), lastUsedAt: new Date(), revokedAt: null });
      return jwt.sign({ id: c.userId, tenantId: c.organizationId, sessionId }, config.jwtSecret);
    };
    const ownerToken = await token(owner), staffToken = await token(staff);
    const server = createServer(createApp({ config }));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/tasks`;
    const request = (method: string, route = '', body?: unknown, credential = ownerToken, context: Record<string, string> = {}) => fetch(base + route, {
      method, headers: { authorization: 'Bearer ' + credential, 'x-tenant-id': owner.organizationId, 'x-branch-id': owner.branchId!, 'content-type': 'application/json', ...context },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
    });
    try {
      assert.equal((await fetch(base)).status, 401);
      assert.equal((await request('GET', '', undefined, 'invalid')).status, 401);
      assert.equal((await request('GET', '', undefined, ownerToken, { 'x-tenant-id': foreign.organizationId })).status, 403);
      assert.equal((await request('GET', '', undefined, staffToken, { 'x-branch-id': branch2 })).status, 403);
      const response = await request('POST', '', payload()); assert.equal(response.status, 201); assert.equal(response.headers.get('cache-control'), 'no-store');
      let fact = (await response.json() as { data: TaskCommandResult }).data;
      assert.equal((await request('GET', '?scope=team')).status, 200);
      assert.equal((await request('GET', '/assignees')).status, 200);
      assert.equal((await request('GET', '/' + fact.id, undefined, staffToken)).status, 200);
      assert.equal((await request('GET', '?scope=team', undefined, staffToken)).status, 403);
      for (const bad of [{ title: '' }, { organizationId: foreign.organizationId }, { status: 'completed' }]) assert.equal((await request('POST', '', payload(bad))).status, 400);
      for (const query of ['?limit=101', '?page=201', '?scope=own&assignee=' + colleague.membershipId]) assert.equal((await request('GET', query)).status, 400);
      assert.equal((await request('PATCH', '/' + fact.id, { title: 'Not allowed', expectedVersion: 1, idempotencyKey: randomUUID() }, staffToken)).status, 403);
      let updated = await request('POST', '/' + fact.id + '/status', { status: 'completed', expectedVersion: 1, idempotencyKey: randomUUID() }, staffToken);
      assert.equal(updated.status, 200); fact = (await updated.json() as { data: TaskCommandResult }).data;
      assert.equal((await request('POST', '/' + fact.id + '/reopen', { reason: 'Synthetic', expectedVersion: fact.version, idempotencyKey: randomUUID() }, staffToken)).status, 403);
      updated = await request('POST', '/' + fact.id + '/reopen', { reason: 'Synthetic', expectedVersion: fact.version, idempotencyKey: randomUUID() });
      assert.equal(updated.status, 200); fact = (await updated.json() as { data: TaskCommandResult }).data;
      updated = await request('PATCH', '/' + fact.id, { assignedMembershipId: colleague.membershipId, expectedVersion: fact.version, idempotencyKey: randomUUID() });
      assert.equal(updated.status, 200); fact = (await updated.json() as { data: TaskCommandResult }).data;
      assert.equal((await request('GET', '/' + fact.id + '/history', undefined, staffToken)).status, 404);
      assert.equal((await request('POST', '/' + fact.id + '/cancel', { reason: 'Synthetic', expectedVersion: 1, idempotencyKey: randomUUID() })).status, 409);
      assert.equal((await request('POST', '/' + fact.id + '/cancel', { reason: 'Synthetic', expectedVersion: fact.version, idempotencyKey: randomUUID() })).status, 200);
      assert.equal((await request('GET', '/' + fact.id + '/history')).status, 200);
      await grant('revoke'); const deniedResponse = await request('GET'); assert.equal(deniedResponse.status, 403);
      assert.equal((await deniedResponse.json() as { error: { code: string } }).error.code, 'ENTITLEMENT_REQUIRED'); await grant('grant');
    } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
  await t.test('Populated current-schema count-only recovery includes Task facts/history/commands', async () => {
    const proof = await verifyRestoredDatabase(db);
    assert.equal(proof.coverage.reviewedThrough, '021_work_tasks.sql');
    assert.ok(Number(proof.counts.work_tasks) > 0);
    assert.ok(Number(proof.counts.work_task_events) > Number(proof.counts.work_tasks));
    assert.equal(proof.counts.work_task_events, proof.counts.work_task_commands);
    assert.ok(Object.values(proof.integrity).every(v => v === '0'));
  });
  await t.test('Recovery rejects missing Task table/guard and corrupted state/history/command links', async () => {
    await db.query('ALTER TABLE work_task_commands RENAME TO qa_missing_task_commands');
    try { await assert.rejects(() => verifyRestoredDatabase(db), /missing required table/); }
    finally { await db.query('ALTER TABLE qa_missing_task_commands RENAME TO work_task_commands'); }
    await db.query('ALTER TABLE work_tasks DISABLE TRIGGER work_tasks_complete');
    try { await assert.rejects(() => verifyRestoredDatabase(db), /integrity failures/); }
    finally { await db.query('ALTER TABLE work_tasks ENABLE TRIGGER work_tasks_complete'); }
    const event = (await db.query('SELECT * FROM work_task_events WHERE task_id=$1 AND resulting_version=1', [first.id])).rows[0]!;
    await db.query('ALTER TABLE work_task_events DISABLE TRIGGER work_task_events_immutable');
    try {
      await db.query("UPDATE work_task_events SET new_status='cancelled' WHERE id=$1", [event.id]);
      await assert.rejects(() => verifyRestoredDatabase(db), /integrity failures/);
    } finally {
      await db.query('UPDATE work_task_events SET new_status=$2 WHERE id=$1', [event.id, event.new_status]);
      await db.query('ALTER TABLE work_task_events ENABLE TRIGGER work_task_events_immutable');
    }
    const command = (await db.query('SELECT * FROM work_task_commands WHERE event_id=$1', [event.id])).rows[0]!;
    await db.query('ALTER TABLE work_task_commands DISABLE TRIGGER work_task_commands_immutable');
    try {
      await db.query("UPDATE work_task_commands SET command='cancel' WHERE event_id=$1", [event.id]);
      await assert.rejects(() => verifyRestoredDatabase(db), /integrity failures/);
    } finally {
      await db.query('UPDATE work_task_commands SET command=$2 WHERE event_id=$1', [event.id, command.command]);
      await db.query('ALTER TABLE work_task_commands ENABLE TRIGGER work_task_commands_immutable');
    }
    assert.equal((await verifyRestoredDatabase(db)).status, 'verified');
  });
});
