# EkaVio

**Multi-tenant SMB operations platform**

EkaVio is a modular SaaS platform designed for small and medium businesses
including shops, clinics, salons, service businesses, and small offices.

The project focuses on secure multi-tenancy, low operating cost, modular
business capabilities, and maintainable backend architecture.

## Architecture

- **Frontend:** React, TypeScript, Vite
- **Backend:** Node.js, Express.js, TypeScript
- **Relational data:** PostgreSQL
- **Operational data:** PostgreSQL for Customer, Service, Appointment, and Queue; MongoDB for remaining legacy domains
- **Infrastructure:** Docker Compose
- **Realtime:** Socket.IO

## Engineering Highlights

- Secure access tokens with revocable server-side sessions
- Organization and branch-aware multi-tenancy
- Membership-based RBAC and permission enforcement
- PostgreSQL-backed identity, authorization, and commercial entitlements
- PostgreSQL operational authority for Customer, Service, Appointment, and Queue, with MongoDB retained for deferred legacy domains
- Transactional migrations and cutover tooling
- Docker health/readiness checks
- Automated lint, typecheck, build, migration, parity and integration gates

## Project Status

🚧 Active development

Hosted staging is deployed at `https://ekavio.afsify.com` with its API at
`https://api.ekavio.afsify.com`. Public infrastructure and selected
authenticated flows are validated for continued development/testing. Full
pilot-readiness validation, including the remaining authenticated smoke flows,
hosted-log review, and backup/restore proof, is still open. Staging is not
production and must not hold real paying-customer data.

---

## Development Documentation

EkaVio is a React/Vite PWA with an Express/TypeScript backend, PostgreSQL identity, commercial, Customer, Service, Appointment, and Queue authority, and MongoDB authority only for deferred legacy operational domains. V2-01 established deterministic engineering and container foundations, V2-02 added revocable server-side sessions, V2-03 added explicit organization memberships and permission enforcement, V2-04 added backend-authoritative commercial entitlements, V2-05A added the PostgreSQL shared-core migration foundation, V2-05B added the compatibility bridge, V2-05C cut identity/session/authorization authority to PostgreSQL, V2-05D cut commercial runtime authority to PostgreSQL, V2-06B1 added the inactive Customer/Service/Appointment/Queue relational and migration foundation, V2-06B2 cut that vertical's runtime authority to PostgreSQL, V2-06B3 prepared the repository for hosted staging, and the partial V2-06B4 closeout recorded the real hosted environment without overstating unfinished pilot-readiness checks.

## Prerequisites

- Node.js 20 or later
- npm
- Docker with the Compose plugin for the container workflow

On Windows PowerShell, use `npm.cmd` and `npx.cmd` if execution policy blocks the `npm.ps1` shim.

## Local environment

Copy the example files before running the applications directly:

```powershell
Copy-Item backend/.env.sample backend/.env
Copy-Item frontend/.env.example frontend/.env
```

The committed examples contain development-only values. Replace all secrets for any shared or production environment. Backend startup validates `NODE_ENV`, `PORT`, `MONGO_URI`, `DATABASE_URL`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `HTTP_ALLOWED_ORIGINS`, `SOCKET_ALLOWED_ORIGINS`, and `TRUST_PROXY_HOPS`. Production mode requires strong secrets, database TLS, HTTPS origins, and an explicit reviewed proxy-hop count. Comma-separate multiple exact allowed origins. Never log or commit a real database URL.

The frontend requires `VITE_API_URL` (including `/api`) and `VITE_SOCKET_URL`. Vite embeds both values at build time.

`REFRESH_TOKEN_SECRET` is used as the key for hashing opaque refresh credentials; it is not a browser-visible token. Keep it independent from `JWT_SECRET` and use strong unique values outside local development.

## Install dependencies

```powershell
Set-Location backend
npm.cmd ci
Set-Location ../frontend
npm.cmd ci
Set-Location ..
```

## Development servers

Start the backend and frontend in separate terminals:

```powershell
Set-Location backend
npm.cmd run dev
```

```powershell
Set-Location frontend
npm.cmd run dev
```

The examples use `http://localhost:5000` for the backend and `http://localhost:5173` for Vite.

## Authentication sessions

The browser receives the refresh credential only as the `ekavio_refresh` HttpOnly cookie. The frontend sends cookies with credentialed login, refresh, and logout requests and keeps the 15-minute access JWT only in application memory. On startup it attempts `/api/auth/refresh`; an HTTP 401 is the expected logged-out result when no valid cookie exists.

The refresh cookie uses `SameSite=Lax`, is scoped to `/api/auth`, and expires after seven days. `Secure` is intentionally disabled for `NODE_ENV=development` and `NODE_ENV=test` so localhost HTTP works. Hosted staging runs with `NODE_ENV=production`, HTTPS, and production-secure cookies. Backend CORS accepts only `HTTP_ALLOWED_ORIGINS`, so configure the exact frontend origin rather than a wildcard. Use sibling `app.<domain>` and `api.<domain>` names; unrelated provider domains are cross-site and are not supported by weakening the cookie.

Logout calls `POST /api/auth/logout`, revokes the server session, clears the cookie, and clears the in-memory client state. A successful password change revokes all of that user's refresh sessions and requires sign-in again. Do not add access or refresh credentials to browser storage when extending the frontend.

Every protected HTTP request and Socket.IO connection now validates the access token's server session and resolves an active Membership. `x-tenant-id` and `x-branch-id` are context requests, not authority: the backend accepts them only when the user has an active membership and branch assignment. The frontend reconnects realtime transport after a server-validated context switch so the old organization room is left.

Permissions and entitlements are intentionally separate. Permissions come from the active membership role and determine what a user may do. Effective entitlements come from the selected organization's active plan, add-ons, and explicit overrides and determine whether the organization has a commercial capability. Protected module routes require both where appropriate. Login, refresh, and tenant switching return the selected organization's effective entitlement state; the browser does not persist or independently grant it.

## Authorization compatibility backfill

Existing development data still contains legacy `User.tenantId`, `User.role`, and assignment fields. Preview the deterministic Membership/default-Branch migration from the backend directory:

```powershell
npm.cmd run authz:backfill
```

After reviewing the dry-run result, apply it with:

```powershell
npm.cmd run authz:backfill -- --apply
```

The command is idempotent. It creates at most one `main` Branch per organization and one Membership per user/organization, never changes an existing membership, and stops before writes when a legacy user has conflicting roles for the same organization or references a missing organization. Login performs the same compatibility check for that single user, allowing existing unambiguous single-tenant accounts to continue working. Back up production data and run the dry-run before applying in any shared environment.

## Commercial catalogue and entitlement migration

From `backend/`, seed or reconcile the deterministic pilot catalogue:

```powershell
npm.cmd run entitlements:catalogue
```

This reconciles the PostgreSQL-backed canonical `ledger`, `inventory`, `attendance`, and `queue` module definitions, a pilot core plan, a non-sellable legacy-import plan, and module add-ons. It is transactional and idempotent, does not assign new access to existing organizations, and contains no finalized product pricing.

Preview the legacy `Organization.activeModules` migration:

```powershell
npm.cmd run entitlements:backfill
```

The report normalizes `khata` and `digital-khata` to `ledger`, lists unknown module IDs, identifies ambiguous active-but-overdue records, and reports existing non-import subscriptions that will be left untouched. It writes nothing by default. After backing up the database and reviewing a clean report, apply it explicitly:

```powershell
npm.cmd run entitlements:backfill -- --apply
```

This deprecated-field backfill writes only legacy Mongo commercial source data and is retained for migration/recovery compatibility. It cannot change post-V2-05D runtime entitlements. Do not run its apply mode as routine administration or against an unreviewed shared/production database.

## Manual pilot subscription administration

Tenant owners/admins may view `GET /api/billing/subscription` and `GET /api/billing/catalogue`, but they cannot grant modules. An authenticated identity-level platform operator may use these endpoints with its bearer access token:

```text
PUT /api/billing/operator/organizations/:organizationId/subscription
PUT /api/billing/operator/organizations/:organizationId/entitlements/:moduleKey
```

The subscription request supplies the full `planKey`, add-on assignments, status, source, and genuine dates. The entitlement request supplies `grant` or `revoke`, status, source, reason, and optional validity dates. Canonical module keys are required. Every successful mutation produces a safe target-organization audit event.

Example pilot subscription body:

```json
{
  "planKey": "pilot-core",
  "addOns": [
    { "key": "module-ledger" },
    { "key": "module-inventory" }
  ],
  "status": "active",
  "source": "pilot",
  "startsAt": "2026-09-14T00:00:00.000Z",
  "currentPeriodEndsAt": "2026-12-31T23:59:59.000Z"
}
```

Example pilot grant body:

```json
{
  "effect": "grant",
  "status": "active",
  "source": "pilot",
  "reason": "Approved pilot access",
  "validUntil": "2026-12-31T23:59:59.000Z"
}
```

No payment provider is configured or required. EkaVio exposes no fake payment-order success or fabricated invoices; payment automation and real billing documents are future optional integrations.

## PostgreSQL identity, commercial, and Queue-vertical authority

PostgreSQL is the runtime authority for users, organizations, branches, memberships, login identity, refresh sessions, request authorization, staff, registration, profile/password state, Attendance identity resolution, module definitions, plans, add-ons, subscriptions, entitlement overrides, effective entitlements and limits, Customers, Services, Appointments, and Queue sessions/tokens/status. MongoDB remains authoritative for Inventory, Ledger/Customer Dues legacy, Attendance records, ParentOrganization/corporate operational data where applicable, ActivityLog audits, and remaining legacy operational domains.

The composition decision is source-controlled and has no environment/request switch or automatic Mongo fallback. Shared-core identity and commercial writes are PostgreSQL-only. Commercial code uses canonical PostgreSQL UUIDs directly. Operational/audit code receives validated, entity-specific legacy Mongo IDs through separate compatibility bridges; PostgreSQL UUIDs are not used as Mongo ObjectIds.

Effective-entitlement snapshots and public catalogue reads span multiple related tables, so they run in read-only, repeatable-read PostgreSQL transactions. A request cannot mix plan, add-on, subscription, or override rows from before and after one concurrent commit.

## Customer / Service / Appointment / Queue runtime (V2-06B2)

Migration 004 adds branch IANA timezones, organization-owned Customers and Services, branch availability, membership-based provider assignments, Appointments with overlap protection and append-only history, and Queue sessions/tokens with append-only history. Live Queue token creation locks the session counter in one transaction; it never counts existing rows. Appointment check-in and Queue token creation are one idempotent transaction.

The Customer, Service, Appointment, and Queue APIs use canonical UUID relationships and the selected PostgreSQL authorization context. Queue and Appointment requests are branch-scoped, Customer is organization-owned, Service availability is enforced per branch, and every helper route requires the Queue entitlement plus `queue.read` or `queue.manage`. Dashboard Queue counts are PostgreSQL branch counts. The frontend supports customer selection/minimal creation, branch-available service selection, versioned Queue transitions, Appointment creation/list/check-in, pagination, retry, and context-aware refetch.

Only `queue.token.created` and `queue.token.status_changed` are emitted after commit to authorized branch rooms with PII-minimized payloads. Mongo Queue receives no runtime reads or writes and is not a fallback or mirror.

Legacy Queue/Customer/Service analysis requires a reviewed local mapping file ending in `.operational-queue-mapping.json`; Git ignores that pattern. Build first, then run dry-run (the default), explicit apply, reconciliation, and the read-only B2 preflight from `backend/`:

```powershell
npm.cmd run build
npm.cmd run operations:queue:shadow -- --mapping C:\secure\tenant.operational-queue-mapping.json
npm.cmd run operations:queue:shadow -- --mapping C:\secure\tenant.operational-queue-mapping.json --apply
npm.cmd run operations:queue:verify -- --mapping C:\secure\tenant.operational-queue-mapping.json
npm.cmd run operations:queue:preflight -- --mapping C:\secure\tenant.operational-queue-mapping.json
npm.cmd run operations:queue:activate -- --mapping C:\secure\tenant.operational-queue-mapping.json
npm.cmd run operations:queue:activate -- --mapping C:\secure\tenant.operational-queue-mapping.json --apply
```

Dry-run receives no target database and cannot mutate operational tables. Apply refuses unmapped organizations/branches, invalid timezones/phones/statuses/token labels, unresolved customer or service collisions, and duplicate numbers within a reviewed historical session. Source fingerprints make a later unreviewed source change fail closed. Verification distinguishes migrated legacy rows from PostgreSQL-native rows. Migration 005 stores the durable authority latch; after activation, normal shadow `--apply` refuses unless an explicit reviewed recovery mode is used.

See [ADR 0011](docs/adr/0011-customer-service-appointment-queue-foundation.md), [ADR 0012](docs/adr/0012-customer-service-appointment-queue-runtime-authority.md), and the executed [V2-06B cutover runbook](docs/runbooks/V2-06B_QUEUE_VERTICAL_CUTOVER.md).

The TypeScript commands execute compiled files. Build first when running them directly from `backend/`:

```powershell
npm.cmd run build
npm.cmd run db:migrate
npm.cmd run db:migrate:status
```

With Compose, the backend production image already contains compiled commands and reviewed SQL:

```powershell
docker compose run --rm backend npm run db:migrate
docker compose run --rm backend npm run db:migrate:status
```

The migration runner applies ordered SQL once, checks the recorded checksum on every rerun, and has no destructive reset/down default.

Preview Mongo-to-PostgreSQL shadow migration (the default writes nothing):

```powershell
npm.cmd run postgres:shadow
```

Before V2-05D activation, backups, a reviewed clean dry run, apply, verification, and read-only commercial preflight were required:

```powershell
npm.cmd run postgres:shadow -- --apply
npm.cmd run postgres:verify
npm.cmd run postgres:commercial:preflight
npm.cmd run postgres:commercial:activate -- --apply
```

The authority activation writes a durable safety latch only after the read-only preflight reports zero blockers. Once active, ordinary `postgres:shadow -- --apply` refuses before writes so stale Mongo commercial rows cannot overwrite PostgreSQL authority. Dry-run and verification remain available. `--recover-commercial-authority` is an exceptional rollback/reconciliation mode, never a routine sync command; see the V2-05D runbook. Reports never contain passwords, hashes, refresh credentials, or database credentials.

After completing a fresh shadow apply and verification against reviewed data, run the read-only cutover readiness check:

```powershell
npm.cmd run postgres:cutover:preflight
```

The preflight returns non-zero for missing migrations/mappings, stale shadow data, invalid tenant/branch relationships, identity projection differences, missing active-user passwords, operator differences, login ambiguity changes, or unexpected PostgreSQL refresh-session rows. It performs no business-data mutation and never prints password or session hashes.

Mongo session invalidation is dry-run by default. Use `--apply` only during an approved cutover after backups, verification, and a zero-blocker preflight:

```powershell
npm.cmd run sessions:mongo:revoke
npm.cmd run sessions:mongo:revoke -- --apply
```

See [ADR 0009](docs/adr/0009-postgresql-commercial-runtime-authority.md), the [commercial coupling audit](docs/reviews/V2-05D_COMMERCIAL_RUNTIME_COUPLING.md), and the executed [V2-05D cutover runbook](docs/runbooks/V2-05D_COMMERCIAL_CUTOVER.md).

See [ADR 0008](docs/adr/0008-postgresql-identity-runtime-authority.md), [ADR 0007](docs/adr/0007-postgresql-cutover-compatibility.md), and the executed [V2-05C cutover runbook](docs/runbooks/V2-05C_IDENTITY_CUTOVER.md).

See [ADR 0006](docs/adr/0006-postgresql-shared-core-migration.md), the [persistence inventory](docs/reviews/V2-05A_PERSISTENCE_INVENTORY.md), and the [backup/restore runbook](docs/runbooks/V2-05A_BACKUP_RESTORE.md).

## Quality gates

Backend:

```powershell
Set-Location backend
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run test:postgres
npm.cmd run test:parity
npm.cmd run test:preflight
npm.cmd run test:cutover
npm.cmd run test:commercial
npm.cmd run test:operational
npm.cmd run test:operational-migration
npm.cmd run test:operational-runtime
npm.cmd start
```

Frontend:

```powershell
Set-Location frontend
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run preview
```

`npm start` in the backend runs compiled `dist/server.js`; run `npm run build` first.

## Docker Compose

From the repository root:

```powershell
docker compose config
docker compose up --build
```

Compose uses pinned MongoDB and PostgreSQL images, local-only default credentials, separate named data volumes, and dependency health checks. Neither database is published to the host. Override the development defaults with environment variables before using the stack outside a local workstation. Stop it with `docker compose down`; do not use `docker compose down -v` unless destruction of both local database volumes is explicitly intended.

## Hosted staging architecture

The recommended hosted topology is a static/PWA frontend at `https://app.<domain>`, one long-running Node/WebSocket backend at `https://api.<domain>`, managed PostgreSQL, and managed MongoDB while deferred domains remain. The backend is stateless, binds the provider `PORT`, supports explicit proxy trust, and requires both databases for readiness. Frontend API and Socket URLs are public build-time configuration; all backend credentials remain provider secrets.

Apply PostgreSQL migrations once through an explicit release command, then use the guarded staging bootstrap only for a new empty staging database. Do not run historical Mongo shadow/cutover tools against a clean environment. Free/sleeping services and manual backups are acceptable only for disposable internal staging; a pilot requires always-on compute, reliable backups, monitoring, and restore evidence.

See the [staging deployment runbook](docs/runbooks/V2-06B3_STAGING_DEPLOYMENT.md), [readiness review](docs/reviews/V2-06B3_STAGING_READINESS_REVIEW.md), [partial hosted validation](docs/reviews/V2-06B4_HOSTED_STAGING_PARTIAL_VALIDATION.md), [cost/reliability register](docs/reviews/V2-06B3_HOSTING_COST_AND_RELIABILITY.md), and [ADR 0013](docs/adr/0013-staging-deployment-architecture.md). Hosted staging now exists for development/testing, but the partial review lists the remaining work required before any pilot or production claim.

## Health endpoints

- `GET http://localhost:5000/health/live` returns HTTP 200 whenever the API process can respond. It does not depend on either database.
- `GET http://localhost:5000/health/ready` returns HTTP 200 only while MongoDB and PostgreSQL are reachable; otherwise it returns HTTP 503.

Health responses expose only status labels and never connection strings or secrets.
