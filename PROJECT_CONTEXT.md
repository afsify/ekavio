# EkaVio Project Context

- Product: EkaVio.
- EkaVio is a low-cost, modular, multi-tenant SaaS platform for small and medium businesses.
- Initial market: Kerala.
- The source code is the truth for the current implementation.
- The EkaVio Master Strategy v3.0 is the target direction.
- Preserve existing working functionality; this is not a greenfield rewrite.
- The chosen architecture is a modular monolith.
- The client direction is a mobile-first React progressive web app (PWA).
- The backend direction is Node.js with TypeScript.
- PostgreSQL is the intended transactional system of record and will be adopted incrementally.
- WhatsApp API, SMS, payment-gateway automation, and paid AI are optional adapters, not core dependencies.
- Backend authorization is mandatory. Frontend menu hiding is never authorization.
- Tenant isolation, permissions, entitlements, money correctness, stock correctness, backups, and tests take priority over feature count.
- Solo-development workflow uses main directly. Before high-risk milestones, create a checkpoint tag. Keep one milestone per coherent commit where practical, start only from a clean working tree, and push only after lint, typecheck, tests, build, Docker validation, and diff review pass.
- Every implementation milestone ends with lint, typecheck, tests, build, diff review, and the exact results.
- Architecture decisions live in repository ADRs.
- Completed milestone: V2-00 established the inspection-only repository baseline and architecture records.
- Completed milestone: V2-01 established deterministic backend and frontend scripts, validated environment configuration, health/readiness checks, explicit CORS origins, production build/start lifecycles, persistent local MongoDB Compose configuration, SPA routing, and CI quality gates while preserving existing business behavior.
- Completed milestone: V2-02 replaced browser-persisted access and refresh JWTs with short-lived memory-only access JWTs and revocable, rotating MongoDB refresh sessions delivered through an HttpOnly cookie. It also made logout and password-change revocation explicit and rejects ambiguous duplicate-phone login.
- Completed milestone: V2-03 Authorization, Tenant Isolation & Branch Context.
- V2-03 established active Membership records as authorization truth, organization-owned Branch authorization context, centralized permissions, platform-operator separation, live session validation, HTTP and Socket.IO tenant isolation, and cross-tenant regression coverage.
- Completed milestone: V2-04 Commercial Entitlements Foundation.
- V2-04 established canonical operational module IDs, organization-scoped plans/add-ons/subscriptions/overrides, deterministic effective entitlements and limits, backend entitlement enforcement, platform-operator-only commercial mutations, an idempotent legacy backfill, and backend-sourced frontend commercial state without payment-gateway or invoice mocks.
- Completed milestone: V2-05A PostgreSQL Foundation & Shadow Migration.
- V2-05A added a pinned PostgreSQL development service, centralized connection lifecycle, deterministic reviewed SQL migrations, constrained shared-core relational schema, dry-run-by-default Mongo-to-PostgreSQL shadow tooling, safe reconciliation, disposable PostgreSQL integration coverage, and backup/restore guidance.
- Completed milestone: V2-05B PostgreSQL Cutover Readiness & Compatibility Bridge.
- V2-05B added explicit canonical UUID and legacy Mongo identifier types, reversible entity-scoped mappings, a validated operational Mongo ID bridge, V2-02-compatible PostgreSQL session schema/repositories, inactive PostgreSQL identity/authorization/write adapters, centralized Mongo runtime composition, attendance identity separation, a read-only cutover preflight, parity/security coverage, and the V2-05C cutover/rollback plan.
- Completed milestone: V2-05C PostgreSQL Identity/Auth Runtime Cutover.
- Completed milestone: V2-05D PostgreSQL Commercial Runtime Cutover.
- Completed milestone: V2-06A Operational Domain Architecture Review & Relational Target Design.
- V2-06A documented the real remaining Mongo operational authority, selected redesigned relational boundaries for Customer, Service, Appointments, Queue, Attendance, Inventory, Customer Dues, corporate linkage, and audit history, and defined migration/concurrency/money/quantity invariants without changing runtime behavior or creating SQL migrations.
- Completed milestone: V2-06B1 Customer/Service/Appointment/Queue PostgreSQL Foundation.
- V2-06B1 added forward-only relational schema and composite organization/branch constraints, reviewed branch timezones, Customer/Service provenance, membership-backed providers, timezone-safe and overlap-safe Appointments, row-locked Queue sessions/tokens, append-only histories, exactly-once appointment check-in, dry-run-first Mongo transformation, reconciliation, read-only B2 preflight, and concurrency/migration/security tests without registering new production routes.
- Completed milestone: V2-06B2 Customer/Service/Appointment/Queue Runtime Cutover.
- V2-06B2 activated PostgreSQL Customer, Service, Appointment, Queue session/token/status runtime authority; canonical UUID APIs; branch-timezone business dates; atomic numbering; idempotent Appointment check-in; branch-scoped realtime; PostgreSQL Dashboard Queue counts; frontend Queue and Appointment workflows; and a durable post-cutover migration safety latch.
- Completed milestone: V2-06B3 Deployment & Staging Readiness.
- V2-06B3 added a validated hosted environment contract, managed PostgreSQL/Mongo TLS readiness, explicit reverse-proxy trust, auth throttling, Socket origin/shutdown handling, deterministic frontend/PWA hosting, unprivileged production containers, clean-staging bootstrap, deployment/backup/cost documentation, and hosted-topology security tests without deploying infrastructure or changing domain authority.
- Partial closeout: V2-06B4 confirmed the hosted frontend/backend, HTTPS/DNS, health/readiness, managed PostgreSQL/MongoDB connectivity, migrations 001–005, exact CORS, public Socket transport, secure refresh-cookie/storage behavior, tenant/branch fail-closed authorization, and disposable Customer/Service/Appointment flows. Queue/realtime, Billing, logout/revocation, hosted-log review, and backup/restore proof remain explicitly open.
- Completed milestone: V2-06B5A Public Commercial Catalogue, Pricing & Access Requests.
- V2-06B5A added operator-configured INR list pricing on canonical plans/add-ons, safe public catalogue and server-quote endpoints, PostgreSQL access requests with immutable price snapshots, low-cost IP/phone throttles, append-only pre-tenant audit history, platform-operator pricing/request management, a backend-driven Request Access landing flow, and a production public-registration guard. Requests and approvals do not create organizations, subscriptions, or entitlements; payment/onboarding remains V2-06B5B.
- PostgreSQL is the current runtime authority for identity/users, organizations, branches, memberships and branch assignments, sessions, login, authorization, staff, controlled registration, profile/password identity, commercial module definitions, plans, add-ons, public pricing, commercial access requests, subscriptions, entitlement overrides, effective entitlement calculation and limits, Customer, Service, Appointment, and Queue. Attendance identity resolution is PostgreSQL-backed.
- Multi-query commercial entitlement and catalogue reads use read-only, repeatable-read PostgreSQL transactions so each request observes one consistent commercial snapshot.
- Current MongoDB runtime authority: Attendance records, Inventory, Ledger/Customer Dues legacy, ParentOrganization/corporate operational data where applicable, ActivityLog/security audit, and remaining legacy operational domains. Mongo Queue is legacy migration/recovery input only.
- Queue writes are PostgreSQL-only. There is no Queue dual-write, Mongo read fallback, or automatic repair. Overall readiness still requires both PostgreSQL and MongoDB while accepted legacy domains remain.
- Deployment status: hosted staging is deployed at `https://ekavio.afsify.com` and `https://api.ekavio.afsify.com` and is partially validated for continued development/testing. It is not production-ready or approved for real pilot/customer data; remaining authenticated smoke flows, hosted-log review, and backup/restore proof are open.
- Deployed topology: static/PWA frontend, one Render Node/WebSocket staging backend, managed Neon PostgreSQL, and temporary managed MongoDB Atlas on same-site HTTPS subdomains.
- Public commercial flow: catalogue -> access request -> platform-operator review -> future V2-06B5B manual payment/onboarding -> subscription/entitlement activation. No payment gateway is required or configured.
- Next product work may continue without representing the partial staging validation as pilot acceptance. V2-06B5B and V2-06C must not begin automatically.

## Dependency-audit status (reviewed during V2-06B3, 2026-09-22)

### Backend production dependency tree

`npm audit --omit=dev` reports zero vulnerabilities after narrow, lockfile-only transitive updates to fixed `brace-expansion`, `fast-uri`, `ip-address`, `js-yaml`, and `qs` releases. No direct backend dependency range or major version was changed. Backend unit, integration, deployment, and container signal regressions were rerun successfully against this lockfile before B3 closed.

### Frontend dependency tree

`npm audit` reports 8 affected packages: 1 moderate and 7 high. `npm audit --omit=dev` reports 4 high packages because build tooling is also reachable through packages currently classified as production dependencies. The deployed Nginx image contains only compiled static assets, not frontend `node_modules`.

| Package | Severity | Directness / relevance | Applicability assessment | Later remediation |
| --- | --- | --- | --- | --- |
| `baseline-browser-mapping` | Moderate | Transitive build dependency through Browserslist. | Build-time only; it is not shipped in the Nginx runtime image, and no untrusted Browserslist input is processed in production. | Refresh the frontend build-tool lockfile to a fixed release. |
| `brace-expansion` | High | Transitive through ESLint and Workbox build tooling. | Development/build-time only; no untrusted glob is processed by the deployed static site. | Upgrade the owning lint/PWA build tools or apply a tested transitive override. |
| `browserslist` | High | Transitive build dependency through Autoprefixer/Babel/Workbox. | Build-time only; production requests cannot supply Browserslist queries or stats files. | Refresh Autoprefixer/Babel/Workbox dependencies to fixed versions. |
| `fast-uri` | High | Transitive through Workbox build tooling -> AJV. | Build-time only; it is absent from the Nginx runtime image and receives no production URI input. | Upgrade Workbox/AJV or apply a tested transitive override. |
| `nanoid` | High | Transitive through PostCSS; reported by the production-only audit because the Tailwind/Vite build chain is classified as a production dependency. | Build-time only in this multi-stage image; the vulnerable custom/non-secure generator APIs are not used by application code or shipped as a server dependency. | Refresh PostCSS/Nanoid and consider reclassifying build-only packages as development dependencies in a later maintenance change. |
| `postcss` | High | Direct development dependency and transitive build dependency through Vite. | Build-time only; CSS sources are repository-controlled, and `node_modules` is not copied into the Nginx runtime. The reported source-map file disclosure path is not exposed by the deployed app. | Upgrade PostCSS to a fixed version and rebuild/verify assets. |
| `react-router` | High | Transitive browser-runtime dependency through direct `react-router-dom`. | The advisory concerns React Server Components action handling. This app uses `BrowserRouter`, `Routes`, and client-side API calls, with no RSC/router action configuration found, so the affected mode is not active. | Upgrade `react-router-dom`/`react-router` to a fixed compatible release (at least the advisory-fixed line) and rerun routing/auth regressions. |
| `react-router-dom` | High | Direct browser-runtime dependency; inherits the `react-router` advisory. | Same RSC-specific assessment as `react-router`; the package is shipped in the browser bundle, but the vulnerable server-action mode is not used. | Upgrade together with `react-router` and verify SPA navigation and authentication flows. |

### Container base-image pinning

- MongoDB uses the explicit patch-level tag `mongo:8.0.30-noble`.
- Backend build and runtime stages and the frontend build stage use `node:20-alpine`, which floats across Node 20 and Alpine patch releases.
- The frontend runtime stage uses `nginx:alpine`, which floats across Nginx and Alpine releases.
- No Node/Nginx pin was changed during V2-03 closeout; selecting and validating exact patch/digest pins is deferred to dependency/container maintenance to avoid an unverified runtime change.
