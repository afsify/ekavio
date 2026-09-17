# ADR 0008: PostgreSQL Identity Runtime Authority

- Status: Accepted
- Date: 2026-09-15
- Scope: V2-05C PostgreSQL Identity/Auth Runtime Cutover

> Commercial-authority statements in this historical V2-05C decision are superseded by [ADR 0009](0009-postgresql-commercial-runtime-authority.md). Operational Mongo boundaries remain current.

## Context

V2-05A created the PostgreSQL shared-core schema and shadow migration. V2-05B added reversible UUID-to-legacy-ID mappings and inactive PostgreSQL adapters while MongoDB remained runtime authority. Keeping MongoDB as an authentication or authorization fallback after switching writes to PostgreSQL would create two conflicting identity authorities, make session revocation ambiguous, and reopen tenant-boundary risks.

Commercial and operational data cannot move in the same change. Queue, Inventory, Ledger, and Attendance records still use Mongo ObjectIds, and Plan, AddOn, Subscription, Entitlement, ParentOrganization, and other operational models still have reviewed Mongo persistence.

## Decision

### Identity and authorization authority

The source-controlled runtime composition is frozen to `authority: 'postgresql'`. PostgreSQL is the only runtime authority for users, organizations, branches, memberships, branch assignments, password/profile identity state, platform-operator identity, login, refresh sessions, request authorization, staff identity/membership writes, registration, and attendance identity resolution.

There is no environment, tenant, or request switch and no automatic Mongo fallback. A PostgreSQL identity or session failure is propagated and authentication fails closed. The legacy Mongo identity, account, session, staff, and authorization repositories remain available only as explicit migration/rollback artifacts; the runtime composition does not import or instantiate them.

Shared-core writes are PostgreSQL-only. Registration and staff creation generate entity-specific, cryptographically random, Mongo-compatible legacy IDs in PostgreSQL for later mapping without creating Mongo User, Organization, Branch, Membership, or Session mirrors.

### Sessions

New refresh sessions are stored only in PostgreSQL. Rotation uses a conditional update over session ID, previous HMAC hash, revocation state, and expiry, preserving exactly one winner. Logout, staff revocation, and password change revoke PostgreSQL sessions. Mongo refresh hashes are never copied. The cutover command is dry-run by default, requires `--apply`, is limited to local/development targets, and idempotently revokes any remaining Mongo refresh sessions without reporting hashes.

### Mongo compatibility boundaries

MongoDB remains runtime storage for Queue, Inventory, Ledger, Attendance records, commercial state, ParentOrganization/corporate compatibility, audit compatibility, analytics, and the other operational domains. Canonical PostgreSQL authorization context reaches those stores only through entity-typed mapping repositories. A PostgreSQL UUID is never accepted as a Mongo ObjectId, and mappings are independently validated for user, organization, branch, and membership namespaces.

Attendance target and display identity are resolved from PostgreSQL active membership and branch assignments; only the Attendance record is read or written in MongoDB. Commercial entitlement reads and mutations map canonical organization/user IDs to their existing legacy Mongo IDs and return canonical organization context to callers. Commercial state itself is not written to PostgreSQL in V2-05C.

Corporate persistence remains Mongo-backed. Existing mapped organizations can use the reviewed bridge. Linking a PostgreSQL-created organization that has no Mongo Organization compatibility record fails explicitly with HTTP 409; no identity mirror is created to make that operation appear successful.

### Availability and startup

The backend starts with both database connections and readiness requires both stores. PostgreSQL identity unavailability does not select Mongo identity. The Compose backend uses a development build target with development dependencies so disposable integration commands can run; the final production stage remains dependency-pruned.

## Validation

The accepted cutover required verified Mongo/PostgreSQL backups, migration status, shadow dry-run and local apply, parity verification, zero-blocker preflight, Mongo-session revocation, unit and disposable database integration suites, a non-empty two-tenant cutover suite, a live registration/login smoke, and four-service health/log review. The detailed local execution record is in `docs/runbooks/V2-05C_IDENTITY_CUTOVER.md`.

## Consequences

- PostgreSQL availability is now required for login, refresh, protected HTTP requests, and Socket.IO authorization.
- MongoDB is still required for commercial and operational requests and therefore remains in readiness, backup, and recovery procedures.
- Rolling application code back to the V2-05B Mongo composition is not a blind rollback after PostgreSQL-only writes begin. New identity and membership state must be inventoried and explicitly reconciled before any authority reversal.
- All users must sign in again after a populated-environment cutover because Mongo refresh sessions are revoked and not migrated.
- Commercial runtime migration is deferred to V2-05D. Operational record migration and removal of legacy IDs require later explicit milestones.
