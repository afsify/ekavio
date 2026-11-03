import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { assertTaskProgress, literalTaskSearch, taskCreateSchema, taskListSchema,
  taskUpdateSchema, taskProgressSchema, taskLifecycleSchema, taskDueInstant, taskStatuses } from '../src/domains/tasks/policy.js';
import { permissionsForRole, permissionCatalogue, type Permission } from '../src/services/authorizationPolicy.js';
import { assignmentPermissions, assertGrant } from '../src/postgres/organizationAuthorization.js';
import { initialModuleCatalogue, initialPlans, MODULES } from '../src/commercial/catalogue.js';

for (const from of taskStatuses) for (const to of taskStatuses) {
  test(`Task progress ${from} -> ${to} follows the fixed matrix`, () => {
    const allowed = (from === 'todo' && ['in_progress', 'completed'].includes(to)) ||
      (from === 'in_progress' && ['todo', 'completed'].includes(to));
    if (allowed) assert.doesNotThrow(() => assertTaskProgress(from, to));
    else assert.throws(() => assertTaskProgress(from, to), /transition/);
  });
}
test('Task DTOs are strict, bounded and never accept authority or history selectors', () => {
  const input = { title: '  Test work  ', assignedMembershipId: randomUUID(), idempotencyKey: randomUUID() };
  assert.equal(taskCreateSchema.parse(input).title, 'Test work');
  for (const bad of [{ title: '' }, { title: 'x'.repeat(201) }, { description: 'x'.repeat(5001) },
    { organizationId: randomUUID() }, { branchId: randomUUID() }, { status: 'completed' },
    { createdBy: randomUUID() }, { version: 2 }, { priority: 'urgent' }, { assignedMembershipId: 'legacy-id' }, { idempotencyKey: 'bad key' }]) {
    assert.throws(() => taskCreateSchema.parse({ ...input, ...bad }));
  }
  assert.throws(() => taskUpdateSchema.parse({ expectedVersion: 1, idempotencyKey: 'edit' }));
  assert.deepEqual(taskUpdateSchema.parse({ title: 'Rename', expectedVersion: 1, idempotencyKey: 'edit' }),
    { title: 'Rename', expectedVersion: 1, idempotencyKey: 'edit' });
  assert.throws(() => taskProgressSchema.parse({ status: 'completed', expectedVersion: 0, idempotencyKey: 'p' }));
  assert.throws(() => taskProgressSchema.parse({ status: 'completed', expectedVersion: 1, idempotencyKey: 'p', assignedMembershipId: randomUUID() }));
  assert.throws(() => taskLifecycleSchema.parse({ expectedVersion: 1, idempotencyKey: 'c', reason: ' ' }));
});
test('Task page/scope/search policy is bounded with literal wildcard handling', () => {
  assert.deepEqual(taskListSchema.parse({}), { page: 1, limit: 20, scope: 'own', search: '', sort: 'due' });
  for (const bad of [{ page: 201 }, { limit: 101 }, { limit: 0 }, { search: 'x'.repeat(201) },
    { scope: 'all' }, { sort: 'description' }, { assignee: randomUUID() }, { foreignFilter: 'yes' }]) {
    assert.throws(() => taskListSchema.parse(bad));
  }
  assert.equal(literalTaskSearch('50%_\\'), '50\\%\\_\\\\');
});
test('Each partial Task field stays independent; only the deadline accepts explicit null', () => {
  const command = { expectedVersion: 1, idempotencyKey: 'partial' };
  for (const edit of [{ title: 'Rename' }, { description: 'Change description' }, { description: '' },
    { priority: 'low' }, { localDue: '2026-09-28T11:00' }, { localDue: null }]) {
    assert.deepEqual(taskUpdateSchema.parse({ ...command, ...edit }), { ...command, ...edit });
  }
  for (const edit of [{ title: null }, { description: null }, { priority: null }, { assignedMembershipId: null }]) {
    assert.throws(() => taskUpdateSchema.parse({ ...command, ...edit }));
  }
});
test('Task due conversion retains UTC, branch zone and DST validation', () => {
  assert.equal(taskDueInstant('2026-09-26T10:30', 'Asia/Kolkata')?.toISOString(), '2026-09-26T05:00:00.000Z');
  assert.equal(taskDueInstant(null, 'Asia/Kolkata'), null);
  for (const local of ['2026-02-30T10:00', '2026-03-08T02:30', '2026-11-01T01:30']) {
    assert.throws(() => taskDueInstant(local, 'America/New_York'), /invalid, ambiguous or nonexistent/);
  }
});
test('Task grants are independent, paired by defaults and do not leak into HR role', () => {
  const task = (role: Parameters<typeof permissionsForRole>[0]) => permissionsForRole(role).filter(p => p.startsWith('tasks.')).sort();
  assert.deepEqual(task('staff'), ['tasks.manage_own', 'tasks.read_own']);
  const all = ['tasks.manage', 'tasks.manage_own', 'tasks.read', 'tasks.read_own'];
  for (const role of ['owner', 'admin', 'manager'] as const) assert.deepEqual(task(role), all);
  assert.deepEqual(task('hr'), []);
  assert.equal(permissionCatalogue.filter(p => p.key.startsWith('tasks.')).length, 4);
  assert.throws(() => assertGrant({ effective: ['tasks.read_own'] }, ['tasks.manage']), /Cannot grant/);
  assertGrant({ effective: ['tasks.read'] }, ['tasks.read']);
});
test('Custom Task role assignments remain explicit and do not union built-in management', async () => {
  const query = { query: async () => ({ rows: [{ permissions: ['tasks.read_own'] as Permission[] }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] }) };
  const result = await assignmentPermissions(query as Parameters<typeof assignmentPermissions>[0], randomUUID(), 'manager', randomUUID());
  assert.deepEqual(result, ['tasks.read_own']);
});
test('Tasks is optional and absent from every initial plan including Pilot Core', () => {
  assert.equal(initialModuleCatalogue.find(m => m.key === MODULES.TASKS)?.commercialType, 'purchasable');
  for (const plan of initialPlans) assert.ok(!(plan.moduleKeys as readonly string[]).includes('tasks'));
});
test('Task migration/source boundaries preserve three tables, immutable history and no background adapter', () => {
  const sql = readFileSync('postgres/migrations/021_work_tasks.sql', 'utf8');
  assert.deepEqual([...sql.matchAll(/CREATE TABLE (\w+)/g)].map(m => m[1]), ['work_tasks', 'work_task_events', 'work_task_commands']);
  assert.match(sql, /FOREIGN KEY\(task_id,organization_id,branch_id\)/);
  assert.match(sql, /CREATE CONSTRAINT TRIGGER work_tasks_complete/);
  assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/);
  assert.doesNotMatch(sql, /INSERT INTO (subscriptions|entitlement_overrides|plans|plan_modules|public_offer_pricing)\b/);
  const source = readFileSync('src/domains/tasks/service.ts', 'utf8');
  assert.match(source, /this\.db\.atomic/);
  assert.match(source, /this\.lockCommercial/);
  assert.match(source, /await this\.record\(repo, access, prior\.task_id/);
  assert.doesNotMatch(source, /console\.|mongoose|nodemailer|socket\.io|setInterval/);
});
