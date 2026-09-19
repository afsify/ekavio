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
- PostgreSQL is the current runtime authority for identity/users, organizations, branches, memberships and branch assignments, sessions, login, authorization, staff, registration, profile/password identity, commercial module definitions, plans, add-ons, subscriptions, entitlement overrides, effective entitlement calculation, and effective limits. Attendance identity resolution is PostgreSQL-backed.
- Multi-query commercial entitlement and catalogue reads use read-only, repeatable-read PostgreSQL transactions so each request observes one consistent commercial snapshot.
- Current operational runtime: MongoDB remains Queue authority and also stores Inventory, Ledger, Attendance records, ParentOrganization/corporate operational data where applicable, ActivityLog/security audit data, analytics, and the remaining operational domains. Runtime identity and commercial mutations do not dual-write, PostgreSQL authority failures do not fall back to MongoDB, and B1 adds no Queue dual-write or fallback.
- Next milestone: V2-06B2 Customer/Service/Appointment/Queue Runtime Cutover.
- Do not treat V2-06B1 shadow tables as runtime authority. Existing Queue routes, Dashboard usage, frontend behavior, and realtime behavior remain Mongo-backed until the complete B2 cutover passes its accepted gate.

## Known dependency-audit risk (V2-03 closeout, 2026-09-14)

No critical advisory was reported. Automated fixes and broad upgrades were intentionally deferred so this runtime closeout does not become a dependency-upgrade milestone.

### Backend production dependency tree

`npm audit --omit=dev` reports 5 affected packages: 1 moderate and 4 high. All are transitive production dependencies and currently have fixes available.

| Package | Severity | Dependency path / relevance | Applicability assessment | Later remediation |
| --- | --- | --- | --- | --- |
| `brace-expansion` | High | Transitive through `swagger-jsdoc` -> `glob` -> `minimatch`; present in the backend runtime and used to discover local API-documentation source files at startup. | No remotely supplied glob is used; the patterns are fixed local paths, so the reported expansion denial-of-service path does not appear externally reachable. | Refresh or override the transitive package to a fixed release after compatibility testing. |
| `fast-uri` | High | Transitive through `swagger-jsdoc` -> Swagger parser -> AJV; present in the backend runtime for schema processing. | Swagger input and references are locally authored at startup; no untrusted remote schema/URI input was found, so the reported host-confusion/SSRF paths do not appear reachable. | Upgrade the Swagger/AJV chain or override `fast-uri` to a fixed compatible release. |
| `ip-address` | High | Transitive through the directly used `express-rate-limit`; runtime request-IP handling. | Rate limiting uses the socket-derived Express IP, and the app does not enable proxy trust or accept a caller-supplied IP value. The reported parser/trust-boundary bypass does not appear directly triggerable in the current deployment, but this is internet-facing code. | Upgrade `express-rate-limit` or its transitive `ip-address` dependency promptly and retest proxy/IP behavior. |
| `js-yaml` | High | Transitive through `swagger-jsdoc` -> Swagger parser; present in the backend runtime for documentation parsing. | Only repository-controlled documentation is parsed at startup; no endpoint accepts YAML, so the reported malicious-YAML CPU paths do not appear remotely reachable. | Upgrade the Swagger parser chain or override `js-yaml` to a fixed compatible release. |
| `qs` | Moderate | Transitive through Express/body-parser; present in the HTTP runtime. | The app enables JSON bodies only and uses scalar query parameters. No attacker-controlled `qs` options or extended URL-encoded body parser was found; exposure appears limited but should not be ignored. | Upgrade Express/body-parser or override `qs` to a fixed compatible release and rerun request regression tests. |

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
