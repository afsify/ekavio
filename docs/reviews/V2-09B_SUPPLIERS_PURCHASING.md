# V2-09B Suppliers & Purchasing

Date: 2026-10-08. Local automated acceptance and hosted schema/public health checks
are complete; exact-commit CI and tag evidence are recorded in the final release report.
**NO-GO FOR REAL CUSTOMER DATA** remains unchanged.

## Baseline and scope

Verified clean `main` at `dad5bebdce0296280f7f61a7b066a0eb6a08a8ce`
(`test: await CRM account sign-out before switching roles`), matching origin and
fresh remote main. Existing annotated `v2-09a-crm-followups` peeled to that commit.
Annotated `pre-v2-09b-suppliers-purchasing` was created and pushed once there.
No branch, reset, restore, stash, clean, historical migration rewrite, Atlas write,
guessed source mapping or later milestone was used.

## Accepted design

See [ADR 0027](../adr/0027-suppliers-purchasing.md) for schema, dependency,
transaction ownership and exact arithmetic decisions. Additive migration 019
defines `suppliers`, `purchase_orders`, `purchase_order_lines`, `purchase_receipts`,
`purchase_receipt_lines`, `purchasing_activity_events`, typed canonical movement
linkage, composite tenancy FKs, versions, immutable/deferred consistency guards,
indexes and closed report/widget/permission/module extensions. 001–018 stay intact.

Suppliers need only a name; contacts/GSTIN/address/notes are bounded and optional.
Phone/email reuse identity normalization, shared phones never merge records,
active/archived status preserves history, and no hard-delete endpoint exists.
Organization-wide Supplier administration and selected-branch purchase history
are explicitly distinguished. UI search, status, pagination, details, editing and
archive/reactivation use human labels and optimistic versions.

Orders have random `EV-PO-` references, INR, business dates, Supplier and 1–50
unique canonical item lines with immutable name/SKU/unit/quantity/price snapshots.
Drafts edit safely; internal ordering adds no stock or email. Unreceived drafts or
ordered documents can be cancelled. Partially/full received orders cannot be
cancelled, and ordered commercial snapshots cannot be rewritten. Date strings
avoid device-timezone shifts. Exact milli quantities × integer paise round once
per line, positive half-paise up, with BIGINT overflow guards; totals are ordered
value, never payment, payable, GST, profit or COGS.

## Inventory, authorization and recovery invariants

`purchasing` / **Suppliers & Purchasing** and `module-purchasing` start unpublished,
without public pricing, Pilot Core inclusion or historical subscription grants.
Owner/admin/manager get read/manage; HR/staff do not, and live custom roles replace
built-ins. Server gates independently require live membership, active assigned
branch, commercial access and permission. Supplier administration needs Purchasing
alone. Order selection/view/edit/status additionally needs Inventory read and both
modules. Receiving needs Purchasing manage AND Inventory manage AND both modules.
Organization/commercial administration states the dependency; it never auto-grants.

`PostgresDatabase.atomic` owns the receipt. Nested canonical Inventory transactions
reuse the SAME ALS-scoped PoolClient; Purchasing never duplicates stock balance SQL
or commits independently. Receipt/lines, canonical movements/balances, progress,
versions and activity commit together or all roll back. Actual first-line stock
write followed by later-line failure is tested. Locks plus optimistic versions
serialize racing authorities/receipts. Partial 4 + 6 against 10 reaches exactly 10;
over-receiving and closed-order receiving fail. Item reference prices remain intact.

Organization-unique keys plus normalized SHA-256 fingerprints return the same
receipt for identical retries, conflict for changed commands and create exactly
one physical increase under concurrent duplicates. Immutable relational links
enforce receipt/movement organization/branch/item/location/type/quantity identity.
Both repository and database deny independent Purchasing receipt reversal;
synchronized returns/corrections remain deferred. Inventory-only direct receiving
and ordinary reversal still pass their existing regressions.

Receiving starts blank, reviews actual quantities before confirmation, disables
duplicate submission and retains failed/uncertain command payload/key for retries.
Success reopens current detail with human receipt references, updated quantities/
status and canonical item/movement links. Latest detail history is clearly bounded;
older receipts remain in paginated branch history. UUIDs are not primary UI content.

## Shared analytics and deliberate deferrals

Four independently gated factual Dashboard widgets: open ordered/partial orders,
partial orders, open orders with an expected date, and receipt documents in the
trailing seven days. Awaiting is not a lateness assertion. No Reports permission is
needed for domain widgets; unauthorized facts are omitted from server responses.

Three curated selected-branch reports: Purchase Orders, Goods Received and daily
Supplier Purchase Summary. Reports read + Purchasing read + module access are
required; Goods Received also requires Inventory read + Inventory entitlement.
Pre-aggregating line values avoids receipt-join duplication. Shared CSV preserves
closed columns/filters, range/pagination/5 MiB budgets, UTF-8, formula-prefix escaping,
safe filenames and append-only export evidence; Supplier text is never executable.

No recipient is guessed for purchasing notifications. Event notifications and
delivery schedulers are deferred. Supplier custom fields are deferred to a reviewed
extension of the shared engine, not a second implementation. No supplier payments,
accounts payable, invoice posting, tax ledger, sales/POS, COGS, returns, amendments,
external ERP/search SaaS, Redis, Kafka, paid AI, mandatory SMTP/SMS/WhatsApp or payment
gateway is introduced. Correctness needs no always-running scheduler.

## Automated evidence

- Clean backend install, lint, typecheck, build: pass; unit/source tests **190/190**.
- Clean frontend install, lint, typecheck, production/PWA build: pass;
  component tests **86/86**.
- **31 distinct database integration files / 266 tests pass**. Additional required
  preflight rerun **17/17** and Mongo source contract **4/4** pass: 33 commands / 287
  tests total, with no skipped/failing assertions.
- Purchasing **22/22**; Inventory runtime **9/9**, migration **4/4**, cutover **7/7**;
  identity account **22/22**, tenant RBAC **25/25**, dynamic fields **19/19**,
  analytics/notifications **17/17**, CRM **16/16**. Identity/session, commercial,
  parity, Queue, Attendance, Customer Dues, activation/renewals, corporate/audit,
  Mongo retirement and source suites also pass.
- Backup envelope/tooling/watchdog contracts **15/15**; no crypto/key/TLS policy changed.
- All four full/production dependency audits: **0 vulnerabilities**.
- Dedicated Purchasing Chromium **17/17** and foundation **19/19** pass. Purchasing
  covers empty states, optional Supplier contacts/lifecycle, two-line exact draft,
  internal ordering, partial/full receiving, stock/history/price preservation,
  replay/conflict/over-receipt/reversal, module/role/tenant/branch negatives,
  all three CSV reports, and 360/390/768/1440 Light/Dark/System without page errors
  or document overflow. The 390px dark confirmation screenshot was visually checked
  and remains an ignored QA artifact, not repository content.
- Prior Chromium foundation **19/19**, identity **11/11**, administration **18/18**,
  dynamic fields **14/14**, analytics **13/13**, commercial **24/24** and CRM **15/15**
  pass: prior suites 114 tests; with Purchasing, **131 browser tests**. Administration/
  fields/analytics were recovered from this
  run's timestamped passing Playwright result files after the orchestration output
  expired; commercial/CRM were not inferred from older artifacts.
- Fresh/018-upgrade/repeated 019 migration and 001–018 checksum preservation pass.
  Historical source fixtures remain pre-CRM/pre-Purchasing: four actual legacy
  modules, no fictional Mongo mappings. Latest-schema expectations were advanced,
  not assertions removed.
- Docker configuration/build/startup pass; local Compose PostgreSQL/backend/frontend
  are healthy and migrations 001–019 match. Live/ready, root, login, `/suppliers` and
  `/purchasing` return HTTP 200; bounded backend/frontend logs show no runtime errors.
  SPA route 200 is not authenticated acceptance; disposable Chromium supplies that.
- After all local acceptance passed, hosted 001–018 history/checksums matched and
  only pending 019 was applied through the normal runner. Hosted 001–019 now match;
  `https://api.ekavio.afsify.com/health/live` and `/health/ready` return HTTP 200.
  Connection configuration stayed ignored/in memory, TLS unchanged; no hosted
  Supplier/payment records were created and no authenticated evidence is inferred.
- Complete source/diff/security/artifact review passes: scoped/parameterized server
  access, independent Inventory authority, immutable history, atomic/idempotent stock,
  escaped UI/CSV and no client-forgeable receipt marker. No credentials, real PII,
  private keys, environment files, backups/dumps, browser evidence, generated builds
  or dependency directories are part of the change. Documentation links pass.
- Owned disposable QA Vite/containers/network were stopped after testing. Normal
  Compose remains three healthy services; retained volumes and Atlas are untouched.

Initial browser checks caught the missing Inventory response receipt marker and a
fixture's trailing-space expectation; both were corrected, not waived. Initial
latest-schema/catalogue tests were updated from 18/five to 19/six while historical
upgrade/legacy boundaries remained strict. One clean install encountered a Windows
esbuild lock while QA was running; after stopping that QA run, the clean install
passed. Windows Purchasing/foundation helpers stalled after all assertions passed;
only verified owned QA process trees were stopped, and both suites exited zero.
Remaining suites use separately managed local QA servers to avoid that teardown.
The expanded owner-history assertion was corrected to include the event label
within its actor/timestamp row; all 17 final Purchasing cases then passed. One
earlier external-server rerun found Vite stopped (connection refused); another
was interrupted by Vite reloading after the test-file edit. Neither changed
product behavior or relaxed assertions. A simultaneous 39-minute execution pause
stalled one commercial case and a repository read; commercial was rerun without
extending timeouts or waiving the failed result.
The external CRM fixture was initially requested during backend startup (socket
hang-up before assertions). Readiness was then explicitly confirmed HTTP 200 and
the complete suite rerun, without weakening its sign-out/session/authority tests.
Managed browser connection failed before navigation due to missing sandbox metadata;
authorized local Chromium provides automated evidence, with no operator test loop.

## Release and operating limits

Accepted pending hosted 019 was applied through the normal locked/checksummed runner
AFTER all local acceptance; ignored staging connection values remained in memory, TLS
unchanged and logs credential-free. Hosted schema/public health is not authenticated
Purchasing or exact deployed-build acceptance. No real hosted Supplier/payment data
is created. **Extended hosted recovery through 019 remains OPEN**.

Commit the coherent result on main, push, verify exact-commit GitHub CI, then create
annotated `v2-09b-suppliers-purchasing` only at that successful SHA. Final main must be
clean and match origin and fresh remote. The final release report records actual
commit/CI/tag evidence; this document never substitutes another commit's CI.

Render Free remains staging-only; always-on hosting remains OPEN. Atlas is retained
and untouched. **NO-GO FOR REAL CUSTOMER DATA** remains. V2-09C HR Plus and V2-10 final
acceptance remain separately authorized/deferred; neither begins automatically.
