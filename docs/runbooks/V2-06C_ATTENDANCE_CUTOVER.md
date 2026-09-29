# V2-06C Attendance PostgreSQL Cutover Runbook

PostgreSQL is the sole ordinary Attendance runtime authority after activation. Mongo Attendance is retained only as reviewed migration/recovery input. MongoDB remains active for other deferred domains.

## Safety boundary

Use a reviewed mapping file ending in `.attendance-mapping.json`; this pattern is Git-ignored. Keep it outside the repository when it contains real staff mapping data. A mapping contains canonical organization mappings and only the per-document branch resolutions needed when a membership has multiple plausible active assigned branches. Never choose `Main` or the first branch without evidence.

Before apply, preserve database restore points according to the existing backup policy. Do not print or embed connection strings. Never run the staging bootstrap during this cutover.

## Build, migration, and status

Run from `backend/` with the already configured secure environment:

```powershell
npm.cmd run build
npm.cmd run db:migrate:status
npm.cmd run db:migrate
npm.cmd run db:migrate:status
npm.cmd run operations:attendance:status
```

`db:migrate` is the explicit forward-only migration command; application startup does not apply migrations. Before activation, `operations:attendance:status` intentionally exits non-zero while reporting `authority: pending`.

## Shadow transform and verification

Dry-run is the default and writes no Attendance rows:

```powershell
npm.cmd run operations:attendance:shadow -- --mapping C:\secure\tenant.attendance-mapping.json
```

Resolve every reported blocker in the reviewed mapping or source data. Then run the explicit transaction and reconciliation:

```powershell
npm.cmd run operations:attendance:shadow -- --mapping C:\secure\tenant.attendance-mapping.json --apply
npm.cmd run operations:attendance:verify -- --mapping C:\secure\tenant.attendance-mapping.json
```

Apply preserves legacy date/status and provenance but deliberately creates no check-in, checkout, shift, actor, or correction reason. Source fingerprints make changed source facts fail closed. Repeating an identical apply is safe; a conflict or unresolved mapping aborts the transaction.

## Preflight and explicit activation

Run the read-only preflight first. It should fail only on the pending authority latch before activation; the activation dry-run evaluates the same checks while permitting that expected pending state.

```powershell
npm.cmd run operations:attendance:preflight -- --mapping C:\secure\tenant.attendance-mapping.json
npm.cmd run operations:attendance:activate -- --mapping C:\secure\tenant.attendance-mapping.json
npm.cmd run operations:attendance:activate -- --mapping C:\secure\tenant.attendance-mapping.json --apply
npm.cmd run operations:attendance:preflight -- --mapping C:\secure\tenant.attendance-mapping.json
npm.cmd run operations:attendance:status
```

Activation writes the durable PostgreSQL authority latch only after reconciliation, mappings, branch timezones, constraints, catalogue, repository health, and source-controlled authority pass. After activation, ordinary shadow `--apply` refuses. `--recover-attendance-authority` is accepted only with `--apply` and only under a separately reviewed freeze/restore/reconciliation procedure; it is not routine synchronization.

## Runtime validation

Validate the selected organization/branch with automated API or integration coverage:

- the roster contains active assigned memberships and persisted daily state without phone data;
- Present, Absent, and Half-day produce one version-1 row per subject/day;
- exact retries do not duplicate;
- corrections require reason/current version and append immutable history;
- foreign tenant/branch, unassigned/inactive membership, guessed UUID, and stale version fail closed;
- Dashboard present-today equals the selected branch's local business-date count;
- runtime and Dashboard contain no Mongo Attendance query, fallback, or dual-write.

No large browser checklist or Attendance realtime validation is required.

## Rollback and recovery

Before the first PostgreSQL-native Attendance write, a separately reviewed rollback can leave the latch pending and preserve the source snapshot. After any accepted PostgreSQL-native mark or correction, Mongo is stale by design. Freeze Attendance writes, preserve PostgreSQL/Mongo evidence and logs, record the last committed write, and prepare an explicit PostgreSQL restore/reconciliation plan. Do not route runtime back to Mongo or enable two writers.

The backup/restore proof required before real pilot/customer data remains open. Never run `docker compose down -v` during validation or recovery.
