# V2-06B3 Hosting Cost and Reliability Register

- Date: 2026-09-22
- Scope: provider-neutral staging, pilot, and production expectations
- Pricing policy: provider prices change; evaluate current plans at provisioning time rather than encoding fragile numbers here

EkaVio's low-cost doctrine means the least expensive architecture that meets the current reliability obligation. It does not make sleeping compute, missing backups, or untested recovery acceptable for paying-customer production.

## Architecture held constant

All tiers use a static/PWA frontend, one long-running Node/Express/Socket.IO modular-monolith backend, PostgreSQL, and MongoDB while deferred domains remain. Extra services, Redis, message brokers, microservices, Kubernetes, paid messaging, payment gateways, and AI are not prerequisites.

## Tier register

| Concern | Free staging | Low-cost pilot | Production |
| --- | --- | --- | --- |
| Purpose | Disposable internal validation | Limited real users with an agreed support window | Normal customer workload |
| Frontend | Free static CDN/host is acceptable | Static host with custom domain and basic monitoring | Custom domain, monitored deploys, rollback history |
| Backend | Sleeping/free WebSocket-capable service is acceptable | Always-on single instance | No sleeping; capacity and failure-domain review |
| Cold start | Accepted and documented | Not accepted during operating hours | Not accepted |
| PostgreSQL | Small managed tier; direct migration URL and runtime pool limits | Reliable managed tier with connection/capacity headroom | Capacity, availability, maintenance and recovery objectives reviewed |
| MongoDB | Small managed tier while required domains remain | Reliable managed tier with access controls | Capacity/availability reviewed until Mongo retirement |
| Backups | Manual pre-change `pg_dump` and `mongodump`; disposable data may have short retention | Scheduled/provider backups plus periodic exports | Automated backups, retention policy, off-system consideration, and proven restore |
| Restore test | Before milestone acceptance and after material schema/data changes | Scheduled and before pilot expansion | Recurring, recorded, and tied to recovery objectives |
| Backend instances | One | One unless measured need proves otherwise | Scale only with Socket/rate-limit coordination designed first |
| Monitoring | Provider logs and manual health checks | Availability checks, database alerts, log retention, named responder | Alerting, incident process, dashboards, capacity and security review |
| SLA | None | Explicit pilot expectation, not provider-free-tier assumptions | Contract/operating objectives defined |
| Data retention | Test data only; minimize PII | Defined pilot retention and deletion procedure | Formal retention/privacy requirements |
| Rollback | Redeploy prior image/commit only when database compatibility is proved | Runbook, freeze writes, restore/reconcile when needed | Tested application and data recovery plan |

## Known low-cost tradeoffs

- Sleeping backends create first-request latency and interrupt Socket.IO. Client reconnection helps but does not make sleeping compute appropriate for a live pilot.
- Free database tiers commonly constrain storage, compute, concurrent connections, retention, regions, and backup features. Confirm current provider limits during provisioning.
- Static hosting is inexpensive because the browser bundle is immutable and the backend owns secrets and authority. Do not move backend logic or secrets into the frontend to preserve a free tier.
- One backend instance avoids distributed Socket.IO and rate-limit coordination. Before adding a second instance, design shared broadcast/session coordination and a distributed limiter; do not scale blindly.
- Manual backup is reasonable only for disposable staging. A successful command is not restore evidence; restore into an isolated target and verify counts/invariants.

## Promotion gates

### Free staging to pilot

Require all of the following:

- same-site HTTPS custom domains validated with real login/refresh/logout;
- always-on backend selected;
- PostgreSQL and Mongo backup/restore evidence;
- database capacity and connection limits reviewed;
- domain-specific CSP tested;
- dependency/container maintenance review completed;
- public registration and API-documentation exposure explicitly decided;
- provider log retention, uptime checks, and a named incident responder;
- real-customer PII/retention and support expectations approved.

### Pilot to production

Require automated backups with retention, recurring restore drills, no sleeping compute, measured capacity, availability objectives, incident/recovery procedures, access review, secret rotation procedure, monitoring/alerting, and an explicit decision on remaining MongoDB authority. Production must not depend on the absence of incidents in staging.

## Provider examples, not dependencies

Vercel or an equivalent static host can serve the frontend; Render or an equivalent long-running web service can serve HTTP and WebSocket traffic; Neon or any compatible managed PostgreSQL can supply a standard secure connection URL; Atlas or a compatible managed MongoDB can supply a standard SRV/TLS URI. EkaVio imports no provider SDK and contains no provider business logic.

Current official behavior and limits must be checked at provisioning time. Relevant documentation includes [Vercel Vite SPA routing](https://vercel.com/docs/frameworks/frontend/vite), [Render web services](https://render.com/docs/web-services), [Render WebSockets](https://render.com/docs/websocket), [node-postgres TLS](https://node-postgres.com/features/ssl), and [MongoDB Node TLS/SRV guidance](https://www.mongodb.com/docs/drivers/node/current/connect/connection-targets/).
