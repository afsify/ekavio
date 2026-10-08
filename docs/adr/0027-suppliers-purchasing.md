# ADR 0027: Suppliers & Purchasing with canonical Inventory receiving

- Status: Accepted
- Date: 2026-10-08
- Scope: V2-09B; no accounting, payments, returns or automatic pilot GO

## Authority and scope

Migration `019_suppliers_purchasing.sql` is additive; 001–018 are unchanged.
PostgreSQL owns organization Suppliers, selected-branch Purchase Orders/lines,
actual goods receipts/lines and append-only purchasing activity. No Mongo source
mappings, second stock balance, supplier ledger or fallback is introduced.
Supplier names are required; normalized E.164 phone, normalized email, contact,
GSTIN, address and bounded notes are optional. Shared phone numbers never merge
records. Active/archived lifecycle and optimistic versions preserve history;
hard deletion is rejected. Supplier history contains only the selected branch's
documents plus organization Supplier events, not other branches' purchases.

Purchase documents use canonical UUIDs internally and random bounded `EV-PO-`
references publicly. Actual receipt documents use `EV-GR-` references. References
are not authorization. Composite foreign keys bind organizations, branches,
Suppliers, order lines, Inventory items/locations and canonical movements.

## Commercial authority and membership authority

Optional `purchasing` / **Suppliers & Purchasing**, add-on `module-purchasing`,
starts unpublished, with no public pricing row, no Pilot Core inclusion, and no
automatic subscription/entitlement grant. Operators may explicitly price/publish
later through existing commercial administration. No invented price is added.

`purchasing.read/manage` are separate server permissions. Owner/admin/manager
receive both under existing built-in policy; HR/staff do not. Custom roles replace
built-ins and cannot confer platform-operator authority. Membership, active
assigned branch, module access and permissions are checked server-side; writes
hold the organization administration lock and re-evaluate live authority.

Suppliers and factual purchasing document counts require Purchasing alone.
Inventory-backed order selection/detail/list/edit/status additionally require
Inventory entitlement and `inventory.read`. Receiving independently requires
`purchasing.manage` AND `inventory.manage` AND both entitlements AND an authorized
active selected branch. A Purchasing permission never indirectly grants stock
authority. Commercial/organization UX states this dependency; no automatic grant
or disproportionate new commercial dependency engine is introduced. Inventory-only
manual receiving and ordinary Inventory reversal retain their independent gates.

## Purchase documents and exact values

Lifecycle: draft → ordered → partially_received → received. Draft/ordered may
instead be cancelled only before any receipt. Received/partially-received goods
cannot be cancelled, erased or silently reversed. Mark as Ordered is internal;
it does not email the Supplier or increase stock. Draft edits replace 1–50 unique
canonical item lines under expected-version checks. Ordered commercial fields and
line snapshots cannot be rewritten. Supplier and active item/unit validity is
checked before ordering. Amendments require safe cancellation/replacement when
unreceived; amendments after receiving are deferred.

Each line captures canonical item identity plus name/SKU/unit snapshots, exact
positive `NUMERIC(18,3)` quantity, non-negative INR `BIGINT` unit price in paise and
exact line value. Positive half-paise ties round upward once per line:
`(quantityMilli × unitPriceMinor + 500) / 1000` using integer division. Sum the
rounded line values; never use floating-point money authority. For example,
0.500 × ₹0.01 = ₹0.01; 1.250 × ₹10.01 = ₹12.51; 0.001 × ₹4.99 = ₹0.00 and
0.001 × ₹5.00 = ₹0.01. Lines and document sums must fit PostgreSQL BIGINT.
Ordered value is not paid amount, invoice settlement, GST, profit, inventory
valuation or COGS. Receiving never overwrites canonical item reference prices.
Business order/delivery dates serialize as date strings, not timezone-shifted
JavaScript Date instants.

## One transaction and one stock authority

`PurchasingService.receive` owns `PostgresDatabase.atomic`. AsyncLocalStorage
propagates the SAME PoolClient to nested canonical Inventory transactions and
commercial queries. Nested `transaction/withClient/query` reuse that client;
there is only one outer BEGIN/COMMIT/ROLLBACK. Purchasing calls the existing
`PostgresInventoryRepository.changeStock`, with a private receipt-line identifier
and expected unit; it does not duplicate balance math or stock SQL. Public
Inventory schemas do not accept this internal source marker.

Receipt header, every line, all Inventory movements/balances, PO progress/version
and activity commit together, or none do. Tests fail a later inactive item after
the first canonical movement and verify no receipt, movement, event, balance or
PO progress survives. Organization/order/item/stock locks serialize concurrent
authority and stock changes. Write statement timeout is bounded to 10 seconds.

Receiving only accepts positive actual quantities up to the remaining amount;
blank UI quantities are excluded, never silently filled. Example: ordered 10,
receive 4, remaining 6, then receive 6 → received. Draft/cancelled/full orders,
foreign lines, inactive items/locations, changed units and over-receiving fail.
The UI reviews quantities before confirmation and disables repeated submission.

Each command has an organization-unique key and SHA-256 fingerprint of canonical
organization/branch/order/version/notes/sorted line identifiers and fixed-scale
quantities. An identical retry returns the same receipt before stale PO-version
checking; altered payloads conflict. Failed/uncertain UI commands retain the exact
confirmed payload/key for retries. Overlapping distinct commands serialize or
conflict, never exceed remaining quantities, and create no duplicate stock.

## Durable relational history and reversal policy

Every receipt line links a unique canonical movement through composite scope
foreign keys. A deferred reverse FK links the movement's typed
`purchase_receipt_line_id` to the receipt line, allowing canonical movement
insertion first without weakening commit invariants. Deferred consistency checks
verify movement type/quantity/identity, at least one receipt line, 1–50 PO lines,
total bounds, no over-receipt and status matching derived receipt progress.
Receipt headers/lines/activity are immutable. Inventory movement history displays
“Received from Purchase Order EV-PO-…” and the typed receipt marker; free text
alone is never the correctness link.

Independent reversal of Purchasing-origin movements is denied by the Inventory
repository AND a database trigger. The UI explains the restriction but is not
authority. Fully synchronized purchasing returns/corrections are deferred, not
implemented as unrelated Inventory reversal or silent history deletion.

## Experience, reports and performance

Guarded `/suppliers` and `/purchasing` reuse shared fields/dialogs, selected context,
bounded search/status/date/sort filters, pagination, exact previews, read-only
snapshots, actor-labelled activity, latest receipt detail and full paginated
receiving history. Canonical Inventory item/movement cross-links remain permission
gated. Supplier directory can operate without Inventory; the PO dependency is
explained instead of making unauthorized requests.

Dashboard adds factual open orders, partial orders, open orders with an expected
date (awaiting delivery, not a lateness assertion) and trailing-seven-day receipt
document counts. Domain permission plus entitlement gates execute SQL only for
authorized facts; `reports.read` is not required for those widgets.

Curated Purchase Orders, Goods Received and Supplier Purchase Summary (by Supplier
and order business date, excluding draft/cancelled orders) reuse existing Reports
and formula-safe UTF-8 CSV, closed columns/filters, 366-day range, pagination,
5 MiB response/export budgets and append-only export evidence. All require
Reports read + Purchasing read + Purchasing entitlement. Goods Received additionally
requires Inventory read + Inventory entitlement. Order values are aggregated
before receipt joins so receipts never multiply document totals. SQL is bounded
and parameterized; indexes support selected-branch/date, Supplier, order history
and receipt-line quantity aggregates. Detail batches receipt lines, not N+1 calls.

Notifications are deferred: no unambiguous purchasing recipient model exists yet.
No supplier email, scheduler, SMS, WhatsApp or alert broadcast is guessed. Supplier
custom fields are explicitly deferred to a reviewed expansion of the shared
engine; no second form engine and no stock-movement custom fields are introduced.

## Consequences and release limits

No new paid provider, Redis, Kafka, AI, procurement SaaS or search service is
required. Apply only accepted pending 019 with the normal locked/checksummed
runner AFTER local acceptance; hosted schema/health does not prove authenticated
Purchasing or exact-deployed-build acceptance. Extended hosted recovery through
019 remains OPEN. Render Free remains staging-only, Atlas remains retained and
untouched, and **NO-GO FOR REAL CUSTOMER DATA** is unchanged. V2-09C HR Plus and
V2-10 final acceptance require separate authorization.
