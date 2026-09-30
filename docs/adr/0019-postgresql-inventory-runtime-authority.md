# ADR 0019: PostgreSQL Inventory Runtime Authority

- Status: Accepted
- Date: 2026-09-29
- Scope: V2-06E Inventory migration and runtime cutover

## Context

The legacy Mongo `Inventory` document stores one organization ID, item name, mutable `currentStock`, mutable `lowStockThreshold`, floating-point price, and timestamps. It has no branch, stock location, unit, movement history, actor, retry key, reversal, or concurrency boundary. Ordinary reads and Dashboard low-stock counts are organization-wide even when the authenticated request has a selected branch.

V2-06A selected an organization item catalogue plus branch locations, immutable stock movements, and transactionally maintained balances. V2-06E must make PostgreSQL the sole ordinary Inventory authority without inventing Sales/POS, purchases, suppliers, transfers, lots, expiry, serials, barcode scanning, cost accounting, FIFO/LIFO, COGS, tax, or procurement.

## Decision

### Catalogue, locations, and units

`inventory_items` is the organization-owned catalogue. It stores a canonical UUID, name, optional organization-unique SKU and barcode, explicit unit code, active/inactive status, optional exact INR reference price, timestamps, and internal migration provenance. Duplicate names are allowed because name alone is not identity. Hard delete is not exposed; inactive status preserves history.

The deliberately small unit vocabulary is `unit`, `piece`, `pack`, `box`, `kg`, `g`, `litre`, and `ml`. APIs return stable code plus display label. Once any movement exists for an item, the database rejects unit changes because historical quantities would otherwise change meaning.

`stock_locations` owns the organization and branch stock boundary. Migration 011 creates one ordinary default location named `Main stock` for each existing branch and a branch-insert trigger creates the same boundary for future branches. The schema can support later multiple locations, but V2-06E exposes only the selected branch's active default location. Location code is unique within a branch and a partial unique index permits at most one active default.

### Exact quantity and reference price

Authoritative quantity is PostgreSQL `NUMERIC(18,3)`. Normal APIs accept validated non-negative or positive decimal strings and return fixed-scale decimal strings. Exponent notation, signs on caller-supplied magnitudes, malformed values, excess precision, overflow, `NaN`, `Infinity`, and JavaScript-number coercion are rejected. Runtime arithmetic is performed by PostgreSQL; JavaScript `Number` is not stock authority.

Reference price is nullable, non-negative INR paise in `BIGINT`. APIs accept at most two decimal places and return `priceMinor` plus a formatted decimal string. The price is a catalogue reference/selling price only. It is not purchase cost, inventory valuation, an asset value, profit, COGS, or accounting authority.

### Immutable movement journal and balance projection

`stock_movements` is the authoritative stock history. The initial types are `opening`, `receive`, `consume`, `adjustment_increase`, `adjustment_decrease`, and `reversal`. The server derives sign: opening/receive/increase are positive; consume/decrease are negative; reversal is the exact inverse of its target. Ordinary clients send a positive magnitude, never an arbitrary signed delta.

Every native movement stores canonical organization, branch, item, location and actor, required retry key and command fingerprint, occurrence time, and optional reason/reference. Consume, adjustments, and reversals require meaningful reasons. Imported opening movements are the only actor-null exception and carry explicit Mongo source provenance. Movement updates and deletes are rejected by an append-only trigger.

`stock_balances` is the item/location projection with exact quantity, location-specific reorder threshold, and update time. The invariant is `stock_balances.quantity = SUM(stock_movements.quantity_delta)` for the same item/location. Quantity is changed only inside reviewed movement transactions. Reconciliation checks every balance boundary against the journal.

### Non-negative policy, concurrency, and idempotency

V2-06E does not permit negative inventory. Receive, consume, adjustment, opening, and reversal operations lock the item/location balance boundary and use one transaction to validate, append the movement, and update the projection. A consume, decrease adjustment, or reversal that would make quantity negative fails without inserting a movement or changing the balance. Concurrent operations serialize on the balance row, so two consumers cannot overspend the same stock.

Native item creation is itself retry-safe because it can include opening stock. An organization-scoped creation retry key and normalized-command fingerprint return the same catalogue item for the same command and reject conflicting reuse. Every movement uses a separate organization-scoped retry key and fingerprint. Target row locking plus a partial unique index permits exactly one full reversal under concurrency. Redis is not introduced.

### Corrections and lifecycle

Historical movement facts are never edited or hidden. A reversal references one same-organization, same-branch, same-item, same-location target; uses its exact inverse delta; requires an actor and reason; and remains visible beside the original. A reversal cannot target another reversal, cannot be duplicated, cannot be partial, and cannot violate non-negative stock. Partial corrections use a new reasoned adjustment.

Inactive items reject new receive, consume, and adjustment commands. Exact reversal remains available so historical mistakes can be corrected. A new item may include optional opening quantity only through one transaction that creates the item, balance, and opening movement. Zero or omitted opening quantity creates a zero balance and no fictional zero-valued movement.

### Branch scope, authorization, and API

The item catalogue is organization-shared; quantities, thresholds, locations, movements, and low-stock decisions are selected-branch scoped. Composite foreign keys and insert guards require organization ownership and an active actor assignment to the stock branch. UUID possession never grants access.

All Inventory routes require the stable `inventory` entitlement. Reads require `inventory.read`; catalogue changes and every stock command require `inventory.manage`. Canonical APIs preserve `GET|POST /api/inventory`, add item fetch/update, receive/consume/adjust, branch movement history, reversal, unit metadata, and paginated low-stock. Public DTOs contain canonical UUIDs and no Mongo provenance. The old mutable `currentStock` request and Mongo-shaped `_id` response are intentionally not retained.

Dashboard low-stock is the PostgreSQL count for the authenticated organization and selected branch/default location, with `quantity <= reorder_threshold`. It never counts another branch or infers authority from the frontend page.

### Legacy transform and cutover

Migration 011 creates the four-table model, default locations, constraints, triggers, indexes, and `inventory/postgresql/v2-06e-cutover` durable latch option. Legacy Inventory is a transform source, not a schema copy. Every document requires canonical organization provenance plus reviewed per-document branch and unit evidence. Branch Main/first/current and unit `unit` are never guessed.

Each accepted source document remains a distinct canonical item, even when names match. Price must convert exactly to INR paise; current stock and threshold must convert exactly to three-decimal quantities. Positive current stock creates one imported opening movement and the matching balance. Zero current stock creates a zero balance without pretending a zero economic movement occurred. Migration does not fabricate historical receipts or consumption.

Dry-run is the default; apply is explicit, transactional, deterministic, and repeat-safe. Reconciliation covers source/target counts, blockers, organization/branch/unit and precision coverage, grouped opening quantities by organization/branch/unit, threshold coverage, provenance uniqueness, and every movement/balance sum. Activation is a separate explicit command after clean verification and preflight. After activation, ordinary migration apply refuses without the reviewed recovery flag.

Ordinary Inventory and Dashboard runtime use PostgreSQL only. The Mongoose model remains reachable solely through migration/recovery tooling and explicit compatibility tests. There is no Inventory Mongo read, write, fallback, dual-write, or automatic repair.

## Consequences

- Branch stock is isolated and safe under retries and concurrent decrements.
- Quantity, threshold, and INR price semantics are exact and stable across API, database, and UI.
- The movement journal preserves factual corrections while the balance projection remains efficient and reconcilable.
- Legacy cutover blocks until organization, branch, unit, quantity, threshold, and price evidence is complete.
- Organization catalogue sharing does not leak another branch's quantity or movement history.
- MongoDB remains required for applicable corporate/parent operations, ActivityLog/security audit, and retained migration/recovery sources until V2-06F.
- No Sales/POS, purchasing, supplier, transfer-document, lot/expiry, scanning, valuation, tax, or accounting capability is implied.

## Alternatives rejected

### Keep mutable `currentStock`

Rejected because it cannot preserve history, attribute corrections, reconcile facts, or prevent lost updates and concurrent overspend.

### Store quantities or prices as JavaScript numbers

Rejected because binary floating point cannot be authoritative for stock or money precision.

### Infer Main branch and `unit` during migration

Rejected because the source contains no evidence: `10` may mean pieces, boxes, kilograms, or litres, and organization-wide stock has no proved originating branch.

### Edit/delete movement mistakes

Rejected because exact full reversal or explicit adjustment preserves attributable permanent history.

### Mongo fallback or dual-write

Rejected because the legacy document cannot atomically represent relational location, journal, retry, actor, reversal, and balance invariants.
