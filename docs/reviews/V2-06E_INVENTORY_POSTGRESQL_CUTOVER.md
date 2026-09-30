# V2-06E Inventory PostgreSQL Cutover Review

- Date: 2026-09-30
- Starting commit: `3730815f6febdbcd136e2b05241b68572e3671ed`
- Starting exact CI: GitHub Actions run `36560643286` (success)
- Checkpoint: `pre-v2-06e-inventory-postgres-cutover`
- Runtime authority: PostgreSQL
- Scope: item catalogue, branch stock locations, exact quantities/prices, immutable movement history, transactional balances, legacy transform, real frontend, Dashboard aggregate, and explicit authority activation

## Baseline and legacy findings

The accepted V2-06D tag resolved to the clean synchronized starting commit before the checkpoint. The legacy Mongoose `Inventory` document is organization-wide and stores `itemName`, mutable JavaScript-number `currentStock`, mutable JavaScript-number `lowStockThreshold`, floating JavaScript-number `price`, and timestamps. It has no branch, stock location, unit, SKU, barcode, movement history, actor, idempotency, reversal, or concurrency rule. The old API could only create/list items and list low stock; item creation directly wrote the current balance. Dashboard repeated the organization-wide Mongo low-stock query. The frontend used Mongo `_id`, number coercion, direct current-stock input, first-page-only data, and a misleading full-looking CSV export.

V2-06E is stock Inventory only. It did not add Sales/POS, purchase or supplier workflows, purchase orders, sale invoices, tax/GST, transfer documents, lots/batches, expiry, serial numbers, scanning, valuation/accounting, FIFO/LIFO, COGS, procurement, or ecommerce.

## Relational architecture

Forward-only `011_inventory_runtime_authority.sql` applies after accepted migrations 001 through 010 and in a clean 001-through-011 run. It extends the durable operational authority latch without altering prior migrations.

`inventory_items` is the organization catalogue with canonical UUID, name, optional organization-unique SKU/barcode, stable unit code, status, optional exact INR paise price, timestamps, creation-command idempotency, and internal legacy provenance. Names are deliberately not unique, and no legacy documents are auto-merged. Unit codes are `unit`, `piece`, `pack`, `box`, `kg`, `g`, `litre`, and `ml`; a database trigger rejects unit change after movement history.

`stock_locations` owns organization and branch. Migration 011 seeds one normal default `Main stock` location for every existing branch and installs a trigger for future branches. Code is branch-unique and a partial unique index permits at most one active default per branch. The schema leaves a clean future multiple-location boundary while the initial API/UX deliberately uses the authenticated branch's default location only.

`stock_movements` is the append-only authority for `opening`, `receive`, `consume`, `adjustment_increase`, `adjustment_decrease`, and `reversal`. It owns item/location/organization/branch, exact signed delta, actor, retry/fingerprint, occurrence time, optional reason/reference, and optional reversal target. Composite foreign keys and an insert guard prevent cross-tenant/branch/item/location/actor relationships. Database sign checks prevent clients from choosing arbitrary economic direction; updates/deletes fail.

`stock_balances` is the transactionally maintained item/location projection with `NUMERIC(18,3)` quantity and location reorder threshold. Every movement transaction locks this boundary, validates non-negative result, appends one fact, and updates the projection. Reconciliation recomputes every balance from movement sums.

## Exact representations and stock policy

Normal quantity input is a validated decimal string with at most three places; output is fixed-scale text. PostgreSQL performs authoritative arithmetic. Zero is accepted for balance/threshold and omitted opening baseline, while movements must be positive magnitudes and nonzero after server-derived sign. Negative input, malformed/exponent/non-finite forms, excess precision, and `NUMERIC(18,3)` overflow fail.

Reference price is nullable non-negative INR paise in `BIGINT`. Normal input accepts at most two decimal places and output contains exact `priceMinor` plus formatted decimal text. It is not accounting valuation or purchase cost.

Opening/receive/increase add quantity; consume/decrease subtract. Ordinary consume/decrease cannot make balance negative. Reversal is one exact inverse fact against the same organization/branch/item/location target, cannot target a reversal, cannot occur twice or partially, and must also preserve non-negative balance. Reason is required for consume, adjustments, and reversal. The original and reversal remain visible.

Native item creation is idempotent because it may include opening stock. Every movement is separately organization-keyed and fingerprinted for safe retry/conflicting-reuse rejection. PostgreSQL row/advisory locks and database uniqueness serialize concurrent receives, consumes, mixed decrease commands, and reversal attempts without Redis.

## Scope, API, permissions, and Dashboard

The catalogue is organization-shared, but quantity, threshold, location, journal, and low-stock are selected-branch facts. A Branch A actor cannot read or mutate Branch B movement/location data. Foreign organization, unassigned branch, forged item, and forged movement identifiers fail closed. `inventory.read` may list/fetch catalogue projections, low stock, unit metadata, and history; `inventory.manage` may create/update catalogue and receive/consume/adjust/reverse. Every route also requires the stable `inventory` entitlement.

Canonical endpoints are:

- `GET|POST /api/inventory`
- `GET|PATCH /api/inventory/:itemId`
- `GET /api/inventory/units`
- `GET /api/inventory/low-stock`
- `GET /api/inventory/:itemId/movements`
- `POST /api/inventory/:itemId/receive`
- `POST /api/inventory/:itemId/consume`
- `POST /api/inventory/:itemId/adjust`
- `POST /api/inventory/movements/:movementId/reversal`

Normal DTOs use UUIDs, exact strings, code/label unit metadata, server balance/threshold/low-stock, and pagination. They omit Mongo IDs and migration fingerprints. The old `_id`, `itemName`, number-price, and direct `currentStock` write contract was intentionally not retained because it cannot express the accepted invariant.

Dashboard low-stock now calls the same PostgreSQL repository and selected branch/default-location semantics. It no longer resolves a Mongo organization or counts organization-wide documents.

## Legacy migration, reconciliation, and authority

The transform is dry-run first. Each source document requires matching canonical organization provenance and explicit per-document branch and unit evidence. Main/first/current branch and unit are never guessed. Source quantity/threshold must convert exactly to three-decimal values; price must convert exactly to INR paise. Invalid identifiers, organization/branch/unit evidence, names, precision, signs, timestamps, unused mapping rows, changed source, and target conflicts block apply.

Each accepted source document creates one distinct item and selected branch balance. Positive stock creates one imported opening movement; zero stock creates a zero balance and no fictional zero movement. Threshold becomes the location-specific reorder threshold. The migration preserves source ObjectId/fingerprint and timestamps internally and fabricates no receipt/consumption history, actor, SKU, or barcode.

Reconciliation reports source/applied/blocker and organization counts, branch/unit/price/quantity/threshold coverage, opening/zero counts, exact grouped opening quantities by organization/branch/unit, target provenance uniqueness, and balance-to-movement equality. Apply is transactional and repeat-safe. Preflight requires migration 011, all tables/constraints, one active default per active branch, clean reconciliation, zero branch/unit/price/quantity blockers, exact balance sums, active Inventory catalogue data, repository health, source-controlled PostgreSQL authority, and the durable latch.

Activation is a separate explicit apply recording `inventory/postgresql/v2-06e-cutover`. Ordinary migration apply then refuses unless separately reviewed recovery mode is supplied. Runtime has no Mongo Inventory read, write, fallback, dual-write, or automatic repair; the old model is migration/recovery and explicit compatibility-test source only.

## Frontend result

The Inventory page is a mobile-first canonical PostgreSQL client. It shows selected branch/default-location context, server-paginated and searchable catalogue cards, stable units, exact quantity/price strings, low-stock indicators and server total, loading/error/empty states, and read/manage-aware controls. Creation separates catalogue fields from optional opening movement. Receive, consume, reasoned adjustment, full reversal, safe catalogue update, and paginated movement history use real APIs and refetch server authority after success. Insufficient stock and other deterministic errors are surfaced without optimistic quantity changes.

The movement journal keeps original and reversal rows visible and does not fabricate page-local running balances. CSV is explicitly `current page`. The code has no Mongo `_id`, direct `currentStock`, `valueAsNumber`, or stale `/inventory/alerts/low-stock` assumption.

## Acceptance evidence

Dedicated automated coverage proves exact quantity and price boundaries, typed schemas, create/update catalogue behavior, optional SKU/barcode uniqueness, duplicate names, unit history lock, inactive-item policy, exact movement sequence and sum, low-stock projection, item and movement idempotency, insufficient-stock rollback, concurrent receive, concurrent consume/adjust, concurrent single reversal, reversal rules and non-negative policy, immutable history, organization catalogue sharing, branch quantity/history isolation, foreign/forged identifiers, migration 001-through-011 and accepted 001-through-010 upgrade, zero-stock policy, transform blockers, repeat-safe apply, reconciliation, fail-closed preflight, durable activation, post-activation apply refusal, PostgreSQL-only runtime source boundaries, and canonical frontend contracts.

The dedicated suites pass: quantity/price/schema unit coverage 3/3; runtime/invariants 9/9; migration/reconciliation 4/4; cutover/source-contract controls 7/7. Final backend lint, typecheck, 134/134 unit/contract tests, and production build pass. Final frontend lint, typecheck, and production/PWA build pass. The accepted commercial-intake, manual-commercial, renewal, Attendance, Customer Dues, and Inventory regression suites all pass after narrow migration-count maintenance for the new migration 011. Compose configuration is valid; the rebuilt backend, frontend, PostgreSQL, and MongoDB containers are healthy; `/health/live`, `/health/ready`, `/`, and `/login` return HTTP 200; and recent backend/frontend logs contain no runtime error signatures.

The preserved-volume local source contained zero Mongo Inventory documents. Migration 011 applied; dry-run and explicit apply reported zero rows and zero blockers; verification reported zero mismatches and zero balance differences; activation dry-run and explicit apply passed every check; post-activation preflight/status report PostgreSQL authority and zero local items/movements/imports. No branch/unit mapping was guessed, and the ignored temporary empty mapping was removed.

Hosted PostgreSQL migration 011 was explicitly applied on 2026-09-30 and status confirms migrations 001 through 011 applied; hosted liveness, readiness, `/`, and `/login` remained HTTP 200 afterward. The safe hosted Mongo Inventory dry-run reached the existing Atlas SRV/network refusal, so no source facts could be reviewed: no organization, branch, or unit mapping was guessed; no Inventory source or target rows were changed; and the hosted Inventory authority latch was not activated. Hosted Inventory reconciliation/activation therefore remains open for an Atlas-authorized environment. Existing hosted Attendance and Customer Dues source reconciliation/activation also remain open. Backup/restore proof remains open before real pilot or customer data.

## Retained scope and readiness

Mongo Inventory is migration/recovery input only. MongoDB is not retired: applicable ParentOrganization/corporate runtime data, ActivityLog/security audit, legacy compatibility/source data, and recovery tooling remain until V2-06F. This cutover is product engineering evidence, not pilot or production approval.

Operational steps are in [the V2-06E runbook](../runbooks/V2-06E_INVENTORY_CUTOVER.md); the durable design is [ADR 0019](../adr/0019-postgresql-inventory-runtime-authority.md).
