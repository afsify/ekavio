# ADR 0013: Hosted Staging Deployment Architecture

- Status: Accepted
- Date: 2026-09-22
- Scope: V2-06B3 deployment and hosted-staging readiness

## Context

EkaVio's accepted application is a modular monolith with a React/Vite PWA, one Node/Express/Socket.IO backend, PostgreSQL authority for shared core/commercial/Customer/Service/Appointment/Queue, and temporary MongoDB authority for deferred domains and ActivityLog. Local Docker Compose proves the four-service topology, but a real host adds TLS termination, reverse proxies, provider ports, custom origins, managed database TLS/pooling, ephemeral filesystems, static-site routing, process signals, cold starts, backup limitations, and same-site cookie constraints.

The first hosted environment is staging. The objective is a low-cost, provider-neutral deployment with honest reliability limits, not a production rollout or a new product domain.

## Decision

### Topology

Deploy the compiled frontend to a static/PWA host and one long-running backend process to a WebSocket-capable Node/Docker host. Connect the backend through standard drivers to managed PostgreSQL and managed MongoDB. Both databases remain readiness dependencies. No provider SDK or provider-specific business logic enters the application.

The application remains a single modular monolith. There is no microservice split, Kubernetes, Redis, message broker, distributed scheduler, paid messaging/payment/AI dependency, or automatic production deployment.

### Domains, TLS, cookies, and origins

Use HTTPS sibling names `app.<domain>` and `api.<domain>`. The refresh cookie remains API-host-only, `HttpOnly`, production `Secure`, `SameSite=Lax`, scoped to `/api/auth`, and rotating/revocable through PostgreSQL sessions. Cross-origin credentialed calls are allowed only from exact configured HTTPS origins. Socket.IO has its own exact allowlist plus the existing PostgreSQL session/membership/branch authorization.

Unrelated provider default domains are cross-site and are not an accepted authentication topology. B3 will not default to `SameSite=None`. Any future cross-site exception requires separate CSRF, browser third-party-cookie, and privacy review.

TLS terminates at the trusted hosting edge. The Node container serves HTTP on provider `PORT` and trusts only an explicit reviewed number of proxy hops. It does not manage certificates.

### Stateless backend and lifecycle

The backend binds `0.0.0.0:$PORT`, stores no authoritative user/business state on local disk, and starts only when PostgreSQL and MongoDB connect. Liveness reports process responsiveness; readiness requires both databases. SIGINT/SIGTERM closes Socket.IO/HTTP and both database pools. Provider stdout/stderr is the initial log sink, with privacy-safe structured error context.

One backend instance is the staging/pilot default. Socket rooms and rate limits are process-local. A second instance requires an explicit shared coordination/limiting design; it is not justified now.

### Databases and releases

Use normal `postgresql://` and `mongodb+srv://`/TLS connection contracts. Production-mode startup rejects database URLs without TLS. Runtime PostgreSQL uses a bounded ten-connection pool; Mongo uses a bounded ten-connection pool with no warm minimum. Values remain secrets and are never logged.

Apply PostgreSQL migrations through one explicit release command, never automatically from each web startup. The migration connection must be direct/session-capable because the runner uses a session advisory lock. Status is checked before and after apply. The managed PostgreSQL service must support the accepted `btree_gist` extension and relational features.

A clean staging database applies migrations 001–005 from zero. It does not run historical Mongo shadow/cutover tooling. The guarded staging bootstrap creates/reuses the minimum operator/organization/main-branch context, reviewed IANA timezone, canonical catalogue, pilot-core entitlement, and durable PostgreSQL operational latch. It is explicit, idempotent for its supported case, secret-driven, and refuses `NODE_ENV=production`. It creates no operational sample rows. A real legacy environment continues to use the prior migration/cutover runbooks instead.

### Frontend and PWA

API and Socket origins are required public build-time values and fail the build when missing/invalid. No backend secret may use a `VITE_*` name. Static hosts must provide SPA fallback so direct routed requests resolve. Workbox precaches only versioned static assets, has no API runtime cache, excludes API/Socket navigation fallback, and cleans obsolete caches. Authentication remains memory/cookie based rather than service-worker or browser-storage authority.

Baseline static headers prevent sniffing/framing and restrict referrer and sensitive browser features. HSTS is an edge responsibility. A domain-specific CSP is a pilot promotion requirement because guessing before final domains risks breaking API, WebSocket, and PWA behavior.

### Reliability and cost

Free staging may accept sleeping compute, cold starts, small storage, manual backups, and no SLA because the environment is disposable and internal. A real pilot requires always-on backend compute, reliable managed databases, monitored health/logs, scheduled backups, and restore evidence. Production additionally requires automated retained backups, recurring restore drills, capacity/availability review, incident ownership, and recovery objectives. “Low cost” never means unreliable zero-cost production.

## Consequences

- The same application artifact works with Vercel/Render/Neon/Atlas examples or compatible providers without SDK lock-in.
- Same-site custom DNS is a functional authentication prerequisite, not cosmetic branding.
- Hosted staging uses `NODE_ENV=production`; the one-off bootstrap runs separately with a staging marker and cannot become web startup behavior.
- MongoDB cost and readiness remain until later accepted domain cutovers and final retirement.
- One instance is simple and economical, but horizontal scale cannot be enabled without Socket/rate-limit coordination.
- Explicit migrations and bootstrap add release steps but avoid startup races and accidental legacy backfills.
- Free staging is useful evidence but cannot establish production reliability.

## Alternatives rejected

### Use unrelated provider domains and weaken the cookie

Rejected. It would turn a same-site refresh design into cross-site credential behavior, add CSRF/third-party-cookie risks, and make temporary provider URLs dictate security.

### Run migrations and seeds on every backend startup

Rejected because multiple starts can race, deployment failures become application availability failures, and seed behavior must never run in production by accident.

### Add Redis for Socket.IO and rate limiting

Rejected because one instance is the accepted staging/pilot shape. Shared infrastructure is justified only when horizontal scale is measured and designed.

### Persist uploads or state on the backend filesystem

Rejected. No current user-upload feature needs object storage, and ephemeral container disk cannot be business authority.

### Serverless backend functions

Rejected for the current backend because it owns long-lived Socket.IO connections, database pools, and graceful process lifecycle.

### Provider-specific database/application SDKs

Rejected. Standard PostgreSQL and MongoDB protocols satisfy the requirement and preserve portability.
