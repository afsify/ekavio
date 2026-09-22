# ADR 0012: Customer, Service, Appointment, and Queue Runtime Authority

- Status: Accepted
- Date: 2026-09-21
- Scope: V2-06B2 operational vertical runtime cutover

## Context

ADR 0011 established the inactive PostgreSQL schema, repositories, migration transformation, reconciliation, and preflight for the Customer/Service/Appointment/Queue vertical. The prior Mongo Queue runtime embedded customer and service strings, used organization-only scope, allocated token labels with `countDocuments() + 1`, and had no concurrency-safe session counter, versioned transition, or appointment check-in transaction.

The B1 local shadow completed with two accepted historical Queue rows, no rejected/quarantined rows, reviewed branch/timezone policy, and clean verification. B2 must activate the whole vertical together so canonical Customer and Service UUIDs cannot diverge from Queue or Appointment authority.

## Decision

### PostgreSQL authority

PostgreSQL is the sole runtime authority for Customers, Services and branch availability, provider/service assignments, Appointments and status history, Queue sessions, Queue tokens, and Queue status history. `runtimePersistence.operationalAuthority` is the source-controlled constant `postgresql`; it is not selectable by environment, request, tenant, or failure state.

MongoDB remains authoritative for Inventory, Ledger/Customer Dues until V2-06D, Attendance records until V2-06C, corporate operational data where applicable, ActivityLog/security audit, and remaining legacy domains. ActivityLog writes use the validated legacy identity bridge but do not make Mongo operational authority.

There is no Queue dual-write, Mongo Queue read-through, fallback, or automatic repair. Executable Mongo Queue access remains only in migration/reconciliation/recovery tooling and tests that exercise that compatibility boundary.

### Tenant, branch, permission, and entitlement boundary

Every endpoint starts from the live PostgreSQL session/membership authorization context. Customers are organization-owned. Queue and Appointments always require the selected authorized branch. Service branch availability and provider membership/branch/service relationships are enforced by composite foreign keys and triggers; a client UUID never grants authority.

Customer, Service, Appointment, and Queue endpoints all require the PostgreSQL Queue module entitlement. Read endpoints require `queue.read`; mutations require `queue.manage`. Permission and entitlement checks remain distinct, and frontend hiding is only convenience.

### Customer and Service contracts

Runtime Customers use canonical UUIDs. Names and optional phones are normalized, the phone index supports search, and equal phones remain separate records unless a deliberate merge is performed outside this minimum workflow. Queue DTOs never expose Customer notes.

Runtime Services are organization-owned and expose selected-branch availability, active state, duration, and optional exact `BIGINT` minor-unit price with currency. Providers are existing active PostgreSQL memberships assigned to the same branch and service. Queue/Appointment writes reject unavailable services and unauthorized provider relationships at the database boundary.

### Branch time and appointments

Branch IANA timezone is authoritative. Appointment local wall-clock input is converted to a `TIMESTAMPTZ` instant, with DST gaps and ambiguous times rejected. Date lists convert branch-local midnight boundaries rather than using server-local time. Provider overlap remains database-enforced with the B1 exclusion constraint. Status changes use the B1 matrix, optimistic versions, and append-only events.

Appointment check-in locks the appointment, validates the organization/branch and eligible status, allocates through the current Queue session, creates the token and both histories, and changes Appointment status in one transaction. A unique appointment-token constraint plus idempotent lookup makes retries and concurrent check-ins return one effective token.

### Queue sessions, numbering, and DTO

The ordinary lane is `default`. The current business date is derived from the branch timezone. Opening that session is race-safe and idempotent. Token allocation locks the session row and increments `next_token_number` transactionally. Runtime code never uses document counts, `MAX(token_number)`, or memory counters.

Queue reads are branch-scoped, paginated, and return a stable DTO containing UUID, display token number, status, Customer and Service summaries, optional Provider summary, optional Appointment link, created timestamp, and version. Migration provenance and Customer notes are not exposed. Status mutation requires the token UUID, active organization/branch, expected version, and an allowed transition; stale versions return a stable conflict.

### Realtime and Dashboard

Only `queue.token.created` and `queue.token.status_changed` are emitted. Emission occurs after the PostgreSQL transaction resolves, targets the already-authorized branch room, and includes token/service/appointment identifiers, number, status, and version—never phone, notes, credentials, or request bodies. Reconnect and context switch refetch authoritative queries. Legacy `queue_updated` behavior is removed.

Dashboard Queue counts call the PostgreSQL repository with the active organization and branch. Inventory, Attendance, and Ledger Dashboard inputs retain their existing Mongo authority.

### Migration safety latch and rollback limit

Migration 005 introduces a durable authority latch. Activation is an explicit command that re-runs clean verification/preflight before inserting the latch. After activation, normal Mongo-to-PostgreSQL shadow `--apply` refuses before writes. Dry-run and verification remain usable for comparison. The explicit recovery flag requires `--apply` and is only for a separately reviewed restoration/reconciliation procedure.

Before any PostgreSQL-native write, rollback could restore the pre-cutover route only after proving Mongo current. After an accepted PostgreSQL-native write, Mongo is stale by design; rollback requires freezing writes and restoring/reconciling PostgreSQL. Automatic fallback or dual-write is prohibited.

## Consequences

- The vertical now has one transactional authority and canonical relational identity.
- Queue numbering, transitions, appointment overlap, and check-in correctness survive concurrency.
- Backend isolation does not depend on frontend filtering.
- Overall readiness still requires both databases because accepted non-cut-over domains and audit remain Mongo-backed.
- Legacy Mongo Queue data and its model remain for reviewed migration/recovery compatibility, not production runtime.
- Attendance migration is explicitly outside this milestone; the next milestone is V2-06B3 Deployment & Staging Readiness.

## Alternatives rejected

### Mongo fallback on PostgreSQL failure

Rejected because Mongo lacks post-cutover writes and would return stale or structurally incompatible state.

### Queue dual-write

Rejected because cross-database atomicity and conflict ownership are undefined.

### Free-form Customer/Service identity translation

Rejected because embedded strings recreate the ambiguity the relational cutover resolves. The frontend must select/create canonical Customer and select a branch-available Service before token creation.

### Server-local business date

Rejected because deployments and branches may use different timezones; only reviewed branch IANA timezone defines the Queue business date.
