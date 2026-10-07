# EkaVio Project Context

## Latest optional module: V2-09A CRM & Follow-ups (2026-10-07)

Migration 018 adds native PostgreSQL organization pipeline stages, selected-branch
Leads/follow-ups and append-only CRM activity, with composite relationships and
retained history. Commercial `crm` / **CRM & Follow-ups** is initially unpublished:
no public price, Pilot Core inclusion or automatic subscription/entitlement grant.
Owner/admin/manager have crm.read/manage; staff/HR do not automatically, and custom
roles still replace built-ins. Entitlement, permission and active assigned branch
authority are independently enforced, with live organization locking on writes.

Manual call/meeting/task/note/other follow-ups store UTC using branch-local inputs;
today/overdue use branch business dates. Terminal history cannot be reopened.
Explicit new/existing Customer conversion is canonical, required-field-aware and
atomic, with exactly-one concurrent winner and no automatic contact merge or Sale.
Shared 13-type Lead fields/layouts, typed filters, four factual dashboard widgets,
two branch-safe reports/bounded formula-safe CSV, generic deduplicated assignment
notifications and bounded Customer-origin links extend existing engines.

Local clean installs/quality/build, 186 backend unit tests, 72 components, all 30
database files (244 tests), dedicated CRM (16), backup contracts (15) and source
contracts (4) pass. Chromium: foundation 19, identity 11, administration 18, fields
14, analytics 13, commercial 24 and CRM 15 pass; responsive CRM covers 360/390/768/
1440 Light/Dark/System without page errors or document overflow. Final affected
analytics and owner workflow were also rerun after preference/modal fixes.
Normal Docker PostgreSQL/backend/frontend are healthy; local health/root/login/CRM
are HTTP 200. Test-only legacy fixtures retain their historical catalogue; production
verification and Mongo-retirement contracts are unchanged. No new paid dependency.

Hosted 001–017 checksums matched before only accepted pending 018 was applied;
001–018 now match. Hosted public health is recorded in the linked acceptance review,
not inferred authenticated CRM or exact deployed-build evidence. See
[ADR 0026](docs/adr/0026-crm-followups.md) and
[V2-09A acceptance](docs/reviews/V2-09A_CRM_FOLLOWUPS.md) for evidence and release scope.
Extended recovery 013–018 and hosted authenticated/exact-deployment acceptance remain
OPEN. **NO-GO FOR REAL CUSTOMER DATA**, Free Render staging-only choice and retained
untouched Atlas remain unchanged. V2-09B, V2-09C and V2-10 are deferred/not started.

## Previous product experience: V2-08F (2026-10-07)

An original folded-E SVG/wordmark now unifies public, workspace and account branding.
Responsive Light/Dark/System public navigation and a complete factual landing site
lead to a three-step Request Access wizard, not checkout. Shared cards use canonical
module capabilities. Plan selection removes/labels included add-ons; independent
add-ons preserve the plan. Server quotes/fingerprints and transactional revalidation
remain authoritative. Migration 017 adds explicit fixed/contact pricing (NULL whole
estimate for contact), random unique immutable public references and retained request
intent. Existing fixed prices and migrations 001–016 are preserved.

Operator intake has bounded literal reference/contact search, status/pagination,
shared public preview and explicit negotiated agreement amounts. Exact manual
settlement, one-time invitation, recipient-chosen password and atomic provisioning
remain unchanged. Billing/renewals use human frozen package names and factual progress.
No gateway, recurring charge, fake invoice, new entitlement or paid dependency.

Public metadata/social art, original PWA icons, local manifest MIME and a two-public-
route sitemap/index allowlist exclude sensitive action URLs. Privacy/security wording
is explicitly staging-only, without legal/certification/uptime claims or trackers.
See [ADR 0025](docs/adr/0025-public-brand-commercial-experience.md) and
[V2-08F acceptance](docs/reviews/V2-08F_PUBLIC_COMMERCIAL_UX.md) for exact final gates
and hosted migration/deployment evidence. Hosted 001–017 are applied with matching
checksums; only pending accepted 017 was applied. Public hosted health/pages are 200,
but exact V2-08F deployment and hosted manifest MIME remain OPEN. Apply 017 explicitly
before other deployments.
Extended 013–017 recovery proof and hosted authenticated/exact deployment acceptance
remain OPEN. **NO-GO FOR REAL CUSTOMER DATA**, intentionally Free Render staging and
retained Atlas are unchanged. V2-09 does not start automatically.

## Previous product foundation: V2-08E (2026-10-07)

Additive migration 016 supplies per-organization/user dashboard preferences,
notification preferences and own-recipient attention rows, plus append-only safe
export audit. Dashboard is CORE without reports.read, but executes/returns only
domain-authorized and commercially entitled widgets. Ten curated reports and fresh
server CSV require reports.read AND domain read AND any paid entitlement. Operational
reports are selected-branch only; Customer/Staff directories are organization-owned.
Branch business dates/timezone, exact Dues/stock projections and batched active
reportable custom fields are reused; Dues are not revenue and stock is not sales.

Exports are formula-safe UTF-8, hard maximum 2,000 rows/5 MiB with a conservative
adaptive lower row budget for wide data, not silently truncated. Generic Membership/
custom-role update messages resolve active assigned recipients on the server in the
canonical transaction. Own center/bell/read/preferences use bounded foreground
polling, no new Socket.IO room or messaging provider. Explicit bounded pruning removes
only read attention older than 90 days. Saved presets/general notification email,
low-stock events, multi-branch paid summaries and broader custom filters are deferred.

See [ADR 0024](docs/adr/0024-dashboards-reports-notifications.md) and
[V2-08E acceptance](docs/reviews/V2-08E_DASHBOARDS_REPORTS_NOTIFICATIONS.md).
Hosted migrations 001–016 are applied with matching checksums; public live/ready and
frontend/login probes passed. This is not authenticated hosted acceptance. Other
environments must apply 016 explicitly before deployment; extend recovery proof separately.
**NO-GO FOR REAL CUSTOMER DATA**, intentionally Free Render staging and retained Atlas
are unchanged. V2-08F now extends this accepted foundation.

## Previous product foundation: V2-08D (2026-10-07)

Dynamic Fields / Data & Forms adds additive migration 015 for Customer, Service,
Appointment, Inventory item and organization-local Membership. Definitions/options,
typed relational values and versioned sections/layouts are separate. Thirteen bounded
types, immutable keys/types, archive history, required-on-new/normal-edit rules and
new-only validated defaults use atomic canonical/custom writes. Creation retries
cannot overwrite metadata or backfill defaults. `fields.read/manage` separate config
authority from entity data authority; existing tenant/branch/RBAC/entitlement checks
remain. Actual canonical forms use one shared renderer and server layout. Customer
search/filter is bounded/parameterized; reportable metadata, unique-value design,
other-domain filters and custom CSV/reporting integration were deferred to V2-08E.

See [ADR 0023](docs/adr/0023-dynamic-fields-and-form-layouts.md) and
[V2-08D acceptance](docs/reviews/V2-08D_DYNAMIC_FIELDS_FORM_LAYOUTS.md).
**NO-GO FOR REAL CUSTOMER DATA**, intentionally Free Render staging and retained
Atlas remain unchanged. V2-08E now extends this accepted foundation. Apply 015 explicitly
before backend deployment; include its schema in future recovery proof.

## Previous foundation: V2-08C (2026-10-06)

Organization administration, branch lifecycle, normalized custom tenant RBAC,
membership lifecycle, authenticated existing-account staff linking, safe tenant
audit and operator-only organization oversight extend the accepted V2-08B baseline.
Migration 014 is additive; 001–013 and historical built-in memberships are not
rewritten. Operating profile fields are distinct from canonical commercial billing
agreement fields. Server permission catalogue is authoritative. Owners retain their
built-in authority; custom permissions replace, never union, built-in grants and
archived references deny all. Grants are subset-checked under organization locks;
version checks reject stale writes. Owner/self authority cannot be destructively
changed, although safe branch assignments remain possible. Assigned roles cannot
be archived and active staff cannot be stranded by branch deactivation.

Customers/Services are explicitly CORE with dedicated `customers.read/manage` and
`services.read/manage`, superseding the historical Queue gates described below.
Queue/Appointments and other commercial domains retain independent entitlement
checks. Staff suspension/revocation is organization-local and preserves global
identity and other organization sessions. Existing-account invitation acceptance
requires the exact authenticated target and explicit single-use acceptance; no
identity/password/email overwrite. Administration events are atomic and append-only;
tenant audit projections exclude raw details/credentials. Platform Operations has
no impersonation or secret-management facility. HTTP and realtime permission checks
remain server-side; frontend context refresh is navigation convenience only.

See [ADR 0022](docs/adr/0022-organization-administration-and-custom-rbac.md) and the
[V2-08C review](docs/reviews/V2-08C_ORGANIZATION_RBAC.md) for acceptance/release evidence.
**NO-GO FOR REAL CUSTOMER DATA**, intentionally Free Render staging and retained
Atlas are unchanged. V2-08D now extends this accepted foundation as documented above.

## Established architecture and historical decisions

- Product: EkaVio.
- EkaVio is a low-cost, modular, multi-tenant SaaS platform for small and medium businesses.
- Initial market: Kerala.
- The source code is the truth for the current implementation.
- The EkaVio Master Strategy v3.0 is the target direction.
- Preserve existing working functionality; this is not a greenfield rewrite.
- The chosen architecture is a modular monolith.
- The client direction is a mobile-first React progressive web app (PWA).
- The backend direction is Node.js with TypeScript.
- PostgreSQL is the sole normal-runtime transactional system of record; MongoDB is retained only for explicit legacy migration, reconciliation, archive, recovery, and compatibility testing.
- WhatsApp API, SMS, payment-gateway automation, and paid AI are optional adapters, not core dependencies.
- Backend authorization is mandatory. Frontend menu hiding is never authorization.
- Tenant isolation, permissions, entitlements, money correctness, stock correctness, backups, and tests take priority over feature count.
- Solo-development workflow uses main directly. Before high-risk milestones, create a checkpoint tag. Keep one milestone per coherent commit where practical, start only from a clean working tree, and push only after lint, typecheck, tests, build, Docker validation, and diff review pass.
- Every implementation milestone ends with lint, typecheck, tests, build, diff review, and the exact results.
- V2-08B identity/recovery uses additive migration 013: globally unambiguous verified email alongside legacy-compatible phone login; hash-only purpose-scoped single-use verification/reset/staff challenges; recipient-chosen staff passwords; closed identity audit; and PostgreSQL per-user Light/Dark/System/accent preferences. SMTP is optional/provider-neutral and tests inject capture, never real email. New passwords use one 12-character/72-UTF-8-byte policy; reset revokes all sessions/sockets with issuance/race guards. Pending changes preserve the old verified email until promotion. Existing-identity linking fails explicitly and remains V2-08C.
- V2-08B retains memory-only access JWTs, rotating HttpOnly/Secure-production/Lax /api/auth refresh cookies, membership/branch/permission/entitlement authority and production registration closure. Local PostgreSQL-backed Playwright acceptance needs no operator-created fixture or manual mail loop. Hosted migration 013 must precede deployment; hosted SMTP smoke is later acceptance, not inferred from local QA. See ADR 0021, the V2-08B review and IDENTITY_EMAIL_RECOVERY runbook. V2-07 NO-GO, Render Free staging-only and Atlas retention remain unchanged.
- V2-08A Product Experience Foundation: Light-default semantic theme tokens with live System mode and local-only preferences; grouped entitlement-and-permission navigation; phone bottom navigation; first-class canonical Customers/Services; Profile/Appearance/Organization/Security Settings; INR rupee presentation with exact paise API conversion; reusable international PhoneInput; actionable empty states and human labels. PostgreSQL, memory-only access credentials, server authorization, commercial authority, backup tooling and canonical module keys are unchanged.
- V2-08A navigation preserves the existing Queue entitlement and queue.read/queue.manage boundaries on Customer/Service APIs. Core experience is not a new sellable module; changing those backend gates requires a later explicit policy review. Reports, Help and assigned-branch administration are honest foundation shells, not invented data or full CRUD.
- V2-08A adds deterministic local Playwright contract-fixture acceptance and Vitest/Testing Library checks to CI, alongside actual PostgreSQL API integration. Browser fixture tests do not establish hosted authenticated tenancy, provider recovery or pilot suitability. The managed browser bridge was unavailable; local Chromium testing requires no operator-created records or manual browser loop.
- Product-completion roadmap: V2-08B identity/recovery, V2-08C organization/RBAC, V2-08D dynamic forms, V2-08E reports/notifications, V2-08F public/commercial UX, optionally approved V2-09 extensions and V2-10 automated final acceptance. V2-07 hosted acceptance is intentionally deferred; NO-GO FOR REAL CUSTOMER DATA remains. Render Free is staging-only by choice; Atlas remains retained. No subsequent milestone starts automatically.
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
- V2-06B5A added operator-configured INR list pricing on canonical plans/add-ons, safe public catalogue and server-quote endpoints, PostgreSQL access requests with immutable price snapshots, low-cost IP/phone throttles, append-only pre-tenant audit history, platform-operator pricing/request management, a backend-driven Request Access landing flow, and a production public-registration guard. Requests and approvals alone do not create organizations, subscriptions, or entitlements.
- Completed milestone: V2-06B5B Manual Commercial Activation & Customer Onboarding.
- V2-06B5B added separate operator-finalized negotiated agreements, append-oriented manual INR payment records, exact settlement gates, hash-only one-time onboarding invitations, customer-chosen passwords, fail-closed existing-phone handling, atomic PostgreSQL tenant provisioning, canonical manual-source subscriptions/add-ons, append-only activation events, and tenant-scoped factual Billing data. It deliberately added no payment gateway, messaging provider, statutory invoice, automated verification, recurring charge, or renewal.
- Hosted V2-06B5B smoke verified on 2026-09-28: migrations 001 through 007 were applied; one disposable public-request-to-customer-Billing flow passed; invitation reuse failed safely; tenant scoping and sanitized hosted logs passed. This is internal staging evidence only, not pilot or production approval.
- Completed milestone: V2-06B5C Manual Renewals & Subscription Lifecycle.
- V2-06B5C added a separate durable renewal aggregate, current-package/public-price snapshots, negotiated INR paise, append-oriented renewal payments, exact settlement, continuous extension, explicit post-expiry reactivation, transaction/locking/concurrency protection, an operator renewal queue, tenant-scoped Billing history, and entitlement expiry/reactivation regressions. It deliberately added no gateway, recurring charge, automatic renewal, scheduler, SMS, WhatsApp dependency, or future package scheduler.
- Hosted PostgreSQL migration 008 was explicitly applied on 2026-09-28 through the existing secure direct/session-capable connection; all migrations 001 through 008 then reported applied and hosted liveness/readiness remained HTTP 200. This is migration/health evidence, not a hosted B5C workflow smoke or production approval.
- Completed milestone: V2-06C Attendance PostgreSQL Runtime Cutover.
- V2-06C added canonical membership-backed branch Attendance, branch-local IANA business dates, retry-safe marks, optimistic reasoned corrections, immutable before/after history, a complete daily roster, PostgreSQL Dashboard present-today counts, a dry-run-first reviewed legacy transform, reconciliation/preflight/activation tooling, and a durable Attendance authority latch. Ordinary runtime has no Mongo Attendance read, write, fallback, or dual-write. Payroll, shifts, advanced Attendance reporting, and Attendance realtime were not added.
- Hosted PostgreSQL migration 009 was explicitly applied on 2026-09-29. Hosted Attendance reconciliation/activation remains pending because the current machine was not permitted by the Atlas network-access list; no hosted branch mapping was guessed and the hosted Attendance authority latch was not activated.
- Completed milestone: V2-06D Customer Dues PostgreSQL Runtime Cutover.
- V2-06D replaced the floating, free-text Mongo Ledger runtime and mock UI with canonical Customer-linked, branch-originated, append-only PostgreSQL Customer Due entries; exact INR paise; derived branch and organization balances; fail-closed ordinary payments; explicit adjustments and full reversals; transactional idempotency/concurrency controls; reviewed dry-run migration, reconciliation, preflight, and a durable authority latch. It deliberately added no general accounting, invoice/tax, Sales/POS, or payment-gateway behavior.
- Hosted PostgreSQL migration 010 was explicitly applied on 2026-09-29 and hosted liveness/readiness remained HTTP 200. Hosted Customer Dues source reconciliation/activation remains pending because this machine's SRV lookup to Atlas was refused; no hosted mapping was guessed and the hosted Customer Dues authority latch was not activated.
- Completed milestone: V2-06E Inventory PostgreSQL Runtime Cutover.
- V2-06E replaced organization-wide mutable Mongo stock with an organization item catalogue, branch default stock locations, exact `NUMERIC(18,3)` quantities, exact INR paise reference prices, immutable opening/receive/consume/adjustment/reversal movements, transactionally locked non-negative balances, branch-scoped low-stock reporting, reviewed dry-run migration/reconciliation/preflight, and a durable Inventory authority latch. It deliberately added no Sales/POS, purchases, suppliers, transfers, lots/expiry, scanning, valuation/accounting, FIFO/LIFO, COGS, tax, or procurement.
- The preserved-volume local Inventory source had zero Mongo documents; migration 011, clean zero-row reconciliation, preflight, and explicit local authority activation passed. Hosted PostgreSQL migration 011 was applied on 2026-09-30, but hosted Inventory source reconciliation/activation remains open because Atlas SRV lookup was refused; no mapping was guessed and the hosted Inventory authority latch was not activated. Hosted Attendance and Customer Dues reconciliation/activation also remain open.
- Completed milestone: V2-06F Corporate, Audit & Mongo Runtime Retirement.
- V2-06F moved ParentOrganization/corporate creation, authorized listing, child linking, and commercial summary to canonical PostgreSQL UUIDs; moved security audit writes to bounded scalar-safe append-only PostgreSQL events; added selective ActivityLog migration with hash-only dispositions for unsafe rows; removed dormant Message/Notification/NotificationBell/Chat sources without replacements; and removed MongoDB from normal server startup, environment validation, readiness, and Compose topology.
- The preserved local corporate source contained zero parents/links. The local ActivityLog source contained 11 rows: 6 safe events and 5 unsafe-details dispositions, with exact reconciliation and both local PostgreSQL authority latches activated. Hosted PostgreSQL migration 012 is applied, but the isolated Atlas dry-run was refused by the network access list before source facts loaded; hosted corporate/audit reconciliation and activation therefore remain open for an Atlas-authorized environment. Atlas was not deleted.
- Completed milestone: V2-07A Pilot Readiness Recovery, Security & Production Hardening.
- V2-07A added a fail-closed PostgreSQL custom-format backup command, count-only restored-state verification, and a disposable local restore procedure. A 273,046-byte local archive restored with migrations 001 through 012, all required identity/commercial/operational/audit structures countable, and zero core orphans in 12.379 seconds; the disposable database and unencrypted temp archive were removed afterward. This is local proof only, not a hosted Neon restore or RTO claim.
- V2-07A remediated current backend/frontend dependency advisories without forced majors; pinned tested Node, Nginx, PostgreSQL, and offline Mongo image manifests; tightened production secret/bootstrap validation; and retained the unprivileged compiled/static container boundaries. Provider recovery settings, scheduled encrypted backups, hosted restore rehearsal, and the V2-07B pilot decision remain open.
- Completed V2-07B final pilot acceptance review on 2026-10-01. The strict decision is **NO-GO FOR REAL CUSTOMER DATA**. Hosted migrations 001 through 012, public health/routes, production CORS and registration boundary, local security audits, quality/integration gates, and the three-service PostgreSQL normal runtime passed. Atlas network policy blocked source-fact loading, so hosted Attendance, Customer Dues, Inventory, corporate, and security-audit reconciliations/authority latches remain pending. Current provider recovery settings, scheduled monitored encrypted off-provider backups, a hosted isolated restore, always-on pilot compute, hosted authenticated E2E/negative tenancy, complete hosted logs, security headers, and named operating owners remain unproven or open. See `docs/reviews/V2-07B_FINAL_PILOT_ACCEPTANCE.md` and the pilot/incident runbooks. No real customer data is approved.
- V2-07C adds a default-branch daily encrypted PostgreSQL backup workflow, offline-key envelope/decrypt tooling, local disposable encrypted restore proof, a read-only two-tenant hosted acceptance checker, and a hosted security-header probe. On 2026-10-03 hosted manual run `37124573922` on `22a6d28eed221e1165b7e2f09a90f70444385558` passed validation, encryption and artifact upload with observed 35-day initial retention. Retrieval, offline decrypt/key custody, isolated PostgreSQL 18-or-newer restore/integrity/cleanup, recurring schedule and alerts remain OPEN pending specific evidence. This does not prove authenticated Neon recovery controls, configured Render headers/alerts or hosted acceptance. Atlas rejected the prior source connection before facts loaded; all five hosted authority latches remain pending. The V2-07C blocker record and `docs/runbooks/V2-07C_OPERATOR_ACTIONS.md` preserve **NO-GO FOR REAL CUSTOMER DATA**; a separate V2-07D review is not yet justified.
- PostgreSQL is the sole normal runtime authority for identity/users, organizations, parent organizations and corporate links, branches, memberships and branch assignments, sessions, login, authorization, staff, controlled onboarding, profile/password identity, commercial module definitions, plans, add-ons, public pricing, access requests, negotiated agreements, initial and renewal manual payment records, onboarding invitations, billing profiles, subscriptions, commercial renewals, entitlement overrides, effective entitlement calculation and limits, Customer, Service, Appointment, Queue, Attendance, Customer Dues, Inventory, and security audit events.
- V2-07C focused recovery on 2026-10-03 proved outside-Git encrypted-file retrieval, checksum validation, authenticated offline decrypt and restoration of the real hosted archive into isolated local Docker PostgreSQL 18.6. Migrations 001–012 and 28 count-only tables passed; four orphan checks were zero; restore took 2.055 seconds (5.386 seconds including verification). Exact disposable target and this-run plaintext cleanup passed. Original ZIP inspection and an earlier operator plaintext copy's cleanup remain OPEN. This is not Neon provider/PITR or restored application proof; schedule, alerts and all other pilot blockers remain OPEN. NO-GO persists; V2-07D is not justified.
- Multi-query commercial entitlement and catalogue reads use read-only, repeatable-read PostgreSQL transactions so each request observes one consistent commercial snapshot.
- V2-07C Render-only recheck on 2026-10-03: frontend `/` and `/login` and backend live/ready returned 200 without redirects; public Engine.IO polling and WSS open handshakes passed. Both frontend routes still fail required headers (only nosniff present; HSTS/CSP/frame/referrer/permissions missing). Same-origin PWA/assets fetched successfully and requested CSP matches inspected source/public script origins, but enforced-browser/PWA/authenticated Socket behavior remains unverified. No Render plan, deployed-SHA, region/count or idle/post-upgrade account evidence was available; always-on is EXTERNAL ACTION REQUIRED. Exact operator actions preserve one instance, current region/environment and PostgreSQL-only runtime. No billing/provider/product/recovery changes; NO-GO and remaining blockers persist, with no V2-07D.
- Current MongoDB normal runtime authority: none. Retained Mongo models and collections are explicit legacy migration, reconciliation, archive, recovery, and compatibility-test input only.
- V2-07C monitoring continuation on 2026-10-04 adds an independent hourly GitHub metadata watchdog (30-hour scheduled-backup threshold, immediate latest-schedule failure/missing-artifact detection, read-only Actions permissions, no database/key/archive access), tests and incident/operator linkage. Actual latest manual success remains `37124573922`; latest schedule `37108471538` failed and consecutive scheduled successes are zero. Its deliberate live rejection is detector evidence, not backup PASS. Primary/backup assignments, notifications/delivery, external frontend/live/ready monitors and authenticated Render/Neon awareness remain external actions. Shared GitHub scheduler/outage risk requires independent daily review. Render Free remains by choice, always-on OPEN; NO-GO and no V2-07D.
- V2-07C Render frontend header closeout on 2026-10-03 supersedes earlier missing-header facts: after operator saved six actual Static Site `/*` rules, checker and independent HEAD/GET passed `/` and `/login` with exact HSTS/CSP/nosniff/frame/referrer/permissions values. Public manifest JSON, worker/scripts/styles, exact API/WSS CSP origins, API/CORS and polling/WSS checks passed; backend live/ready 200. Browser connection was unavailable before navigation, so console/PWA activation/authenticated compatibility remain unverified. Eight targeted deployment/hardening contracts passed. No code/config/compute/Atlas change; always-on is OPEN BY OPERATOR CHOICE / STAGING FREE PLAN, overall NO-GO and remaining pilot blockers unchanged, no V2-07D.
- V2-07C hosted Atlas closeout on 2026-10-03 supersedes the earlier pending source/latch facts: operator-confirmed narrow runner access enabled real read-only Atlas queries; Attendance, Ledger, Inventory, corporate parents/child links and ActivityLog each had zero source rows. All five zero-source reconciliations/previews passed without guessed mappings or shadow data applies, then pending PostgreSQL latches activated once (corporate/audit atomically through combined authority). Final preflights/status passed; audit safe/unsafe/disposition counts were all zero. Atlas is retained and was not written to or deleted. Temporary runner `/32` removal is awaiting operator confirmation. Normal runtime stays PostgreSQL-only; local health and four source contracts passed. Render remains Free by operator choice; always-on and all other pilot blockers remain OPEN, with NO-GO and no V2-07D.
- Normal application writes and reads are PostgreSQL-only. There is no Mongo dual-write, runtime read fallback, automatic repair, or tenant-selected authority. Normal readiness requires PostgreSQL only; `MONGO_URI` belongs only to explicit legacy tools.
- Deployment status: hosted staging is deployed at `https://ekavio.afsify.com` and `https://api.ekavio.afsify.com` and is partially validated for continued development/testing. The controlled V2-06B5B activation/onboarding/Billing flow and its scoped log review are verified, and V2-07A proves local PostgreSQL logical restore only. V2-07B explicitly found NO-GO for real customer data: remaining authenticated flows/negative tenant checks, authenticated Neon recovery evidence, scheduled monitored encrypted backups, hosted disposable restore, Atlas source reconciliation, pilot-suitable always-on hosting, alerts, and named operators remain open.
- Deployed target topology after V2-06F rollout: static/PWA frontend, one Render Node/WebSocket staging backend, and managed Neon PostgreSQL. Temporary MongoDB Atlas is retained outside normal runtime for explicit legacy reconciliation/archive/recovery and has not been deleted.
- Public commercial flow: catalogue -> access request -> platform-operator review -> approved -> negotiated agreement -> manual payment -> secure one-time onboarding -> atomic organization/subscription activation -> customer login. No payment gateway or automated messaging provider is required or configured.
- Subscription continuation flow: active subscription -> renewal due/expired -> operator-reviewed current-package renewal -> negotiated amount -> manual exact settlement -> atomic apply -> extended/reactivated subscription. Package changes remain a separate explicit commercial administration action.
- Hosted B5B validation used the direct/session-capable Neon migration connection and confirmed migrations 001 through 007 applied before the controlled smoke; an application deployment alone was not treated as migration evidence.
- V2-07B has issued **NO-GO FOR REAL CUSTOMER DATA**; completing a milestone/tag is not pilot approval. The ordered MUST-FIX evidence and a later explicit GO review are required before onboarding real customers. Atlas remains retained and was not deleted. Do not start Merchant Sales Lite or Sales/POS automatically.

## Dependency and container status (reviewed during V2-07A, 2026-10-01)

### Dependency audits

- Backend `npm audit --omit=dev`: zero vulnerabilities after Socket.IO 4.8.4 selected fixed Engine.IO 6.6.11.
- Frontend `npm audit`: zero vulnerabilities.
- Frontend `npm audit --omit=dev`: zero vulnerabilities.
- Frontend compatible updates include Axios 1.20.0, React Router/DOM 7.18.4, Socket.IO client 4.8.4, PostCSS 8.5.28, Autoprefixer 10.6.1, and fixed transitive Browserslist, baseline-browser-mapping, brace-expansion, fast-uri, and nanoid releases.
- No `npm audit fix --force`, unnecessary major upgrade, or application architecture change was used. Backend 143/143 source/unit tests, all accepted database/domain suites, frontend lint/typecheck/PWA build, normal Compose health, and the four required HTTP routes passed afterward.

### Container image pinning and runtime contents

- Backend/frontend Node stages: `node:20.20.2-alpine3.23` plus tested multi-platform manifest digest.
- Frontend static runtime: `nginx:1.31.6-alpine3.24` plus tested multi-platform manifest digest.
- Compose/CI PostgreSQL server: `postgres:17.11-alpine3.23` plus the tested manifest digest. External backup/archive tooling independently uses `postgres:18.6-alpine3.23@sha256:885cf05d376c7cf27afef02073e6bdac3841252537f16e244fd1c1e6a7c99fb1` after the 2026-10-03 correction for hosted Neon 18.6; local Compose dumps still use pg_dump 17.11. Hosted pg_dump 18 restore proof requires an isolated PostgreSQL 18-or-newer target and remains open.
- Retained offline migration/CI Mongo: `mongo:8.0.30-noble` plus manifest digest; it is not a normal runtime dependency.
- CI setup-node is pinned to Node 20.20.2.
- Backend production runs as UID 1000 from compiled `dist`, omits dev dependencies/source/environment files, starts `node dist/server.js`, and health-checks readiness. Frontend runs as UID 101 with static output only and no `node_modules` or environment file. Normal Compose publishes only backend 5000 and frontend 80-to-8080; PostgreSQL is internal and Mongo is stopped/offline-profile only.
