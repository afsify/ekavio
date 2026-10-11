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

## Historical local gates at the first D commit

These results belong to `b1846b77439e84c0393f0f7cbd504ca9c8290a64` before its
first push. They are not Linux CI acceptance or proof for a later correction.
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

## Linux CI investigation and final correction

The first pushed D commit `b1846b77439e84c0393f0f7cbd504ca9c8290a64`
failed [CI run 38121116223](https://github.com/afsify/ekavio/actions/runs/38121116223),
foundation job `114415875261`. The D visual step passed 62/65; the three
320px Light/Dark/System journeys failed the unchanged document-width assertion
at the loaded renewal screenshot. Earlier local 495-case success did not
constitute Linux acceptance. No completion tag was published for that commit.

Resume inspection found main, origin/main and fresh remote main at that SHA,
with no staged or untracked project changes before this correction. Existing
ignored Linux diagnostics and the downloaded sanitized CI artifact were retained.
The checkpoint remains at the accepted C baseline; no checkpoint was recreated.

The CI runner used Ubuntu 24.04, Node 20.20.2 and Playwright 1.63.0 /
Chromium 153.0.8010.12. A clean, unchanged-lockfile install in the matching
official Playwright Noble image provided Linux-native Vite/Tailwind and Chromium.
That image's Node 24.20.0 is a documented local harness difference, not a
repository upgrade; final GitHub acceptance must use the workflow's Node 20.
The default container WenQuanYi font concealed document-level overflow, while
DejaVu Sans reproduced CI's failure. Installing those fonts only in disposable
QA did not change application fonts or dependencies.

| 320px geometry | Before, DejaVu Sans | Corrected |
| --- | ---: | ---: |
| Viewport / HTML client width / DPR | 320 / 320 / 1 | 320 / 320 / 1 |
| Document and body scroll width | 325 | 320 |
| Renewal wrapper width | 246 | 246 |
| Grid track / direct card width | 288 | 246 |
| Direct card right edge | 325 | 283 |
| Filled date control width | Intrinsic sizing pushed the card outward | 220 |

An implicit minimum-content grid track inherited native form-control pressure.
WenQuanYi yielded a still-incorrect 279px card inside the 246px wrapper, but its
right edge (316px) stayed within the document. Thus Linux-browser tests against
Windows assets passing earlier did not rule out the defect. Explicit zero-minimum
tracks and shrinkable direct children remove the cause. Phone detail padding is
12px, returning to 20px at 640px. Screenshot review then caught a 1024px nested
two-column date field clipping despite document containment; `auto-fit` form
columns now respond to card width, with a 240px preferred minimum capped at 100%.
The existing desktop outer split is retained. No global overflow clipping or
font-size reduction is introduced.

The three original 320px journeys passed after correction, followed by a full
65/65 Linux run. After the final screenshot-driven refinement, a fresh D
matrix passed 65/65 and the affected commercial regression passed 24/24.
Permanent coverage retains every
original assertion/deadline and zero retries, adds direct-card containment and
a 220px date-control minimum, and captures the filled payment form. The case
count remains 65; diagnostic repetitions are not new product acceptance cases.

Development initially served cached pre-edit modules from the Windows mount;
a read-only served-source check proved the mismatch. Fresh QA server processes
served the actual correction. An initial build/preview lacked mandatory public
API URLs and stopped safely; explicit loopback QA URLs resolved setup. One
production comparison was declined because automatic approval review exhausted
its usage limit; it did not execute and is not a test failure or pass. The
normally approved resumed comparison passed. Hosted credentials were never used.

During the final refinement, concurrent QA builds/dev serving produced navigation
interference (including an explicitly destroyed execution context), not a renewed
overflow failure. The incomplete foundation attempt had 36 passed, four failed,
two interrupted and 19 unrun; the incomplete D attempt had four passed, two
failed, one interrupted and 58 unrun. Neither is counted as a passed suite.
Only those identified QA runners were stopped and their evidence retained. The
container's missing frontend ignore file was restored; native Linux and Windows
production CSS then matched (`index-BGP7c20E.css`, 75.80 kB / 14.83 kB gzip).
Remaining local suites use fixed Linux production assets, sequential suite
execution, original suite workers/deadlines and zero retries. CI retains its
unchanged fresh Linux development-server workflow.

Final native Linux production renewal diagnostics passed 24/24 combinations;
the original three full 320px development journeys also passed 3/3 after the
last form-grid change. Measured date widths are 220px at 320px and approximately
329px at 1024px. All eight focused payment/review contact sheets (48 actual
screenshots across Light/Dark/System) and representative full-resolution originals
were inspected. These diagnostics supplement, not inflate, the 495 distinct
retained product-browser cases. Earlier 26 full administration/state contact
sheets were also inspected; the final refinement changes only renewal form sizing.

The final 65-case Linux production run completed in 10.3 minutes. All 26 newly
generated administration/state contact sheets were visually reviewed again,
covering all eight widths and three themes, with full-resolution 320px payment
and review and 1024px payment originals checked separately. The ignored
`frontend/test-results/linux-release-administration/` contains 887 original
frames (35 loaded journeys across 24 combinations, 42 state frames and five
special frames) and 26 contact sheets. Earlier diagnostic artifacts are preserved.

### Final corrected-source local gates

Completed runner exit codes and retained logs were recovered, not inferred from
partial output. Final frozen Linux suites ran sequentially, without retries.
The previously failing/interrupted 1920px Light/Dark foundation journeys and
390px shell case passed in the complete 61/61 foundation rerun. No incomplete
attempt contributes to the following totals.

| Gate | Final result |
| --- | --- |
| Backend lint / typecheck / unit / build | Passed; 196/196 unit tests. Backend source is unchanged by the layout correction. |
| Database integration | 34 files, 328/328 tests; zero failures/skips; isolated disposable PostgreSQL and legacy-test Mongo fixtures. |
| Frontend lint / typecheck / component / build | Passed after the final form-grid correction; 121/121 component tests; Windows and native Linux production builds passed. |
| Recovery / security / source contracts | Root operations contracts 23/23; Mongo-source contract 4/4. |
| Dependency audits | Four backend/frontend full and production-only audits; zero vulnerabilities; lockfiles unchanged. |
| Real PostgreSQL browser workflows | 163/163 across the 12 retained suites listed above. Affected commercial 24/24 rerun after the last layout edit is a repeat, not an inflated distinct-case total. |
| Final Linux presentation regressions | Administration 65/65, foundation 61/61, daily operations 175/175, relationships 31/31: 332/332. |
| Distinct product browser total | 495/495 = 163 real PostgreSQL + 332 sanitized presentation cases. Supplementary 24-combination diagnostics and three original 320px development reruns are recorded separately. |
| Docker runtime | Config/build/up passed; three healthy services; live/ready/root/login HTTP 200; bounded logs free of runtime-error/sensitive-value matches. |

Only the renewal page, semantic renewal CSS, strengthened visual regression,
acceptance report and source audit changed in this correction. Original document
overflow, dialog/focus/occlusion, commercial authority and security assertions,
deadlines and zero-retry policy remain unchanged. No CI configuration, dependency,
backend, migration, secret or hosted setting changed. README, PROJECT_CONTEXT,
ADR 0029 and the V2-11 roadmap already describe the implemented scope, deferred E
work and independent NO-GO restrictions; their existing boundaries remain valid.

Final source builds on Windows and Linux passed: 435 modules, main entry
317.61 kB / 101.01 kB gzip, shared client 99.54 kB / 33.89 kB gzip, CSS
75.80 kB / 14.83 kB gzip, PWA 78 entries / 1144.38 KiB. The existing mixed
static/dynamic API import warning remains. Docker rebuilt the final frontend;
all three services are healthy, live/ready/root/login returned HTTP 200 and a
bounded 150-line/service, ten-minute runtime/security scan found zero matches.

## Performance, security and exclusions

Historical first-D production build: 435 transformed modules; main entry 317.61 kB / 101.00 kB gzip,
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
