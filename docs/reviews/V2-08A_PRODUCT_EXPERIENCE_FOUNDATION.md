# V2-08A product experience foundation

## Scope and baseline

Accepted starting main: `cb9d168986f2c9ed69ba1609f0de4b24f675551d`
(`chore: add pilot backup monitoring`), verified clean and equal to remote main.
Annotated checkpoint: `pre-v2-08a-product-experience-foundation`, pushed at that exact commit.
Work stays on main. This review closes product foundation, not pilot acceptance.

**NO-GO FOR REAL CUSTOMER DATA** remains unchanged. Hosted V2-07 acceptance is
intentionally deferred until product completion and separate automated final
acceptance. Render Free remains staging-only by operator choice; Atlas is retained.
No hosted credentials, operator-created fixtures, Atlas writes or authority-latch
changes are part of this milestone. Backup/recovery and hosting requirements are
not weakened. See the [roadmap](../roadmap/V2_PRODUCT_COMPLETION_ROADMAP.md).

## Experience architecture

- Semantic background, surface, border, text, primary and status tokens unify new
  components and adapt existing utility-based screens. Light is the first-time
  default, even on a Dark OS. Light/Dark/System and curated accents are available.
  System uses `prefers-color-scheme`, listens live and removes its listener.
  Only validated local appearance preferences persist; denied storage is safe.
  Organization branding APIs are not misused as per-user preferences.
- Desktop has a persistent grouped sidebar; tablet a dismissible drawer; phone
  has Home/Queue/Customers/More bottom navigation, with unavailable items omitted.
  Organization, assigned branch, page context and profile entry remain visible.
  Drawer/modal keyboard trapping, Escape and focus restoration support keyboard use.
- Navigation evaluates permission AND entitlement independently, then operator
  status where applicable. Protected route guards match navigation; backend checks
  remain authority. Tenant admins are not platform operators. Commercial Intake,
  Renewals and Corporate HQ stay in a separate Platform operations group.
- Customers and Services are core experience destinations, not new sellable modules.
  Existing canonical APIs still require Queue entitlement and queue.read/queue.manage.
  Those boundaries were preserved, not bypassed by the UI. A future policy change
  must explicitly review backend permissions/entitlements.

## Canonical master data

Customers (`/customers`) provides API pagination/search, loading, retry, empty CTA,
create/edit, optional normalized phone, safe text notes and fetched detail modal.
Read-only users have no mutation controls. Queue and Customer Dues still consume
the same PostgreSQL Customer records. IDs are routing keys, not visible customer labels.

Services (`/services`) provides pagination/search, name/description/duration,
create/edit, global active state, current-branch availability and canonical
membership-backed provider assignment. New services use existing atomic branch
assignment. Queue and Appointment selectors use the existing shared branch service
query, invalidated after edits. The narrow backend change is parameterized,
case-insensitive service-name search, preserving organization/branch constraints.
No schema change, duplicate catalogue, price fiction or payment/accounting was added.
Full branch availability CRUD has no existing HTTP contract and remains deferred.
Availability is not inferred absent from a bounded result; unconfirmed is explicit.

## Settings, terminology and commercial presentation

My Profile, Appearance, Organization and Security are available to authenticated
members. Existing profile update and current/new-password APIs are reused; password
change retains server session revocation and returns to sign-in. Organization
information comes from active server-returned memberships. Authorized administration
shows assigned Branches and permission-checked Staff/Billing links; additional
organization fields, full branch CRUD, custom roles and invitation redesign are deferred.

Raw tenant/user/branch identifiers and commercial keys are collapsed under Technical
details with copy actions. Immutable history IDs stay canonical internally. Where
actor names are not provided authoritatively, the UI says Platform operator instead
of guessing a person. Tenant historical agreement/renewal DTOs do not contain frozen
package names; honest recorded-package labels and collapsed keys are used, not a
potentially changed current plan masquerading as historical truth.

Pricing, negotiated agreement and manual payment/renewal editors display INR rupees
and convert decimal strings exactly through integer/BigInt paise at the API boundary.
Negative, exponent, excess precision and unsafe-range values are rejected. Server
pricing and immutable snapshots remain authoritative. No-op request updates use
neutral `No changes to save.` feedback. Customer Dues replaces customer-facing Ledger
wording without renaming the internal `ledger` key. Empty Customer/Dues, Service/Queue/
Appointment and Inventory states offer permitted next actions. Dashboard removes
hard-coded financial/queue illustrations and displays only available canonical counts.
Reports and Help are explicitly incomplete shells without invented reports or contacts.

## Phone and dependency review

Pinned MIT `libphonenumber-js` 1.13.14 supplies reviewed, maintained normalization
without a paid service. The wrapper defaults to IN, offers country flags/names,
shows a non-editable calling prefix, uses mobile tel input, accessible labels/errors
and emits E.164 when valid. Newly touched Public Request Access, Customer and Staff
forms reuse it; valid unchanged legacy customer phones remain compatible. Login
identity, OTP, phone-or-email and account recovery contracts are unchanged.

Pinned Playwright 1.63.0, Vitest 4.1.11, jsdom 26.1.0 and Testing Library support
the existing Node 20.20.2 toolchain. No forced audit upgrade or paid dependency was used.

## Automated QA and evidence boundaries

`npm test` runs focused Vitest/Testing Library money, phone, navigation, storage,
System-theme listener, Settings and empty-state tests. `npm run test:e2e` starts a
dedicated loopback Vite server and Chromium. Each test owns fresh generated identity
and HTTP-contract data; fixtures never connect to hosted services. No credentials
are committed. The managed in-app browser failed before navigation because sandbox
metadata was unavailable; the explicitly requested local Playwright path was used.
No operator manual browser testing or fixture creation was required.

Browser coverage includes Light/Dark at 390/768/1440, no document overflow, Light
default on Dark OS, live System changes/persistence, permission and entitlement
hiding, protected routes, canonical-shaped Customer create/edit/details/search/
pagination/retry, Service create/edit shared Queue/Appointment options, read-only
mutation hiding, human Settings/profile save, operator separation, exact rupee API
conversion, keyboard drawer/dialog behavior, logout and no browser page errors.
Screenshots/traces are ignored local/CI artifacts, not committed collections.

These are frontend HTTP-contract fixture tests, not real database-backed browser
or hosted tenant-isolation proof. Actual local PostgreSQL operational foundation
and Express runtime suites complement them, including service search and customer/
service mutations, foreign organization/branch rejection and permission boundaries.
Existing 143 backend tests retain authentication/refresh/password revocation,
authorization, entitlements and commercial invariants. Source-contract assertions
now inspect the factored navigation module; their operator and entitlement checks
remain intact. The operational fixture keeps its audit authority latch pending,
so its bounded audit-persistence warnings are fixture limitations, not waived
normal-runtime acceptance errors. Normal Docker health/log checks are separate.

## Final validation

Local acceptance on 2026-10-05:

| Gate | Result |
| --- | --- |
| Backend npm ci, lint, typecheck, build | PASS |
| Backend unit/source contracts | 143/143 PASS; no skips |
| PostgreSQL operational foundation | 1 aggregate suite PASS |
| PostgreSQL Express operational runtime, including added search/mutation isolation | 1 aggregate suite PASS |
| Frontend npm ci, lint, typecheck, production/PWA build | PASS |
| Vitest / Testing Library | 20/20 PASS |
| Playwright Chromium | 19/19 PASS |
| Light/Dark at 390, 768, 1440 | All six PASS; no document overflow |
| Backend runtime audit; frontend full and runtime audit | Zero reported vulnerabilities |
| Docker Compose config and build/up | PASS; three normal services healthy; offline Mongo stopped |
| Local live, ready, root, login | HTTP 200 on all four |
| Normal backend/frontend bounded runtime log review | No runtime error matches |
| Diff/security/artifact review | No secrets, environment files, backups, dumps, generated builds or screenshot collections staged |

Final screenshot review corrected desktop drawer-button visibility and verified
mobile/desktop Light/Dark presentation. Final storage review explicitly strips
unknown legacy preference fields, retaining only mode/accent, with regression coverage.
Build reports a non-blocking approximately 509 kB shared JS chunk and existing
mixed static/dynamic import warning; these are not hidden by relaxed build limits.

CI retains the complete backend/database suite sequence and adds frontend unit,
Chromium acceptance and seven-day QA artifacts. No milestone tag is created until
CI succeeds for the exact final commit. The final report supplies the commit,
exact CI run, remote and tag identity. No subsequent milestone begins automatically.

Deferred: V2-08B identity/recovery and durable user preferences; V2-08C organization
fields/branch CRUD/RBAC/staff lifecycle; V2-08D custom fields/form layouts; V2-08E
reports/notifications; V2-08F full public/commercial polish. No CRM, Purchase, HR,
gateway, SMS, WhatsApp or paid AI feature is introduced here.
