# ADR 0009: PostgreSQL Commercial Runtime Authority

- Status: Accepted
- Date: 2026-09-15
- Scope: V2-05D PostgreSQL Commercial Runtime Cutover

## Context

V2-04 established canonical module IDs and deterministic plan, add-on, subscription, override, entitlement, and limit semantics in MongoDB. V2-05A created normalized PostgreSQL commercial tables, V2-05B added migration compatibility, and V2-05C made PostgreSQL authoritative for identity, sessions, and authorization while commercial runtime reads and writes continued through a canonical-to-legacy Mongo bridge.

Keeping commercial authority in Mongo after identity cutover forced login, refresh, tenant switching, billing APIs, module middleware, and operator administration to cross the identity mapping boundary. Dual-writing commercial changes or falling back automatically would allow stale subscriptions or revoked modules to become effective again.

## Decision

### Commercial authority

PostgreSQL is the only runtime authority for module definitions, plans, plan modules and limits, add-ons, add-on modules and limit adjustments, subscriptions, subscription add-ons, explicit entitlement overrides, the public catalogue, effective entitlement calculation inputs, effective limits, and platform-operator commercial mutations.

Commercial repositories accept canonical PostgreSQL organization and actor UUIDs directly. Runtime commercial paths do not translate organization IDs to Mongo IDs, import Mongoose commercial models, dual-write Mongo mirrors, or fall back automatically when PostgreSQL is unavailable. Entitlement-dependent operations fail closed.

Multi-query effective-entitlement snapshots and public catalogue reads use read-only, repeatable-read PostgreSQL transactions. Each request therefore evaluates one database snapshot and cannot combine plan, add-on, subscription, or override rows from opposite sides of a concurrent commit.

The source-controlled composition declares PostgreSQL identity, session, authorization, and commercial authority, with MongoDB operational authority. No environment or request value can reverse that selection.

### Preserved V2-04 semantics

The pure request-time evaluator remains storage-neutral and preserves the accepted rules: an active or trialing, in-window subscription may grant an active plan and active, in-window add-ons; active, in-window explicit grants add modules; an active, in-window explicit revoke has precedence over every grant; inactive catalogue modules fail closed; and inactive, suspended, cancelled, pending, or expired subscription state grants no plan/add-on access.

Limit evaluation remains deterministic: the plan supplies the base; the highest applicable override can raise that base; additive adjustments are summed afterward; and an unconfigured limit remains `null`. Time windows are evaluated on each request, not only by background work.

Membership permission and commercial entitlement remain independent requirements. The stable `ENTITLEMENT_REQUIRED` denial contract is unchanged, and frontend state is never authority.

### Administration and manual operation

Platform-operator subscription and override changes are PostgreSQL-only and transactional. Tenant owners and administrators cannot self-enable commercial modules. Manual/pilot plan assignment, add-on assignment, status management, explicit grants/revocations, and time-limited access remain supported without a payment gateway. This decision adds no pricing, invoice, checkout, Razorpay, Stripe, messaging, or paid-AI behavior.

The deterministic catalogue reconciliation command writes PostgreSQL only and does not change customer subscriptions. Canonical module keys remain `ledger`, `inventory`, `attendance`, and `queue`. `khata` and `digital-khata` remain legacy migration aliases only.

### Mongo boundaries and audit continuity

Queue, Inventory, Ledger, Attendance records, ParentOrganization/corporate operational records, ActivityLog security audits, and the other operational domains remain in MongoDB. Operational record access continues through validated identity mapping. A commercial check is evaluated in PostgreSQL before an entitled operational handler accesses organization-scoped Mongo records.

Commercial audit events continue to use canonical PostgreSQL actor and organization context, validated compatibility mapping, and Mongo ActivityLog storage. Audit storage is not commercial authority and never receives credentials or full sensitive request bodies.

Old Mongoose commercial models remain only for legacy source loading, parity verification, pre-cutover backfill, explicit recovery, and tests. They are absent from executable runtime entitlement, catalogue, billing, auth hydration, and operator mutation paths.

### Shadow safety and rollback

Migration `003_commercial_runtime_authority.sql` adds a durable, initially empty authority latch. After a zero-blocker read-only commercial preflight, the explicit activation command records PostgreSQL authority. Once active, ordinary Mongo-to-PostgreSQL shadow `--apply` refuses before any copied data is written. Dry-run and verification remain available.

`--recover-commercial-authority` is an exceptional, explicit shadow-apply mode. It is not a normal synchronization mechanism. It may be used only under an approved rollback plan after PostgreSQL commercial changes have been inventoried and reconciled. There is no PostgreSQL-to-Mongo fallback or reverse replication. Rolling application code back to Mongo authority after PostgreSQL writes would otherwise discard newer plans, statuses, assignments, grants, or revocations.

## Consequences

- PostgreSQL availability is required for login/bootstrap entitlement hydration, billing, commercial administration, and module gates.
- MongoDB remains required for operational domains and readiness therefore still requires both databases.
- New organizations can receive commercial state using canonical UUIDs without a Mongo Organization mirror.
- Commercial parity tooling is a migration regression tool after cutover, not a runtime dual-source implementation.
- Operational-domain migration is deliberately deferred pending architecture review.
