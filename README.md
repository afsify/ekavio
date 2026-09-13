# EkaVio development

EkaVio is a React/Vite PWA with an Express/TypeScript backend and MongoDB. V2-01 established deterministic engineering and container foundations, V2-02 added revocable server-side sessions, and V2-03 adds explicit organization memberships, branch context, and backend permission enforcement.

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

The committed examples contain development-only values. Replace all secrets for any shared or production environment. Backend startup validates `NODE_ENV`, `PORT`, `MONGO_URI`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `HTTP_ALLOWED_ORIGINS`, and `SOCKET_ALLOWED_ORIGINS`. Comma-separate multiple allowed origins.

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

Permissions and modules remain intentionally separate. Permissions come from the active membership role and determine what a user may do. `activeModules` is retained only as the existing organization capability compatibility value; commercial entitlement design belongs to V2-04.

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

## Quality gates

Backend:

```powershell
Set-Location backend
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
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

Compose uses a pinned MongoDB image, local-only default credentials, a named data volume, and dependency health checks. MongoDB is not published to the host. Override the development defaults with environment variables before using the stack outside a local workstation.

## Health endpoints

- `GET http://localhost:5000/health/live` returns HTTP 200 whenever the API process can respond. It does not depend on MongoDB.
- `GET http://localhost:5000/health/ready` returns HTTP 200 only while Mongoose reports an active MongoDB connection; otherwise it returns HTTP 503.

Health responses expose only status labels and never connection strings or secrets.
