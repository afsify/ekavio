# V2-05D PostgreSQL Commercial Cutover Runbook

Executed: 2026-09-15

Starting commit: `6bc2c1468989b2c3247a6ee0108758aed4d365b6`

Pre-cutover checkpoint: `pre-v2-05d-commercial-cutover`

## Safety classification

The Compose backend reports `NODE_ENV=development`. MongoDB and PostgreSQL use the repository's local named volumes, Docker service names, development database name, and unpublished database ports. Both targets were classified as local/development before writes. Initial commercial counts were zero in all five Mongo collections and all ten normalized PostgreSQL commercial tables.

No step in this runbook is authorization for a shared or production target. Stop and obtain explicit approval if target ownership or environment classification is uncertain.

## Verified backups

Backups were created before catalogue source reconciliation, migration `--apply`, or authority activation. Both archives are under the Git-ignored `backups/` directory and are not committed.

| Store | Archive | Size | SHA-256 |
| --- | --- | ---: | --- |
| MongoDB | `backups/v2-05d-local-20260915T164208Z/mongo-before-v2-05d.archive.gz` | 1,458 bytes | `E2AD386BFD3B0D8B85CA87F60514567B7BF37CAE4FBC0E1AB0F9F6018F4CCB3B` |
| PostgreSQL | `backups/v2-05d-local-20260915T164208Z/postgres-before-v2-05d.dump` | 51,626 bytes | `A3CDC53F554A8C7897658A2D369196A867152C0F4D87E9DA5D743F24FCA46EDD` |

`mongorestore --dryRun` parsed the compressed archive with zero failures. `pg_restore --list` parsed the custom-format archive and listed 119 TOC entries. See `V2-05A_BACKUP_RESTORE.md` for isolated restore drills; never restore over a current database until the exact target is independently verified.

## Executed local sequence

From the repository root, using the built development backend image:

```powershell
docker compose run --rm backend npm run db:migrate
docker compose run --rm backend npm run db:migrate:status
docker compose run --rm backend npm run entitlements:catalogue:mongo-legacy
docker compose run --rm backend npm run entitlements:backfill
docker compose run --rm backend npm run postgres:shadow
docker compose run --rm backend npm run postgres:shadow -- --apply
docker compose run --rm backend npm run postgres:verify
docker compose run --rm backend npm run postgres:commercial:preflight
docker compose run --rm backend npm run postgres:commercial:activate -- --apply
```

Migration status reported `001`, `002`, and `003` applied. The legacy source catalogue contained 4 modules, 2 plans, and 4 add-ons. The legacy organization backfill dry run scanned zero organizations and found no unknown or ambiguous data. Shadow dry-run and apply each reported 4 module definitions, 2 plans, 1 plan-module relation, 5 plan limits, 4 add-ons, 4 add-on-module relations, zero subscriptions, zero overrides, and zero issues. Reconciliation matched with zero mismatches.

The read-only commercial preflight reported zero blockers, exact catalogue/relation parity, and zero migrated organizations in this empty local baseline. A separate disposable two-organization integration suite covers non-empty subscription, add-on, override, effective module, effective limit, and tenant-switch parity and isolation.

Final validation also confirmed that multi-query entitlement snapshots and catalogue reads run in read-only, repeatable-read PostgreSQL transactions, with commit/rollback handling and unconditional pooled-client release.

Activation was performed only after preflight passed. An ordinary post-activation shadow apply then exited non-zero before writes, proving the safety latch.

## Current commands

PostgreSQL catalogue reconciliation is deterministic and idempotent:

```powershell
Set-Location backend
npm.cmd run entitlements:catalogue
```

The V2-05D preflight performs no business-data writes:

```powershell
npm.cmd run build
npm.cmd run postgres:commercial:preflight
```

Legacy Mongo catalogue/backfill commands are migration or recovery tools only. They cannot change runtime commercial authority.

Normal shadow dry-run remains available. Normal apply is intentionally blocked after activation:

```powershell
npm.cmd run postgres:shadow
npm.cmd run postgres:shadow -- --apply
```

The second command must fail with `Shadow apply refused` after V2-05D. Do not bypass it for routine synchronization.

## Rollback limitations

There is no automatic PostgreSQL-to-Mongo fallback. If PostgreSQL commercial reads fail, entitlement-dependent requests fail closed. Do not switch application composition to Mongo to restore availability.

After any PostgreSQL commercial write, rollback requires an approved reconciliation plan that inventories every changed subscription, add-on assignment, status/date, and explicit override. The exceptional command below can overwrite PostgreSQL shared-core state from Mongo and therefore must never be used casually:

```powershell
npm.cmd run postgres:shadow -- --apply --recover-commercial-authority
```

Before considering it, stop commercial mutations, take fresh backups of both stores, prove the intended direction record by record, test restore/reconciliation in disposable databases, and obtain explicit authority. The recovery flag does not implement reverse replication and does not make Mongo current.

Stopping the stack must preserve volumes:

```powershell
docker compose down
```

Never use `docker compose down -v` for this runbook.
