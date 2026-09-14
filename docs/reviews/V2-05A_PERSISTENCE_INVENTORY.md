# V2-05A Persistence Inventory

- Audit baseline: `71dfe5f58e948dd9f51f23b0d46564e381a4422f`
- Runtime source of truth during V2-05A: MongoDB
- PostgreSQL scope: shared-core schema, shadow copy, and reconciliation only

All current Mongoose records use MongoDB `ObjectId` primary keys. Mongoose references are application conventions, not database-enforced foreign keys, so the shadow migration must validate every relationship before writing.

| Model / Mongo collection | References | Mongo uniqueness and indexes | Scope / classification | Migration risk and V2-05A decision |
| --- | --- | --- | --- | --- |
| `User` / `users` | required legacy `tenantId -> Organization`; embedded assignment tenant IDs | unique `(tenantId, phone)` | Shared-core identity; runtime-critical | Password hash and hidden `platformRole` are sensitive. Copy the password hash exactly without reporting it; preserve operator only when explicitly present. Do not copy legacy assignment arrays as authority. |
| `Organization` / `organizations` | optional `parentId -> ParentOrganization` | index `parentId` | Shared-core tenant; runtime-critical | Contains deprecated commercial fields and theme object. Copy current organization identity/theme and corporate link, but do not make deprecated fields relational authority. |
| `ParentOrganization` / `parentorganizations` | required `ownerId -> User` | index `ownerId` | Shared-core corporate hierarchy; runtime-partial | Owner/user dependency changes migration ordering. Dangling owners or organization links must abort before writes. |
| `Branch` / `branches` | required `organizationId -> Organization` | unique `(organizationId, code)`; index `organizationId` | Shared-core authorization; runtime-critical | Cross-tenant assignment is security-sensitive. PostgreSQL uses organization-local uniqueness and composite foreign keys in the assignment join table. |
| `Membership` / `memberships` | required User and Organization; embedded `branchIds -> Branch` | unique `(userId, organizationId)`; indexes `userId`, `organizationId`, `(organizationId,status)` | Shared-core authorization; runtime-critical | Embedded branch array must normalize to rows. Preserve active/inactive/revoked exactly and reject a branch owned by another organization. |
| `Session` / `sessions` | required `userId -> User` | unique/indexed `sessionId`; index `userId`; TTL `expiresAt` | Shared-core authentication; runtime-critical | Contains refresh credential hashes. Create future PostgreSQL schema only; shadow-copy zero active session rows and require reauthentication at V2-05B cutover. |
| `ModuleDefinition` / `moduledefinitions` | canonical module key values | unique/indexed `key` | Shared-core commercial catalogue; runtime-critical | Reject unknown module keys and normalize no aliases here. Copy metadata/version/status only. |
| `Plan` / `plans` | embedded canonical module keys and limit grants | unique/indexed `key` | Shared-core commercial catalogue; runtime-critical | Normalize module and limit arrays into join tables. Unknown modules/limits or duplicate embedded grants are validation errors. |
| `AddOn` / `addons` | embedded canonical module keys and limit adjustments | unique/indexed `key` | Shared-core commercial catalogue; runtime-critical | Normalize modules/limits. Preserve add/override semantics and reject unknown or duplicate entries. |
| `Subscription` / `subscriptions` | Organization, optional Plan, embedded AddOn references, optional creator/updater Users | unique/indexed `organizationId`; index `status` | Shared-core commercial state; runtime-critical | Normalize add-ons; preserve status/source/dates exactly. Dangling catalogue/user references abort; one subscription per organization remains enforced. |
| `Entitlement` / `entitlements` | Organization, canonical module key, required actor User | unique `(organizationId,moduleKey)`; indexes organization | Shared-core commercial override; runtime-critical | Preserve grant/revoke, active/inactive, validity, source, reason, and actor. Unknown modules or dangling actors abort. |
| `ActivityLog` / `activitylogs` | required Organization and User | indexes `tenantId`, `userId`, `action` | Shared-core audit metadata; runtime-supporting | `details` is unconstrained Mixed data and may contain historical unsafe shapes. Create an `audit_events` schema but do not shadow-copy events in V2-05A pending a dedicated safe-data review. |
| `Queue` / `queues` | required Organization | index `tenantId` | Operational domain; runtime-critical | Retains Mongo reads/writes. No PostgreSQL table or shadow copy in V2-05A. |
| `Inventory` / `inventories` | required Organization | index `tenantId` | Operational domain; runtime-critical | Retains Mongo. Existing floating-point price semantics are not redesigned or copied in V2-05A. |
| `Ledger` / `ledgers` | required Organization | index `tenantId` | Operational domain; runtime-critical | Retains Mongo. Existing amount and workflow semantics are not redesigned or copied. |
| `Attendance` / `attendances` | required Organization and User | unique `(tenantId,userId,date)`; indexes tenant, user, `(tenantId,date)` | Operational domain; runtime-critical | Retains Mongo. No PostgreSQL table or runtime change. |
| `Message` / `messages` | required Organization and sender User | indexes `tenantId`, `senderId` | Deferred/nonfunctional operational domain | No PostgreSQL table; do not imply a working chat capability. |
| `Notification` / `notifications` | required Organization | index `tenantId` | Deferred/nonfunctional operational domain | No PostgreSQL table; do not invent a notification workflow. |

## Coupling findings

- Runtime authentication, request-context resolution, sessions, authorization, entitlements, staff, corporate, and all operational domains currently call Mongoose models.
- Existing focused boundaries already exist for identity lookup, session storage, authorization context, entitlement evaluation, attendance, inventory, and queue behavior. Controllers still call Mongoose directly in several areas.
- V2-05A will not swap or broadly refactor these runtime implementations. A PostgreSQL-specific shared-core repository will serve only shadow migration and verification so V2-05B has a tested persistence boundary without creating a generic ORM layer.
- No current source uses Mongoose `.populate()` or `.aggregate()`. Relationships are resolved through explicit queries, embedded ID arrays, or scoped model operations.
- Parent organization ownership creates the only shared-core ordering wrinkle: users must exist before parent organizations, and parent organizations before applying organization parent links.
