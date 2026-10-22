import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { PostgresDatabase } from '../../postgres/database.js';
import { PostgresCommercialRepository } from '../../postgres/commercialRepository.js';
import { membershipAuthority } from '../../postgres/organizationAuthorization.js';
import { createEntitlementService, type EffectiveEntitlements } from '../../services/entitlementService.js';
import type { AuthorizationContext } from '../../services/requestContextService.js';
import { AppError } from '../../utils/AppError.js';
import { branchLocalDateTimeToInstant, instantToBranchBusinessDate, nextBusinessDate } from '../appointments/timezone.js';
import { TaskRepository, type TaskRow, type TaskCommand, type TaskCommandResult } from './repository.js';
import { assertTaskProgress, literalTaskSearch, taskAssigneeSchema, taskCreateSchema, taskDueInstant,
  taskLifecycleSchema, taskListSchema, taskPageSchema, taskProgressSchema, taskUpdateSchema } from './policy.js';

type Actor = Awaited<ReturnType<typeof membershipAuthority>>;
interface Access { actor: Actor; timezone: string; now: Date }
const manager = (actor: Actor) => actor.effective.includes('tasks.read') && actor.effective.includes('tasks.manage');
const ownUpdate = (actor: Actor) => actor.effective.includes('tasks.read_own') && actor.effective.includes('tasks.manage_own');
const readable = (actor: Actor) => actor.effective.includes('tasks.read') || actor.effective.includes('tasks.read_own');
const eligibleSql = `(m.role='owner' OR (m.custom_role_id IS NULL AND m.role IN ('admin','manager','staff')) OR
 (r.status='active' AND (SELECT count(*) FROM organization_role_permissions p
 WHERE p.role_id=r.id AND p.permission IN ('tasks.read_own','tasks.manage_own'))=2))`;
const listSelect = `SELECT t.*,u.name AS assignee_name,m.status AS assignee_status,
 EXISTS(SELECT 1 FROM membership_branch_assignments a WHERE a.organization_id=t.organization_id
 AND a.membership_id=m.id AND a.branch_id=t.branch_id) AS assignee_branch_assigned
 FROM work_tasks t JOIN memberships m ON m.id=t.assigned_membership_id AND m.organization_id=t.organization_id JOIN users u ON u.id=m.user_id`;

export class TaskService {
  readonly entitlements: { getEffective(org: string): Promise<EffectiveEntitlements> };
  constructor(private readonly db: PostgresDatabase, private readonly now: () => Date = () => new Date()) {
    this.entitlements = createEntitlementService(new PostgresCommercialRepository(db), now);
  }

  private async lockMember(client: PoolClient, org: string, id: string) {
    const member = (await client.query<{ custom_role_id: string | null }>(
      'SELECT custom_role_id FROM memberships WHERE id=$1 AND organization_id=$2 FOR SHARE', [id, org])).rows[0];
    await client.query('SELECT membership_id FROM membership_branch_assignments WHERE membership_id=$1 AND organization_id=$2 ORDER BY branch_id FOR SHARE', [id, org]);
    if (member?.custom_role_id) {
      await client.query('SELECT id FROM organization_roles WHERE id=$1 AND organization_id=$2 FOR SHARE', [member.custom_role_id, org]);
      await client.query('SELECT permission FROM organization_role_permissions WHERE role_id=$1 ORDER BY permission FOR SHARE', [member.custom_role_id]);
    }
  }

  // Existing commercial writers do not all lock organizations. Protect the actual
  // snapshot inputs here without changing their policy or using another client.
  // New org-scoped grant rows also acquire FK key-share on our locked org row.
  private async lockCommercial(client: PoolClient, org: string) {
    await client.query("SELECT id FROM module_definitions WHERE key='tasks' FOR SHARE");
    await client.query('SELECT id FROM subscriptions WHERE organization_id=$1 FOR SHARE', [org]);
    await client.query('SELECT id FROM entitlement_overrides WHERE organization_id=$1 ORDER BY id FOR SHARE', [org]);
    await client.query('SELECT p.id FROM plans p JOIN subscriptions s ON s.plan_id=p.id WHERE s.organization_id=$1 FOR SHARE OF p', [org]);
    await client.query('SELECT pm.plan_id FROM plan_modules pm JOIN subscriptions s ON s.plan_id=pm.plan_id WHERE s.organization_id=$1 ORDER BY pm.module_definition_id FOR SHARE OF pm', [org]);
    await client.query('SELECT a.add_on_id FROM subscription_add_ons a JOIN subscriptions s ON s.id=a.subscription_id WHERE s.organization_id=$1 ORDER BY a.add_on_id FOR SHARE OF a', [org]);
    await client.query('SELECT a.id FROM add_ons a JOIN subscription_add_ons sa ON sa.add_on_id=a.id JOIN subscriptions s ON s.id=sa.subscription_id WHERE s.organization_id=$1 ORDER BY a.id FOR SHARE OF a', [org]);
    await client.query('SELECT am.add_on_id FROM add_on_modules am JOIN subscription_add_ons sa ON sa.add_on_id=am.add_on_id JOIN subscriptions s ON s.id=sa.subscription_id WHERE s.organization_id=$1 ORDER BY am.add_on_id,am.module_definition_id FOR SHARE OF am', [org]);
  }

  private async access(client: PoolClient, c: AuthorizationContext): Promise<Access> {
    if (!c.branchId) throw new AppError('Select an authorized branch', 400);
    const actor = await membershipAuthority(client, c.userId, c.organizationId);
    if (actor.id !== c.membershipId || !readable(actor)) throw new AppError('Task permission denied', 403);
    const branch = (await client.query<{ timezone: string }>(`SELECT b.timezone FROM branches b
      JOIN membership_branch_assignments a ON a.organization_id=b.organization_id AND a.branch_id=b.id
      WHERE b.id=$1 AND b.organization_id=$2 AND b.status='active' AND a.membership_id=$3`,
    [c.branchId, c.organizationId, actor.id])).rows[0];
    if (!branch) throw new AppError('Access denied to this branch', 403);
    if (!(await this.entitlements.getEffective(c.organizationId)).modules.some(m => m.key === 'tasks' && m.enabled)) {
      throw new AppError('Tasks entitlement required', 403);
    }
    return { actor, timezone: branch.timezone, now: this.now() };
  }

  private read<T>(c: AuthorizationContext, operation: (client: PoolClient, access: Access) => Promise<T>): Promise<T> {
    return this.db.atomic(async client => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL statement_timeout='10s'");
      return operation(client, await this.access(client, c));
    });
  }

  private async record(repo: TaskRepository, access: Access, id: string, progress = false, lock = false) {
    const full = progress ? manager(access.actor) : access.actor.effective.includes('tasks.read');
    if (progress && !full && !ownUpdate(access.actor)) throw new AppError('Task progress permission denied', 403);
    const row = await repo.find(id, full ? undefined : access.actor.id, lock);
    if (!row) throw new AppError('Task not found', 404);
    return row;
  }

  private write(c: AuthorizationContext, command: TaskCommand, input: { idempotencyKey: string }, id: string | undefined,
    operation: (client: PoolClient, repo: TaskRepository, access: Access, row?: TaskRow) => Promise<TaskCommandResult>) {
    return this.db.atomic(async client => {
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='10s'");
      await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [c.organizationId]);
      await client.query('SELECT id FROM branches WHERE id=$1 AND organization_id=$2 FOR SHARE', [c.branchId ?? null, c.organizationId]);
      await this.lockMember(client, c.organizationId, c.membershipId);
      await this.lockCommercial(client, c.organizationId);
      const access = await this.access(client, c);
      if (command !== 'status' && !manager(access.actor)) throw new AppError('Task management permission denied', 403);
      if (command === 'status' && !manager(access.actor) && !ownUpdate(access.actor)) throw new AppError('Task progress permission denied', 403);
      const repo = new TaskRepository(client, c.organizationId, c.branchId!);
      // Zod outputs fixed property order and strips no unknown input: equal
      // validated commands fingerprint identically regardless of JSON key order.
      const fingerprint = createHash('sha256').update(JSON.stringify({
        org: c.organizationId, branch: c.branchId, actor: access.actor.id, command, id: id ?? null, input,
      })).digest('hex');
      const prior = await repo.prior(input.idempotencyKey);
      if (prior) {
        if (prior.actor_membership_id !== access.actor.id || prior.branch_id !== c.branchId || prior.command_fingerprint.trim() !== fingerprint) {
          throw new AppError('Idempotency key conflicts with another task command', 409);
        }
        // Current row authority applies even when the original command succeeded.
        await this.record(repo, access, prior.task_id, command === 'status');
        return { id: prior.task_id, version: prior.resulting_version, eventId: prior.event_id };
      }
      const row = id ? await this.record(repo, access, id, command === 'status', true) : undefined;
      const result = await operation(client, repo, access, row);
      await repo.remember(input.idempotencyKey, access.actor.id, command, fingerprint, result);
      return result;
    });
  }

  private async assignee(client: PoolClient, c: AuthorizationContext, id: string) {
    await this.lockMember(client, c.organizationId, id);
    const match = await client.query(`SELECT m.id FROM memberships m
      LEFT JOIN organization_roles r ON r.id=m.custom_role_id AND r.organization_id=m.organization_id
      JOIN membership_branch_assignments a ON a.membership_id=m.id AND a.organization_id=m.organization_id
      WHERE m.id=$1 AND m.organization_id=$2 AND a.branch_id=$3 AND m.status='active' AND ${eligibleSql}`,
    [id, c.organizationId, c.branchId]);
    if (!match.rowCount) throw new AppError('Assignee must be an active same-branch member with own Task capabilities', 400);
  }

  async create(c: AuthorizationContext, input: unknown) {
    const value = taskCreateSchema.parse(input);
    return this.write(c, 'create', value, undefined, async (client, repo, access) => {
      await this.assignee(client, c, value.assignedMembershipId);
      const due = taskDueInstant(value.localDue, access.timezone);
      const row = (await client.query<TaskRow>(`INSERT INTO work_tasks
        (organization_id,branch_id,creator_membership_id,assigned_membership_id,created_by,updated_by,actor_membership_id,
         title,description,priority,due_at,due_timezone,last_action)
        VALUES($1,$2,$3,$4,$5,$5,$3,$6,$7,$8,$9,$10,'task.created') RETURNING id,version`,
      [c.organizationId, c.branchId, access.actor.id, value.assignedMembershipId, c.userId,
        value.title, value.description, value.priority, due, due ? access.timezone : null])).rows[0]!;
      return repo.result(row.id, row.version);
    });
  }

  async update(c: AuthorizationContext, id: string, input: unknown) {
    const value = taskUpdateSchema.parse(input);
    return this.write(c, 'update', value, id, async (client, repo, access, row) => {
      this.version(row!, value.expectedVersion);
      if (!['todo', 'in_progress'].includes(row!.status)) throw new AppError('Only open tasks can be edited or reassigned', 409);
      if (value.assignedMembershipId !== undefined) await this.assignee(client, c, value.assignedMembershipId);
      const due = value.localDue === undefined ? row!.due_at : taskDueInstant(value.localDue, access.timezone);
      const zone = value.localDue === undefined ? row!.due_timezone : due ? access.timezone : null;
      await client.query(`UPDATE work_tasks SET title=$4,description=$5,priority=$6,assigned_membership_id=$7,due_at=$8,due_timezone=$9,
        updated_by=$10,actor_membership_id=$11,version=version+1,last_reason=NULL,last_action=$12
        WHERE id=$1 AND organization_id=$2 AND branch_id=$3`,
      [id, c.organizationId, c.branchId, value.title ?? row!.title, value.description ?? row!.description,
        value.priority ?? row!.priority, value.assignedMembershipId ?? row!.assigned_membership_id, due, zone,
        c.userId, access.actor.id, value.assignedMembershipId && value.assignedMembershipId !== row!.assigned_membership_id ? 'task.assigned' : 'task.updated']);
      return repo.result(id, row!.version + 1);
    });
  }

  private version(row: TaskRow, expected: number) {
    if (row.version !== expected) throw new AppError('Task changed; reload before saving', 409);
  }

  async progress(c: AuthorizationContext, id: string, input: unknown) {
    const value = taskProgressSchema.parse(input);
    return this.write(c, 'status', value, id, async (client, repo, access, row) => {
      this.version(row!, value.expectedVersion);
      assertTaskProgress(row!.status, value.status);
      const action = value.status === 'completed' ? 'task.completed' : value.status === 'in_progress' ? 'task.started' : 'task.reset';
      await this.changeState(client, c, access.actor.id, id, value.status, action, null);
      return repo.result(id, row!.version + 1);
    });
  }

  async lifecycle(c: AuthorizationContext, id: string, action: 'cancel' | 'reopen', input: unknown) {
    const value = taskLifecycleSchema.parse(input);
    return this.write(c, action, value, id, async (client, repo, access, row) => {
      this.version(row!, value.expectedVersion);
      if (action === 'reopen' ? row!.status !== 'completed' : !['todo', 'in_progress'].includes(row!.status)) {
        throw new AppError('Task cannot make this lifecycle transition', 409);
      }
      await this.changeState(client, c, access.actor.id, id, action === 'cancel' ? 'cancelled' : 'todo',
        action === 'cancel' ? 'task.cancelled' : 'task.reopened', value.reason);
      return repo.result(id, row!.version + 1);
    });
  }

  private async changeState(client: PoolClient, c: AuthorizationContext, actor: string, id: string, status: string, action: string, reason: string | null) {
    await client.query(`UPDATE work_tasks SET status=$4,last_action=$5,last_reason=$6,version=version+1,updated_by=$7,actor_membership_id=$8
      WHERE id=$1 AND organization_id=$2 AND branch_id=$3`, [id, c.organizationId, c.branchId, status, action, reason, c.userId, actor]);
  }

  private dto(row: TaskRow, access: Access) {
    const canManage = manager(access.actor), canProgress = canManage || (ownUpdate(access.actor) && row.assigned_membership_id === access.actor.id);
    const open = row.status === 'todo' || row.status === 'in_progress';
    return {
      id: row.id, organizationId: row.organization_id, branchId: row.branch_id,
      creatorMembershipId: row.creator_membership_id, assignedMembershipId: row.assigned_membership_id,
      assigneeName: row.assignee_name, assigneeStatus: row.assignee_status, assigneeBranchAssigned: row.assignee_branch_assigned,
      title: row.title, description: row.description, priority: row.priority, status: row.status, version: row.version,
      dueAt: row.due_at?.toISOString() ?? null, dueTimezone: row.due_timezone,
      createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
      completedAt: row.completed_at?.toISOString() ?? null, cancelledAt: row.cancelled_at?.toISOString() ?? null,
      overdue: open && row.due_at !== null && row.due_at < access.now,
      allowedActions: [...(open && canProgress ? ['progress'] : []), ...(open && canManage ? ['edit', 'reassign', 'cancel'] : []),
        ...(row.status === 'completed' && canManage ? ['reopen'] : [])],
    };
  }

  async detail(c: AuthorizationContext, id: string) {
    return this.read(c, async (client, access) => ({
      ...this.dto(await this.record(new TaskRepository(client, c.organizationId, c.branchId!), access, id), access),
      timezone: access.timezone, serverNow: access.now.toISOString(),
    }));
  }

  async list(c: AuthorizationContext, input: unknown) {
    const filter = taskListSchema.parse(input);
    return this.read(c, async (client, access) => {
      if (filter.scope === 'team' && !access.actor.effective.includes('tasks.read')) throw new AppError('Team Task read permission denied', 403);
      const args: unknown[] = [c.organizationId, c.branchId];
      const bind = (value: unknown) => `$${args.push(value)}`;
      const where = ['t.organization_id=$1', 't.branch_id=$2'];
      if (filter.scope === 'own') where.push(`t.assigned_membership_id=${bind(access.actor.id)}`);
      if (filter.assignee) where.push(`t.assigned_membership_id=${bind(filter.assignee)}`);
      if (filter.status) where.push(`t.status=${bind(filter.status)}`);
      if (filter.priority) where.push(`t.priority=${bind(filter.priority)}`);
      if (filter.search) where.push(`t.title ILIKE ${bind('%' + literalTaskSearch(filter.search) + '%')} ESCAPE '\\'`);
      const today = instantToBranchBusinessDate(access.now, access.timezone);
      if (filter.attention) {
        where.push("t.status IN ('todo','in_progress')");
        if (filter.attention === 'overdue') where.push(`t.due_at<${bind(access.now)}`);
        else {
          const end = branchLocalDateTimeToInstant(nextBusinessDate(today) + 'T00:00', access.timezone);
          if (filter.attention === 'upcoming') where.push(`t.due_at>=${bind(end)}`);
          else where.push(`t.due_at>=${bind(branchLocalDateTimeToInstant(today + 'T00:00', access.timezone))} AND t.due_at<${bind(end)}`);
        }
      }
      const predicate = where.join(' AND ');
      const total = Number((await client.query(`SELECT count(*) AS n FROM work_tasks t WHERE ${predicate}`, args)).rows[0]!.n);
      const order = filter.sort === 'recent' ? 't.created_at DESC,t.id' : 't.due_at ASC NULLS LAST,t.id';
      const limit = bind(filter.limit), offset = bind((filter.page - 1) * filter.limit);
      const rows = (await client.query<TaskRow>(`${listSelect} WHERE ${predicate} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, args)).rows;
      return { data: rows.map(row => this.dto(row, access)), total, page: filter.page, limit: filter.limit,
        timezone: access.timezone, businessDate: today, serverNow: access.now.toISOString() };
    });
  }

  async history(c: AuthorizationContext, id: string, input: unknown) {
    const page = taskPageSchema.parse(input);
    return this.read(c, async (client, access) => {
      await this.record(new TaskRepository(client, c.organizationId, c.branchId!), access, id);
      const args = [c.organizationId, c.branchId, id];
      const total = Number((await client.query('SELECT count(*) AS n FROM work_task_events WHERE organization_id=$1 AND branch_id=$2 AND task_id=$3', args)).rows[0]!.n);
      const data = (await client.query(`SELECT e.id,e.action,e.resulting_version,e.occurred_at,e.reason,e.actor_membership_id,
        u.name AS actor,e.old_status,e.new_status,e.old_assignee,e.new_assignee,e.old_due_at,e.new_due_at,
        e.old_priority,e.new_priority,e.old_due_timezone,e.new_due_timezone,e.changed_fields
        FROM work_task_events e JOIN users u ON u.id=e.actor_user_id
        WHERE e.organization_id=$1 AND e.branch_id=$2 AND e.task_id=$3 ORDER BY e.resulting_version DESC LIMIT $4 OFFSET $5`,
      [...args, page.limit, (page.page - 1) * page.limit])).rows;
      return { data, total, ...page };
    });
  }

  async assignees(c: AuthorizationContext, input: unknown) {
    const page = taskAssigneeSchema.parse(input);
    return this.read(c, async (client, access) => {
      if (!manager(access.actor)) throw new AppError('Task assignment permission denied', 403);
      const from = `FROM memberships m JOIN users u ON u.id=m.user_id
        LEFT JOIN organization_roles r ON r.id=m.custom_role_id AND r.organization_id=m.organization_id
        JOIN membership_branch_assignments a ON a.membership_id=m.id AND a.organization_id=m.organization_id
        WHERE m.organization_id=$1 AND a.branch_id=$2 AND m.status='active' AND ${eligibleSql}
        AND u.name ILIKE $3 ESCAPE '\\'`;
      const args = [c.organizationId, c.branchId, '%' + literalTaskSearch(page.search) + '%'];
      const total = Number((await client.query('SELECT count(*) AS n ' + from, args)).rows[0]!.n);
      const data = (await client.query('SELECT m.id,u.name ' + from + ' ORDER BY lower(u.name),m.id LIMIT $4 OFFSET $5',
        [...args, page.limit, (page.page - 1) * page.limit])).rows;
      return { data, total, page: page.page, limit: page.limit };
    });
  }
}
