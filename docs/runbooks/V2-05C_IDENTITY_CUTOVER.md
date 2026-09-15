# V2-05C PostgreSQL Identity/Auth Runtime Cutover

## Status

V2-05C was executed and validated on 2026-09-15 against the repository's local/development Docker Compose databases. This record is evidence for that local cutover; it is not authorization to apply the same mutation to another environment.

The runtime composition after cutover is:

- PostgreSQL: users/identity, organizations, branches, memberships, branch assignments, login, refresh sessions, authorization/request context, staff, registration, profile/password identity, and Attendance identity resolution.
- MongoDB: Queue, Inventory, Ledger, Attendance records, Plan/AddOn/Subscription/Entitlement state, ParentOrganization/corporate compatibility, security-audit compatibility, analytics, and remaining operational domains.

There is no shared-core identity dual write, runtime database selector, or automatic PostgreSQL-to-Mongo identity fallback.

## Local execution record

### Safety and backups

- Environment: `local-development` Docker Compose; database services are not published to the host.
- Source counts before apply: zero users, organizations, branches, memberships, and sessions in both shared-core stores; Mongo operational/commercial collections were also empty.
- Backup directory: `backups/v2-05c-local-20260915T052007Z` (ignored by Git through `backups/`).
- Mongo archive: `mongo-before-v2-05c.archive.gz`, 1,451 bytes, SHA-256 `a0d6be0a4a828809ec5f444c3e1d96b4078cfed95d335915ffee82a5f993d635`.
- PostgreSQL archive: `postgres-before-v2-05c.dump`, 51,626 bytes, SHA-256 `4058313349a648b1bedfb4f7af236559909e7122ae197fc5524dfa4a63e0344c`.
- Mongo restore validation: `mongorestore --dryRun --gzip` recognized 16 expected collections and completed with zero failures.
- PostgreSQL restore validation: `pg_restore --list` successfully listed 119 TOC entries.

No credential, password hash, JWT, or refresh-token hash was printed or copied.

### Migration and cutover gates

The following sequence completed successfully against the confirmed local databases:

1. `db:migrate` and `db:migrate:status`: migrations `001_shared_core.sql` and `002_auth_session_compatibility.sql` applied.
2. `postgres:shadow`: dry-run reported zero issues across all 18 entity/relationship groups.
3. `postgres:shadow -- --apply`: local apply completed with zero issues and zero session rows copied.
4. `postgres:verify`: `matched: true`, zero mismatches.
5. `postgres:cutover:preflight`: `ready: true`, zero blockers.
6. `sessions:mongo:revoke`: dry-run reported zero existing/revocable sessions.
7. `sessions:mongo:revoke -- --apply`: local apply completed; the post-apply dry-run remained at zero revocable sessions.

The databases were empty, so acceptance did not rely on those zero counts. The disposable V2-05C integration suite created non-empty two-tenant PostgreSQL identity fixtures and Mongo operational/commercial fixtures, then proved authority, isolation, and cleanup behavior.

### Test and runtime evidence

- Backend lint, TypeScript check, and build passed.
- Backend unit/security regression suite passed 77/77.
- PostgreSQL integration/preflight suite passed 16/16.
- Mongo/PostgreSQL parity suite passed 7/7.
- V2-05C cutover integration suite passed 15/15, including PostgreSQL-only login/session/staff/password/registration, exactly-one-winner refresh rotation, replay/revocation rejection, legacy Mongo-session rejection, organization/branch isolation, Socket.IO authorization, operational mapping, Attendance split, commercial entitlements, security-audit mapping, and no Mongo identity mirrors.
- Frontend install, lint, TypeScript check, and production build passed.
- `docker compose config` passed.
- Mongo, PostgreSQL, backend, and frontend were all healthy after `docker compose up --build -d`.
- `/health/live`, `/health/ready`, `/`, and `/login` each returned HTTP 200.
- Focused runtime logs contained no UUID/ObjectId conversion, PostgreSQL session, tenant mapping, transaction, identity-fallback, or commercial-mapping anomaly.
- A disposable live API smoke returned HTTP 201 for registration and HTTP 200 for login; returned organization/branch/user IDs were UUIDs, access and refresh credentials were issued, and Mongo had zero User/Organization/Membership mirrors. The uniquely identified PostgreSQL fixture was removed afterward.

The live smoke exposed an Express 5 incompatibility in `express-mongo-sanitize` 2.x: its middleware assigns the getter-only `request.query`. The application now sanitizes inputs in place and shadows the query getter with the sanitized value. A regression test covers this path.

## Production or shared-environment procedure

Do not reuse the local apply result as approval for another environment. Before any future environment cutover:

1. Approve a maintenance window, operator, rollback owner, maximum rollback interval, and communication channel.
2. Classify the exact MongoDB/PostgreSQL targets and verify configuration without printing credentials.
3. Freeze registration, staff, profile/password, membership, branch, and session-changing writes.
4. Create fresh protected backups, record sizes and SHA-256 values, and validate Mongo restore dry-run and PostgreSQL archive listing.
5. Run migration status, shadow dry-run, reviewed apply, verification, and cutover preflight; require zero mismatches and zero blockers.
6. Run Mongo-session revocation dry-run. Only then use explicit `--apply`; never copy Mongo refresh hashes to PostgreSQL.
7. Deploy the reviewed source composition with `authority: 'postgresql'` and require users to sign in again.
8. Run non-empty two-tenant auth, staff, branch, attendance, Socket.IO, commercial, and operational-domain smoke tests.
9. Observe authentication failures, PostgreSQL errors/latency, mapping failures, authorization denials, rotation conflicts, connection saturation, and Mongo bridge errors through the approved window.
10. End maintenance only after all acceptance thresholds pass.

## Rollback limitations and procedure

A rollback is considered for systemic login/session failure, tenant or branch isolation failure, missing/incorrect mappings, PostgreSQL transaction failure, unacceptable database availability/latency, or operational/commercial bridge failure. Suspected cross-tenant exposure requires immediate traffic restriction and incident handling.

There is no automatic runtime fallback. After PostgreSQL-only writes begin, reverting the application composition without reconciliation would lose or conflict with identities, memberships, passwords, and session state. A safe rollback must:

1. Re-enter maintenance and stop all shared-core writes.
2. Inventory every PostgreSQL identity, membership, branch, profile/password, and session change since cutover.
3. Reconcile durable PostgreSQL identity changes into a separately reviewed Mongo recovery path; never discard them silently.
4. Deploy an explicitly reviewed composition rollback.
5. Invalidate sessions again and require sign-in so credentials do not cross authority boundaries.
6. Re-run two-tenant authorization, staff, branch, attendance, Socket.IO, commercial, and operational smoke tests.
7. Preserve both database volumes, backups, and logs for reconciliation and incident review.

The safe rollback window ends when post-cutover PostgreSQL writes exceed the approved replay/reconciliation procedure. Recovery then requires a dedicated migration plan.

## Deferred boundaries

- V2-05D: PostgreSQL commercial runtime cutover.
- Later explicit milestones: operational record migration, corporate persistence migration, audit persistence migration, and eventual legacy-ID removal.
- PostgreSQL-created organizations have no Mongo Organization mirror. Corporate child linking for those organizations fails explicitly with HTTP 409 until corporate persistence is migrated; identity dual-write is not an acceptable workaround.
