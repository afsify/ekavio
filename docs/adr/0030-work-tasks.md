# ADR 0030 — Independent branch-scoped assigned Tasks

2026-10-15. Status: approved for V2-12C Batch 1 local backend implementation;
local acceptance is recorded separately. No hosted rollout/publication approved.

## Decision

General Tasks is a separate PostgreSQL aggregate, not CRM Lead follow-ups, HR My
Work leave/schedules, Attendance or Sales. Additive migration 021 follows the
unchanged 001–020 chain. Tasks is optional/unpublished/unpriced: no plan changes,
automatic grants, subscription purchases or hosted activation.

Four independent permissions: tasks.read_own, tasks.manage_own (progress only),
tasks.read (selected-branch team), tasks.manage (team commands). Built-in staff
receive the own pair; owner/admin/manager receive all four. HR gets none by
analogy. Custom roles replace built-ins and retain grant-subset checks. Every
read/write independently requires live membership, assigned active branch and
Tasks entitlement. Operator/creator identity is not a bypass.

One eligible same-branch assignee is required, with own read/progress capability.
Branch identity is immutable; deactivation/removal retains facts/history while
denying the former staff context. Managers explicitly reassign or cancel.

| From | To | Authority |
| --- | --- | --- |
| todo | in_progress/completed | Current assignee with own pair, or manager with team pair |
| in_progress | todo/completed | Same |
| todo/in_progress | cancelled | Manager, explicit reasoned cancellation |
| completed | todo | Manager, explicit reasoned reopening |
| cancelled | none | Terminal retained fact |

Open details/deadline/assignee changes are manager-only; progress commands cannot
edit them. Completed records freeze until reopen; cancelled records never reopen.
There is no deletion endpoint or automatic cleanup. Prior completion remains in
history after reopen.

`work_tasks` owns facts/version/actors/UTC deadline, fixed priority and lifecycle
timestamps. `work_task_events` is trigger-generated append-only before/after
state/assignment/deadline/priority metadata, not copied descriptions. Composite
tenant/branch/membership FKs protect identities. `work_task_commands` retains
minimal durable command results/fingerprints; identical retries replay, different
payload/actor/scope conflicts. Authority is rechecked before replay. One fact
version, event and command result must commit together, enforced by a deferred
constraint trigger, unique keys and FKs.

Commands use the existing pg/ALS atomic client, organization lock, live grants,
record lock and expectedVersion. Existing administration mutations share the org
lock. Existing commercial writers do not universally do so: Task-specific shared
locks protect current module/subscription/override/plan/add-on inputs and relevant
membership/role/assignment rows before rechecking. New org-scoped grant inserts
also need FK key-share on the locked organization. Other modules' business rules
are unchanged. Lock/statement failures are bounded conflicts, not automatic retry
or authority repair. Reads recheck within a consistent read-only snapshot.

Strict bounded DTOs/query limits and parameterized literal search apply. Own
filters cannot select another staff member. Branch-local input uses the existing
IANA conversion and rejects DST gaps/folds; UTC is stored. Overdue is active
due_at < serverNow; Today is a half-open branch day (can overlap Overdue), Upcoming
begins tomorrow. No scheduler writes an overdue state. Histories/eligible rosters
are bounded and permission-scoped, without staff contact/HR/private data.

## Consequences and boundaries

No new driver, ORM, auth system, dependency, notification, worker or provider.
Tasks API is backend-only in this batch. Frontend/My Tasks/Team Tasks and optional
Dashboard projections need separate approval. No new Forms Studio entity, Kanban,
calendar, recurring work, messaging, AI, attachments or imports.

Extend count-only recovery semantics through 021, including populated Task
projection/history/command invariants and corrupt/missing-guard cases. A synthetic
PostgreSQL 17 custom dump/restore is local proof only; encryption contracts and
hosted PostgreSQL 18 restoration remain separate evidence. Roll back application
entry points if needed; retain additive data/history instead of dropping tables.
Retention and bounded organization-level serialization have storage/contention
costs; no unmeasured scaling or zero-cost guarantee.

**NO-GO FOR REAL CUSTOMER DATA. Render Free remains staging-only.** No readiness
register changes, hosted migration, commit, push, tag or deployment in this batch.
