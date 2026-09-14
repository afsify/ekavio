# EkaVio development

EkaVio is a React/Vite PWA with an Express/TypeScript backend and MongoDB. V2-01 established deterministic engineering and container foundations, V2-02 added revocable server-side sessions, V2-03 added explicit organization memberships and permission enforcement, V2-04 added backend-authoritative commercial entitlements, and V2-05A adds the PostgreSQL shared-core migration foundation. MongoDB remains application runtime source of truth after V2-05A.

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

The committed examples contain development-only values. Replace all secrets for any shared or production environment. Backend startup validates `NODE_ENV`, `PORT`, `MONGO_URI`, `DATABASE_URL`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `HTTP_ALLOWED_ORIGINS`, and `SOCKET_ALLOWED_ORIGINS`. Comma-separate multiple allowed origins. Never log or commit a real database URL.

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

The refresh cookie uses `SameSite=Lax`, is scoped to `/api/auth`, and expires after seven days. `Secure` is intentionally disabled for `NODE_ENV=development` and `NODE_ENV=test` so localhost HTTP works. Production must use HTTPS; production cookies always enable `Secure`. Backend CORS still accepts only `HTTP_ALLOWED_ORIGINS`, so configure the exact frontend origin rather than a wildcard.

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

This creates the canonical `ledger`, `inventory`, `attendance`, and `queue` module definitions, a pilot core plan, a non-sellable legacy-import plan, and module add-ons. It does not assign new access to existing organizations and contains no finalized product pricing.

Preview the legacy `Organization.activeModules` migration:

```powershell
npm.cmd run entitlements:backfill
```

The report normalizes `khata` and `digital-khata` to `ledger`, lists unknown module IDs, identifies ambiguous active-but-overdue records, and reports existing non-import subscriptions that will be left untouched. It writes nothing by default. After backing up the database and reviewing a clean report, apply it explicitly:

```powershell
npm.cmd run entitlements:backfill -- --apply
```

The apply operation is idempotent, creates at most one import subscription per organization, preserves valid legacy module access, and retains inactive/suspended state. It stops before any write if unknown or ambiguous legacy data exists. Do not run apply automatically against an unreviewed shared or production database.

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

## PostgreSQL foundation and shadow migration

PostgreSQL is a V2-05A shadow target, not a runtime authority. Authentication, refresh sessions, request authorization, memberships, commercial entitlements, Queue, Inventory, Ledger, and Attendance continue to read and write MongoDB. There is no dual write or cutover in this milestone.

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

After completing backups, reviewing a clean dry run, and applying schema migrations, explicitly apply and reconcile:

```powershell
npm.cmd run postgres:shadow -- --apply
npm.cmd run postgres:verify
```

Apply is one transaction, validates all source relationships before writes, upserts by stable `legacy_mongo_id`, and is idempotent. Verification returns non-zero for any mismatch. Reports never contain passwords, password hashes, refresh-token hashes, or database credentials. Active Mongo refresh sessions are intentionally not copied; V2-05B will require reauthentication at cutover unless a separately reviewed safe design replaces that decision.

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

## Health endpoints

- `GET http://localhost:5000/health/live` returns HTTP 200 whenever the API process can respond. It does not depend on either database.
- `GET http://localhost:5000/health/ready` returns HTTP 200 only while MongoDB and PostgreSQL are reachable; otherwise it returns HTTP 503.

Health responses expose only status labels and never connection strings or secrets.
