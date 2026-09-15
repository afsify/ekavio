# ADR 0007: PostgreSQL Cutover Compatibility Bridge

- Status: Accepted
- Date: 2026-09-14
- Scope: V2-05B PostgreSQL Cutover Readiness & Compatibility Bridge

## Context

V2-05A proved that EkaVio's MongoDB shared-core records can be represented and reconciled in PostgreSQL, but request authorization, login context, refresh sessions, staff mutations, profile/registration operations, commercial policy, and operational collections still depended on Mongo identifiers and Mongoose calls. Switching runtime authority while those dependencies remained implicit would combine an identity cutover with identifier translation, session-protocol changes, multi-table write changes, and operational-domain migration risk.

## Decision

### Runtime authority and staging

MongoDB remains the sole application runtime source of truth throughout and after V2-05B. PostgreSQL repositories are inactive adapters instantiated only by disposable integration tests, explicit shadow/verification tooling, and the read-only cutover preflight. V2-05C may switch identity/authentication/authorization only through a separately reviewed composition change. Commercial authority remains MongoDB until V2-05D or another explicitly accepted milestone.

### Identifier namespaces

PostgreSQL shared-core rows use canonical UUID primary keys. MongoDB shared-core and operational records use 24-character lowercase hexadecimal identifiers. New bridge code represents these as entity-specific branded TypeScript types and validates them with `isUuid`/`isLegacyMongoId`; user, organization, branch, and membership mappings are separate and never inferred across tables.

The PostgreSQL `legacy_mongo_id` is a compatibility key, not a public primary key. A future PostgreSQL runtime write that creates a User, Organization, Branch, or Membership generates its compatibility ID from 12 cryptographically random bytes without creating a placeholder Mongo document or depending on Mongoose. Database uniqueness detects the already-improbable collision.

Compatibility IDs may be removed only after all operational Mongo records and references have migrated, shadow reconciliation is clean, rollback no longer requires Mongo IDs, backup/restore has been rehearsed, and an accepted removal milestone explicitly deletes the bridge.

### Mapping and operational bridge

An explicit PostgreSQL mapping repository performs UUID-to-legacy and legacy-to-UUID lookup independently for User, Organization, Branch, and Membership. Invalid formats fail before a query; missing mappings fail explicitly. Queue, Inventory, Ledger, Attendance, and analytics continue to store/query legacy Mongo tenant IDs. They now obtain those IDs through an operational identity boundary so a future canonical authorization context cannot be passed silently to an ObjectId query.

Attendance storage remains MongoDB. Identity/membership access and display-safe user projection are a separate resolver contract with active Mongo and inactive PostgreSQL implementations. A PostgreSQL resolver maps only a user with an active membership and, when selected, the assigned branch in the active canonical organization.

### Inactive shared-core adapters and composition

PostgreSQL adapters implement the existing session, authorization-context, and authentication identity contracts. Domain-specific write adapters cover registration, staff identity/membership creation, organization-scoped membership revocation, branch assignment, theme/profile/password updates, and session invalidation. Multi-table PostgreSQL operations are transactions; staff mutations cannot set `platform_role`.

The runtime composition is one frozen, code-reviewed Mongo binding. There is no request-selected database, service locator, environment toggle, or hidden fallback. Activating PostgreSQL later must be a small explicit code change performed only under the V2-05C runbook.

### Session compatibility

Migration `002_auth_session_compatibility.sql` adds the unique 32-hex application `session_id`, bounded optional user-agent/IP metadata, and credential/session format constraints while retaining the UUID row ID and V2-02 fields. The PostgreSQL repository preserves HMAC-only credential storage and exactly-one-winner rotation through one conditional `UPDATE` matching session ID, old hash, unrevoked state, and expiry.

Mongo refresh sessions and hashes are never copied. Identity cutover invalidates Mongo refresh sessions and requires every user to sign in again.

### No dual writes and preflight

V2-05B runtime mutations write MongoDB only. PostgreSQL business rows change only through explicit shadow migration tooling or disposable tests. No adapter writes both databases.

`postgres:cutover:preflight` is read-only. It requires all migrations, clean source validation and shadow reconciliation, complete reversible mappings, valid compatibility IDs, active membership/branch consistency, operator parity, required password hashes, unchanged duplicate-phone ambiguity, repository projection parity, no unknown tenant relationship, and zero PostgreSQL refresh sessions. Any blocker produces a non-zero exit without printing credential hashes.

## Consequences

- V2-05C can focus on the deliberate identity/auth/session composition switch and reauthentication rather than inventing adapters during an outage.
- Operational collections remain available through validated legacy IDs while shared-core UUIDs can become authoritative later.
- MongoDB must remain deployed and backed up after V2-05B.
- A rollback after future PostgreSQL writes is not a blind switch: new PostgreSQL state must be reconciled or replayed and cannot be silently discarded.
- Commercial entitlements, corporate hierarchy runtime, audit events, and operational storage cutover remain later milestones.
