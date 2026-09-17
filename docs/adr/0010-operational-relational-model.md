# ADR 0010: Operational Relational Model

- Status: Accepted
- Date: 2026-09-17
- Scope: V2-06 operational target architecture

## Context

V2-05C and V2-05D made PostgreSQL authoritative for identity, sessions, authorization, and commercial state. Queue, Inventory, Ledger, Attendance, corporate parent linkage, and security audit records still use MongoDB through canonical-to-legacy identity mapping.

Those Mongo documents are prototype shapes rather than safe relational targets. They are organization-only, duplicate customer and service identity, store money and quantities as binary floating-point Numbers, and generally hold mutable current state without durable business history. Queue number generation is count-based and race-prone; Inventory has no movement journal; Ledger is actually Customer Dues; Attendance has no branch key. Copying these documents one-for-one would preserve the defects and make later Appointments, Sales, and branch isolation expensive to correct.

## Decision

### Relational authority and scope

Operational domains will move incrementally to PostgreSQL inside the existing modular monolith. Each cutover has one runtime authority, no automatic fallback, and no ordinary dual-write. Mongo compatibility exists only in explicit migration, verification, and time-bounded recovery tooling.

Every operational row belongs to a canonical PostgreSQL organization. Branch is added only where it is a real transaction boundary:

- Customers and item/service catalogues are organization-scoped.
- A customer may have an optional home branch; a service has branch availability.
- Appointments, Queue sessions/tokens, Attendance, stock locations/movements, Customer Dues entries, and future Sales are branch-scoped.
- Missing branch context never means all branches on an ordinary operational route.
- Organization-wide aggregation requires a separate authorized contract and permission.

Composite organization relationships or equivalent database constraints prevent a branch, membership, service, provider, customer, or location from another organization being linked by UUID.

### Customer identity

Customer is an organization-wide identity shared by Appointments, Queue, Customer Dues, Inventory-adjacent Sales, and future Sales. The initial model contains name, normalized phone, optional home branch, notes, status, timestamps, and merge/provenance metadata. It is intentionally not a CRM.

Normalized phone is indexed but is not initially unique. Shared numbers, recycled numbers, legacy formatting, and incomplete data make automatic uniqueness or merging unsafe. A merge is an explicit audited transaction; phone equality alone never merges records.

### Services and providers

Services are organization-owned catalogue entries with branch availability, duration, optional price, and active state. This replaces Queue's free-form serviceType.

Providers are existing memberships assigned to services at branches. No second user or staff identity table is created.

### Appointments and Queue

Appointment and Queue are separate domains. An appointment reserves service time. Queue represents on-site service order. Check-in changes appointment status and creates one queue token referencing the appointment; walk-in queue tokens do not require an appointment.

Queue numbering is scoped by queue_sessions. A session owns organization, branch, local business date, a non-null lane key defaulting to default, state, and next token number. Token creation atomically locks/updates this counter and inserts the token. queue_tokens has a unique (queue_session_id, token_number) constraint. Count-based generation is prohibited.

Appointments and Queue tokens hold current status/version projections. appointment_status_events and queue_status_events are append-only transition histories with actor, reason, and time. Database constraints and transactional transition checks enforce valid state changes.

Appointment instants use TIMESTAMPTZ. Every branch has an explicit IANA timezone for input interpretation and business dates. Server-local time is never business authority. Active provider appointments cannot overlap, enforced by a reviewed PostgreSQL exclusion constraint or an equivalent locked scheduling transaction.

### Attendance

Attendance references canonical membership, organization, and branch. The initial useful workflow remains one daily record per organization/membership/date with optional check-in/out, status, source, override actor/reason, version, and timestamps. Manual corrections create append-only attendance change records.

Shifts, leave, payroll, and performance are deferred until an actual workflow requires them. The design does not fabricate check-in/out times when migrating date-only Mongo status records.

### Inventory and stock

Inventory is replaced by organization-owned items, branch-owned stock locations, immutable stock movements, and transactionally maintained stock balances.

The authoritative invariant is:

**balance(item, location) = sum(non-reversed movement deltas for item, location)**

Every stock-changing action inserts a movement. The transaction locks the balance row, validates the negative-stock policy, inserts an idempotent movement, and updates the cached balance. Reconciliation recomputes movements and must report no difference. A balance is never repaired by an unaudited overwrite.

The initial policy denies negative stock. Suppliers, purchases, transfers, tax profiles, lots, and expiry are deferred, while typed source/reference fields permit later integration.

### Customer Dues

The Mongo Ledger is redefined as Customer Dues, not general accounting. customer_due_entries is an immutable journal of charge, payment, adjustment_increase, adjustment_decrease, and reversal entries linked to organization, originating branch, customer, actor, currency, optional due date, and optional typed business source. Amount is positive; entry type determines sign. A reversal contributes the inverse of its target, cannot target a reversal, and each entry can be reversed at most once.

The authoritative invariant is:

**customer due balance = signed sum of immutable entries for that customer and currency**

Charges and adjustment_increase entries add to the balance; payments and adjustment_decrease entries subtract; a valid reversal contributes the inverse sign/value of its target. Corrections use linked reversals, never silent update/delete. A balance projection is allowed only after measured need and must reconcile to the journal. Charge-level settlement allocations are deferred until invoice/aging behavior requires them.

### Money and quantities

Authoritative money is BIGINT integer minor units paired with ISO 4217 currency. INR is stored as paise. API minor-unit values are decimal strings so JavaScript floating point and safe-integer limits cannot corrupt them. UI decimal input is parsed according to currency scale and rounded once, half-up, at the input boundary. Cross-currency totals are not produced without an explicit conversion domain.

Stock quantity is NUMERIC(18,3), serialized through APIs as a decimal string and processed with decimal-safe code. This supports fractional goods while bounding precision. Item unit cannot change after movements exist without an explicit conversion migration.

### Identifiers and migration compatibility

New rows use UUID primary keys and canonical PostgreSQL organization, branch, membership, and user references. ObjectId semantics do not enter permanent APIs.

Migrated source document rows may hold nullable, format-checked, unique legacy_mongo_id provenance during cutover/recovery. Customer and Service have no source ObjectId because they are derived from embedded strings; deterministic migration artifacts link their new UUIDs to contributing source documents and reviewed merge decisions. Generated relational history rows carry explicit migration provenance where needed. Legacy IDs are removed only after reconciliation, restore evidence, rollback-window expiry, and a repository-wide proof that no runtime or supported recovery path needs them.

### Immutability, transactions, and idempotency

Queue/appointment status events, stock movements, Customer Dues entries, attendance correction records, and future Sale/payment events are append-only. Current-state tables remain ordinary relational projections. This is not generic event sourcing.

Queue token creation, appointment booking, stock changes, Customer Dues/payment writes, and imported/kiosk attendance writes use database uniqueness, row locking or exclusion constraints, and one PostgreSQL transaction. Retriable creates carry organization-scoped idempotency keys. Redis, distributed locks, or a message broker are not required.

### Realtime and cost

Only Queue initially requires realtime. queue.token.created and queue.token.status_changed are emitted after commit to the authorized organization/branch room with PII-minimized canonical payloads. HTTP remains recovery and read authority.

The architecture remains a low-cost modular monolith using PostgreSQL transactions, constraints, indexes, row locks, CTEs, and limited JSONB. It adds no Redis, Kafka, RabbitMQ, Elasticsearch, microservices, Kubernetes, paid AI, SMS, WhatsApp Business API, or payment gateway dependency.

## Consequences

- Operational Mongo documents cannot be copied directly; domain-specific dry-run/apply/verify transforms are required.
- Customer, Service, Appointment, and Queue must cut over as one vertical to avoid another cross-database operational identity bridge.
- Branch-level isolation becomes a data constraint as well as an authorization check.
- Historical data remains explainable through status events, movements, dues entries, attendance changes, and security audits.
- APIs must expose exact money/quantity strings and canonical UUIDs; stale mock and duplicate frontend contracts must be replaced during owning milestones.
- PostgreSQL availability becomes required for each operational domain as it cuts over.
- Mongo remains required until Queue, Attendance, Customer Dues, Inventory, corporate linkage, and audits are cut over and prototype models are archived/retired.

## Alternatives rejected

### One-for-one Mongo document tables

Rejected because this would preserve organization-only scope, duplicated customer data, floating-point money, mutable balances, and missing history.

### Keep Mongo for operational domains indefinitely

Rejected because every request would continue crossing canonical/legacy identity boundaries and transactional workflows spanning customers, appointments, queue, dues, and stock would lack one database transaction.

### Generic event sourcing and external brokers

Rejected as unnecessary complexity. Append-only relational history plus current projections satisfies the identified audit and correctness needs.

### Phone as customer identity

Rejected because a phone is an attribute, not a stable unique customer key, and the legacy data does not prove organization-level uniqueness.

### Full ERP/CRM in the operational foundation

Rejected. The selected tables support the current product and a clean future Sales boundary without speculative accounting, payroll, supplier, marketing, or messaging systems.
