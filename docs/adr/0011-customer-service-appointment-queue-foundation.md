# ADR 0011: Customer, Service, Appointment, and Queue PostgreSQL Foundation

- Status: Accepted
- Date: 2026-09-17
- Scope: V2-06B1 relational foundation and migration readiness

## Context

ADR 0010 selected Customer, Service, Appointment, and Queue as one operational vertical. The live Queue is still a prototype Mongo document: it has organization scope but no branch, embeds customer and service strings, generates a string token with `countDocuments() + 1`, mutates status without history or a transition matrix, and has no safe concurrency boundary. There is no legacy Appointment source.

Cutting routes over while inventing relational identity and migration policy would combine too many irreversible decisions. V2-06B is therefore split. B1 establishes and proves the target schema, repositories, transformations, reconciliation, and preflight. B2 will switch the complete vertical and its clients. Mongo remains the only Queue runtime authority throughout B1.

## Decision

### Relational model and code boundary

Forward-only migration `004_operational_queue_foundation.sql` adds the operational tables. Domain code is grouped under `src/domains/customers`, `services`, `appointments`, and `queue`; shared connection/migration infrastructure stays under `src/postgres`. Existing identity, authorization, membership, branch, and commercial models are reused rather than wrapped in a generic repository framework.

Composite foreign keys carry `organization_id` through customer home branches, service availability, provider assignments, appointments, sessions, and tokens. Provider assignments reference both an existing membership-branch assignment and an active service-branch availability row. A database trigger refuses activation unless the membership, branch, service, and availability are active. Canonical identifiers are UUIDs. Legacy ObjectIds appear only in format-checked migration provenance.

### Branch timezone policy

`branches.timezone` is a nullable IANA name during B1 so an unknown production value is never guessed. PostgreSQL validates non-null names against `pg_timezone_names`; the application also validates through `Intl.DateTimeFormat`. The reviewed migration mapping may populate a branch timezone. B2 preflight fails while any active branch has no valid value.

Appointment input is a branch-local wall-clock value, converted to an instant and stored as `TIMESTAMPTZ`. Display conversion always names the branch timezone. Invalid calendar values, DST gaps, and DST-ambiguous local times are rejected; callers must submit an unambiguous time. Server-local time is never authoritative. Kerala fixtures explicitly use `Asia/Kolkata`, but no global India default exists.

### Customer policy

`customers` is organization-owned and contains name, normalized/display phone, optional home branch and notes, status, explicit same-organization merge target, and timestamps. Normalized phone is indexed but not unique. Local-number normalization requires a reviewed calling code; it is never inferred globally. Phone equality alone neither merges nor identifies a customer.

`customer_source_links` records every contributing Queue or Ledger document, target customer UUID, organization, and a SHA-256 source fingerprint. Exact normalized name-and-phone candidates may group deterministically. A phone associated with different normalized names is ambiguous until every source has an explicit reviewed customer-group decision. Explicit merges lock both same-organization customers and move provenance in one transaction; cross-organization and self-merges fail.

### Service and provider policy

`services` is organization-owned with a normalized organization-unique name, positive duration, optional exact `BIGINT` minor-unit price and ISO currency, active state, and timestamps. `service_branch_availability` links the catalogue to branches without making the service branch-owned. `provider_service_assignments` uses existing memberships and requires membership branch access plus matching organization/service/branch relationships. No provider identity, schedule, payroll, or performance model is introduced.

Legacy `serviceType` is normalized deterministically. Empty labels are rejected. Materially different labels that normalize alike block apply unless all affected raw labels have reviewed canonical resolutions. `service_source_links` retains each Queue document's original label and fingerprint.

### Appointment policy

`appointments` holds organization, branch, customer, service, optional assigned provider membership, `TIMESTAMPTZ` interval, current status, notes, optimistic version, optional organization-scoped idempotency key, creator, and timestamps. Foreign keys require branch availability and, when assigned, a matching provider/service/branch assignment. End must be later than start.

Active provider states are `scheduled`, `confirmed`, and `checked_in`. A GiST exclusion constraint over provider membership and the half-open `[starts_at, ends_at)` range prevents overlap under concurrency. `completed`, `cancelled`, and `no_show` do not block a future interval.

The transition matrix is:

- `scheduled` to `confirmed`, `checked_in`, `cancelled`, or `no_show`;
- `confirmed` to `checked_in`, `cancelled`, or `no_show`;
- `checked_in` to `completed` or `cancelled`;
- terminal states have no outgoing transition.

Each transition locks the appointment, checks the expected version, updates the projection, and appends an `appointment_status_events` row in one transaction. Database triggers reject update/delete of history. Appointments start empty; Queue rows are never reinterpreted as appointments.

### Queue session, numbering, and history policy

`queue_sessions` is unique by organization, branch, local business date, and non-null lane key (`default` unless reviewed otherwise). Opening the same key reuses its session. A new local business date creates a fresh session whose `next_token_number` starts at one. Closed sessions carry `closed_at` and reject future allocations; reopening is not implicit.

`queue_tokens` contains canonical customer/service relationships, optional appointment/provider, current status/version, source provenance, and a number unique within the session. Future allocation begins a PostgreSQL transaction, locks the open session row, increments its counter, inserts the token, and appends its initial status event before commit. It does not count rows, calculate `MAX`, use application memory, or require Redis. Organization-scoped idempotency keys make a retry return the original compatible operation.

Queue transitions are `waiting -> serving|cancelled` and `serving -> completed|cancelled`; completed and cancelled are terminal. `queue_status_events` is append-only and records version, from/to state, actor/source, reason, and time. A migrated initial event may name `migration` with no invented human actor. Future user operations require an actor.

Appointment check-in locks the appointment, verifies organization/branch and a check-in-eligible state, reuses any existing appointment token, locks/allocates the session counter, inserts the Queue token/event, and updates the appointment/event in one transaction. The unique appointment-token index and idempotency key make it exactly once.

### Migration, reconciliation, and preflight

The Queue migration commands require an uncommitted, reviewed JSON mapping. It identifies the legacy organization, canonical organization/branch, timezone, reviewed local-phone calling code, default service duration, customer/service resolutions, and an explicit created-at/local-date session policy or per-document session overrides.

Dry-run is the default and has no target database handle, so it cannot mutate operational tables. It reports source counts, candidate counts, quarantined rows, and all unresolved organization, customer, service, timezone, status, token-label, or session-number issues. Apply requires `--apply`, refuses any issue, validates the mapping against PostgreSQL, and performs all writes in one transaction. Deterministic UUIDs, legacy-ID uniqueness, fingerprints, and upserts make an unchanged source idempotent and reject post-review source drift.

Verification rebuilds the source plan and compares counts, mappings, organization/branch/session/customer/service relationships, token numbers, statuses, timestamps, legacy IDs, fingerprints, and uniqueness. A mismatch exits non-zero. The B2 preflight is read-only: it requires current migrations, valid active-branch timezones, clean verification, installed concurrency constraints, no collision/unmapped issue, and the source-controlled `operationalAuthority` value `mongodb`.

### Runtime authority boundary

Migration 004 and the future repositories are inactive infrastructure in B1. Existing `POST /api/queue`, `GET /api/queue`, `PATCH /api/queue/:id/status`, Dashboard counts, and the current Queue frontend continue to use Mongo through the operational identity bridge. There is no Queue dual-write, PostgreSQL fallback, new Socket.IO emission, route registration, or frontend runtime change.

B2 may switch authority only after a restore-tested backup, reviewed mapping, successful apply, zero-difference verification, passing preflight and concurrency/security suites, and an accepted runtime/frontend/realtime cutover diff. The complete Customer/Service/Appointment/Queue vertical then switches to PostgreSQL together. Realtime events may be emitted only after commit with PII-minimized branch-scoped DTOs. Rollback before accepting PostgreSQL writes may return to Mongo; after accepted PostgreSQL writes, rollback is restore/reconciliation work and must never be an automatic fallback or dual-write.

## Consequences

- B1 can prove relational integrity and migration readiness without risking current Queue traffic.
- Nullable branch timezone is an explicit readiness debt, not a guessed default.
- Historical duplicate token labels require reviewed distinct sessions; fake global uniqueness is prohibited.
- Customer and service derivation remains explainable through immutable source links and fingerprints.
- PostgreSQL constraints, locks, and append-only histories carry concurrency/security invariants even before routes activate them.
- B2 still owns production API contracts, selected-branch authorization, frontend pagination/counts, Dashboard changes, realtime activation, runtime searches, and removal of Mongo Queue authority.

## Alternatives rejected

### Cut Queue over in B1

Rejected because runtime, frontend, realtime, and recovery behavior should switch only after the complete vertical and transformed data pass an independent readiness gate.

### Dual-write during readiness

Rejected because it creates conflict resolution and two authorities without solving customer/service ambiguity.

### Infer branch, timezone, customer, or historical session

Rejected because the legacy rows do not contain enough evidence. A blocked, reviewed mapping is safer than a plausible but false relationship.

### Keep `countDocuments() + 1`

Rejected because concurrent requests can receive the same token and historical counts do not represent a business-date session.
