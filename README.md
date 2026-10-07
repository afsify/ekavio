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
- **Application data:** PostgreSQL is the sole normal runtime authority; MongoDB is retained only for explicit legacy migration, reconciliation, archive, recovery, and compatibility tests
- **Infrastructure:** Docker Compose
- **Realtime:** Socket.IO

## Engineering Highlights

- Secure access tokens with revocable server-side sessions
- Organization and branch-aware multi-tenancy
- Membership-based RBAC and permission enforcement
- PostgreSQL-backed identity, authorization, and commercial entitlements
- Server-authoritative public catalogue pricing and commercial access requests
- Manual exact-settlement subscription renewal and post-expiry reactivation
- PostgreSQL authority for corporate relationships and bounded append-only security audit, in addition to all accepted identity, commercial, and operational domains
- PostgreSQL-only normal server startup/readiness, with MongoDB isolated behind an explicit offline legacy-tools profile
- Transactional migrations and cutover tooling
- Docker health/readiness checks
- Automated lint, typecheck, build, migration, parity and integration gates

## Project Status

🚧 Active development

V2-08F completes the public website and manual commercial experience: one original
EkaVio mark/wordmark, Light/Dark/System navigation, factual module/CORE messaging,
FAQ/privacy, and a three-step Request Access wizard. Explicit fixed/contact pricing
never invents a zero/partial contact total. Server quotes and final transaction
revalidation remain authority. Plan/add-on overlap is labeled and rejected safely.
Unique immutable random public references replace raw UUIDs as receipt/intake labels.
Operator pricing shares the public card preview; bounded intake search and factual
agreement/payment/onboarding/renewal progress use human package names.

Additive **017** must precede deployment; 001–016 and old fixed pricing remain intact.
Run backend `npm run test:public-experience` and frontend
`npm run test:e2e:commercial` against disposable PostgreSQL. Public HTTPS canonical
origin is optionally `VITE_PUBLIC_APP_URL` (default `https://ekavio.afsify.com`);
only home/privacy are indexed. Original social/PWA assets are self-hosted; local
Nginx serves `application/manifest+json`. See [ADR 0025](docs/adr/0025-public-brand-commercial-experience.md)
and [V2-08F acceptance](docs/reviews/V2-08F_PUBLIC_COMMERCIAL_UX.md) for test, bundle,
hosted migration and exact-deployment boundaries.
**NO-GO FOR REAL CUSTOMER DATA** is unchanged. Render Free stays staging-only,
Atlas retained, extended schema recovery OPEN. No automatic V2-09, gateway or trackers.

V2-08E adds permission-aware Workspace dashboards, durable hide/order/reset,
independently authorized Organization/Platform overviews, ten curated Reports,
server-generated formula-safe CSV and a personal PostgreSQL notification center.
Dashboard is CORE; Reports/exports require `reports.read` plus domain read and any
existing paid entitlement. Branch business dates, exact Dues balances/journal effects,
canonical stock and active reportable custom-field columns are used, not invented
revenue/sales. Exports have hard 2,000-row/5-MiB limits with a conservative lower budget
for wide records. Membership/custom-role attention is generic, own-recipient and
transactional; foreground polling needs no Socket.IO or messaging provider.

Apply additive **016** explicitly before backend deployment. See
[ADR 0024](docs/adr/0024-dashboards-reports-notifications.md) and
[V2-08E acceptance](docs/reviews/V2-08E_DASHBOARDS_REPORTS_NOTIFICATIONS.md).
Run backend `npm run test:analytics-notifications` and frontend
`npm run test:e2e:analytics` against disposable local PostgreSQL. Explicit maintenance
`npm run notifications:prune -- --apply` deletes at most 1,000 read attention messages
older than 90 days; unread, audit and business rows remain. General notification email
and saved presets are deferred. **NO-GO FOR REAL CUSTOMER DATA** remains unchanged;
Render Free is staging-only by choice, Atlas retained; V2-08F now extends this foundation.
Hosted 001–016 checksums/status and public live/ready/frontend/login are verified;
this does not claim hosted authenticated V2-08E acceptance or extended recovery proof.

V2-08D adds organization **Data & Forms** (`/custom-fields`): 13 bounded field types
for Customers, Services, Appointments, Inventory items and staff Memberships; stable
options, typed relational values, archive history and versioned sections/layouts.
Actual create/edit/detail forms and desktop/mobile previews share the renderer.
Configuration permission (`fields.read/manage`) never grants entity-data access;
existing RBAC, tenant/branch and commercial gates remain. Required fields validate
new records and normal edits without historical backfill; defaults apply only to new
records, not retries. Apply additive **015** explicitly before backend deployment.
Customer custom search/filter is bounded and parameterized. V2-08E now consumes
reportable fields and safe custom CSV; uniqueness and broader filters remain deferred.
See [ADR 0023](docs/adr/0023-dynamic-fields-and-form-layouts.md) and
[dynamic-fields acceptance](docs/reviews/V2-08D_DYNAMIC_FIELDS_FORM_LAYOUTS.md).
Run backend `npm run test:dynamic-fields` and frontend `npm run test:e2e:fields`
against disposable local PostgreSQL. **NO-GO FOR REAL CUSTOMER DATA** is unchanged;
V2-08E/F extend this accepted foundation; V2-09 does not start automatically.

V2-08C adds organization administration (`/admin`), safe branch lifecycle,
organization-local custom roles, staff suspension/reactivation/revocation,
authenticated existing-account invitation acceptance, safe tenant audit and an
operator-only Platform Operations directory. Apply migration **014** explicitly
before deploying this backend; 001–013 are retained unchanged. Custom role
permissions replace built-in grants, never augment them. Customers and Services
are now CORE with dedicated read/manage permissions, independent of Queue
subscription; Queue/Appointments retain both Queue permission and entitlement.
See [ADR 0022](docs/adr/0022-organization-administration-and-custom-rbac.md) and
[organization/RBAC acceptance](docs/reviews/V2-08C_ORGANIZATION_RBAC.md).
`npm run test:organization-admin` and frontend `npm run test:e2e:admin` exercise
disposable local PostgreSQL authority and automatic browser acceptance.
**NO-GO FOR REAL CUSTOMER DATA** remains unchanged.

V2-08B adds phone-or-verified-email login, secure email verification/recovery,
staff invitations with recipient-chosen passwords, and durable per-user appearance.
See [identity/recovery review](docs/reviews/V2-08B_IDENTITY_ACCOUNT_RECOVERY.md),
[ADR 0021](docs/adr/0021-identity-email-recovery.md) and
[email/recovery operations](docs/runbooks/IDENTITY_EMAIL_RECOVERY.md).
Apply migration 013 explicitly before deploying this backend. Email delivery may
remain disabled for disposable staging; configure compatible SMTP securely to enable
verification/recovery. No paid email service or SMS is required. Existing phone-only
users and the legacy phone login body remain supported. Email is login/recovery
authority only after verification. New passwords use one 12-character/72-UTF-8-byte
policy; successful reset/change revokes sessions. Staff administrators no longer
choose passwords; no-email invitations have a one-time private handoff link.

`npm run test:identity-account` runs disposable PostgreSQL API/security acceptance.
`npm run test:e2e:identity` in frontend runs real local PostgreSQL/Express/capture-email
browser acceptance (requires local POSTGRES_TEST_URL); no hosted account/manual email
loop or SMTP credentials. See the runbook for isolation and secret-free QA outputs.
This does not change **NO-GO FOR REAL CUSTOMER DATA** or validate hosted SMTP.

V2-08A adds a Light-default, Light/Dark/System product foundation, responsive
workspace navigation, dedicated canonical Customers and Services pages, structured
Settings, international phone input and exact rupee-based commercial editors.
See the [product experience review](docs/reviews/V2-08A_PRODUCT_EXPERIENCE_FOUNDATION.md)
and [completion roadmap](docs/roadmap/V2_PRODUCT_COMPLETION_ROADMAP.md).
V2-07 hosted pilot acceptance is intentionally deferred until product completion;
**NO-GO FOR REAL CUSTOMER DATA** remains unchanged. Render Free remains staging-only
by operator choice, and Atlas is retained.

Automated frontend acceptance uses disposable, per-test local HTTP contract
fixtures, not hosted customer accounts. It is complemented by actual PostgreSQL
API integration tests; browser fixture success is not hosted tenancy or recovery proof.

```powershell
Set-Location frontend
npm.cmd ci
npm.cmd test
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Browser QA starts its own loopback Vite server with explicit fixture URLs.
For a normal build, supply `VITE_API_URL` and `VITE_SOCKET_URL` as documented below.
Screenshots/traces stay in ignored test artifacts and CI, not source control.

Hosted staging is deployed at `https://ekavio.afsify.com` with its API at
`https://api.ekavio.afsify.com`. The V2-07B final acceptance and V2-07C blocker-resolution decisions are
**NO-GO FOR REAL CUSTOMER DATA**. The public routes, schema, local quality
gates, and selected earlier authenticated staging flows passed, but operating
encrypted backups, authenticated provider recovery, hosted restore, always-on
pilot hosting, legacy-source reconciliation, and final hosted authenticated
acceptance remain open. Staging is for disposable development data only. See
the [V2-07C blocker matrix](docs/reviews/V2-07C_PILOT_BLOCKER_RESOLUTION.md),
[V2-07B ordered MUST-FIX list](docs/reviews/V2-07B_FINAL_PILOT_ACCEPTANCE.md),
[pilot operations](docs/runbooks/PILOT_OPERATIONS.md), and
[incident response](docs/runbooks/INCIDENT_RESPONSE.md).

On 2026-10-03, hosted manual backup run `37124573922` passed archive validation,
encryption and artifact upload. Retrieval/decryption/isolated PostgreSQL 18-or-newer
restore and cleanup, successful recurring schedules and alert delivery remain
OPEN pending specific evidence. Follow the [remaining operator checklist](docs/runbooks/V2-07C_OPERATOR_ACTIONS.md);
this progress does not authorize a pilot or V2-07D.

---

## Development Documentation

V2-07C backup monitoring now includes a separate metadata-only [watchdog](scripts/backup-watchdog.mjs) and [operator/delivery checklist](docs/runbooks/V2-07C_OPERATOR_ACTIONS.md#monitoring-and-backup-alert-operator-actions-2026-10-04). It requires recent scheduled backup success and a retained artifact; manual success does not substitute. Tooling does not prove notifications, external monitoring or pilot readiness. NO-GO remains unchanged.

EkaVio is a React/Vite PWA with an Express/TypeScript backend and PostgreSQL as its sole normal runtime data authority. V2-01 established deterministic engineering and container foundations, V2-02 added revocable server-side sessions, V2-03 added explicit organization memberships and permission enforcement, V2-04 added backend-authoritative commercial entitlements, V2-05A added the PostgreSQL shared-core migration foundation, V2-05B added the compatibility bridge, V2-05C cut identity/session/authorization authority to PostgreSQL, V2-05D cut commercial runtime authority to PostgreSQL, V2-06B1/B2 established and activated Customer/Service/Appointment/Queue relational authority, V2-06B3 prepared hosted staging, V2-06B5A/B/B5C added controlled public commercial intake, manual activation, and renewals, V2-06C/D/E cut Attendance, Customer Dues, and Inventory, and V2-06F cut corporate and security audit while removing MongoDB from normal server startup/readiness. MongoDB remains only for explicit legacy migration, reconciliation, archive, recovery, and compatibility tests; Atlas has not been deleted.

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

The committed examples contain development-only values. Replace all secrets for any shared or production environment. Normal backend startup validates `NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `HTTP_ALLOWED_ORIGINS`, `SOCKET_ALLOWED_ORIGINS`, and `TRUST_PROXY_HOPS`; it neither reads nor requires `MONGO_URI`. Production mode requires strong secrets, PostgreSQL TLS, HTTPS origins, and an explicit reviewed proxy-hop count. `MONGO_URI` is supplied separately only to explicit legacy tools. Comma-separate multiple exact allowed origins. Never log or commit a real database URL.

Production also rejects the committed development secret values, identical JWT and refresh secrets, and staging-bootstrap confirmation/phone/password variables in the long-running service. Bootstrap inputs belong only to the one-off non-production job and must be removed afterward.

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

## Public commercial catalogue and access requests

The landing page reads the live public catalogue from `GET /api/public/commercial/catalogue`. Platform operators configure optional monthly/yearly INR list prices in whole paise; no arbitrary price is seeded or hard-coded in React. Unpublished pricing appears publicly as “Contact for pricing.”

Visitors can request a server-authoritative estimate with `POST /api/public/commercial/quote` and submit `POST /api/public/access-requests`. Submission accepts selections rather than a client total, recalculates against PostgreSQL, stores an immutable list-price snapshot, and returns a safe opaque receipt. IP throttling and a normalized-phone cooldown provide low-cost abuse resistance.

Platform operators manage pricing and requests at `/commercial/requests` through protected `/api/billing/operator/*` APIs. Tenant owners/admins cannot access those endpoints. `pending` requests may move to `contacted`, `approved`, or `rejected`; `contacted` may move to `approved` or `rejected`. Approval alone does not grant an entitlement or create an organization/subscription.

Hosted production-mode deployments return 404 from public `POST /api/auth/register`. Controlled test/bootstrap repository paths remain available. The deliberate commercial flow is:

```text
Public catalogue -> Access request -> Operator review
-> Approved -> Negotiated agreement -> Manual payment
-> Secure one-time onboarding -> Organization/subscription activation -> Customer login
```

No payment gateway is configured or required. See [ADR 0014](docs/adr/0014-server-authoritative-public-commercial-intake.md) and the [V2-06B5A review](docs/reviews/V2-06B5A_PUBLIC_COMMERCIAL_INTAKE.md).

## Manual commercial activation and onboarding

An approved access request can be finalized once into a separate commercial agreement. The backend reloads the canonical PostgreSQL catalogue, validates plan/add-on compatibility, calculates the current list subtotal, and stores exact INR paise plus a negotiated total. A zero or list-different total requires an operator reason. Exact period timestamps are operator-reviewed; B5B does not approximate a month as 30 days.

Platform operators may append manual `upi`, `bank_transfer`, `cash`, or `other` payment records. Partial entries are allowed, retry keys are idempotent, and only an exact confirmed non-void total unlocks onboarding. Confirmed financial facts cannot be edited or deleted; an incorrect record is voided with actor, reason, and time. These entries are human assertions that payment was received, not automatic bank/UPI verification, PCI processing, tax accounting, or statutory invoices.

Once settled, an operator can issue a 72-hour one-time link. The server generates at least 32 random bytes, persists only a SHA-256 hash, and returns the raw fragment link once. The `/onboarding` page removes the fragment from browser history immediately, keeps the token only in component memory, and sends it only in strict POST bodies. It never stores the token in local/session storage. Replacement revokes an older active invitation.

The customer chooses a password of at least 12 characters and reviews the Main-branch IANA timezone (default `Asia/Kolkata`). One PostgreSQL transaction creates the normal user, organization, Main branch, owner membership/assignment, billing profile, active manual-source subscription, and selected add-ons, then consumes the token and marks both agreement and request activated. An existing normalized phone fails closed for operator resolution; B5B does not silently link identities. Effective modules remain exclusively server-computed from the resulting subscription.

Authenticated customers see factual current subscription, agreement amount, manual payment history, and billing profile at Billing. No onboarding token, operator note, other-tenant record, or fabricated invoice number is returned. See [ADR 0015](docs/adr/0015-manual-commercial-activation-and-onboarding.md) and the [V2-06B5B review](docs/reviews/V2-06B5B_MANUAL_COMMERCIAL_ACTIVATION.md).

## Manual subscription renewals

Platform operators manage continued service at `/commercial/renewals` through server-filtered, paginated views for expiring, expired, in-progress, exactly settled, and recently renewed subscriptions. A renewal is a separate immutable aggregate; it never rewrites the initial access request, agreement, payment, onboarding, or provisioning history.

An operator-only read-only preview loads the current package and server-calculated list pricing before the negotiated amount is entered. Finalization locks and reloads those canonical facts, preserves the current plan/add-ons, and stores exact INR paise plus the operator-reviewed period and negotiated total. A list-different total, zero total, or incomplete public price requires an explicit reason. Package changes are not future-scheduled by renewal; they remain a separate explicit commercial administration action so a future period cannot grant modules early.

Renewal payments are manual operator assertions using `upi`, `bank_transfer`, `cash`, or `other`. Partial records are append-oriented and idempotent. Confirmed facts cannot be edited/deleted; a correction is a reasoned void. Application requires the confirmed non-void sum to equal the agreed amount exactly.

For an unexpired subscription, the reviewed renewal begins at its authoritative current-period end. For an expired subscription, the operator must supply an explicit non-backdated reactivation start. One PostgreSQL transaction rechecks settlement, linkage, period, cycle, package, and state; updates the canonical subscription and add-on windows; marks the renewal applied; and appends audit events. Suspended, cancelled, and inactive subscriptions fail closed.

Customer Billing remains reachable after commercial expiry and shows neutral lifecycle messaging plus tenant-scoped initial and renewal/payment history. It has no Pay Now, checkout, automatic renewal, recurring charge, or payment link. Expiry and time remaining are derived when queried, so no Redis, queue, or background billing scheduler is required. See [ADR 0016](docs/adr/0016-separate-manual-renewal-aggregate.md) and the [V2-06B5C review](docs/reviews/V2-06B5C_MANUAL_RENEWALS.md).

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

## PostgreSQL application runtime authority

PostgreSQL is the runtime authority for users, organizations, branches, memberships, login identity, refresh sessions, request authorization, staff, registration, profile/password state, commercial catalogue/agreement/payment/subscription/renewal/entitlement state, Customers, Services, Appointments, Queue sessions/tokens/status, Attendance, Customer Dues, Inventory, parent organizations/corporate links, and security audit events. MongoDB has no normal web runtime authority. Legacy Mongo collections remain available only to explicit migration, reconciliation, archive, recovery, and compatibility-test commands.

The composition decision is source-controlled and has no environment/request switch, automatic Mongo fallback, or dual-write. Normal code uses canonical PostgreSQL UUIDs directly. Legacy ObjectIds are accepted only inside isolated tooling and are never interpreted as canonical UUIDs.

Effective-entitlement snapshots and public catalogue reads span multiple related tables, so they run in read-only, repeatable-read PostgreSQL transactions. A request cannot mix plan, add-on, subscription, or override rows from before and after one concurrent commit.

## Customer / Service / Appointment / Queue runtime (V2-06B2)

Migration 004 adds branch IANA timezones, organization-owned Customers and Services, branch availability, membership-based provider assignments, Appointments with overlap protection and append-only history, and Queue sessions/tokens with append-only history. Live Queue token creation locks the session counter in one transaction; it never counts existing rows. Appointment check-in and Queue token creation are one idempotent transaction.

The Customer, Service, Appointment, and Queue APIs use canonical UUID relationships and the selected PostgreSQL authorization context. Queue and Appointment requests are branch-scoped and require Queue entitlement plus `queue.read` or `queue.manage`. Since V2-08C, organization-owned Customers and Services are CORE, protected by `customers.read/manage` and `services.read/manage` without a Queue subscription. Service availability remains branch-constrained. Dashboard Queue counts are PostgreSQL branch counts. The frontend supports canonical customer/service selection, versioned Queue transitions, Appointment creation/list/check-in, pagination, retry and context-aware refetch.

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

## Attendance runtime (V2-06C)

Migration 009 adds branch-scoped `attendance_records`, immutable versioned `attendance_record_changes`, and a durable Attendance authority latch. The canonical subject is an existing PostgreSQL organization membership. The database enforces one record per organization/membership/business date, preserves the branch that owns the fact, and requires membership/actor assignment to that organization and branch. New manual marks require active memberships; deactivated staff retain authorized historical visibility.

The selected branch's IANA timezone defines the business date and converts optional local check-in/out values to authoritative instants. Absent records cannot contain times and checkout must be later than check-in. Initial marks are transaction/concurrency safe and support an idempotency key. Corrections require the exact current version plus a reason and append immutable before/after history. EkaVio does not infer hours, shifts, lateness, payroll, overtime, or half-day from duration.

`GET /api/attendance` returns the complete selected-branch daily roster with marked and unmarked memberships and factual totals. `POST /api/attendance` marks or corrects canonical membership UUIDs. Read and mutation remain separately gated by the Attendance entitlement plus `attendance.read` or `attendance.manage`. The frontend uses these APIs with loading, empty, error, persisted-state, permission-aware, and stale-correction behavior. Dashboard present-today uses the same PostgreSQL branch-local date rule. No Attendance Socket.IO events are introduced.

The legacy Mongo transform is dry-run first and accepts no guessed branch. Exactly one plausible active assigned branch is automatic; ambiguity requires a reviewed per-document mapping. Imported rows preserve date/status/provenance and intentionally have no fabricated times, shift, actor, or reason. Build first, then use a secure ignored mapping file:

```powershell
npm.cmd run operations:attendance:shadow -- --mapping C:\secure\tenant.attendance-mapping.json
npm.cmd run operations:attendance:shadow -- --mapping C:\secure\tenant.attendance-mapping.json --apply
npm.cmd run operations:attendance:verify -- --mapping C:\secure\tenant.attendance-mapping.json
npm.cmd run operations:attendance:preflight -- --mapping C:\secure\tenant.attendance-mapping.json
npm.cmd run operations:attendance:activate -- --mapping C:\secure\tenant.attendance-mapping.json
npm.cmd run operations:attendance:activate -- --mapping C:\secure\tenant.attendance-mapping.json --apply
npm.cmd run operations:attendance:status
```

Activation is explicit after zero-blocker reconciliation/preflight. Once active, ordinary shadow apply refuses unless the separately reviewed recovery flag is supplied. Ordinary Attendance and Dashboard runtime contain no Mongo Attendance read, write, fallback, or dual-write; the old model remains migration/recovery compatibility only. See [ADR 0017](docs/adr/0017-postgresql-attendance-runtime-authority.md), the [V2-06C review](docs/reviews/V2-06C_ATTENDANCE_POSTGRESQL_CUTOVER.md), and the [Attendance cutover runbook](docs/runbooks/V2-06C_ATTENDANCE_CUTOVER.md).

## Customer Dues runtime (V2-06D)

Migration 010 replaces the ambiguous Mongo Ledger runtime with append-only `customer_due_entries`. Customer Dues is strictly money a business's customers owe and payments that reduce that amount; it is not general accounting, invoicing, tax, Sales/POS, or a payment gateway. Every entry references a canonical organization, originating branch, Customer, and actor. Positive INR paise are stored as `BIGINT`; charge/increase-adjustment add to balance, payment/decrease-adjustment subtract, and a full reversal contributes the exact inverse of its target. Balance is a server-derived journal aggregate, never a mutable independent field.

Ordinary payments transactionally lock the organization/Customer boundary and cannot exceed the authoritative organization-wide outstanding balance. Adjustments require a reason. Historical rows cannot be updated or deleted, and each non-reversal entry can be reversed once with an actor and reason. Organization-scoped idempotency keys make same-command retries safe while rejecting conflicting reuse. Branch journal rows remain branch-isolated; the Customer balance endpoint separately labels organization-wide and selected-branch aggregates.

The canonical APIs are `/api/customer-dues/entries`, `/api/customer-dues/customers`, Customer balance/history, and entry reversal. They require the stable `ledger` entitlement and separate `ledger.read`/`ledger.manage` permissions. `/api/ledger` is retained only as a read-only PostgreSQL compatibility view; legacy free-text writes are removed. Public DTOs use canonical UUIDs and decimal strings and do not expose migration Mongo ObjectIds.

Legacy transformation is dry-run first. It maps `credit` to `charge`, keeps `payment`, blocks any amount that cannot convert exactly to two-decimal INR paise, reuses accepted Customer source links or explicit reviewed overrides, and requires reviewed originating branch evidence for every document. Use a secure ignored mapping file:

```powershell
npm.cmd run operations:customer-dues:shadow -- --mapping C:\secure\tenant.customer-dues-mapping.json
npm.cmd run operations:customer-dues:shadow -- --mapping C:\secure\tenant.customer-dues-mapping.json --apply
npm.cmd run operations:customer-dues:verify -- --mapping C:\secure\tenant.customer-dues-mapping.json
npm.cmd run operations:customer-dues:preflight -- --mapping C:\secure\tenant.customer-dues-mapping.json
npm.cmd run operations:customer-dues:activate -- --mapping C:\secure\tenant.customer-dues-mapping.json
npm.cmd run operations:customer-dues:activate -- --mapping C:\secure\tenant.customer-dues-mapping.json --apply
npm.cmd run operations:customer-dues:status
```

Activation is explicit after clean reconciliation/preflight and writes a durable authority latch. Ordinary migration apply then refuses unless separately reviewed recovery mode is requested. Runtime has no Mongo Ledger read, write, fallback, dual-write, or automatic repair. See [ADR 0018](docs/adr/0018-postgresql-customer-dues-runtime-authority.md), the [V2-06D review](docs/reviews/V2-06D_CUSTOMER_DUES_POSTGRESQL_CUTOVER.md), and the [Customer Dues cutover runbook](docs/runbooks/V2-06D_CUSTOMER_DUES_CUTOVER.md).

## Inventory runtime (V2-06E)

Migration 011 replaces mutable, organization-wide Mongo stock with an organization catalogue (`inventory_items`), branch-owned default `stock_locations`, immutable `stock_movements`, and transactionally maintained `stock_balances`. Quantity and reorder threshold use PostgreSQL `NUMERIC(18,3)` and decimal-string APIs. Optional reference price uses exact non-negative INR paise in `BIGINT`; it is not accounting valuation or purchase cost.

The initial unit vocabulary is `unit`, `piece`, `pack`, `box`, `kg`, `g`, `litre`, and `ml`. An item's unit cannot change after any movement exists. New items may include optional opening quantity only through one transaction that creates the catalogue row, balance, and opening movement. Zero opening stock creates a zero balance without a fictional zero movement.

Receive, consume, increase/decrease adjustment, and full reversal are permanent stock facts. The server derives delta sign from operation type, locks the item/location balance, rejects any command or reversal that would make stock negative, appends one idempotent movement, and updates the projection atomically. Reversal is one exact inverse of a same-scope non-reversal target; partial and duplicate reversal are not supported. Adjustment, consume, and reversal require reasons.

Catalogue identity is organization-shared, while quantity, threshold, location, history, and low-stock are selected-branch scoped. All routes require the stable `inventory` entitlement; reads use `inventory.read`, and catalogue/stock changes use `inventory.manage`. Dashboard low-stock uses the same PostgreSQL selected-branch aggregate. The frontend uses UUIDs, exact strings, server pagination/search, real movement commands, permission-aware controls, and a current-page-only CSV export.

Legacy transformation requires explicit per-document branch and unit evidence; it never guesses Main/first/current branch or `unit`, and it never merges duplicate names. Build first, then use a secure ignored mapping file:

```powershell
npm.cmd run operations:inventory:shadow -- --mapping C:\secure\tenant.inventory-mapping.json
npm.cmd run operations:inventory:shadow -- --mapping C:\secure\tenant.inventory-mapping.json --apply
npm.cmd run operations:inventory:verify -- --mapping C:\secure\tenant.inventory-mapping.json
npm.cmd run operations:inventory:preflight -- --mapping C:\secure\tenant.inventory-mapping.json
npm.cmd run operations:inventory:activate -- --mapping C:\secure\tenant.inventory-mapping.json
npm.cmd run operations:inventory:activate -- --mapping C:\secure\tenant.inventory-mapping.json --apply
npm.cmd run operations:inventory:status
```

Activation is explicit after migration 011, zero-blocker reconciliation, exact balance-to-movement checks, and preflight. Once active, ordinary migration apply refuses unless the separately reviewed recovery flag is supplied. Ordinary Inventory and Dashboard runtime contain no Mongo Inventory read, write, fallback, dual-write, or automatic repair. See [ADR 0019](docs/adr/0019-postgresql-inventory-runtime-authority.md), the [V2-06E review](docs/reviews/V2-06E_INVENTORY_POSTGRESQL_CUTOVER.md), and the [Inventory cutover runbook](docs/runbooks/V2-06E_INVENTORY_CUTOVER.md).

## Corporate, security audit, and Mongo runtime retirement (V2-06F)

Migration 012 completes the normal runtime cutover. Parent organization creation/listing, child linking, and linked-organization commercial summary use canonical PostgreSQL UUIDs and owner/membership authorization. The Corporate screen loads an authorized parent list and honest empty/error states; it contains no hard-coded `defaultParent` or fabricated subscription fallback.

Security audit writes use append-only PostgreSQL `audit_events` with a closed action vocabulary and bounded scalar-only details. Sensitive field names, nested structures, non-finite values, and oversized content are rejected. Legacy ActivityLog transformation imports only safe, canonically mapped rows. Unsafe rows create a hash/fingerprint/reason disposition without copying the raw payload; raw archive/retention work remains outside Git and must precede Atlas deletion.

Normal server startup, environment validation, readiness, and Compose require PostgreSQL only. MongoDB and `legacy-tools` are available only through the explicit `legacy-migration` Compose profile. Retained Mongoose models and compatibility repositories are offline tooling, not a fallback, mirror, or dual-write authority. Message, Notification, NotificationBell, and dormant Chat implementations were removed without building replacements.

Build first, then run the reviewed legacy workflow only with securely injected PostgreSQL and Mongo connection values:

```powershell
npm.cmd run runtime:corporate:shadow
npm.cmd run runtime:corporate:shadow -- --apply
npm.cmd run runtime:corporate:verify
npm.cmd run runtime:audit:shadow
npm.cmd run runtime:audit:shadow -- --apply
npm.cmd run runtime:audit:verify
npm.cmd run runtime:mongo:activate
npm.cmd run runtime:mongo:activate -- --apply
npm.cmd run runtime:mongo:preflight
npm.cmd run runtime:mongo:status
```

Dry runs are non-mutating. Do not repeat successful activation. Apply refuses after activation unless an explicit reviewed recovery flag is supplied. Atlas is not deleted by V2-06F; hosted source reconciliation, secure archive/retention approval, backup/restore proof, and rollback-window acceptance remain separate gates. See [ADR 0020](docs/adr/0020-postgresql-corporate-audit-and-mongo-runtime-retirement.md), the [V2-06F review](docs/reviews/V2-06F_CORPORATE_AUDIT_MONGO_RETIREMENT.md), and the [V2-06F runbook](docs/runbooks/V2-06F_MONGO_RUNTIME_RETIREMENT.md).

## PostgreSQL recovery and pilot hardening (V2-07A)

Runtime-sensitive Node, Nginx, PostgreSQL, and retained offline Mongo images use tested tag-plus-manifest-digest references. Backend/frontend dependency audits are clean after compatible Socket.IO/Engine.IO, Axios, React Router, PostCSS/Autoprefixer, and transitive build-tool updates. Production containers remain unprivileged and contain only compiled backend or static frontend artifacts.

Create a validated logical backup in an encrypted operator path outside this repository:

```powershell
# Local Compose proof/source
node scripts/postgres-backup.mjs --output-dir C:\secure\ekavio-backups --compose

# Hosted source: inject DATABASE_URL securely; never place it in the command
node scripts/postgres-backup.mjs --output-dir E:\encrypted\ekavio-backups
```

Restore only into a new disposable local database with the required safety prefix:

```powershell
node scripts/postgres-restore-proof.mjs `
  --archive C:\secure\ekavio-backups\ekavio-postgresql-<timestamp>.dump `
  --database ekavio_v207a_restore_<unique_suffix> `
  --drop-after-verification
```

The proof requires migrations 001 through 012, counts the accepted identity, commercial, operational, and audit structures without selecting row data, and rejects core orphan relationships. V2-07A completed this proof against local Compose in 12.379 seconds for a small 273,046-byte development archive; this is not a hosted recovery-time guarantee.

V2-07C adds a scheduled encrypted-backup workflow, offline-key encryption/decryption, a disposable local end-to-end restore check, a hosted header probe, and a read-only two-tenant hosted acceptance script. Run `node --test scripts/backup-envelope.test.mjs` and `node scripts/backup-compose-acceptance.mjs --confirm-local-disposable` for the local backup path. The actual Neon plan/restore settings are not observable from source or a connection URL. A pilot still requires a **successful hosted** scheduled backup/retrieval/isolated restore, authenticated provider-setting evidence, tested alerts and owners, always-on hosting, Atlas source reconciliation, configured Render headers, and hosted acceptance. See the [V2-07C blocker record](docs/reviews/V2-07C_PILOT_BLOCKER_RESOLUTION.md), [recovery runbook](docs/runbooks/V2-07A_BACKUP_RESTORE.md), and [V2-07A hardening review](docs/reviews/V2-07A_PILOT_READINESS_HARDENING.md). No real data is approved.

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
npm.cmd run test:commercial-intake
npm.cmd run test:manual-commercial
npm.cmd run test:commercial-renewal
npm.cmd run test:attendance
npm.cmd run test:attendance-migration
npm.cmd run test:attendance-cutover
npm.cmd run test:customer-dues
npm.cmd run test:customer-dues-migration
npm.cmd run test:customer-dues-cutover
npm.cmd run test:inventory
npm.cmd run test:inventory-migration
npm.cmd run test:inventory-cutover
npm.cmd run test:corporate
npm.cmd run test:corporate-migration
npm.cmd run test:audit
npm.cmd run test:audit-migration
npm.cmd run test:mongo-retirement
npm.cmd run test:mongo-source-contract
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

Normal Compose contains PostgreSQL, backend, and frontend. PostgreSQL uses local-only default credentials and is not published to the host. Override development defaults before using the stack outside a local workstation. MongoDB and `legacy-tools` are available only with `docker compose --profile legacy-migration ...`; their retained named volume is not a normal application dependency. Stop services without deleting volumes; do not use `docker compose down -v` unless destruction of local database evidence is explicitly intended.

## Hosted staging architecture

The recommended normal hosted topology is a static/PWA frontend at `https://app.<domain>`, one long-running Node/WebSocket backend at `https://api.<domain>`, and managed PostgreSQL. The backend is stateless, binds the provider `PORT`, supports explicit proxy trust, and requires PostgreSQL for readiness. Managed MongoDB Atlas is temporarily retained outside the normal application dependency graph for explicit legacy reconciliation/archive/recovery only. Frontend API and Socket URLs are public build-time configuration; all backend credentials remain provider secrets.

Apply PostgreSQL migrations once through an explicit release command, then use the guarded staging bootstrap only for a new empty staging database. B5B requires migration `007_manual_commercial_activation.sql`; B5C requires `008_manual_subscription_renewals.sql`; V2-06C requires `009_attendance_runtime_authority.sql`; V2-06D requires `010_customer_dues_runtime_authority.sql`; V2-06E requires `011_inventory_runtime_authority.sql`; V2-06F requires `012_corporate_audit_runtime_authority.sql`. Check and apply them through the direct/session-capable Neon migration URL before claiming hosted behavior; a pushed application commit is not migration evidence. Hosted migrations 001 through 012 are applied. Hosted source reconciliation and authority activation for Attendance, Customer Dues, Inventory, corporate, and audit remain open: the V2-07B Docker attempt reached Atlas but was denied by its network policy before source facts loaded. Do not change runtime DNS, guess mappings or latch state, weaken Atlas network access, or delete Atlas. V2-07A proved PostgreSQL logical restore locally, not against Neon. Free/sleeping services and manual backups are acceptable only for disposable internal staging; a pilot requires always-on compute, verified provider recovery settings, scheduled encrypted backups, monitoring, and a hosted restore drill.

See the [staging deployment runbook](docs/runbooks/V2-06B3_STAGING_DEPLOYMENT.md), [readiness review](docs/reviews/V2-06B3_STAGING_READINESS_REVIEW.md), [partial hosted validation](docs/reviews/V2-06B4_HOSTED_STAGING_PARTIAL_VALIDATION.md), [cost/reliability register](docs/reviews/V2-06B3_HOSTING_COST_AND_RELIABILITY.md), [ADR 0013](docs/adr/0013-staging-deployment-architecture.md), and the [V2-07B final acceptance](docs/reviews/V2-07B_FINAL_PILOT_ACCEPTANCE.md). The V2-07B decision is NO-GO for real customer data until its operating and hosted-evidence blockers are closed.

## Health endpoints

- `GET http://localhost:5000/health/live` returns HTTP 200 whenever the API process can respond. It does not depend on either database.
- `GET http://localhost:5000/health/ready` returns HTTP 200 only while PostgreSQL is reachable; otherwise it returns HTTP 503. MongoDB is not a normal readiness dependency.

Health responses expose only status labels and never connection strings or secrets.
