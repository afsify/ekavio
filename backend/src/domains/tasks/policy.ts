import { z } from 'zod';
import { AppError } from '../../utils/AppError.js';
import { branchLocalDateTimeToInstant } from '../appointments/timezone.js';

export const taskStatuses = ['todo', 'in_progress', 'completed', 'cancelled'] as const;
export type TaskStatus = typeof taskStatuses[number];
export const taskPriorities = ['low', 'normal', 'high'] as const;
const text = (maximum: number) => z.string().trim().max(maximum);
const key = z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/);
const expectedVersion = z.number().int().positive();
const localDue = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/).nullable();
export const taskCreateSchema = z.object({
  title: text(200).min(1), description: text(5000).default(''),
  assignedMembershipId: z.uuid(), priority: z.enum(taskPriorities).default('normal'),
  localDue: localDue.default(null), idempotencyKey: key,
}).strict();
// Do not partial() the create schema: Zod defaults would silently reset omitted
// description/priority/deadline on a title-only patch.
export const taskUpdateSchema = z.object({
  title: text(200).min(1).optional(), description: text(5000).optional(),
  assignedMembershipId: z.uuid().optional(), priority: z.enum(taskPriorities).optional(),
  localDue: localDue.optional(), expectedVersion, idempotencyKey: key,
}).strict().refine(value => ['title', 'description', 'assignedMembershipId', 'priority', 'localDue']
  .some(field => Object.prototype.hasOwnProperty.call(value, field)), 'Provide an actual task edit');
export const taskProgressSchema = z.object({
  status: z.enum(['todo', 'in_progress', 'completed']), expectedVersion, idempotencyKey: key,
}).strict();
export const taskLifecycleSchema = z.object({
  expectedVersion, idempotencyKey: key, reason: text(500).min(1),
}).strict();
export const taskPageSchema = z.object({
  page: z.coerce.number().int().min(1).max(200).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
export const taskListSchema = taskPageSchema.extend({
  scope: z.enum(['own', 'team']).default('own'), search: text(200).default(''),
  status: z.enum(taskStatuses).optional(), priority: z.enum(taskPriorities).optional(),
  assignee: z.uuid().optional(), attention: z.enum(['today', 'overdue', 'upcoming']).optional(),
  sort: z.enum(['due', 'recent']).default('due'),
}).strict().refine(value => value.scope === 'team' || value.assignee === undefined,
  'Own work cannot select another assignee');
export const taskAssigneeSchema = taskPageSchema.extend({ search: text(200).default('') }).strict();

export function taskDueInstant(local: string | null, timezone: string): Date | null {
  if (local === null) return null;
  try { return branchLocalDateTimeToInstant(local, timezone); }
  catch { throw new AppError('Task deadline is invalid, ambiguous or nonexistent in the branch timezone', 400); }
}

// No terminal state is edited through a progress command. Reopen/cancel are separate.
export function assertTaskProgress(from: TaskStatus, to: TaskStatus): void {
  if (!((from === 'todo' && (to === 'in_progress' || to === 'completed')) ||
    (from === 'in_progress' && (to === 'todo' || to === 'completed')))) {
    throw new AppError('Task cannot make this progress transition; reload current facts', 409);
  }
}

export const literalTaskSearch = (value: string): string => value.replace(/[\\%_]/g, '\\$&');
