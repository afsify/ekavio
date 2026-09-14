# V2-05A Backup and Restore Runbook

Use this runbook before any shared or production shadow `--apply`. Replace the example paths and credentials with environment-specific secret injection. Never commit generated backup files; `backups/`, `*.dump`, and `*.sql.gz` are ignored.

MongoDB remains runtime source of truth in V2-05A. A PostgreSQL restore recovers only the shadow state; it does not authorize a runtime cutover.

## Backup

Create a timestamped directory outside the repository when possible. For the local Compose stack, these examples stream archives to the host without printing database contents:

```powershell
New-Item -ItemType Directory -Force backups | Out-Null
docker compose exec -T mongo mongodump --archive=/tmp/mongo-before-v2-05a.archive.gz --gzip --uri="mongodb://ekavio:ekavio-local-development-only@localhost:27017/ekavio?authSource=admin"
docker compose cp mongo:/tmp/mongo-before-v2-05a.archive.gz backups/mongo-before-v2-05a.archive.gz
docker compose exec -T postgres pg_dump --format=custom --no-owner --no-acl --username=ekavio --dbname=ekavio --file=/tmp/postgres-before-v2-05a.dump
docker compose cp postgres:/tmp/postgres-before-v2-05a.dump backups/postgres-before-v2-05a.dump
Get-Item backups/mongo-before-v2-05a.archive.gz, backups/postgres-before-v2-05a.dump | Select-Object FullName, Length
```

Outside local development, do not put credentials directly in shell history. Use the platform's secret manager or credential files, confirm encryption and retention, and store both backups in access-controlled storage. Check that each archive is non-empty and run a restore rehearsal against disposable databases before apply.

## Restore rehearsal

Never rehearse against the live databases. Create disposable MongoDB/PostgreSQL targets and restore into them:

```powershell
docker compose cp backups/mongo-before-v2-05a.archive.gz mongo:/tmp/mongo-before-v2-05a.archive.gz
docker compose exec -T mongo mongorestore --archive=/tmp/mongo-before-v2-05a.archive.gz --gzip --drop --uri="mongodb://ekavio:ekavio-local-development-only@localhost:27017/ekavio_restore_test?authSource=admin"
docker compose exec -T postgres createdb --username=ekavio ekavio_restore_test
docker compose cp backups/postgres-before-v2-05a.dump postgres:/tmp/postgres-before-v2-05a.dump
docker compose exec -T postgres pg_restore --clean --if-exists --no-owner --no-acl --username=ekavio --dbname=ekavio_restore_test /tmp/postgres-before-v2-05a.dump
```

`--drop` and `--clean` are destructive to the named restore target. Confirm the target names are disposable before running them. Do not use these flags against the active `ekavio` databases.

After a rehearsal, inspect record counts and application-specific samples. Remove disposable targets only after confirming their exact names. Production restore execution requires a separate incident plan, an approved outage/cutover window, and verified target identifiers.

## PostgreSQL post-apply backup

After a successful shadow apply and a clean `postgres:verify`, capture the verified PostgreSQL state separately:

```powershell
docker compose exec -T postgres pg_dump --format=custom --no-owner --no-acl --username=ekavio --dbname=ekavio --file=/tmp/postgres-after-v2-05a.dump
docker compose cp postgres:/tmp/postgres-after-v2-05a.dump backups/postgres-after-v2-05a.dump
Get-Item backups/postgres-after-v2-05a.dump | Select-Object FullName, Length
```

Retain both the pre-apply MongoDB archive and post-apply PostgreSQL archive under the same protected change record. Verification success does not replace a restore rehearsal.

## Shadow migration sequence

1. Complete and verify the pre-apply MongoDB backup and, when PostgreSQL already contains state, its pre-apply backup.
2. Run `npm.cmd run db:migrate` from a built backend or inside the backend container.
3. Run `npm.cmd run postgres:shadow` and review every dry-run count/issue.
4. Run `npm.cmd run postgres:shadow -- --apply` only after a clean review.
5. Run `npm.cmd run postgres:verify`; treat any non-zero result as a failed shadow copy.
6. Capture and rehearse the post-apply PostgreSQL backup.
7. Keep MongoDB authoritative. Do not route application traffic to PostgreSQL in V2-05A.
