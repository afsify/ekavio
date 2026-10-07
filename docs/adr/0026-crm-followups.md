# ADR 0026: CRM and manual follow-ups

Status: Accepted for V2-09A product completion (2026-10-07); not pilot approval.

## Decision

Use native PostgreSQL CRM, not a second contact database or Mongo runtime.
Migration 018 is additive; migrations 001–017 remain unchanged. Commercial module
`crm` is labeled **CRM & Follow-ups**, purchasable through `module-crm` but initially
unpublished: no public pricing row, invented price, Pilot Core inclusion, subscription
grant or entitlement override. Publication/manual activation remains operator-only.

`crm.read` and `crm.manage` are independent membership permissions. Owner, admin
and manager receive both; staff and HR receive neither automatically. Custom roles
replace built-in permissions. Routes independently require authentication, commercial
entitlement, permission and an active assigned branch. CRM writes reacquire live
membership/organization authority inside a bounded repeatable-read transaction.

Stages belong to an organization; leads, follow-ups and activity belong to the
selected branch. Composite foreign keys prohibit cross-organization/branch links.
Assignment requires active organization membership assigned to that branch. Retained
inactive assignments stay readable; new/reassigned inactive references are rejected.
Stages have explicit order, optimistic versions and archive status; no hard deletion.
An explicit, empty-pipeline-only action creates New, Contacted, Qualified, Discussion
and Decision. Reads and deployments never auto-create stages or business records.

Leads are potential canonical Customers: name, optional company/contact/source,
stage, assignment, bounded notes, version and active/converted/lost/archived state.
Lost requires a reason; lost/archive/reactivation are explicit retained transitions.
Converted links are permanent. Duplicate phones/emails never imply merging or reuse.
Follow-ups are call, meeting, task, note or other, with pending/completed/cancelled
states. Completed/cancelled records cannot be reopened or rewritten. Branch-local
wall clocks use the existing timezone engine and persist UTC instants. Today means
the branch business date; overdue means pending actions before that date for active
leads. This is manual workflow, not a scheduled reminder service.

## Atomic conversion and retained activity

New conversion reuses canonical Customer validation/normalization and the shared
required-field validator. Existing conversion requires explicit selection of an
active same-organization Customer. Both lock the lead, check its version and live
Customer permissions, and commit Customer/fields/link/activity together. A failed
required field rolls back all writes; concurrent conversion has exactly one winner.
No Sale, Deal, payment, invoice or revenue object is created.

The existing AsyncLocalStorage atomic boundary composes repositories and field writes.
Commercial snapshot readers must not BEGIN/COMMIT/ROLLBACK an independent transaction
when already inside that boundary. Outside it, their existing read-only snapshot
behavior is unchanged. Serialization/version conflicts are HTTP 409, not successes.

CRM activity is closed-action, append-only history with actor/time and scoped related
records; bounded plain notes are rendered as text. Lead/stage/assignment/follow-up,
conversion and lifecycle events remain distinct from metadata-only administrative
audit. No raw contact/notes enter generic notification templates or export audit.

## Shared integrations

Extend the one V2-08D field/layout engine with `lead`: all 13 types, stable archived
options, required validation, versioned sections, typed filters and reportable values.
The previous five entities keep their accepted behavior. Lead filters reuse the
closed Customer typed predicate with an explicit entity, bound values and outer scope.

Four factual CRM widgets require CRM entitlement and crm.read, not reports.read.
CRM Leads and CRM Follow-ups reports independently require reports.read, crm.read
and entitlement; selected-branch filtering and existing 2,000-row/5-MiB formula-safe
CSV budgets apply. Reportable Lead values are batch-loaded, not queried per row.

Transactional assignment attention is generic, authorized, active-recipient-only,
preference-controlled and deduplicated. It links only to `/crm`; there is no scheduler,
marketing delivery, contact data or credential in the payload. Customer detail shows
at most ten converted-origin leads from the selected branch only when authorized.

`/crm` uses the existing protected responsive shell, shared modal/form/phone/theme
controls, guarded mobile More navigation and human stage/staff/Customer labels.
Pipeline cards show factual stage counts, with bounded filtered lead pages rather
than an unbounded Kanban or forecast. Drafts and cache keys are organization/branch
scoped; stale saves require reload and never silently overwrite.

## Validation and historical-source boundary

Disposable PostgreSQL and automated Chromium exercise positive/negative authority,
typed fields, time, rollback/concurrency, retained history, reports and notifications.
Historical legacy fixtures remain pre-CRM. Test-only preparation of empty, named
disposable databases removes the newly seeded CRM catalogue before old source-parity
fixtures; the migration-016 test seeds only its supported four-module catalogue.
Current-catalogue reconciliation still asserts five modules. Production verification,
Mongo retirement and native CRM catalogue are not relaxed or special-cased.

## Consequences and boundaries

No new package, provider, paid service, SMS, WhatsApp, AI, Redis, Kafka, gateway,
marketing email or search SaaS is required. Mongo/Atlas is not CRM authority and is
not written to or deleted. Render Free remains staging-only by operator choice.
Extended schema recovery (013–018), hosted authenticated/deployment and operational
evidence remain separate OPEN gates. **NO-GO FOR REAL CUSTOMER DATA** is unchanged.
Suppliers/Purchasing, HR Plus and final pilot acceptance require separate milestones.
