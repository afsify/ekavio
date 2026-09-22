# V2-06B Customer / Service / Appointment / Queue Cutover Runbook

This runbook records the executed V2-06B1 shadow migration and V2-06B2 PostgreSQL runtime cutover. The authority direction is now PostgreSQL; Mongo Queue data is legacy migration/recovery input only.

## Authority and rollback boundary

PostgreSQL is the sole runtime authority for Customer, Service, Appointment, Queue sessions, Queue tokens, and their status histories. The decision is source-controlled in `runtimePersistence`; there is no request/environment switch, Mongo read fallback, or Queue dual-write. MongoDB remains required for Inventory, Ledger/Customer Dues, Attendance records, corporate operational data where applicable, and ActivityLog/security audit.

After the first accepted PostgreSQL-native write, rollback is not a route switch. Freeze the vertical, preserve both databases, and restore or explicitly reconcile PostgreSQL from an approved recovery plan. Never point runtime at stale Mongo Queue data, enable both writers, or use the recovery flag as routine synchronization.

## Mapping and pre-cutover commands

Mapping files must end in `.operational-queue-mapping.json`, remain Git-ignored, and contain reviewed organization, branch, IANA timezone, calling-code, service-duration, customer/service collision, and historical-session decisions.

```powershell
npm.cmd run build
npm.cmd run db:migrate:status
npm.cmd run operations:queue:shadow -- --mapping C:\secure\tenant.operational-queue-mapping.json
npm.cmd run operations:queue:shadow -- --mapping C:\secure\tenant.operational-queue-mapping.json --apply
npm.cmd run operations:queue:verify -- --mapping C:\secure\tenant.operational-queue-mapping.json
npm.cmd run operations:queue:preflight -- --mapping C:\secure\tenant.operational-queue-mapping.json
```

Dry-run never receives a target database handle. Apply is one fingerprint-protected transaction and refuses unresolved mappings, collisions, invalid branch/timezone context, or duplicate token numbers in a reviewed session.

## Authority activation

Migration `005_operational_runtime_authority.sql` adds the durable authority latch. Activation is dry-run by default and performs the full preflight before writing the latch.

```powershell
npm.cmd run operations:queue:activate -- --mapping C:\secure\tenant.operational-queue-mapping.json
npm.cmd run operations:queue:activate -- --mapping C:\secure\tenant.operational-queue-mapping.json --apply
npm.cmd run operations:queue:preflight -- --mapping C:\secure\tenant.operational-queue-mapping.json
```

After activation, ordinary shadow dry-run and verification remain available. Ordinary `--apply` refuses before writes. `--recover-operational-authority` is accepted only together with `--apply` and is reserved for an explicitly reviewed recovery operation.

## Local execution record — 2026-09-21

- Environment: local Docker Compose development targets only (`mongo` and `postgres` service hosts, `NODE_ENV=development`). The incomplete standalone `backend/.env` was not used.
- PostgreSQL backup: `v2-06b2-precutover-20260921-postgres.dump`, 111,980 bytes, SHA-256 `671365ED406A2B095FCEB302B5573024183F453B94757EF99B7161C85B3C06DC`.
- Mongo backup: `v2-06b2-precutover-20260921-mongo.archive.gz`, 2,337 bytes, SHA-256 `F4BFF91A829A30BCE93BCE2A141408B26291C24DBFEC7A659B20854B60CD6ED9`.
- Restore proof: both backups restored into disposable isolated databases and produced the expected four pre-B2 migrations and empty identity/Queue authority counts; the disposable databases were then removed.
- Reviewed mapping: one local development organization, one branch, `Asia/Kolkata`, `+91`, 30-minute service duration, historical default session closed.
- Shadow report: Mongo Queue 2, Ledger customers 0, accepted 2, rejected 0, quarantined 0, Customer candidates 2, Service candidates 1, Queue sessions 1, issues 0.
- Apply: completed transactionally with the same reviewed counts.
- Verification: clean; 2 Queue source links/tokens, 2 Customer source links, 2 Service source links, zero mismatches.
- Preflight: every migration, timezone, verification, mapping, relation, and concurrency-constraint check passed.
- Migration 005: applied with migrations 001–005 current.
- Activation dry-run and explicit apply: passed; durable PostgreSQL authority latch inserted.
- Post-activation preflight: ready with the source-controlled authority and durable latch aligned.
- Safety proof: ordinary post-activation shadow `--apply` exited non-zero with the expected refusal; dry-run and legacy verification still passed.
- Post-write proof: the real API smoke flow created 2 PostgreSQL-native Queue tokens (one walk-in and one idempotent Appointment check-in) plus 1 Appointment; verification still reported the 2 migrated legacy rows clean with zero mismatches, while Mongo Queue remained at 2 documents.

The backup files and mapping are ignored local artifacts and must never be staged. Verify checksums again before any restore.

## Runtime validation

The accepted runtime boundary provides:

- organization-owned Customer create/list/search/fetch/safe update;
- organization Services with selected-branch availability and membership-backed providers;
- branch-local Appointment create/list/fetch/transition/check-in using `TIMESTAMPTZ`;
- idempotent current-day default Queue sessions derived from the branch IANA timezone;
- row-locked token allocation, branch-scoped pagination, optimistic status transitions, and append-only history;
- post-commit `queue.token.created` and `queue.token.status_changed` events to authorized branch rooms with no phone or notes;
- PostgreSQL Dashboard Queue counts;
- Queue-entitlement plus `queue.read`/`queue.manage` backend gates on every helper route.

Run all backend, B1 migration/concurrency, B2 Express/API, frontend, Compose, HTTP, real-flow, log, source-search, and diff gates before commit. Stop for cross-tenant/branch access, a duplicate appointment check-in token, any Mongo Queue runtime read/write, any fallback, or a failed authority latch.

## Recovery checklist

1. Freeze Customer/Service/Appointment/Queue writes.
2. Record the last committed PostgreSQL write and affected organizations/branches.
3. Preserve PostgreSQL and Mongo backups plus audit/log evidence.
4. Do not run normal shadow apply; its latch refusal is intentional.
5. Prepare and review a one-time reconciliation plan. If it explicitly uses `--recover-operational-authority`, record the approver, source snapshot, mapping checksum, dry-run report, and restore point.
6. Re-run verification, tenant/branch isolation, token concurrency, check-in idempotency, and API gates before reopening.

Never run `docker compose down -v` as part of validation or recovery.

The next milestone is V2-06B3 Deployment & Staging Readiness. This runbook does not start B3 or Attendance migration.
