# V2-06C Attendance PostgreSQL Cutover Review

- Date: 2026-09-29
- Starting commit: `ffba83504ac0faf80520fd5d442417f368c040dd`
- Starting exact CI: GitHub Actions run `36421082965` (success)
- Checkpoint: `pre-v2-06c-attendance-postgres-cutover`
- Runtime authority: PostgreSQL
- Scope: Attendance records, daily roster, corrections/history, Dashboard count, legacy transform, and explicit authority activation

## Baseline and legacy findings

The accepted B5C tag resolved to the starting commit and the synchronized `main` baseline was clean before the checkpoint. The legacy Mongoose Attendance document contains only organization (`tenantId`), user, UTC-normalized date, and `present`/`absent`/`half-day` status. It does not contain branch, canonical membership, check-in/out facts, actor, correction reason, version, or history. The prior runtime translated PostgreSQL identity back to Mongo IDs, listed organization-wide records, and returned placeholder identity fields. Dashboard used a Mongo count with server-local day boundaries. The prior frontend was local mock state.

This made the migration a reviewed transform rather than a direct copy. No source fact can prove a branch when a membership has multiple plausible assignments.

## Relational design

Forward-only migration `009_attendance_runtime_authority.sql` works after accepted migrations 001 through 008 and also as part of a clean 001-through-009 migration. It does not change the accepted migration files.

`attendance_records` stores canonical organization, branch, and membership UUIDs; branch-local `DATE`; optional instant check-in/out; explicit status and source; creation/correction actors; correction reason; optimistic version; optional idempotency key; legacy document provenance/fingerprint; and timestamps. PostgreSQL enforces:

- one row per organization/membership/business date;
- immutable record identity, branch ownership, source, and provenance;
- branch/organization ownership and membership/actor branch assignment through composite foreign keys;
- active branch plus reviewed IANA timezone;
- active subject/actor for new manual marks;
- absent-without-times and ordered times on the same branch-local business date;
- import provenance and manual/kiosk actor rules.

`attendance_record_changes` is append-only. Every factual correction records the prior/new status and times, actor, reason, resulting version, and occurrence time. The projection cannot be deleted. Its trigger requires a factual change, a one-step version increment, and an active branch-assigned correction actor before appending history.

The canonical subject remains the existing organization membership. No Attendance-specific user/staff identity was introduced. Deactivating a membership prevents a new manual mark but does not delete or hide an existing record from the authorized branch/date roster.

## Runtime behavior

The dedicated PostgreSQL repository uses parameterized SQL and transactions. It obtains an advisory transaction lock for the organization/membership/date key, checks exact idempotent retries, refuses cross-branch ownership changes, requires expected version plus reason for corrections, and returns a deterministic conflict for stale versions. Database uniqueness remains the final concurrency boundary.

The branch's IANA timezone defines default today and converts optional local wall-clock values to `TIMESTAMPTZ`. Every supplied instant must map back to the selected business date. Asia/Kolkata coverage proves a local date that differs from UTC; no server-local timezone participates.

The real API retains `GET /api/attendance` and `POST /api/attendance`, using canonical `membershipId`, `attendanceDate`, status, optional times, idempotency key, expected version, and correction reason. `GET /api/attendance/{recordId}/history` returns branch-scoped immutable correction history. The Attendance entitlement and `attendance.read`/`attendance.manage` permissions remain separate backend gates.

The daily roster joins active memberships assigned to the selected branch with that date's existing records, including historical marked memberships that later became inactive. It exposes only display name, role, membership state, Attendance facts/version, and correction count—no phone. Its summary counts total, present, absent, half-day, and unmarked across the complete server roster.

Dashboard present-today calls the same PostgreSQL Attendance service and branch-local date rule. Inventory is still allowed to use the Mongo operational identity bridge, but Attendance does not. No Attendance realtime events, payroll, shifts, hours-worked inference, overtime, ranking, or advanced reporting were added.

## Legacy migration, reconciliation, and latch

The reviewed `.attendance-mapping.json` format maps a legacy organization to its canonical organization and may resolve an individual legacy Attendance document to a branch. The dry-run source resolves the legacy user into the canonical user/membership. Exactly one active assigned branch with a timezone is accepted automatically. Missing identity, no branch, multiple branches without review, an invalid reviewed branch, invalid identifiers/date/status/timestamps, duplicate subject/day facts, target conflicts, or unused reviewed overrides are blockers. It never chooses Main or the first branch.

Imported rows preserve legacy date/status, use `source = import`, retain source ID/fingerprint/timestamps, and use null times and actor/reason. Apply is transactional and identical repeats are safe. Reconciliation compares every planned source/target fact plus source/target counts, status/organization counts, date coverage, membership mappings, and uniqueness.

The preflight checks migration 009, active-branch timezones, clean reconciliation, zero blockers, uniqueness, canonical assignments, the Attendance module catalogue, repository health, source-controlled PostgreSQL authority, and the durable latch. Migration 009 generalizes the accepted operational latch to include `attendance`; activation records `v2-06c-cutover` only through the explicit activation command. Ordinary shadow apply refuses after activation unless the explicit reviewed recovery mode is supplied.

## Frontend result

The mock roster and local-only success path are removed. The mobile-first page loads the selected branch/date from the real API, shows timezone and factual summary/roster state, and includes loading, empty, error, retry, and read-only modes. Managers can mark Present, Absent, or Half-day with optional branch-local times. Changing an existing row opens a correction flow that requires a reason and sends the current version; a 409 informs the user, closes stale input, and refetches authority. Successful writes invalidate Attendance and Dashboard queries.

## Authority proof and retained Mongo scope

`runtimePersistence.attendanceAuthority` is a source-controlled PostgreSQL constant and ordinary runtime composes only `PostgresAttendanceRepository`. Attendance controllers, service, repository, and Dashboard contain no Mongoose Attendance model, Mongo storage adapter, legacy organization/user ID mapping, fallback, dual-write, or automatic repair. Legacy compatibility was renamed and isolated for explicit migration/recovery and accepted compatibility tests.

MongoDB is not retired. Inventory, Ledger/Customer Dues legacy, ParentOrganization/corporate operational data where applicable, ActivityLog/security audit, and remaining deferred domains still require it. Backup/restore proof remains open before real pilot or customer data, and hosted staging remains development/testing only.

## Acceptance evidence

The final closeout validates backend lint, typecheck, unit tests, build, all accepted PostgreSQL/integration suites, the three dedicated Attendance suites, frontend lint/typecheck/build, Compose configuration/build/health, liveness/readiness and frontend routes, runtime logs, source-authority searches, security/artifact review, and the complete diff. The dedicated suites cover clean and accepted upgrade migrations, dry-run/apply/reconciliation, ambiguity/blockers, provenance/no fabricated times, schema constraints, branch/tenant isolation, active/inactive membership behavior, retry and concurrency, correction history/version conflict, timezone boundaries, Dashboard parity, explicit latch activation, and post-activation migration refusal.

The local preserved-volume cutover found zero legacy Mongo Attendance documents and zero blockers. Migration 009 applied, empty apply/reconciliation succeeded, the pre-activation preflight failed only on the intentionally pending latch, activation dry-run and explicit activation succeeded, post-activation preflight/status reported PostgreSQL authority, and ordinary follow-up apply was refused. The final dedicated outputs were Attendance runtime 9/9, migration/reconciliation 6/6, and cutover controls 6/6; backend unit/contract tests passed 127/127. All accepted integration suites passed. All four Compose services were healthy, the four required HTTP targets returned 200, and backend/frontend logs contained no runtime error.

Hosted staging PostgreSQL migration 009 was explicitly applied on 2026-09-29. The required Mongo Attendance source scan could not complete: Node's SRV lookup was refused locally, and a credentials-safe direct-host retry confirmed that the current machine IP is not allowed by the Atlas network-access list. No hosted Mongo data was read or written, no mapping decision was guessed, and the hosted Attendance authority latch was not activated. Hosted reconciliation, preflight, and explicit activation remain pending from a network-authorized environment; this does not affect the proven local/source-controlled cutover and is not pilot-readiness evidence.

Operational commands and the recovery boundary are recorded in [the V2-06C runbook](../runbooks/V2-06C_ATTENDANCE_CUTOVER.md); the durable decision is [ADR 0017](../adr/0017-postgresql-attendance-runtime-authority.md).
