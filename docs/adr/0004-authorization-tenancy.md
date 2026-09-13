# ADR 0004: Authorization, Tenant Isolation, and Branch Context

- Status: Accepted
- Date: 2026-09-13
- Supersedes: ADR 0003's deferred access-token session-check and legacy tenant-authority decisions

## Context

EkaVio previously used `User.tenantId`, role strings in access JWTs, and optional user assignments as overlapping sources of tenant authority. Controllers repeated role comparisons and tenant filters, Socket.IO joined the tenant embedded in an old JWT, attendance accepted an arbitrary target user, and corporate operations did not consistently prove authority over every organization they changed. An organization administrator could also act as a cross-organization consolidated-billing override.

V2-03 must establish one explicit authorization path while preserving MongoDB and existing development data. Commercial plans and module entitlements remain a later milestone.

## Decision

### User and Membership

`User` represents an identity. `Membership` represents that identity's relationship to exactly one Organization and contains role, active/inactive/revoked status, assigned branches, and timestamps. A unique `(userId, organizationId)` index prevents duplicate relationships, including duplicate active memberships. Live authorization reads Membership; the old `User.tenantId`, `User.role`, and assignments remain only as temporary compatibility/backfill inputs and response compatibility fields.

Roles are `owner`, `admin`, `manager`, `hr`, and `staff`. Membership status is checked on every authenticated request. Revoking a membership does not delete the user identity or the user's relationships to other organizations.

### Organization, Branch, and corporate hierarchy

An Organization remains the tenant boundary. A Branch is owned by one Organization and has a unique organization-local code and active status. Membership branch assignments constrain selectable branch context. Existing organizations receive an idempotent `main` Branch during compatibility backfill. Operational records remain organization-scoped in this milestone; the Branch model and request context establish the authorization foundation without pretending existing records are branch-aware.

`ParentOrganization` remains a corporate ownership/hierarchy concept and is not converted into Branch. Corporate linking requires the actor to own the parent relationship and hold an active child-organization membership whose role includes `organization.manage`.

### Permission evaluation

A centralized, default-deny role policy maps memberships to stable capabilities:

- `organization.manage`
- `staff.read`, `staff.manage`
- `queue.read`, `queue.manage`
- `inventory.read`, `inventory.manage`
- `ledger.read`, `ledger.manage`
- `attendance.read`, `attendance.manage`
- `reports.read`
- `billing.read`, `billing.manage`
- `corporate.manage`

Routes enforce these permissions after authentication and before controller work. Controllers and services receive the server-resolved organization context and use shared organization/resource query builders. Frontend guards use the effective permissions only for usability; backend checks are authoritative.

### Platform operator boundary

An EkaVio platform operator is an identity-level `platformRole: operator`, selected explicitly and excluded from normal User queries. Organization staff management cannot set this field. An organization `owner` or `admin` is not a platform operator, and platform-operator status does not itself manufacture a tenant membership. No public operator UI or broad support bypass is introduced.

### Authenticated request context

For each protected HTTP request, the backend verifies the JWT signature and resolves:

`active Session -> User -> active Membership -> Organization -> assigned active Branch -> permissions`

The typed result contains user, session, membership, organization, optional branch, role, permissions, and platform-operator status. The role claim in the JWT is informational and is not authorization truth. A requested `x-tenant-id` must match an active membership. A requested `x-branch-id` must belong to that organization and appear in the membership assignment. Invalid or foreign contexts fail closed without falling back to an arbitrary organization.

### Tenant and branch switching

Login and refresh return active memberships, branch choices, current role/permissions, and current `activeModules`. The frontend switches organization or branch by rotating the refresh credential with requested context headers. Only a server-validated response updates UI state. API calls then send the active organization/branch as context hints.

### Socket.IO isolation

Socket authentication uses the same Session and Membership resolver as HTTP. The client supplies its active organization/branch with the in-memory access token. A successful connection joins canonical `organization:<id>` and optional `branch:<id>` rooms. Context changes reconnect the socket, which leaves all old rooms before joining only the newly authorized rooms. Logout disconnects the socket. Staff membership revocation revokes the user's sessions and disconnects their active sockets.

### Access-token and session revocation

V2-03 chooses option B: validate MongoDB Session state for every authenticated HTTP request and Socket.IO connection. A revoked session therefore cannot keep using an otherwise unexpired 15-minute access JWT. This adds one indexed Session lookup per authentication and is accepted for the current modular monolith because it gives uniform behavior for staff administration, corporate linking, tenant switching, billing administration, and all other protected routes without Redis or a second policy path.

### Compatibility migration

`npm run authz:backfill` is dry-run by default; `npm run authz:backfill -- --apply` applies compound upserts. The script derives only the tenant associations already present in legacy fields, creates an organization-local `main` Branch where absent, never updates/reactivates an existing Membership, and may be run repeatedly. It validates all referenced organizations and conflicting per-user/per-organization roles before writing. Ambiguity stops the run rather than guessing. Login applies the same deterministic procedure to one legacy identity so unambiguous single-tenant development data remains usable.

### Permissions and entitlements

Permissions answer whether the active member may perform an operation. Organization modules/entitlements answer whether the organization has the capability. `activeModules` remains the existing compatibility gate and is not folded into permissions. V2-04 will define commercial entitlements independently.

## Consequences

- Attendance writes cannot target a user outside the active organization/branch assignment.
- Foreign queue identifiers are queried with organization scope and return the same not-found result as missing identifiers. Inventory, ledger, analytics, attendance, staff, corporate, and billing paths are explicitly reviewed and scoped or permission-gated.
- Corporate child linking proves authority over both sides, and tenant administrators no longer receive a global billing override.
- Safe audit records are written for membership and corporate mutations using allowlisted identifiers and roles only. Passwords, tokens, cookies, and full request bodies are never recorded. The legacy broad-body activity middleware remains unmounted pending a later audit subsystem milestone.
- Branch-aware operational persistence and management UX, customizable database RBAC, account linking, full operator tooling, and commercial entitlement architecture are deferred.
- PostgreSQL migration remains deferred; MongoDB compound indexes and scoped queries implement this milestone.
