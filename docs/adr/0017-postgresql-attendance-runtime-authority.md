# ADR 0017: PostgreSQL Attendance Runtime Authority

- Status: Accepted
- Date: 2026-09-28
- Scope: V2-06C Attendance migration and runtime cutover

## Context

The legacy Attendance document stores an organization, a Mongo user, a UTC-normalized date, and a status. It has no branch, canonical membership, check-in/out facts, correction history, optimistic version, or retry key. Runtime reads were organization-wide Mongo queries and Dashboard "today" depended on server time. The UI used local mock rows.

V2-06A selected a branch-scoped relational target. V2-06C must preserve historical date/status facts, require reviewed branch resolution, and make PostgreSQL the only ordinary Attendance authority without pretending MongoDB is retired for other domains.

## Decision

### Canonical subject and scope

The Attendance subject is the existing PostgreSQL organization membership. One current projection exists per organization, membership, and branch-local business date; the row also owns one branch and cannot move between branches. Composite foreign keys require the membership and marking/correction actors to belong to that organization and branch. New manual marks require an active subject and active actor. Historical rows remain visible in their branch after the subject becomes inactive.

Every runtime endpoint begins with the live PostgreSQL tenant and selected-branch context, the `attendance` entitlement, and either `attendance.read` or `attendance.manage`. Missing branch context is an error, never an organization-wide query. UUIDs are identifiers, not authorization.

### Time, facts, and corrections

The selected branch's reviewed IANA timezone defines the business date. Optional local check-in/out input is converted to `TIMESTAMPTZ`; supplied instants must map back to the record's branch-local date. Absent rows cannot have times and checkout must be later than check-in. The system does not infer shifts, hours, lateness, payroll, or half-day from duration.

An initial mark creates version 1 and may use an organization-scoped idempotency key. Advisory transaction locking plus the database uniqueness constraint makes retries/concurrency safe. A factual change requires the exact current version, an active authorized actor, and a meaningful reason. The projection increments once and a trigger appends immutable before/after facts to `attendance_record_changes`. Deletes and blind last-write-wins updates are prohibited.

### Legacy transform and cutover

Migration 009 adds the records/history schema and extends the existing operational authority latch with the `attendance` vertical. The Mongo migration is dry-run by default. It resolves legacy organization and user into one canonical membership, then accepts an automatic branch only when exactly one active assigned branch with a reviewed timezone exists. Ambiguity requires a reviewed per-document mapping; missing/invalid identity, branch, date, status, duplicates, and target conflicts are blockers.

Imported rows preserve date and status, use `source = import`, retain Mongo document provenance and a source fingerprint, and have null times/actor/reason. Apply is transactional and repeat-safe. Verification compares counts, dates, statuses, organization/membership/branch mappings, provenance, and target uniqueness. Activation is explicit only after the read-only preflight passes and writes the durable `v2-06c-cutover` latch. After activation, ordinary shadow apply refuses unless an explicitly reviewed recovery flag is supplied.

### Runtime authority

`runtimePersistence.attendanceAuthority` is the source-controlled constant `postgresql`. Attendance GET, POST, history, roster, and Dashboard present-today count use only the PostgreSQL repository with canonical UUID context. There is no Mongo read fallback, write-through, dual-write, or automatic repair. The Mongoose model and compatibility adapter remain reachable only from migration/recovery tooling and compatibility tests until the later Mongo-retirement milestone.

The frontend consumes the complete server roster for the selected branch/date, including marked and unmarked active memberships, shows factual server summaries, and requires a reason/current version for corrections. HTTP refetch is sufficient; Attendance realtime is not introduced.

## Consequences

- Attendance now has a single transactional authority, branch isolation, deterministic local dates, retry safety, and immutable correction history.
- Dashboard and daily Attendance use the same branch-local date rule.
- Legacy documents without an unambiguous reviewed branch block activation rather than being silently assigned to Main or the first branch.
- MongoDB remains required for Inventory, Customer Dues/Ledger legacy, corporate operational data where applicable, ActivityLog/security audit, and other deferred legacy domains.
- This decision does not add payroll, shifts, overtime, performance scoring, advanced reporting, or Attendance Socket.IO events.

## Alternatives rejected

### Organization-wide Attendance

Rejected because it leaks branch operational state and cannot define the correct business date for organizations with multiple timezones.

### Choosing Main or the first branch during migration

Rejected because the legacy document contains no branch fact; convenience is not evidence.

### Mongo fallback or dual-write

Rejected because post-cutover PostgreSQL corrections and native marks cannot be atomically mirrored and Mongo would become stale by design.

### In-place correction without history

Rejected because Attendance is a factual operational record and needs actor, reason, before/after evidence, and deterministic concurrency behavior.
