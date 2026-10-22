import type { PoolClient, QueryResultRow } from 'pg';
import type { TaskStatus } from './policy.js';

export interface TaskRow extends QueryResultRow {
  id: string; organization_id: string; branch_id: string;
  creator_membership_id: string; assigned_membership_id: string;
  title: string; description: string; priority: 'low' | 'normal' | 'high';
  due_at: Date | null; due_timezone: string | null; status: TaskStatus; version: number;
  created_at: Date; updated_at: Date; completed_at: Date | null; cancelled_at: Date | null;
}
export interface TaskCommandResult { id: string; version: number; eventId: string }
export type TaskCommand = 'create' | 'update' | 'status' | 'cancel' | 'reopen';

/** Every method receives the caller's one atomic/snapshot client, never a pool. */
export class TaskRepository {
  constructor(private readonly client: PoolClient, private readonly org: string, private readonly branch: string) {}

  async find(id: string, ownMembership?: string, lock = false): Promise<TaskRow | undefined> {
    return (await this.client.query<TaskRow>(`
      SELECT t.*,u.name AS assignee_name,m.status AS assignee_status,
        EXISTS(SELECT 1 FROM membership_branch_assignments a WHERE a.organization_id=t.organization_id
          AND a.membership_id=m.id AND a.branch_id=t.branch_id) AS assignee_branch_assigned
      FROM work_tasks t JOIN memberships m ON m.id=t.assigned_membership_id AND m.organization_id=t.organization_id
      JOIN users u ON u.id=m.user_id
      WHERE t.id=$1 AND t.organization_id=$2 AND t.branch_id=$3
        AND ($4::uuid IS NULL OR t.assigned_membership_id=$4)
      ${lock ? 'FOR UPDATE OF t' : ''}`, [id, this.org, this.branch, ownMembership ?? null])).rows[0];
  }

  async prior(key: string) {
    return (await this.client.query<{
      actor_membership_id: string; branch_id: string; command_fingerprint: string;
      task_id: string; resulting_version: number; event_id: string;
    }>('SELECT * FROM work_task_commands WHERE organization_id=$1 AND key=$2', [this.org, key])).rows[0];
  }

  async result(id: string, version: number): Promise<TaskCommandResult> {
    const event = (await this.client.query<{ id: string }>(`SELECT id FROM work_task_events
      WHERE organization_id=$1 AND branch_id=$2 AND task_id=$3 AND resulting_version=$4`,
    [this.org, this.branch, id, version])).rows[0];
    if (!event) throw new Error('Task history did not commit with its fact');
    return { id, version, eventId: event.id };
  }

  async remember(key: string, actor: string, command: TaskCommand, fingerprint: string, result: TaskCommandResult) {
    await this.client.query(`INSERT INTO work_task_commands
      (organization_id,key,branch_id,actor_membership_id,task_id,command,command_fingerprint,resulting_version,event_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [this.org, key, this.branch, actor, result.id, command, fingerprint, result.version, result.eventId]);
  }
}
