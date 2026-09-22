# V2-06B3 Hosted Staging Deployment Runbook

This is a provider-neutral procedure for EkaVio's first hosted staging environment. It does not authorize production deployment, paid purchases, a real domain purchase, legacy migration, or the next product milestone. Replace every placeholder through provider secret settings; never commit a real credential.

## Target and blocking rules

```text
Browser / PWA
  -> https://app.<domain>  (static frontend)
  -> https://api.<domain>  (one Node/Express/Socket.IO service)
       -> managed PostgreSQL
       -> managed MongoDB (still required)
```

Stop if HTTPS or sibling app/API domains cannot be configured. Unrelated static-host and backend-host default domains are cross-site; the accepted `Secure; HttpOnly; SameSite=Lax` refresh cookie will not support cross-site refresh XHR. Do not work around this by changing the cookie to `SameSite=None` without a separate CSRF and third-party-cookie review.

Stop for any missing secret, non-TLS hosted database URL, wildcard origin, unknown proxy path, pending/modified migration, failed health check, failed smoke flow, or untested backup. Staging is not production and is not yet deployed by this repository milestone.

## Commands from the repository

| Component | Working directory | Install | Build | Start / output |
| --- | --- | --- | --- | --- |
| Frontend | `frontend` | `npm ci` | `npm run build` | Static output: `frontend/dist` |
| Backend | `backend` | `npm ci` | `npm run build` | `npm start` (`node dist/server.js`) |
| PostgreSQL migration | `backend` | Built backend required | `npm run db:migrate` | Status: `npm run db:migrate:status` |

The backend production Dockerfile is the preferred example backend artifact because it runs `node dist/server.js` directly as PID 1 for reliable signal delivery and includes migrations. A native Node 20 service using the commands above is also supported. Use one mode, not two competing deployments. The frontend is best deployed as static files; its Nginx image is an alternative, not a requirement for a static provider.

## 1. Create PostgreSQL

Create an empty, isolated staging database and a least-privileged application/migration user that can create the accepted schema and `btree_gist` extension. Obtain a standard `postgresql://...` connection URL with TLS enabled. Prefer certificate verification (`sslmode=verify-full`) when the provider supplies a public-CA hostname. Provider-supplied `sslmode=require` URLs are supported by the locked Node driver.

Use a direct/session connection URL for migrations because the runner holds a PostgreSQL session advisory lock across its checks. A transaction-mode pooler URL is suitable for normal runtime only after compatibility verification; do not use it for the release migration command.

## 2. Create MongoDB

Create an empty, isolated staging database, application user, and narrow network access rule. Obtain `mongodb+srv://...` where available; SRV discovery enables TLS by default. A standard multi-host `mongodb://...?...tls=true` URI also works. Mongo remains required for Attendance records, Inventory, legacy Ledger/Customer Dues, applicable corporate data, and ActivityLog/security audit.

Do not run Mongo-to-PostgreSQL legacy tooling merely because the tools exist. A clean staging environment has no legacy source.

## 3. Configure backend secrets and settings

Set these in the backend provider's environment/secret UI:

```text
NODE_ENV=production
PORT=<provider supplied or 5000>
DATABASE_URL=<secure runtime PostgreSQL URL>
MONGO_URI=<secure managed MongoDB URI>
JWT_SECRET=<unique random value, at least 32 characters>
REFRESH_TOKEN_SECRET=<different unique random value, at least 32 characters>
HTTP_ALLOWED_ORIGINS=https://app.<domain>
SOCKET_ALLOWED_ORIGINS=https://app.<domain>
TRUST_PROXY_HOPS=<reviewed count, commonly 1 for one edge proxy>
```

Never place these secrets in `VITE_*`, an image build argument, a committed file, a shell transcript, or provider-visible build log. `PORT`, origins, and proxy count are configuration rather than secrets.

## 4. Apply PostgreSQL migrations from zero

Run this as one explicit, non-interactive release job from `backend/`, using the direct migration URL in `DATABASE_URL`:

```sh
npm ci
npm run build
npm run db:migrate:status
npm run db:migrate
npm run db:migrate:status
```

The first status must report accepted migrations as pending on a clean database; the final status must report migrations 001 through 005 applied with matching checksums. The migration runner serializes a release with an advisory lock and each migration is transactional. Do not edit accepted SQL and do not run migrations from every web instance startup.

Clean initialization is not a legacy cutover. Do not run `postgres:shadow`, commercial/identity cutover activation, or `operations:queue:shadow/verify/preflight/activate` unless a real reviewed legacy source and its runbook exist.

## 5. Deploy the backend

Deploy one production Docker target or one Node 20 service. The process binds `0.0.0.0:$PORT`. Configure the platform health path as `/health/ready`; `/health/live` is process-only diagnosis and must not be used to send traffic to a process whose databases are unavailable.

The service must receive `SIGTERM` on replacement and enough time to close Socket.IO/HTTP and both database pools. Do not attach persistent disk: the application is stateless and no authoritative data belongs on container storage.

## 6. Verify backend health

Through the public HTTPS API domain, require:

```text
GET https://api.<domain>/health/live   -> 200 {"status":"ok"}
GET https://api.<domain>/health/ready  -> 200 with MongoDB and PostgreSQL ready
```

A 503 readiness result is a deployment failure. Responses must not expose hosts, database names, cluster identifiers, or credentials. Review startup logs for only safe connection/status messages.

## 7. Configure and build the frontend

Set public build-time values:

```text
VITE_API_URL=https://api.<domain>/api
VITE_SOCKET_URL=https://api.<domain>
```

Run `npm ci && npm run build` in `frontend/` and publish `dist/`. These values are visible in the browser bundle and must contain no secret. A hosted production build fails if either is absent, invalid, or a non-loopback HTTP URL.

## 8. Deploy the frontend and validate routing/PWA

For a provider rooted at `frontend/`, `vercel.json` supplies the SPA fallback and baseline static headers. Equivalent static hosts must rewrite unknown application paths to `/index.html` while still serving real assets. Verify HTTP 200 for `/`, `/login`, and one authenticated client route on direct refresh.

Confirm `manifest.webmanifest`, `sw.js`, and hashed assets load. The service worker must precache static assets only; `/api` and `/socket.io` must not appear in runtime caches. Confirm an update replaces old static caches and does not restore an authenticated session offline.

## 9. Configure exact CORS and Socket origins

`HTTP_ALLOWED_ORIGINS` and `SOCKET_ALLOWED_ORIGINS` must contain exact scheme/host/port origins, comma-separated only when multiple reviewed frontend origins are needed. Do not include a path, trailing slash, wildcard, or backend origin. Production validation requires HTTPS.

From `https://app.<domain>`, confirm an OPTIONS preflight to the API returns the exact `Access-Control-Allow-Origin` and credentials header. An unapproved Origin must fail. Confirm a Socket.IO connection upgrades through the reverse proxy and an unauthorized origin or unauthorized tenant/branch context does not join a room.

## 10. Configure domains, DNS, and certificates

Conceptually configure:

- `app.<domain>` CNAME/alias to the static host;
- `api.<domain>` CNAME/alias to the backend host.

Follow the selected providers' exact DNS target instructions; do not assume a registrar. Let the providers terminate HTTPS and issue/renew certificates. Do not install custom certificates inside the Node container. Confirm HTTP redirects to HTTPS, certificates cover each hostname, and both names share the same registrable parent and scheme.

HSTS belongs at the trusted host edge/custom-domain boundary. Enable it only after HTTPS is stable and subdomain impact is understood. Before a real pilot, add and browser-test a domain-specific frontend CSP that permits only the accepted API/WebSocket/worker/assets.

## 11. Bootstrap clean staging

The guarded bootstrap is the only seed path added by B3. It creates or reuses one staging owner/admin context, marks that identity as staging platform operator, assigns the reviewed IANA timezone to the `main` branch, reconciles the canonical catalogue, assigns the `pilot-core` trial subscription, and latches PostgreSQL operational authority. It creates no Customer, Service, Appointment, Queue token, Attendance, Inventory, Dues, notification, chat, Sales, or payment fixture.

Run the compiled command once with a direct staging `DATABASE_URL`. The command requires migrations current, is idempotent for one unambiguous phone/context, refuses weak/missing input, and refuses `NODE_ENV=production`. Run it as an isolated staging job with `NODE_ENV=staging`, not in the web service startup command:

```sh
npm run staging:bootstrap
```

Provide these job-only values through secret settings:

```text
NODE_ENV=staging
STAGING_BOOTSTRAP_CONFIRM=staging
STAGING_BOOTSTRAP_PHONE=<non-production staging login>
STAGING_BOOTSTRAP_PASSWORD=<unique value, at least 12 characters>
STAGING_BOOTSTRAP_USER_NAME=<staging operator name>
STAGING_BOOTSTRAP_ORGANIZATION_NAME=<staging organization>
STAGING_BOOTSTRAP_ORGANIZATION_TYPE=<reviewed type>
STAGING_BOOTSTRAP_BRANCH_TIMEZONE=<IANA value such as Asia/Kolkata>
```

Remove job-only values after execution. Keep the web runtime at `NODE_ENV=production`. Do not copy staging credentials into production.

## 12. Functional and security validation

Using the browser at `https://app.<domain>`:

1. Log in and confirm the response sets `ekavio_refresh` with `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/api/auth`, and the expected lifetime.
2. Refresh the page and confirm `/api/auth/refresh` rotates the cookie and restores the in-memory access session.
3. Confirm the organization and `main` branch are selected and cannot be changed to an unauthorized UUID.
4. Create a Customer through the canonical API/UI.
5. Create a Service available at the selected branch.
6. Create an Appointment and verify the branch-local time.
7. Check in that Appointment or create a walk-in Queue token; confirm one monotonic branch/session token.
8. Observe `queue.token.created` or `queue.token.status_changed` on the authenticated branch Socket and confirm no phone/notes/credential appears in the payload.
9. Reload/refetch after disconnect and confirm HTTP state is authoritative.
10. Log out, confirm the cookie is expired/cleared, the PostgreSQL session is revoked, Socket disconnects, and refresh fails.
11. Change a test password and confirm prior sessions cannot refresh.
12. Test an unapproved CORS/Socket origin and cross-tenant/cross-branch identifiers; all must be denied.

Review browser storage: access/refresh credentials must not exist in local/session storage or service-worker caches. Review provider logs: no password, hash, bearer token, refresh credential, Cookie/Authorization header, database URI, request body, or unnecessary customer PII may appear.

## 13. Backup and restore proof

Before material staging changes, take named, timestamped database-specific backups. Examples when the provider permits direct tools:

```sh
pg_dump --format=custom --file=<secure-path>/ekavio-staging.dump "$DATABASE_URL"
mongodump --uri="$MONGO_URI" --archive=<secure-path>/ekavio-staging.archive.gz --gzip
```

Do not store them in the repository or image. Record hashes and tool versions. Restore into new isolated disposable targets, run migration status, compare important counts/invariants, exercise login and the Queue flow, then remove only the disposable targets. Never call a backup proven until restore succeeds.

Manual backup can be accepted for disposable free staging. A pilot needs scheduled/provider backups plus restore evidence. Production requires automated retention, recovery objectives, incident ownership, and recurring drills.

## 14. Rollback

For an application-only failure with no incompatible database write, redeploy the last accepted commit/image and rerun health/smoke checks. Never automatically switch PostgreSQL-owned identity/commercial/Queue paths back to Mongo.

For a migration/data failure, stop/freeze writes, preserve logs and both databases, take new forensic backups, and restore the affected database to an isolated target. Decide roll-forward versus restore/reconcile from evidence. PostgreSQL-native Customer/Service/Appointment/Queue writes make Mongo Queue stale by design; it is not a rollback source.

Do not run destructive database resets or `docker compose down -v`. Rotate any exposed secret before reopening.

## Provider examples

### Vercel or equivalent static host

Set project root to `frontend`, install with `npm ci`, build with `npm run build`, and publish `dist`. Supply only the two `VITE_*` public URLs. The minimal checked-in config provides Vite SPA deep-link fallback and baseline headers. Configure `app.<domain>` before auth validation.

### Render or equivalent WebSocket host

Use the backend Docker production target or root `backend` with `npm ci && npm run build`, then `npm start`. Set the provider `PORT`, readiness path `/health/ready`, secrets, exact origins, and reviewed proxy hops. The service must be a long-running WebSocket-capable web service, not a short-lived function. Keep one instance for current staging. Configure `api.<domain>` and `wss` through provider TLS.

### Neon or equivalent PostgreSQL

Use the standard provider URL; no provider SDK is required. Runtime may use the provider's pooled URL within the ten-connection application cap. Migrations must use the direct/session URL, support `btree_gist`, and pass status before/after apply. Free-tier backup/retention is not assumed.

### MongoDB Atlas or equivalent

Use a dedicated database user, encoded credentials, SRV/TLS URI, and narrow network rules. No Atlas SDK is required. Confirm DNS works from the backend host. Free-tier automated backup is not assumed; use an approved export/restore process for staging.

## Completion record

Record the final commit, frontend/backend deployment identifiers, sanitized environment names (never values), DNS/certificate status, migration status, health responses, functional/security results, backup hashes and restore evidence. Only then state that hosted staging exists. Successful V2-06B3 repository CI alone does not make that claim.
