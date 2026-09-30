# V2-06E Inventory PostgreSQL Cutover Runbook

PostgreSQL is the sole ordinary Inventory runtime authority after activation. Mongo Inventory is retained only as reviewed migration/recovery input. MongoDB remains active for deferred corporate/audit work and retained source tooling.

## Safety boundary

Use a reviewed mapping file ending in `.inventory-mapping.json`; this pattern is Git-ignored. Keep real mapping data outside the repository. Every legacy document must resolve to a canonical organization with matching Mongo provenance, an evidence-backed active branch, and an explicit supported unit code. Never choose Main, the first/current branch, or `unit` for convenience. Do not merge duplicate names without separate accepted evidence; V2-06E safely preserves each source document as a distinct catalogue identity.

A mapping has this shape; placeholders are illustrative, not real data:

```json
{
  "version": 1,
  "organizations": [
    {
      "legacyOrganizationId": "000000000000000000000000",
      "organizationId": "00000000-0000-4000-8000-000000000000",
      "branchResolutions": {
        "111111111111111111111111": "11111111-1111-4111-8111-111111111111"
      },
      "unitResolutions": {
        "111111111111111111111111": "piece"
      }
    }
  ]
}
```

Supported unit codes are `unit`, `piece`, `pack`, `box`, `kg`, `g`, `litre`, and `ml`. Before apply, preserve PostgreSQL and Mongo restore points under the accepted backup policy. Do not print connection strings or operational mapping contents. Never run staging bootstrap during a cutover.

## Build, migration, and status

Run from `backend/` with the already configured secure environment:

```powershell
npm.cmd run build
npm.cmd run db:migrate:status
npm.cmd run db:migrate
npm.cmd run db:migrate:status
npm.cmd run operations:inventory:status
```

`db:migrate` explicitly applies forward-only migration 011; application startup does not apply migrations. Before activation, Inventory status intentionally exits non-zero while reporting `authority: pending`.

## Dry-run transform and reviewed mapping

Dry-run is the default and writes no Inventory target row:

```powershell
npm.cmd run operations:inventory:shadow -- --mapping C:\secure\tenant.inventory-mapping.json
```

Review source and blocker counts, organization counts, branch and unit coverage, price/quantity/threshold conversion coverage, positive-opening and zero-balance counts, and grouped opening quantities by organization/branch/unit. Resolve every blocker without guessing.

Legacy `currentStock`, `lowStockThreshold`, and `price` are JavaScript numbers. Stock and threshold must convert exactly to `NUMERIC(18,3)` and price exactly to INR paise. Unsupported precision, negative/invalid/non-finite values, missing/invalid organization, branch, unit, timestamp, provenance, unused review rows, and conflicting targets block apply. Duplicate names remain separate items.

## Apply and reconciliation

After review, apply and verify:

```powershell
npm.cmd run operations:inventory:shadow -- --mapping C:\secure\tenant.inventory-mapping.json --apply
npm.cmd run operations:inventory:verify -- --mapping C:\secure\tenant.inventory-mapping.json
```

Positive source stock creates exactly one imported opening movement and matching balance. Zero source stock creates a zero balance and no zero-valued movement. Threshold becomes the selected location's reorder threshold. Apply retains the source ObjectId/fingerprint internally and is repeat-safe. Verification requires source/target count equality, exact catalogue and mapping facts, opening movement consistency, provenance uniqueness, and `stock_balances.quantity = SUM(stock_movements.quantity_delta)` for every balance boundary.

## Preflight and explicit activation

Run the read-only preflight. Before activation it should fail only on the deliberately pending latch. The activation dry-run allows that expected pending state but writes nothing:

```powershell
npm.cmd run operations:inventory:preflight -- --mapping C:\secure\tenant.inventory-mapping.json
npm.cmd run operations:inventory:activate -- --mapping C:\secure\tenant.inventory-mapping.json
npm.cmd run operations:inventory:activate -- --mapping C:\secure\tenant.inventory-mapping.json --apply
npm.cmd run operations:inventory:preflight -- --mapping C:\secure\tenant.inventory-mapping.json
npm.cmd run operations:inventory:status
```

Activation writes the durable latch only after migration 011, all Inventory tables/constraints, one active default location per active branch, clean reconciliation, zero general/branch/unit/price/quantity blockers, exact movement/balance sums, active `inventory` catalogue data, repository health, and source-controlled PostgreSQL authority pass.

After activation, ordinary shadow `--apply` refuses. `--recover-inventory-authority` works only with `--apply` and only under a separately reviewed write freeze, restore, and reconciliation procedure. It is not routine synchronization.

## Runtime validation

Use the automated API/integration suites for the selected organization and branch:

- create an item with an explicit unit, exact reference price, threshold, and optional opening movement;
- receive, consume, increase/decrease adjust, and reverse while confirming exact movement sum and projected balance;
- confirm insufficient/concurrent decrements cannot produce negative quantity;
- confirm same-command retry returns one fact and conflicting retry fails;
- confirm one exact full reversal, no reversal-of-reversal, no duplicate/partial/cross-branch reversal, and no reversal that would make stock negative;
- confirm the catalogue can be organization-shared while quantities, thresholds, low-stock, and movement history remain selected-branch scoped;
- confirm foreign tenant/branch/item/location/movement UUIDs and missing entitlement/permission fail closed;
- confirm unit cannot change after history and inactive items reject new ordinary movements;
- confirm normal DTOs contain no Mongo ObjectId or direct mutable `currentStock` contract;
- confirm Dashboard low-stock is the PostgreSQL selected-branch aggregate.

No large manual browser checklist is required. The Inventory screen uses server pagination/search, canonical UUIDs, decimal strings, real commands, permission-aware controls, and a clearly labelled current-page CSV export.

## Rollback and recovery

Before the first PostgreSQL-native Inventory movement, an approved rollback can leave the latch pending and preserve both source snapshots. After any native opening, receive, consume, adjustment, or reversal, Mongo is stale by design. Freeze Inventory writes, preserve PostgreSQL/Mongo evidence and logs, record the last committed command, and prepare an explicit PostgreSQL restore/reconciliation plan. Do not route runtime back to Mongo or enable two writers.

Backup/restore proof remains open before real pilot/customer data. Never run `docker compose down -v` during validation or recovery.
