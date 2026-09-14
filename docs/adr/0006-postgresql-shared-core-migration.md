# ADR 0006: PostgreSQL Shared-Core Migration

- Status: Accepted
- Date: 2026-09-14
- Scope: V2-05A PostgreSQL Foundation & Shadow Migration

## Context

EkaVio's intended transactional system of record is PostgreSQL, while its implemented runtime uses MongoDB and Mongoose. Authentication, session rotation, request authorization, commercial entitlements, and the Queue, Inventory, Ledger, and Attendance domains are already working against MongoDB. Switching those paths while designing a relational model would combine persistence migration with a high-risk runtime cutover.

V2-05A therefore needs a production-shaped PostgreSQL foundation, deterministic schema migrations, and evidence that existing shared-core records can be represented and reconciled without changing application behavior.

## Decision

### Authority and boundary

MongoDB remains the application runtime source of truth throughout and after V2-05A. Login, refresh sessions, authorization context, memberships, entitlements, and every operational domain continue to use their existing Mongoose implementations. PostgreSQL is used only by explicit migration, shadow-copy, verification, health, and integration-test tooling. V2-05A does not introduce a dual-write path or a PostgreSQL runtime read.

Only implemented shared-core concepts receive relational tables: users, parent organizations, organizations, branches, memberships and branch assignments, module definitions, plans and their grants, add-ons and their adjustments, subscriptions and assigned add-ons, and entitlement overrides. Queue, Inventory, Ledger, Attendance, Message, and Notification do not receive speculative relational tables. `audit_events` is schema-only because legacy activity details are unconstrained, and `auth_sessions` is schema-only for the session decision below.

### Identity and relationship strategy

Each relational entity uses a PostgreSQL UUID primary key. Shadowed entities also have a nullable, uniquely constrained `legacy_mongo_id` with a 24-character lowercase hexadecimal check. The compatibility ID is the stable idempotency key; Mongo ObjectIds do not become PostgreSQL primary keys.

Foreign keys enforce organization, user, catalogue, subscription, and entitlement relationships. Membership branch assignments carry `organization_id` and use composite foreign keys to both Membership and Branch, so a branch from another organization cannot be assigned even if application validation is bypassed. Existing uniqueness and status/value domains are preserved with unique and check constraints.

### Migrations and connection lifecycle

Reviewed SQL files use ordered three-digit names. The runner calculates SHA-256 checksums, records each applied file in `schema_migrations`, rejects edits to applied migrations, holds a PostgreSQL advisory lock, and applies each pending file in a transaction. Rerunning is safe. There is no automatic rollback, reset, or destructive down command.

The backend owns one bounded `pg` pool. Startup validates `DATABASE_URL` and verifies both databases before listening. Readiness checks both dependencies but returns status labels only. SIGINT and SIGTERM close HTTP, Mongoose, and the PostgreSQL pool. Connection URLs and database error details are never logged.

### Shadow migration and reconciliation

The shadow command is dry-run by default. Dry-run reads and validates MongoDB only and performs zero PostgreSQL mutation. `--apply` is mandatory for writes and expects reviewed migrations to be present. Before opening the write transaction, validation rejects malformed or duplicate IDs, dangling references, cross-organization branch assignments, duplicate embedded grants, unknown capabilities/limits, invalid states, and invalid date windows. Apply upserts by `legacy_mongo_id` in dependency order and transactionally replaces only normalized child rows owned by each source parent. Reruns are idempotent and do not delete unrelated rows.

Reconciliation independently reads Mongo source truth and PostgreSQL shadow state, compares identity, hierarchy, assignments, operator mapping, catalogue, subscription/entitlement status and important dates, and returns non-zero on mismatch. Credential hashes may be compared internally but are never included in a report.

The apply order follows actual dependencies: users, parent organizations, organizations, branches, memberships, branch assignments, module definitions, plans and normalized grants, add-ons and normalized adjustments, subscriptions and assigned add-ons, then entitlement overrides. Users precede organizations because `ParentOrganization.ownerId` points to User, while the legacy user tenant is validated against the source snapshot rather than made relational authority.

### Session safety

Mongo refresh sessions and their refresh-token hashes are never shadow-copied. Reusing active refresh credentials across persistence boundaries would expand secret exposure and complicate atomic rotation. V2-05B must invalidate legacy sessions and require reauthentication at cutover unless a separate, equally safe design is reviewed and accepted. V2-02 session behavior is unchanged in V2-05A.

Password hashes are copied exactly as identity credentials for future cutover, but no command or report prints them. PostgreSQL credentials, password hashes, and refresh hashes are prohibited from logs and committed artifacts.

## Consequences

- The relational shared-core model and migration tooling can be tested before runtime cutover.
- PostgreSQL readiness is now required for the four-service development stack even though MongoDB remains runtime authority.
- Shadow apply is an explicit operator action after backup and clean dry-run review.
- V2-05B owns shared-core runtime cutover, reauthentication, cutover sequencing, and rollback planning.
- Operational-domain migration, audit event conversion, stale-shadow deletion policy, production sizing, and high-availability operations remain later work.
- The temporary dual-database stack costs additional memory, storage, monitoring, backup work, and operational attention. That complexity is accepted only to separate evidence gathering from cutover risk.
- MongoDB can be retired only after V2-05B+ has cut over every authoritative read/write path, legacy ObjectId bridges are no longer required, reconciliation and rollback evidence is complete, backups/restores have been rehearsed, and an accepted removal milestone explicitly deletes it.
- This decision does not introduce microservices, Redis, or a new infrastructure framework; the modular monolith remains the deployment architecture.
