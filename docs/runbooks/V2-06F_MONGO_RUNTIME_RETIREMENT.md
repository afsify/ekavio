# V2-06F Corporate, Audit, and Mongo Runtime Retirement Runbook

PostgreSQL is the sole normal runtime authority. MongoDB is retained only for explicit legacy migration, reconciliation, archive, recovery, and compatibility testing. This runbook does not authorize Atlas deletion, pilot data, or a Mongo fallback.

## Safety boundary

Use secure environment injection for `DATABASE_URL` and `MONGO_URI`; never print either value. Normal web processes receive no `MONGO_URI`. Run legacy commands only from an access-controlled operator environment or the explicit Compose `legacy-migration` profile. Do not weaken Atlas network access, disable TLS, add application DNS workarounds, or expose MongoDB publicly.

Before any hosted apply, preserve reviewed PostgreSQL and Mongo restore points. Keep raw `ActivityLog` exports encrypted outside the repository. Files matching `*.audit-archive.json` and `*.activity-log-archive.json` are ignored defensively, but an ignored path is not a secure archive policy.

## Build and migration 012

From `backend/`, with the reviewed PostgreSQL environment:

```powershell
npm.cmd run build
npm.cmd run db:migrate:status
npm.cmd run db:migrate
npm.cmd run db:migrate:status
npm.cmd run runtime:mongo:status
```

Migration `012_corporate_audit_runtime_authority.sql` adds audit provenance/IP constraints, scalar-safety validation, indexes, append-only protection, hash-only unsafe-row dispositions, and the final corporate/audit authority latch table. Application startup never applies SQL migrations.

## Corporate dry-run, apply, and verify

With both secure connection values present:

```powershell
npm.cmd run runtime:corporate:shadow
npm.cmd run runtime:corporate:shadow -- --apply
npm.cmd run runtime:corporate:verify
```

Dry-run and verify must account for every legacy parent and child relationship. Invalid ObjectIds, missing canonical owner/organization provenance, duplicate parents, multiple parent relationships, invalid names/timestamps, and target conflicts block apply. Do not invent owners or parent relationships. Apply is transactional, deterministic, and repeat-safe.

## ActivityLog dry-run, selective apply, and verify

```powershell
npm.cmd run runtime:audit:shadow
npm.cmd run runtime:audit:shadow -- --apply
npm.cmd run runtime:audit:verify
```

Review source, safe, unsafe, per-action, reason, organization, and timestamp counts. Safe rows require canonical organization and actor provenance, an allowed action, a valid timestamp, bounded IP text, and a scalar-safe details object. Unsafe rows create only a hashed disposition and fingerprint. Never copy raw unsafe details into PostgreSQL, logs, a command transcript, or Git. Verification requires every source row to be represented exactly once as a canonical event or disposition and requires zero legacy provenance duplicates.

## Preflight and activation

Activation is deliberately separate from migration:

```powershell
npm.cmd run runtime:mongo:activate
npm.cmd run runtime:mongo:activate -- --apply
npm.cmd run runtime:mongo:preflight
npm.cmd run runtime:mongo:status
```

The dry run permits only the expected pending latches. Apply writes both latches only after migration 012, schema and append-only triggers, clean corporate and audit reconciliation, zero blockers, repository health, and source-controlled PostgreSQL/offline-only authority checks pass. Do not repeat an already successful activation. After activation, corporate/audit shadow apply refuses unless `--recover-corporate-authority` or `--recover-audit-authority` is explicitly reviewed under a write freeze and restore/reconciliation plan.

## Normal-runtime proof

MongoDB must be stopped. From the repository root:

```powershell
docker compose config --services
docker compose up --build -d
docker compose ps
```

The service list must be exactly `postgres`, `backend`, and `frontend`. Verify HTTP 200 for `/health/live`, `/health/ready`, `/`, and `/login`. Readiness must report PostgreSQL only. Inspect backend/frontend/PostgreSQL logs without exposing environment values.

## Explicit legacy profile

```powershell
docker compose --profile legacy-migration config --services
docker compose --profile legacy-migration run --rm legacy-tools node --version
```

The profile adds MongoDB and `legacy-tools` for operator-invoked commands. It must not alter normal backend dependencies or readiness. Stop MongoDB again after legacy work; do not destroy volumes.

## Hosted staging

Using the secure direct/session-capable PostgreSQL connection, read migration status, apply only pending migration 012, and confirm 001 through 012. Deploy the accepted backend so the normal process no longer receives or requires `MONGO_URI`, then verify hosted liveness and readiness.

Run corporate/audit dry-run, apply, verify, preflight, and activation only from an environment already authorized to reach Atlas and only after reviewed backups. If Atlas cannot be reached safely, stop after one diagnostic attempt and record reconciliation/activation as open. Keep prior Attendance, Customer Dues, and Inventory hosted source items open unless their own reviewed mappings and reconciliations are actually completed.

## Recovery and physical retirement

There is no automatic rollback to Mongo and no dual-write. If canonical results are disputed, freeze affected writes, preserve PostgreSQL and Mongo evidence, inspect fingerprints and reconciliation output, restore through the accepted backup process if approved, and use a recovery flag only as a separately reviewed operation.

Do not delete Atlas in V2-06F. Physical deletion requires complete source reconciliation for every retained domain, encrypted archive/retention approval for unsafe audit material, PostgreSQL and Mongo backup/restore proof, an accepted rollback window, and explicit later authorization.
