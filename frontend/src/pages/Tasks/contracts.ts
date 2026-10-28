import axios from 'axios';
import { client } from '../../api/client';
import { getErrorMessage } from '../../api/errors';

export type TaskStatus = 'todo' | 'in_progress' | 'completed' | 'cancelled';
export type Priority = 'low' | 'normal' | 'high';
export type TaskAction = 'progress' | 'edit' | 'reassign' | 'cancel' | 'reopen';
export interface Task {
  id: string; organizationId: string; branchId: string; creatorMembershipId: string;
  assignedMembershipId: string; assigneeName: string; assigneeStatus: string;
  assigneeBranchAssigned: boolean; title: string; description: string; priority: Priority;
  status: TaskStatus; version: number; dueAt: string | null; dueTimezone: string | null;
  createdAt: string; updatedAt: string; completedAt: string | null; cancelledAt: string | null;
  overdue: boolean; allowedActions: TaskAction[];
}
export interface Page<T> { data: T[]; total: number; page: number; limit: number }
export interface TaskPage extends Page<Task> { timezone: string; businessDate: string; serverNow: string }
export interface TaskDetail extends Task { timezone: string; serverNow: string }
export interface Assignee { id: string; name: string }
export interface TaskEvent {
  id: string; action: string; resulting_version: number; occurred_at: string;
  actor: string; reason: string | null; changed_fields: string[];
  old_status: TaskStatus | null; new_status: TaskStatus;
  old_priority: Priority | null; new_priority: Priority;
  old_due_at: string | null; new_due_at: string | null;
  old_due_timezone: string | null; new_due_timezone: string | null;
}
export interface TaskDraft { title: string; description: string; priority: Priority; assignedMembershipId: string; localDue: string }
export const statusLabels: Record<TaskStatus, string> = { todo: 'To do', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };
export const priorityLabels: Record<Priority, string> = { low: 'Low', normal: 'Normal', high: 'High' };
export const eventLabels: Record<string, string> = { 'task.created': 'Task created', 'task.started': 'Work started', 'task.reset': 'Returned to to do', 'task.completed': 'Task completed', 'task.updated': 'Details updated', 'task.assigned': 'Assignee changed', 'task.cancelled': 'Task cancelled', 'task.reopened': 'Task reopened' };
export const blankDraft: TaskDraft = { title: '', description: '', priority: 'normal', assignedMembershipId: '', localDue: '' };
export function localDue(instant: string | null, timezone: string): string {
  if (!instant) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant));
  const part = (name: string) => parts.find(p => p.type === name)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}`;
}
export function draftFor(task: TaskDetail): TaskDraft {
  return { title: task.title, description: task.description, priority: task.priority, assignedMembershipId: task.assignedMembershipId, localDue: localDue(task.dueAt, task.timezone) };
}
export function editPatch(draft: TaskDraft, initial: TaskDraft): Record<string, string | null> {
  const patch: Record<string, string | null> = {};
  for (const key of ['title', 'description', 'priority', 'assignedMembershipId', 'localDue'] as const) {
    const next = key === 'title' || key === 'description' ? draft[key].trim() : draft[key];
    if (next !== initial[key]) patch[key] = key === 'localDue' && next === '' ? null : next;
  }
  return patch;
}
export function progressTargets(task: Task): TaskStatus[] {
  if (!task.allowedActions.includes('progress')) return [];
  return task.status === 'todo' ? ['in_progress', 'completed'] : task.status === 'in_progress' ? ['todo', 'completed'] : [];
}
export function taskTime(instant: string | null, timezone: string): string {
  return instant ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(instant)) : 'No deadline';
}
export async function getTaskData<T>(path: string, params?: object, signal?: AbortSignal): Promise<T> {
  return (await client.get<{ data: T }>(path, { params, signal })).data.data;
}
export function taskError(error: unknown): string {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (status === 401) return 'Your session has expired. Sign in again before continuing.';
  if (status === 403) return 'Task access was denied. Your membership, branch, permission or entitlement may have changed.';
  if (status === 404) return 'This task is no longer available in your current workspace.';
  if (status === 409) return 'This task or command changed. Reload current facts before making a new decision. Your draft has not been overwritten.';
  return getErrorMessage(error, 'Tasks could not be loaded. Try again when your connection is available.');
}
