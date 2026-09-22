# V2-06B3 Hosted Staging Readiness Review

- Review date: 2026-09-22
- Starting commit: `edc0c27c0a18d55b0167b3151155ed3727391526`
- Scope: deployment and hosted-staging readiness only
- Deployment state: repository prepared; no hosted environment was created

## Executive result

EkaVio can be deployed as one static React/PWA frontend, one long-running Node/Express/Socket.IO backend, one managed PostgreSQL database, and one managed MongoDB database. The application remains a modular monolith. PostgreSQL remains authoritative for shared core, commercial state, Customer, Service, Appointment, and Queue; MongoDB remains required for deferred domains and security audit.

The repository-level P0 findings were corrected in this milestone. The deployment itself must still satisfy the runbook's blocking conditions: HTTPS, sibling `app.<domain>` and `api.<domain>` names, exact origins, secure managed database URLs, reviewed proxy-hop count, current migrations, and successful health/smoke checks. Unrelated provider domains are not an accepted cookie topology.

## Audit coverage

The review traced backend environment parsing, Mongo and PostgreSQL connection setup, all PostgreSQL migrations and release scripts, Express middleware, auth cookies, Socket.IO authorization/rooms, process startup/shutdown, liveness/readiness, Docker build/runtime stages, frontend API and Socket clients, Vite/PWA generation, Nginx SPA routing, Compose, CI, ignore rules, and committed environment examples.

Repository searches covered `localhost`, `127.0.0.1`, HTTP(S), database URLs, Vite variables, CORS, Socket.IO, cookies, ports, hosts, secrets, logging, uploads, and filesystem writes. Localhost values remain only in development examples, Compose, CI, and tests. Hosted values are configurable; no runtime authority depends on the Docker hostnames `postgres` or `mongo`.

## Issue register

| Priority | Finding | Resolution / required action |
| --- | --- | --- |
| P0 | Proxy trust was implicit, so forwarded client IP and rate limiting could be wrong behind a host proxy. | Fixed with validated `TRUST_PROXY_HOPS`; production requires an explicit value and direct/local mode remains `0`. |
| P0 | Production database URLs did not fail closed when TLS was omitted. | Fixed: production requires PostgreSQL TLS parameters and Mongo SRV/TLS. Values are never echoed on validation failure. |
| P0 | Frontend builds could succeed without API/Socket URLs and fail only in the browser. | Fixed: Vite validates both build-time URLs; non-loopback hosted production URLs must be HTTPS. |
| P0 | Static-host deep links had no provider routing contract. | Fixed with minimal `frontend/vercel.json`; Nginx already uses an SPA fallback. `/login` and client routes resolve to `index.html`. |
| P0 | Socket.IO was attached before startup but was not explicitly closed during failure or signal shutdown. | Fixed with an awaited Socket.IO close as the sole owner of its attached HTTP-server shutdown, before database disconnect; backend binds the provider `PORT` on `0.0.0.0`. |
| P0 | Socket CORS existed, but WebSocket upgrades did not have an explicit origin admission check. | Fixed with an exact `allowRequest` policy while retaining token/session and tenant/branch authorization. Origin is defense in depth, not authentication. |
| P0 | A clean migrated database lacked a safe path to create an operator, reviewed branch timezone, catalogue, and pilot entitlement. | Fixed with explicit, idempotent `staging:bootstrap`. It requires current migrations and secrets, refuses `NODE_ENV=production`, and creates no Customer/Service/Appointment/Queue fixtures. |
| P0 | A staging deployment on unrelated default host domains would make `SameSite=Lax` refresh cookies unavailable to cross-site XHR. | No insecure default was added. Deployment is blocked until sibling same-site domains are configured; see the runbook. |
| P1 | Free/sleeping backend plans introduce cold starts and Socket disconnects. | Acceptable only for non-customer staging. Pilot requires an always-on backend and monitoring. |
| P1 | Free database tiers may lack adequate automated backups, retention, capacity, or recovery guarantees. | Manual backup is acceptable for disposable staging; pilot requires scheduled backups and restore evidence. |
| P1 | Auth and API rate limits are in-memory and each Socket room exists in one process. | Correct for one staging/pilot instance. Multiple instances require reviewed shared coordination before horizontal scale. No Redis was added. |
| P1 | A domain-specific frontend Content Security Policy cannot be correct until final API/domain values are known. | Basic static security headers are installed. Add and browser-test a least-privilege CSP before a real pilot; do not guess a policy during staging preparation. |
| P1 | Frontend build/runtime-package classification still produces deferred audit findings, and Node/Nginx base tags float within their selected variants. | Backend production dependencies were patched to zero audit findings. Reassess frontend dependency classification/upgrades and pin tested image releases through maintenance before real customer production. |
| P1 | Public registration and API documentation exposure require an operating decision before a pilot. | Staging may retain them for testing; restrict or intentionally approve them before customer exposure. |
| P2 | The PWA manifest uses the existing SVG favicon rather than dedicated 192/512 PNG install assets. | Safe and functional for staging; add reviewed install artwork later without changing service-worker authority. |
| P2 | Provider stdout/stderr is the only operational log sink. | Sufficient for initial staging. Define retention/alerting and incident ownership before production. |
| P2 | `s3Uploader.ts` and its dependency are unused legacy code. | No runtime import or upload path exists and no object storage is needed. Remove in later dependency cleanup if still unused. |
| P2 | Docker base images are tag-pinned only to a major/variant, not immutable digests. | Pin tested patch releases/digests during container maintenance. |

## Environment contract

Hosted staging runs the backend with `NODE_ENV=production`; “staging” describes the deployment, not a weaker Node security mode.

| Variable | Required | Format / meaning | Development | Staging / production | Secret |
| --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | Optional; defaults to `development` | `development`, `test`, or `production` | `development` | `production` | No |
| `PORT` | Optional; defaults to `5000` | Integer 1–65535 | `5000` | Use provider value | No |
| `DATABASE_URL` | Yes | `postgresql://` or `postgres://` | Local URL allowed | TLS required; prefer certificate-verifying provider URL. Use direct/session URL for migrations. | Yes |
| `MONGO_URI` | Yes | `mongodb://` or `mongodb+srv://` | Local URL allowed | SRV enables TLS by default; standard URI must explicitly enable TLS | Yes |
| `JWT_SECRET` | Yes | Access-JWT signing secret | Non-shared development value | Unique, at least 32 characters | Yes |
| `REFRESH_TOKEN_SECRET` | Yes | Refresh-credential hash secret, independent of JWT secret | Non-shared development value | Unique, at least 32 characters | Yes |
| `HTTP_ALLOWED_ORIGINS` | Yes | Comma-separated exact origins with no paths, credentials, or wildcard | Exact localhost origin(s) | HTTPS `app.<domain>` origin; add future production origin explicitly | No |
| `SOCKET_ALLOWED_ORIGINS` | Yes | Comma-separated exact origins | Exact localhost origin(s) | HTTPS `app.<domain>` origin | No |
| `TRUST_PROXY_HOPS` | Production: yes; otherwise defaults to `0` | Integer 0–3; reviewed number of proxies between client and app | `0` | Common single edge proxy is `1`; verify provider topology | No |
| `VITE_API_URL` | Frontend build: yes | Absolute API base including `/api` | `http://localhost:5000/api` | `https://api.<domain>/api` | No; public bundle value |
| `VITE_SOCKET_URL` | Frontend build: yes | Absolute backend origin | `http://localhost:5000` | `https://api.<domain>` | No; public bundle value |

The one-off `staging:bootstrap` additionally requires `STAGING_BOOTSTRAP_CONFIRM=staging`, phone, unique password, user name, organization name/type, and an IANA branch timezone. These are command inputs, not web-runtime settings. They belong in the provider's secret/job environment, must not be committed, and the command refuses `NODE_ENV=production`.

## Cookie and same-site assessment

The refresh cookie remains `HttpOnly`, `Secure` in production, `SameSite=Lax`, host-only, scoped to `/api/auth`, and valid for seven days. With HTTPS sibling hosts such as `app.example.test` and `api.example.test`, browser requests are cross-origin but same-site (same scheme and registrable parent). Axios uses credentials, and exact credentialed CORS authorizes the frontend origin. The cookie stays confined to the API host and auth path.

Unrelated `*.vercel.app` and `*.onrender.com` names are cross-site. `SameSite=Lax` will not support the refresh XHR flow there. Switching to `SameSite=None` would require `Secure`, explicit CSRF analysis/protection, and acceptance of third-party-cookie restrictions. This milestone intentionally does not weaken the cookie; configure sibling custom domains instead.

## CORS and realtime

HTTP CORS uses an exact parsed allowlist, credentials, and normal middleware OPTIONS handling. Wildcards, paths, embedded credentials, invalid schemes, and production HTTP origins fail configuration. Tests cover development origin acceptance, hosted credentialed preflight, and rejection.

Socket.IO uses a separately configured exact origin list plus `allowRequest`, then validates the access JWT, live PostgreSQL session, active membership, selected organization, and selected branch before joining rooms. The frontend URL is build-configured and Socket.IO reconnects automatically; application context changes explicitly disconnect/reconnect and authoritative HTTP queries refetch. One backend instance requires no adapter. Horizontal scale would require a reviewed shared adapter/rate-limit strategy and is not part of B3.

## Frontend and PWA

Vite fails the build when either public URL is absent or invalid. No secret belongs in a `VITE_*` variable. Nginx and Vercel provide SPA fallback. The manifest now defines identity, scope, start URL, description, colors, and the existing SVG icon. Workbox precaches versioned static build assets, cleans old caches, has no runtime API cache, and denies `/api` and `/socket.io` navigation fallback. Auth tokens remain memory-only; only theme preference is local storage. Service-worker and manifest responses are marked for revalidation by the supplied hosts.

## Backend, containers, and storage

The backend binds `0.0.0.0:$PORT`, fails startup if either required database cannot connect, answers liveness independently, and requires both databases for readiness. SIGINT/SIGTERM awaits Socket.IO, which owns closure of its attached HTTP server, then closes Mongo and the PostgreSQL pool. Sessions and business authority live in databases; the process keeps only replaceable access/Socket state. No runtime path writes authoritative data to container disk. Filesystem reads are limited to reviewed migrations/mappings; mapping tooling is explicit and not web runtime. The unused S3 utility has no importer.

Production backend and frontend images are multi-stage. Backend runtime omits dev dependencies, runs as the `node` user, and starts `node dist/server.js` directly as PID 1 so platform signals reach the application; frontend runs as `nginx` on unprivileged port 8080. Both define image health checks, `.dockerignore` excludes environment and backup artifacts, and neither image bakes runtime secrets. Source maps are not enabled by the current TypeScript/Vite production output.

## Managed database compatibility

`pg` receives the standard connection string unchanged. Runtime pool limits are 10 connections with a 30-second idle timeout and 5-second connection timeout, appropriate for one low-tier instance; use a provider pooler for runtime only when its transaction semantics are compatible. The release migration command must use a direct/session connection because the runner holds a session advisory lock across migration checks. Migrations require PostgreSQL support for `btree_gist`, `TIMESTAMPTZ`, UUIDs, exclusion constraints, advisory locks, transactions, and IANA timezone data. Migration 004 installs `btree_gist`; verify provider permission before deployment.

Mongoose/driver accepts standard Mongo SRV discovery; SRV enables TLS by default. The connection uses a maximum pool of 10, no warm minimum, 30-second idle retirement, bounded selection/connect time, clean disconnect, and readiness through Mongoose state. Atlas/equivalent access lists, database user permissions, and backups are infrastructure responsibilities. Mongo remains mandatory.

## Headers, rate limits, logging, and privacy

Helmet protects backend responses, including content-type, frame, referrer, HSTS and related defaults; a restrictive Permissions Policy is added. Static host configs set content-type, frame, referrer, and Permissions Policy headers. TLS termination and HSTS policy are an edge/custom-domain responsibility. A final frontend CSP is deferred until the real domains are known so API, WebSocket, worker, and PWA traffic are not accidentally broken.

Sensitive auth paths (`login`, `refresh`, and `register`) are limited to 20 attempts per IP per 15 minutes in addition to the existing API limit. This is intentionally single-process. Correct IP attribution depends on the reviewed proxy-hop value. Application errors log a generated correlation ID, method, path, status, error type, and operational flag—not request bodies, cookie/authorization headers, connection URLs, tokens, passwords, hashes, or customer phone values. Provider access logs must be reviewed separately.

## Secret and artifact review

Git ignores `.env` and `.env.*` while allowing only sanitized `.env.example`/`.env.sample`, plus backups, dumps, archives, private keys, credential JSON, local Queue mappings, dependencies, coverage, and builds. Runtime and example files contain no production fallback secret. Hosted secrets belong only in provider secret settings. Before commit, tracked/staged content and history-oriented pattern searches must be reviewed without printing values.

## Readiness conclusion

There is no remaining repository P0 for a runbook-conforming hosted staging deployment. P1 items are explicit pilot gates, not permission to operate unreliable zero-cost customer production. B3 does not deploy infrastructure and does not start V2-06C.
