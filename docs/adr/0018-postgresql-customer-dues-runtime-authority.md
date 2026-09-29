# ADR 0018: PostgreSQL Customer Dues Runtime Authority

- Status: Accepted
- Date: 2026-09-29
- Scope: V2-06D Customer Dues migration and runtime cutover

## Context

The legacy `Ledger` is not a general accounting ledger. Its Mongo documents record an organization, duplicated customer name/phone, a floating-point amount, a `credit` or `payment` label, an optional description, and timestamps. They have no canonical Customer UUID, branch, actor, retry key, immutable correction model, or exact-money representation. The existing frontend was unrelated mock state.

V2-06A classified this domain as Customer Dues: charges that increase what a merchant's customer owes and payments that reduce it. V2-06D must make PostgreSQL the sole ordinary authority without adding general accounting, invoices, tax, POS, a payment gateway, or mutable balances.

## Decision

### Immutable journal and exact money

`customer_due_entries` is an append-only factual journal linked to canonical organization, originating branch, Customer, and actor. Its types are `charge`, `payment`, `adjustment_increase`, `adjustment_decrease`, and `reversal`. `amount_minor` is always a positive PostgreSQL `BIGINT` magnitude in INR paise; type determines sign. Normal API input is a validated decimal string with at most two places, and output includes decimal-string minor units and formatted decimal strings so JavaScript numbers never become money authority.

Balance is derived by aggregating signed entries. It is not stored as an independently mutable amount. Ordinary payments transactionally lock the organization/customer balance boundary and cannot exceed the current organization-wide outstanding balance. An explicit adjustment or reversal may produce a credit balance; this is a privileged factual correction, not accidental payment behavior.

### Reversals and corrections

Normal entries cannot be edited or deleted. A full reversal references exactly one same-organization, same-branch, same-customer, same-currency target, carries its exact magnitude, and contributes the inverse sign. It requires an actor, reason, occurrence time, and idempotency key. A reversal cannot target another reversal, cannot be partial, and a partial unique index permits one reversal per target. Partial corrections use explicit adjustment entries.

### Scope and authorization

Every ordinary list/create/reversal starts with live PostgreSQL organization and selected-branch context, the stable `ledger` entitlement, and `ledger.read` or `ledger.manage`. Composite foreign keys and an insert guard require the branch, Customer, and actor assignment to belong to the same organization. A branch journal never returns another branch's rows.

Customer identity is organization-wide, so the balance endpoint deliberately returns separately labelled organization-wide and selected-branch aggregates for one authorized Customer. UUIDs identify records but do not authorize access. Public DTOs omit migration source IDs and actor internals.

### Idempotency and concurrency

Native commands require an organization-scoped idempotency key and a hash of normalized authoritative input. The same key and same command returns the original result; conflicting reuse returns a deterministic conflict. PostgreSQL advisory transaction locks serialize customer balance decisions, row locking serializes a reversal target, and database uniqueness remains the final boundary. Redis and a mutable balance projection are not introduced.

### Legacy transform and cutover

Migration 010 creates the journal and extends the durable operational authority latch with `customer_dues`. Legacy `credit` maps to `charge`; legacy `payment` maps to `payment`. Floating Mongo amounts must convert exactly to two-decimal INR paise. Customer resolution uses accepted `customer_source_links` or an explicit reviewed per-document mapping; it never merges by phone. Because legacy Ledger has no branch, every source document requires reviewed branch evidence. Missing, conflicting, ambiguous, imprecise, or invalid facts block apply.

Imported rows preserve the Mongo ObjectId, fingerprint, description, and source-created occurrence time internally. Migration is dry-run first, transactional, and repeat-safe. Reconciliation compares counts, types, organizations, exact charge/payment totals, Customer and branch coverage, dates, provenance, and uniqueness. Normal API responses never expose a Mongo ObjectId.

Activation is explicit only after migration, apply, verification, and preflight. The latch records `v2-06d-cutover`. After activation, ordinary migration apply refuses unless a separately reviewed recovery flag is supplied. Runtime composition is source-controlled PostgreSQL with no Mongo Ledger read, write, fallback, dual-write, or automatic repair. `/api/ledger` remains temporarily as a read-only PostgreSQL compatibility view; its unsafe legacy write is removed.

## Consequences

- Customer Dues has one exact transactional authority and immutable correction history.
- Branch journals and organization-wide balances have distinct, explicit semantics.
- Ordinary overpayment fails closed; future prepayment/refund behavior needs a separate design.
- Migration cannot guess Customer identity or originating branch.
- MongoDB remains required for Inventory, applicable corporate/parent data, ActivityLog/security audit, and retained migration/recovery sources.
- The decision does not add a general ledger, chart of accounts, invoices, tax/GST, sales/POS, supplier payables, bank reconciliation, or a payment gateway.

## Alternatives rejected

### Mutable amount owed on Customer

Rejected because it loses factual history and creates competing truth during retries, corrections, and concurrency.

### Floating-point rupee amounts

Rejected because binary floating point cannot be authoritative for exact money or reconciliation.

### Editing or deleting mistakes

Rejected because financial-operational facts need attributable correction history. Full reversal or explicit adjustment is deterministic and auditable.

### Organization-wide journal listing

Rejected because originating branch facts must remain isolated. Only the separately named Customer balance aggregate crosses branches.

### Mongo fallback or dual-write

Rejected because PostgreSQL-native entries, idempotency, and reversals cannot be atomically mirrored into the prototype Mongo shape.
