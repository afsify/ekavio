# V2-11D administration, HR, reporting, notifications and billing acceptance

Date: 2026-10-11. Engineering UX acceptance only.
**NO-GO FOR REAL CUSTOMER DATA remains unchanged. Render Free is staging-only.**

## Baseline and scope

Resumed the preserved main working tree, rather than restarting implementation.
Accepted C baseline: `3fb1165dbff6f62ed15d2a5f95ae1dd360868caf`, exact successful
CI `38066738453`, annotated `v2-11c-crm-purchasing-experience`. The single published
`pre-v2-11d-administration-experience` checkpoint is preserved at that baseline.
The intentional `reference/` ignore rule is unchanged; references remain read-only
and out of Git. No historical migration, backend runtime, dependency or hosted
environment/provider configuration is changed. Atlas is untouched.

[Pre-implementation source audit](V2-11D_ADMINISTRATION_UX_AUDIT.md),
[ADR 0029](../adr/0029-ekavio-design-system.md) and
[roadmap](../roadmap/V2_11_EXPERIENCE_ROADMAP.md) describe the source boundaries.

| Workspace | Implemented experience and preserved contract |
| --- | --- |
| Organization / Branches / Roles | Grouped operating profile and readable canonical permissions, server-ordered bounded desktop directories/mobile records, single edit/review/discard sheets, versioned lifecycle confirmation. Branch/Member responses are capped at 200; no complete total, unsupported paging or global sort is represented. Role catalogue is configuration, not a fabricated paginated directory. |
| Staff | Protected identity, membership status, roles, branch details and canonical dynamic fields; reviewed access, invitation and revocation. Optional Branch/Role catalogue grants are not prerequisites for unchanged canonical assignments. Replacement roles, self/owner protections and recipient-chosen credentials remain server enforced. Raw handoffs are transient component memory, not query/mutation cache or durable storage. |
| HR Plus / My Work | Server-page leave/shift records, responsive configuration/calendar forms, explicit request/decision/schedule reviews and guarded pending/dirty sheets. Whole-day policy, different reviewer/all-assigned-branch coverage, private reasons/notes, branch dates and UTC, overlaps, immutable publication/history, versions and existing create keys remain canonical. Attendance is independent. |
| Reports | Curated catalogue and supported filters/columns, readable desktop/mobile server results and reviewed export snapshot. Fresh server permission/entitlement/tenant checks and audit remain authoritative. Export keeps 2,000-row / 5 MiB adaptive budgets, exact monetary facts and CSV formula safety. No arbitrary report builder or subset-global sorting. |
| Notifications | Scoped personal attention cards, category/unread feedback, explicit all-page/all-category own-inbox bulk-read review and truthful preference save/error state. Only existing organization/CRM/HR events and supported deep links; no recipient API, scheduler or external messaging. |
| Tenant Billing / operator commercial | Semantic subscription/period/limits, included plan versus independent add-ons, human-readable effective access sources, persisted manual payment and renewal history. Operator-only reviewed pricing, intake, agreement, settlement, onboarding and renewal actions; frozen historical terms, exact settlement and existing idempotency remain authoritative. No gateway, automatic charge, tax invoice or fabricated price/payment. |

Scope-keyed queries and workspace remounts cover account, organization, branch,
grants, entitlements and platform-operator status. Abort signals plus captured
context checks reject late subscription responses. One-dialog review snapshots
retain applicable versions and exact keyed payment/request payloads. Pending
commands prevent duplicate submission/closing. Uncertain non-idempotent writes
require authoritative inspection before a new command; keyed repeat-safe retries
retain the original payload/key. Successful Organization writes await refreshed
records before reopening an editor, preventing a stale role version race.

## Actual local gates

All counts below count distinct cases, not repeated attempts.

| Gate | Evidence |
| --- | --- |
| Clean installs | Backend and frontend `npm ci` passed; lockfiles unchanged. |
| Backend | Lint, typecheck and build passed; 196/196 unit tests passed, no skips. |
| Database | All 34 integration files passed: 328/328 tests, no skips, against isolated loopback PostgreSQL and legacy-test Mongo fixtures. Covers migrations 001–020 and identity/commercial/operational/admin/analytics/HR boundaries. |
| Offline source / operations contracts | Mongo-source contract 4/4; root backup/encryption/watchdog/hosted/strict-NO-GO contracts 23/23 passed, no skips. Local verifier tests are not new genuine hosted recovery proof. |
| Frontend | Original corrected suite 108/108; with 13 new focused cases, final 121/121 components passed. Lint/typecheck and production/PWA build passed. |
| Dependency security | Backend/frontend full and production-only audits each report zero vulnerabilities; no new dependency. |
| Browser / visual | 495/495 distinct Chromium cases passed: 163 real PostgreSQL workflow/authority cases plus 332 sanitized presentation/shell cases. No failed or interrupted attempt is counted as a pass. |
| Docker | Compose config and build/up passed; PostgreSQL, backend and frontend healthy. Local live/ready/root/login explicitly HTTP 200. Bounded runtime log scan found no runtime-error or sensitive-value matches. Normal runtime remains PostgreSQL-only. |

The managed browser connection lacked required sandbox metadata. The explicitly
authorized repository Playwright/Chromium fallback uses existing local QA servers.
Private workflows use real disposable PostgreSQL sessions/canonical APIs; their
traces/screenshots are disabled and excluded from upload. Sanitized visual DTOs
prove presentation only and block hosted API transmission. HTTP probes/screenshots
are not tenancy, settlement, recovery or hosted acceptance proof.

### Browser breakdown and loaded visual evidence

| Suite | Distinct passed cases | Evidence kind |
| --- | ---: | --- |
| Identity / recovery / invitations | 11 | Real disposable PostgreSQL |
| Organization administration | 18 | Real disposable PostgreSQL |
| Dynamic forms | 14 | Real disposable PostgreSQL |
| Analytics / notifications | 13 | Real disposable PostgreSQL |
| Public / operator commercial lifecycle | 24 | Real disposable PostgreSQL |
| CRM | 15 | Real disposable PostgreSQL |
| Purchasing | 18 | Real disposable PostgreSQL |
| HR Plus | 15 | Real disposable PostgreSQL |
| All-module shell / context | 10 | Real disposable PostgreSQL |
| Daily operations | 13 | Real disposable PostgreSQL |
| Relationship workflows | 6 | Real disposable PostgreSQL |
| Reviewed D administration | 6 | Real disposable PostgreSQL |
| Foundation / retained shell | 61 | Sanitized contracts |
| Daily-operations visuals | 175 | Sanitized contracts |
| Relationship visuals | 31 | Sanitized contracts |
| D administration visuals | 65 | Sanitized contracts |

D's 65 cases comprise 24 loaded width/theme journeys, 14 read-only/empty/error
walkthroughs, one short-height review/discard case, two loading/denial cases and
24 dedicated actual-report-value viewport captures. All required widths (320,
360, 390, 430, 768, 1024, 1440, 1920) passed Light, Dark and System. System tracks
live OS dark/light changes. Automation checks document overflow, dialog bounds,
keyboard focus containment and footer action point-hit/occlusion, including
390 × 430 short-height review and discard. No assertion deadline or retry policy
was weakened.

Sanitized evidence lives in ignored `frontend/test-results/administration-visual/`:
34 loaded journeys × 24 combinations = 816 frames, 42 state frames and five
short-height/loading/denial frames, plus 24 matrix and two state contact sheets.
Original report-value captures frame the actual long values. Contact sheets and
representative originals were visually inspected, not inferred from passing code.
This is layout/focus acceptance, not a formal WCAG certification or Lighthouse
score. Private PostgreSQL traces/screenshots never become release evidence.

Reproduction uses `test:e2e:administration`, `test:e2e:administration-visual` and
`node e2e-administration-visual/review-matrix.mjs` from `frontend`. Windows used
the documented external local-server flags, bounded workers and a frozen
production preview. CI retains ordinary isolated fixture startup.

## Corrections and evidence discipline

TypeScript/ESLint and the HR component locator from the interrupted session were
corrected. Genuine findings included mobile Reports records hidden by a legacy
selector, reopening a role editor before canonical invalidation finished, late
Billing responses after authority changes, ambiguous notification category
labeling, optional staff catalogue-grant assumptions, misleading preference Saved
feedback, a filtered category incorrectly disabling all-category inbox actions,
and non-idempotent shift-edit retry advice. The inbox action now obtains its count
from the existing unfiltered, context-scoped server query; category rows do not
become global facts. Optional-catalogue Staff review retains the canonical role
name instead of showing a blank label. Focused tests cover these
boundaries. Existing invitation/admin/HR/commercial/export tests now traverse the
required review step without removing domain, authority or negative assertions.

Windows managed QA startup timed out before tests; directly starting the existing
test API/Vite servers and using supported external-server flags resolved the
harness issue. Overloaded concurrent build/test workers caused unchanged timeout
failures; bounded workers retain original assertion deadlines and zero retries.
Repeated fixed-phone identity fixtures correctly encountered already-created QA
accounts; only the identified disposable QA API was restarted to restore the
suite's normal fresh-database condition. Production rate limits and account-link
rules were not modified. A filtered-export workflow now waits for the actual
matching server response before opening review, rather than accepting an already
visible unfiltered row. Development reloads interrupted captures while files were
being edited; sanitized regressions use a frozen production preview. Screenshot
inspection also identified two evidence-framing gaps: actual report values were
below a heading-only capture, and a broad loading locator matched the bootstrap
loader. Dedicated viewport-value captures and the exact Reports loading locator
corrected the evidence without weakening assertions. No failed attempt is counted
as a passed gate.

## Performance, security and exclusions

Production build: 435 transformed modules; main entry 317.61 kB / 101.00 kB gzip,
shared client 99.54 kB / 33.89 kB gzip, CSS 75.41 kB / 14.76 kB gzip. D workspaces
remain lazy-loaded. PWA precache is 78 entries / 1144.03 KiB, versus accepted C's
77 / 1112.46 KiB: +31.57 KiB (2.84%). The existing mixed static/dynamic API-client
import warning remains; no measured latency improvement or Lighthouse score is
claimed. No new UI/theme/auth stack or mandatory paid service was introduced.

No owner transfer, payroll, accrued balance, partial-day leave, automatic
Attendance, complete Branch/Staff pagination, arbitrary reporting, extra event
delivery, payment gateway, automatic recurring billing or accounting is claimed.
Any such capability requires separately reviewed backend/security scope.

V2-11E remains deferred: final cross-domain/public/account polish and broad
accessibility/performance acceptance. It does not begin automatically.

V2-10 NO-GO remains independent: always-on/provider capacity and cost, genuine
post-020 hosted archive extended recovery, commercial authority/preflight approval,
exact deployed frontend/backend SHA, hosted two-tenant/session/role/entitlement/
CSV/realtime E2E, manifest MIME, independent monitoring recipient acknowledgement,
private owner/support/privacy/recovery accountability, actual Neon recovery window/
permissions/quota/cost, hosted SMTP evidence and last-good rollback execution.
Local UX acceptance closes none of these requirements.

## Release boundary

Publish only after all local gates and full diff/security/artifact review pass.
Push main without force, verify successful GitHub Actions on the exact final SHA,
then create/push annotated `v2-11d-administration-experience` and verify its remote
peeled target and clean main equality. The existing checkpoint is not recreated.
The release tag identifies the final commit; no self-referential commit SHA or
previous CI run is used as proof of this release.
