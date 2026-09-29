# V2-06D Customer Dues PostgreSQL Cutover Runbook

PostgreSQL is the sole ordinary Customer Dues runtime authority after activation. Mongo Ledger is retained only as reviewed migration/recovery input. MongoDB remains active for other deferred domains.

## Safety boundary

Use a reviewed mapping file ending in `.customer-dues-mapping.json`; this pattern is Git-ignored. Keep real mapping data outside the repository. Each mapped source document must resolve to a canonical organization, canonical Customer, and evidence-backed originating branch. Existing `customer_source_links` with `source_kind = ledger` are accepted Customer evidence; a phone match is never sufficient. Never choose Main, the first branch, or create a duplicate Customer for convenience.

Before apply, preserve PostgreSQL and Mongo restore points under the accepted backup policy. Do not print connection strings, mapping contents, names, or phone numbers. Never run staging bootstrap during a cutover.

## Build, migration, and status

Run from `backend/` with the already configured secure environment:

```powershell
npm.cmd run build
npm.cmd run db:migrate:status
npm.cmd run db:migrate
npm.cmd run db:migrate:status
npm.cmd run operations:customer-dues:status
```

`db:migrate` explicitly applies forward-only migration 010; application startup does not apply migrations. Before activation, status intentionally exits non-zero while reporting `authority: pending`.

## Shadow transform and reconciliation

Dry-run is the default and writes no Customer Due entries:

```powershell
npm.cmd run operations:customer-dues:shadow -- --mapping C:\secure\tenant.customer-dues-mapping.json
```

Review source count, blockers, type and organization counts, exact charge/payment totals, Customer/branch coverage, and date coverage. Resolve every blocker without guessing. Then apply and verify:

```powershell
npm.cmd run operations:customer-dues:shadow -- --mapping C:\secure\tenant.customer-dues-mapping.json --apply
npm.cmd run operations:customer-dues:verify -- --mapping C:\secure\tenant.customer-dues-mapping.json
```

`credit` becomes `charge`; `payment` remains `payment`. Amounts must convert exactly to INR paise. Apply preserves description, source-created occurrence time, and internal provenance. Repeating identical input is safe. Changed source facts, invalid money, unsupported types, missing/conflicting Customer evidence, missing/invalid branch evidence, target conflicts, or unused reviewed overrides fail closed.

## Preflight and explicit activation

Run the read-only preflight. Before activation it should fail only on the deliberately pending latch. The activation dry-run allows that expected pending state but writes nothing.

```powershell
npm.cmd run operations:customer-dues:preflight -- --mapping C:\secure\tenant.customer-dues-mapping.json
npm.cmd run operations:customer-dues:activate -- --mapping C:\secure\tenant.customer-dues-mapping.json
npm.cmd run operations:customer-dues:activate -- --mapping C:\secure\tenant.customer-dues-mapping.json --apply
npm.cmd run operations:customer-dues:preflight -- --mapping C:\secure\tenant.customer-dues-mapping.json
npm.cmd run operations:customer-dues:status
```

Activation writes the durable PostgreSQL latch only after migration 010, clean source reconciliation, zero money/Customer/branch blockers, canonical constraints, active `ledger` catalogue entry, repository health, and source-controlled PostgreSQL authority pass. After activation, ordinary shadow `--apply` refuses. `--recover-customer-dues-authority` works only with `--apply` and only under a separately reviewed freeze/restore/reconciliation procedure; it is not synchronization.

## Runtime validation

Use automated API/integration coverage for the selected organization and branch:

- create a charge and confirm exact positive balance effect;
- record a payment and confirm overpayment is rejected;
- create privileged increase/decrease adjustments with reasons;
- reverse one entry once and preserve both rows;
- confirm same-command retries create one fact and conflicting retries fail;
- confirm the branch journal excludes other branches while the labelled organization balance aggregates them;
- confirm foreign tenant/branch/Customer/entry UUIDs and missing entitlement/permission fail closed;
- confirm normal DTOs contain no legacy Mongo ObjectId;
- confirm `/api/ledger` is read-only PostgreSQL compatibility and ordinary runtime has no Mongo Ledger query.

No large browser checklist is required. The Customer Dues screen uses the canonical APIs, server balance, pagination, and a clearly labelled current-page CSV export.

## Rollback and recovery

Before the first PostgreSQL-native Customer Due entry, an approved rollback can leave the latch pending and preserve both source snapshots. After any native charge, payment, adjustment, or reversal, Mongo is stale by design. Freeze Customer Dues writes, preserve PostgreSQL/Mongo evidence and logs, record the last committed command, and prepare an explicit PostgreSQL restore/reconciliation plan. Do not route runtime back to Mongo or enable two writers.

Backup/restore proof remains open before real pilot/customer data. Never run `docker compose down -v` during validation or recovery.
