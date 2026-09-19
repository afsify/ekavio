# V2-06 Operational PostgreSQL Roadmap

- Status: Proposed by V2-06A
- Date: 2026-09-17
- Applies after: V2-06A Operational Domain Architecture Review & Relational Target Design

## Roadmap rules

Each implementation milestone begins from a clean main branch and an accepted checkpoint. It owns one coherent runtime-authority change and ends before the next begins.

For every Mongo-sourced cutover:

1. Back up the source and target and prove the documented restore path.
2. Add reviewed forward-only PostgreSQL migration(s).
3. Provide a read-only preflight and dry-run-by-default migration.
4. Require an explicit apply flag and refuse when mapping, value, or tenant/branch ambiguity exists.
5. Make application deterministic/idempotent through legacy IDs and domain idempotency keys.
6. Reconcile row counts, rejected rows, identifiers, money/quantity totals, and domain invariants.
7. Cut one runtime authority with no dual-write and no automatic fallback.
8. Run tenant/branch security, contract, concurrency, parity, rollback-boundary, lint, typecheck, test, build, Compose, health, and diff gates appropriate to the milestone.
9. Update ADRs, PROJECT_CONTEXT, README/runbook material, and runtime-authority searches.

Legacy Mongo data is not presumed valid merely because it exists. Every skipped/quarantined row is counted and explained; silent loss is forbidden.

## V2-06B — Customer, Service, Appointment & Queue PostgreSQL Vertical

- Subdivision accepted: V2-06B1 foundation/readiness, then V2-06B2 runtime cutover.
- V2-06B1 status: completed 2026-09-17.
- V2-06B2 status: next milestone.

### V2-06B1 — PostgreSQL foundation and migration readiness

V2-06B1 owns migration 004; branch timezone validation; Customer, Service, provider, Appointment, Queue session/token schemas; composite tenant/branch constraints; append-only histories; row-locked token allocation; atomic appointment check-in; dry-run/apply/verify/preflight tooling; and correctness/concurrency/migration/security evidence. PostgreSQL operational rows remain inactive shadow/future-runtime state. Mongo remains the sole Queue runtime authority, existing Queue routes and frontend are unchanged, no Queue dual-write exists, and no new realtime event is emitted.

### V2-06B2 — Complete vertical runtime cutover

V2-06B2 owns the single accepted authority switch for Customer, Service, Appointment, and Queue; selected-branch production APIs; canonical DTOs and real pagination; Dashboard and frontend integration; post-commit PII-minimized realtime; executable Mongo Queue runtime removal; production validation; and the rollback boundary. It may begin only after B1 remote CI/tag acceptance and must require a restore-tested backup, reviewed mapping, clean apply/reconciliation, valid active-branch timezones, passing read-only preflight, and concurrency/security gates.

The domain order is unchanged: this remains the first V2-06 operational vertical, followed by Attendance, Customer Dues, Inventory, and corporate/audit retirement.

### Goal

Deliver the first branch-safe, sellable clinic/salon operational vertical and remove Queue runtime authority from MongoDB. Establish one canonical Customer/Service vocabulary so Appointments and Queue do not create another cross-database identity bridge.

### Tables/domains

- Add explicit IANA timezone to PostgreSQL branches with reviewed backfill.
- customers.
- services.
- service_branch_availability.
- provider_service_assignments using existing memberships.
- appointments and appointment_status_events.
- queue_sessions, queue_tokens, and queue_status_events.

### Existing functionality preserved

- Authenticated, entitled, permission-checked Queue create/list/status workflows.
- Canonical organization and selected-branch context.
- Existing queue commercial entitlement and queue.read/queue.manage permission semantics.
- Walk-in customers and the current waiting/serving/completed/cancelled intent.
- Compatible /queue paths where safe, with canonical UUID DTOs and real pagination metadata.
- Dashboard active-queue count, now branch-correct.

### Migration strategy

- **Customers:** transform Queue customerName/phone records and known Ledger identities into organization-scoped customer candidates. Normalize phone, report collision groups, and never auto-merge an ambiguous group.
- **Services:** transform distinct Queue serviceType values into reviewed organization services and branch availability. Collisions/empty labels block apply.
- **Queue:** transform Mongo Queue rows to queue_sessions/tokens/events. The preflight requires an explicit branch and local business-date/session policy; it never guesses silently. Preserve legacy_mongo_id on tokens and original timestamps. Duplicate historical token labels are reported and may coexist only in distinct reviewed sessions.
- **Appointments:** start clean because there is no legacy source.
- Activate PostgreSQL Queue authority only after migration/reconciliation and branch isolation pass. After activation, ordinary Queue paths never read/write Mongo.

### Tests required

- Customer phone normalization, duplicate candidates, explicit merge, and cross-tenant merge denial.
- Composite organization/branch/customer/service/provider FK isolation.
- Service availability and provider assignment authorization.
- Appointment timezone parsing, invalid intervals, status transitions, optimistic versioning, and concurrent overlap denial.
- Atomic concurrent Queue token creation proving unique monotonic numbers in a session.
- Queue session reset/business-date behavior and close behavior.
- Appointment check-in creates exactly one queue token; repeated idempotent request returns the same result.
- Queue transition matrix, immutable event history, branch filtering, pagination, dashboard counts, and PII-minimized realtime payloads.
- Migration dry-run/apply/idempotency/reconciliation plus source backup/restore evidence.
- Frontend Queue contract and error/empty/loading behavior.

### Explicit non-goals

- No Customer CRM, marketing, loyalty, documents, or automatic contact merge.
- No provider payroll or new staff identity.
- No recurring schedules, reminders, resource rooms, telemedicine, SMS, or WhatsApp.
- No public token lookup unless separately accepted with an opaque identifier and PII review.
- No Attendance, Customer Dues, Inventory, Sales, notification, or chat cutover.

### Exit criteria

- PostgreSQL is the sole runtime authority for Customers, Services, Appointments, and Queue.
- Every operational Queue query/write is organization- and selected-branch-safe.
- countDocuments + 1 and the queue_updated event contract are absent from runtime paths.
- Migration/reconciliation reports have zero unexplained differences.
- Queue UI uses real pagination/counts and canonical contracts; no first-page totals or stale duplicate hook remain.
- Required quality, Docker, health, security, diff, remote CI, and completion-tag gates pass.

## V2-06C — Attendance PostgreSQL Cutover

### Goal

Make attendance branch-safe and useful without inventing payroll or workforce scheduling; replace the mock Attendance page with the real backend contract.

### Tables/domains

- attendance_records.
- attendance_record_changes.
- Existing memberships and branches remain identity/authorization authority.

### Existing functionality preserved

- Mark present/absent/half-day for a date.
- List a day's attendance.
- Attendance entitlement and attendance.read/attendance.manage permissions.
- Existing canonical user inputs may be accepted through a compatibility DTO while the stored FK is membership_id.
- Dashboard present count, now based on branch local date.

### Migration strategy

- Transform Mongo Attendance rows using canonical organization/user mappings and historical/active membership evidence.
- Preserve date/status and timestamps; never fabricate check-in/out times, source actors, or reasons.
- A row with ambiguous/no branch or membership mapping blocks apply and appears in the report.
- Preserve legacy_mongo_id on the target record; enforce one organization/membership/date record.
- Cut runtime storage from Mongo to PostgreSQL only after branch-filtered parity and reconciliation.

### Tests required

- Cross-tenant and cross-branch read/write denial, including the previous null-user leak case.
- Unique daily record and concurrent/retried marking behavior.
- Branch-timezone date boundaries and check-out-after-check-in constraint.
- Manual correction reason/actor and immutable before/after history.
- Membership inactive/revoked behavior.
- Migration ambiguity, dry-run, idempotency, count/status/date reconciliation.
- Real frontend roster/list/mark behavior and truthful errors.

### Explicit non-goals

- No shifts, rosters, leave approval, payroll, biometrics, performance analytics, or geofencing.
- No automatic working-hour calculation beyond fields required by the accepted attendance contract.
- No Customer Dues, Inventory, or Sales work.

### Exit criteria

- PostgreSQL is sole Attendance record authority; Mongo Attendance has no runtime import.
- No ordinary attendance request can return or modify another branch's row.
- Attendance page contains no mockStaffData and exercises the accepted API.
- UTC/server-local ambiguity is replaced by branch-local business-date rules.
- Migration, quality, security, Compose, CI, and tag gates pass.

## V2-06D — Customer Dues PostgreSQL Cutover

### Goal

Replace the ambiguous Mongo Ledger with an exact, immutable Customer Dues journal and connect the currently mock frontend to real customer balances/history.

### Tables/domains

- customer_due_entries.
- Use customers from V2-06B.
- Add customer_due_balances only if load measurement in this milestone proves a projection is required; otherwise derive with indexed SQL.

### Existing functionality preserved

- Record a customer charge/credit and payment with description.
- List Customer Dues history.
- ledger entitlement and ledger.read/ledger.manage permissions remain canonical commercial/permission keys.
- /ledger may remain a documented compatibility route while new DTOs use customer UUIDs, exact money, occurredAt, and entry type.

### Migration strategy

- Transform each Mongo Ledger row into a Customer Dues entry only after validating credit/payment semantics.
- Resolve the customer through explicit source provenance and reviewed normalized-phone/name candidates. Ambiguity blocks automatic application.
- Convert legacy decimal display values to integer minor units exactly; any value with unsupported scale or unsafe representation blocks apply.
- Assign a reviewed originating branch; do not silently choose the caller's current branch.
- Preserve timestamps, description, and legacy_mongo_id. Do not synthesize allocations or invoices.

### Tests required

- Exact minor-unit parse/serialization, currency scale, overflow, rounding-boundary, and no floating-point persistence tests.
- Signed balance invariant for charge/payment/adjustment_increase/adjustment_decrease/reversal.
- One-time same-customer/currency reversal and immutable history.
- Idempotent payment/import retries and concurrent writes.
- Organization/branch/customer/actor FK isolation and aggregate-permission separation.
- Migration value totals by organization/currency/type, dry-run/apply/idempotency, and ambiguous-customer rejection.
- Real frontend create/list/balance/reversal, removal of debit/payment and id/date shape mismatches.

### Explicit non-goals

- No chart of accounts, journal accounting, GST filing, invoice engine, bank reconciliation, gateway, credit scoring, or debt collection automation.
- No charge-level allocation until Sales/invoice aging requires it.
- No Inventory or merchant Sales implementation.

### Exit criteria

- PostgreSQL Customer Dues is sole runtime authority and Mongo Ledger has no runtime import.
- Every authoritative amount is integer minor units with explicit currency and string API serialization.
- Corrections are reversal-oriented; updates/deletes cannot rewrite financial history.
- Ledger page is real and no mock rows/local-only mutation remain.
- Per-customer and reconciliation balances match accepted source semantics.
- All required gates pass.

## V2-06E — Inventory PostgreSQL Cutover

### Goal

Replace mutable organization-level stock with branch/location-aware, movement-based inventory and exact quantities/prices.

### Tables/domains

- inventory_items.
- stock_locations.
- stock_movements.
- stock_balances.

### Existing functionality preserved

- Create/list inventory items.
- Show current and low-stock state.
- inventory entitlement and inventory.read/inventory.manage permissions.
- Existing /inventory and /inventory/low-stock paths where compatibility is safe.
- Dashboard low-stock count, now scoped to the selected branch/location.

### Migration strategy

- Transform each Mongo Inventory document into an organization item, a reviewed branch/default location, an immutable opening movement, and the corresponding balance.
- Resolve duplicate names/SKUs, branch assignment, unit, quantity precision, and price scale in preflight. Ambiguity blocks apply.
- Convert price to integer minor units exactly and currentStock/threshold to NUMERIC(18,3). Preserve no unsupported excess precision silently.
- Preserve legacy_mongo_id on items and source provenance on opening movements.
- Reconcile item counts, opening totals per item/location, movement sums, balances, prices, and low-stock results before authority activation.

### Tests required

- Decimal quantity parsing/serialization, precision/scale, unit immutability, and negative-stock denial.
- Concurrent movement writes with balance-row locking and no lost update.
- Idempotent movement retry, reversal, transfer-pair behavior if transfers are included, and movement/balance reconciliation.
- Branch/location isolation and cross-tenant FK rejection.
- Exact minor-unit selling price behavior.
- Migration dry-run/apply/idempotency and opening-balance reconciliation.
- Frontend item vs stock-action contracts, page-aware lists, low-stock behavior, and accurate exports.

### Explicit non-goals

- No suppliers, purchase orders, receiving workflow, lots/expiry, warehouse optimization, tax engine, barcode hardware, or merchant Sales.
- No Redis cache or asynchronous stock authority.
- No unaudited direct balance edit.

### Exit criteria

- PostgreSQL is sole Inventory authority; every stock delta has a movement.
- stock_balances exactly reconcile to movements and concurrent tests prove no lost updates.
- Money and quantity values never depend on JavaScript binary floating point.
- Ordinary inventory reads/writes require selected branch/location authorization.
- Mongo Inventory has no runtime import and all gates pass.

## V2-06F — Corporate, Audit & Mongo Retirement

### Goal

Move the final legitimate runtime dependencies to existing PostgreSQL foundations, retire unsupported prototypes and legacy compatibility paths, and remove MongoDB from the production runtime.

### Tables/domains

- Existing parent_organizations and organizations.parent_organization_id.
- Existing audit_events, with only reviewed additive constraints/indexes if required.
- No replacement Message/Notification tables.
- Remove remaining operational identity bridge/runtime Mongoose composition after retention gates.

### Existing functionality preserved

- Authorized creation/linking of parent organizations and consolidated commercial read behavior.
- Safe allowlisted security audit recording.
- Explicitly unavailable Chat remains unavailable.
- Notification bell does not pretend a backend inbox exists.
- Offline archive/recovery artifacts remain only if policy requires them; they are not runtime dependencies.

### Migration strategy

- Reconcile Mongo ParentOrganization and parent links against already shadowed PostgreSQL rows, then cut corporate runtime to PostgreSQL.
- Transform only securityAuditService-compatible, scalar-safe ActivityLog records into audit_events. Report/hash/archive unsafe Mixed records; never silently drop them or inject unreviewed JSON.
- Inventory Message and Notification counts. Export/archive if retention requires; otherwise record accepted retirement counts. Do not map them to invented relational domains.
- After a restore-tested backup and expired rollback windows, remove old Mongoose identity/commercial/operational models, Mongo runtime composition, mappings no longer required, Compose Mongo service, and Mongo readiness checks in one reviewed milestone.

### Tests required

- Parent owner/child authority, cross-organization link denial, canonical parent selection, and commercial aggregation consistency.
- Safe audit allowlist, metadata redaction/shape, actor-null behavior where permitted, failure policy, and append-only behavior.
- Migration/reconciliation for parent rows/links and accepted/rejected audit counts.
- Repository-wide runtime import/authority searches proving no executable Mongo dependency.
- Compose start, health/readiness, backup/restore, and rollback-boundary validation without Mongo.
- Frontend corporate contract and removal of literal defaultParent/phantom Notification calls.

### Explicit non-goals

- No Chat, notification inbox, email/SMS/WhatsApp delivery, parent-level operational data sharing, or new commercial behavior.
- No deletion of required backups or legally retained archives.
- No PostgreSQL-to-Mongo fallback.

### Exit criteria

- PostgreSQL is sole runtime authority for every live domain.
- Production dependencies, Compose, readiness, and application code do not require MongoDB/Mongoose.
- Parent/corporate and safe audit migration reports reconcile with all exclusions explained.
- Message/Notification retirement and retention decisions are documented.
- A clean environment starts and passes all quality, integration, security, health, backup/restore, remote CI, and tag gates without Mongo.

## Future V2-07 — Merchant Sales Lite (deferred)

### Goal

Only after V2-06 acceptance, add the minimum merchant/customer Sale workflow that can atomically create stock movements and Customer Dues/payment entries.

### Candidate tables/domains

- sales and sale_lines.
- payments and payment_allocations where settlement requires them.
- Explicit void/refund history.

### Existing functionality preserved

- Customer, service/item, Dues, Inventory, branch, membership, and exact-money invariants.
- EkaVio SaaS subscriptions remain a completely separate commercial domain.

### Migration strategy

- Start clean unless a later audit finds a real merchant-sale source.
- Never reinterpret SaaS invoices/subscriptions as merchant Sales.

### Tests required

- Atomic Sale/stock/Dues effects; idempotent checkout; void/refund/reversal; exact tax/rounding only if tax scope is explicitly accepted; branch/tenant security.

### Explicit non-goals

- No full ERP, general accounting, supplier suite, gateway requirement, or tax-filing platform.

### Exit criteria

- Accepted product scope and ADR exist before implementation; every committed Sale has reconciled money and stock effects; subscription billing remains isolated.

## Sequence rationale

The order is not alphabetical. V2-06B first removes the highest-value branch and concurrency defect while establishing identities every later customer-facing domain needs. Attendance follows because it has a narrow security gap and a misleading mock UI. Customer Dues then establishes the exact-money and immutable-financial conventions. Inventory follows after those conventions, because stock/location transformation and concurrency are the most complex prototype correction. Corporate/audit cleanup comes last so Mongo can be removed once, after every true operational dependency has left. Sales remains future work, not a hidden prerequisite for correcting current data.
