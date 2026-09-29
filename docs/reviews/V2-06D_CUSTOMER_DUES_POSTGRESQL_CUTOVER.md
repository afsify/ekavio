# V2-06D Customer Dues PostgreSQL Cutover Review

- Date: 2026-09-29
- Starting commit: `072eaf1e172a7db8e2cdd93979335d4f3e660895`
- Starting exact CI: GitHub Actions run `36521952001` (success)
- Checkpoint: `pre-v2-06d-customer-dues-postgres-cutover`
- Runtime authority: PostgreSQL
- Scope: exact Customer Dues journal, balances, corrections, legacy transform, real frontend, and explicit authority activation

## Baseline and legacy findings

The accepted V2-06C tag resolved to the clean synchronized starting commit before the checkpoint. The legacy Mongoose `Ledger` document is organization-wide and duplicates customer name and phone. It stores a JavaScript `Number`, `credit`/`payment`, optional description, and timestamps. It has no canonical Customer, branch, actor, idempotency, reversal, or immutable-history fact. Its POST route allowed free-text identity and floating money. The frontend used two hard-coded rows and local mutations rather than any backend API.

The actual domain is Customer Dues, not general accounting. A legacy `credit` means a charge that increases customer debt; `payment` decreases it. The milestone did not add accounts, invoices, tax/GST, supplier payables, banking, revenue/profit, sales/POS, or gateway behavior.

## Relational and money design

Forward-only migration `010_customer_dues_runtime_authority.sql` applies after accepted migrations 001 through 009 and in a clean 001-through-010 run. It creates append-only `customer_due_entries` and extends the durable operational authority latch without changing historical migrations.

Every row owns canonical organization, originating branch, Customer, type, positive `BIGINT` paise magnitude, INR, optional due date and description, optional typed source, reversal target, actor, retry/fingerprint data, occurrence/creation time, and optional internal migration provenance. Composite foreign keys and an insert trigger enforce active same-organization branch/Customer/actor context. Indexes cover branch journal and organization Customer history; partial unique indexes enforce organization command idempotency and one reversal per target.

Sign is derived: charge and increase adjustment are positive; payment and decrease adjustment are negative; reversal is the exact inverse of its target. Balance is an indexed journal aggregate rather than a mutable column. Normal requests accept one strict decimal string and convert directly to paise with `BigInt`; malformed, zero, negative, excessive precision, exponent notation, unsafe coercion, and PostgreSQL overflow fail. API money values remain decimal strings.

Ordinary payment takes a transaction-scoped organization/Customer advisory lock, calculates the authoritative organization-wide balance, rejects overpayment, and inserts atomically. Adjustments are explicit privileged facts and require a reason. Reversal locks the selected-branch target, requires exact magnitude/scope/currency/actor/reason, disallows reversal-of-reversal and a second reversal, and leaves both facts visible. Updates and deletes are rejected by the database.

## Scope, API, and compatibility

Customer remains the organization-wide identity; journal rows do not copy its name or phone. Ordinary list/create/reversal is selected-branch scoped. The explicit balance endpoint returns separately labelled organization-wide and selected-branch balances. All routes require the stable `ledger` commercial entitlement; reads use `ledger.read` and money-changing commands use `ledger.manage`.

Canonical endpoints are:

- `GET|POST /api/customer-dues/entries`
- `POST /api/customer-dues/entries/:entryId/reversal`
- `GET /api/customer-dues/customers`
- `GET /api/customer-dues/customers/:customerId/balance`
- `GET /api/customer-dues/customers/:customerId/history`

Create commands use canonical `customerId`, type, decimal amount, INR, optional due date/description/occurrence time, and required idempotency key. Public DTOs omit migration source IDs and actor internals. `/api/ledger` is retained only as a time-bounded read adapter over the same selected-branch PostgreSQL DTO. The unsafe legacy POST contract and schema were removed.

## Migration, preflight, and authority

The Mongo transform is dry-run first. It maps `credit` to `charge`, preserves `payment`, accepts only exactly convertible two-decimal INR values, preserves description and source creation time, and retains source ID/fingerprint internally. Customer resolution uses an accepted Ledger `customer_source_links` row or an explicit matching review override; a phone match never merges identity. Every source document needs reviewed branch resolution because legacy Ledger contains no branch.

Reconciliation reports source/applied/blocker counts, type and organization counts, exact charge/payment totals, Customer/branch coverage, timestamp coverage, source-to-target facts, and legacy-ID uniqueness without logging names or phones. Apply is transactional and repeat-safe. Missing/conflicting Customer evidence, missing/invalid branch evidence, invalid type/money/timestamp/description/provenance, unused overrides, and target conflicts are blockers.

Preflight requires migration 010, the journal, valid canonical references, clean reconciliation, zero general/money/Customer/branch blockers, active `ledger` catalogue data, repository health, PostgreSQL source-controlled authority, and the latch. Activation is a separate explicit apply that records `customer_dues/postgresql/v2-06d-cutover`; normal migration apply then refuses without the recovery flag.

## Frontend result

The mock Ledger page is now a mobile-first Customer Dues screen. It loads canonical Customers and the selected-branch paginated journal, displays separately labelled authoritative organization and branch balances, filters by Customer/type/date, and has loading/error/empty/read-only states. Authorized users can record charges, payments, and reasoned adjustments; payment copy explains that debt decreases. Reversal requires confirmation and reason, then keeps original and reversal visible. The UI sends decimal money strings and retry UUIDs, refetches server authority after success, and never computes authoritative balance from the loaded page. CSV export is explicitly labelled current page.

## Acceptance evidence

Dedicated automated coverage proves exact decimal/paise conversion through PostgreSQL `BIGINT` maximum, malformed/zero/negative/unsafe legacy values, sign and sequence balances, organization-versus-branch scope, date filtering, pagination, overpayment rejection, idempotent retry/conflict, concurrent payments, concurrent reversal, append-only constraints, reversal shape, actor assignment, tenant/branch/Customer/entry isolation, normal DTO provenance privacy, clean and accepted upgrade migrations, dry-run/apply/repeat/reconciliation, every required transform blocker, preflight fail-closed behavior, durable activation, and post-activation migration refusal.

The dedicated suites pass: runtime/invariants 8/8, migration/reconciliation 4/4, and cutover controls 6/6. Unit/contract coverage includes exact money/schema, separate read/manage permissions, `ledger` entitlement route guards, PostgreSQL-only runtime source contracts, the read-only compatibility route, and frontend removal of mock/debit/fake success behavior. Backend lint, typecheck, 131/131 unit-contract tests, and build pass. Frontend lint, typecheck, and production build pass. Every accepted PostgreSQL, parity, identity, commercial, operational, intake, activation, renewal, Attendance, and Customer Dues integration family passed. One parallel local run exhausted the disposable PostgreSQL connection pool; the same affected operational suite passed in isolation and had no product assertion failure.

The preserved-volume local cutover found zero Mongo Ledger source documents and zero blockers. Migration 010 applied; dry-run, apply, and reconciliation were clean; pre-activation preflight failed only on the deliberately pending latch; activation dry-run and explicit apply succeeded; post-activation preflight/status report PostgreSQL authority; and normal migration apply is protected after activation. All four Compose services are healthy, `/health/live`, `/health/ready`, `/`, and `/login` return HTTP 200, and recent backend/frontend logs contain no runtime error.

Hosted PostgreSQL migration 010 was the only pending migration and was explicitly applied on 2026-09-29; migrations 001 through 010 then reported applied and hosted liveness/readiness remained HTTP 200. The Customer Dues Atlas dry-run could not start because SRV resolution was refused from this machine. No hosted source data was read or written, no mapping was guessed, Atlas access was not broadened, and the hosted Customer Dues latch was not activated. Reconciliation, preflight, and activation remain pending from a network-authorized environment. The existing hosted Attendance open item remains unchanged.

## Retained scope and readiness

Mongo Ledger is migration/recovery input only; ordinary Customer Dues runtime has no Mongoose import, query, write, fallback, dual-write, or automatic repair. MongoDB is not retired: Inventory, applicable ParentOrganization/corporate data, ActivityLog/security audit, and retained migration/recovery sources still require it. Hosted Attendance reconciliation/activation remains open due the previously recorded Atlas network restriction. Backup/restore proof remains open before real pilot or customer data, and staging remains internal development/testing infrastructure rather than production or pilot approval.

Operational steps are in [the V2-06D runbook](../runbooks/V2-06D_CUSTOMER_DUES_CUTOVER.md); the durable design is [ADR 0018](../adr/0018-postgresql-customer-dues-runtime-authority.md).
