# V2-12B Batch 3 — CRM, Follow-ups and appearance

2026-10-14–15. Implementation/local acceptance only. No commit, push, tag, provider
change or subsequent feature is authorized. **NO-GO FOR REAL CUSTOMER DATA;
Render Free remains staging-only.** Local acceptance is complete; this is not a
release or hosted-readiness decision. Publication requires separate approval
and exact-new-commit CI.

## Baseline and boundaries

`main`, HEAD, origin/main and fresh remote main matched accepted
`0d5ec643e1e0de8c5d8e2dee6d06903c8eb896b6`. Exact
[CI 38569953650](https://github.com/afsify/ekavio/actions/runs/38569953650) was
independently verified completed/success, attempt 1. Initially no tracked/staged
changes; only the four protected untracked strategy/V2-12A reports, whose SHA256
hashes match Batch 2. No applicable AGENTS.md found. PROJECT_CONTEXT, ADR 0029,
experience roadmap and Batch 1/2 acceptance records were reviewed.

References remain ignored, read-only and unexecuted; no installation, copying,
credentials, customer data or assets imported. All QA uses new ignored Batch 3
paths; previous screenshots/failures remain. No provider operations or hosted SQL.
Disposable local PostgreSQL fixtures are used only for the explicitly requested
local CRM/browser acceptance, not hosted verification.

## Focused source-backed comparison

Only relevant source sections were reviewed, not entire reference applications.
All four references were actually present locally. File paths below are relative
to `reference/` and do not imply adopting their business/security contracts.

| Source inspected | Verified behavior / EkaVio gap | Justified direction and API/test impact |
| --- | --- | --- |
| `biz_crm-main/frontend/src/modules/leads/KanbanBoard.tsx`; `biz_crm-main/frontend/src/modules/leads/LeadPipelinesPage.tsx`; `biz_crm-main/frontend/src/components/common/leads/LeadKanban.tsx` | Main board models per-stage pages/load-more, identity/assignee/stage buckets; older shared board filters received rows and sums value. EkaVio has canonical counts plus one server page, not that full-board API. | Ordered stage summaries and compact record actions. No received-page totals, financial values, drag/drop or full Kanban claim. Assert stage filters and paging at request boundary. |
| `biz_crm-main/frontend/src/modules/followups/FollowUpsPage.tsx` | Prominent due/assignment/category presentation and date/stat shortcuts; browser-local Day.js logic and WhatsApp/call actions are reference-only. EkaVio has manual branch-time views. | Branch-time schedule/status/assignee hierarchy, Today/Overdue/Upcoming/Completed/history shortcuts. Keep canonical completion/cancellation/version API; no messaging. |
| `biz_crm-main/frontend/src/modules/leads/LeadDetailsPage.tsx` | Actual custom-field sections, paged activity and detail grouping; additional contact/AI capabilities are incompatible/unapproved. EkaVio duplicated contact text and had flat details. | One identity header, structured canonical metadata, existing custom fields/activity/conversion actions. Preserve live-version guard, RBAC and Customer links. |
| `biz_crm-main/frontend/src/modules/Dashboard/widgetRegistry.tsx`; `biz_crm-main/frontend/src/modules/tasks/TaskTabs.tsx` | Data-backed widget registry; explicit assigned-to/by/tagged/organization work tabs. | Reuse truthful attention/navigation pattern. General Tasks is future architecture, not current implementation. |
| `le-valor-resort-wayanad-main/src/components/shared/ThemeSwitcher.jsx`; `le-valor-resort-wayanad-main/src/components/ui/ThemeProvider.jsx` | Redux boolean theme, Framer Motion rotation/scale and 300ms transitions; its displayed Sun/Moon mapping represents the action rather than current mode, generic toggle name, no System/reduced-motion logic in these components. | Original CSS-only 200ms thumb/icon control, named native switch and explicit System indicator. Do not copy branding, assets, Redux, Ant Design or animation dependency. |
| `Biz_auth-main/Front-end/src/components/common/SwitchToggle.tsx` | Native button/switch with aria-checked, disabled/keyboard paths and icon variants; optional visual label is not a programmatic button label. | Stable accessible name plus checked state; rely on native Space/Enter rather than duplicate custom keyboard toggles. Keep EkaVio identity/session implementation. |
| `Connect_v3_Front_End-main/src/modules/staff/user/components/ThemeSettings.tsx`; `biz_crm-main/frontend/src/modules/settings/components/AppearanceSettings.tsx` | Named theme/accent presets, selected feedback and preview patterns. | Reuse EkaVio's existing four accents and account persistence. No reference accent/state/API import. |

EkaVio source: `src/pages/CRM/CrmPage.tsx`, CRM `contracts.ts`,
`RelationshipRecords`, `OperationForm`, `CustomerReportFilter`, DynamicForm,
`ThemeProvider`, `useAppStore`, `sessionPersistence`, AdminLayout and Settings.
Backend `domains/crm/service.ts` independently confirms overview Today/Overdue
count **follow-ups**, while Lead attention filters return matching **leads**;
multiple actions per Lead make those cardinalities different. Summary shortcuts
now open Follow-ups, not a misleading Lead list. PostgreSQL counts, branch
business date/timezone, at-most-20-record pages and 50-stage bound remain.

## Before/after implementation

Fresh accepted Linux before journey passed 1/1, exit 0 (35.1s). Loaded mobile
CRM overview/pipeline/detail/follow-up screenshots were inspected. Gaps: tall
summary/help/filter stack before records, long names repeated in action labels,
duplicated detail information, flat due/status hierarchy and no direct header
theme choice. Before captures remain under the new QA root's
`relationships-visual/`; later invocations use distinct working directories.

- Original Sun/Moon control over the existing store: fixed geometry, native
  switch, accessible checked state and System description, 200ms CSS animation,
  reduced-motion override. OS resolution is observational, not a second store.
- Reusable native Light/Dark/System radio choices in Settings/account dialog;
  existing local fallback, serialized account PUT, accent and session contracts
  remain. Paint-only self-hosted blocking bootstrap applies validated preferences
  before React; it does not extract/persist credentials or own account authority.
- CRM identity/action hierarchy, compact mobile summary, meaningful due-actions,
  server-owned stage progression, collapsed optional filters with always-visible
  search and independent chips. PII criteria remain ephemeral, not URL/storage.
- Compact named View/Edit actions, long identity/assignee wrapping, structured
  Lead drawer with actual creation time, current stage/status, canonical/custom
  values and existing activity history. Missing dates are not fabricated.
- Manual Follow-ups have explicit five-view choices, branch-time schedules,
  pending/completed/cancelled badges, assignments and guarded existing actions.
  Existing reviewed forms, optimistic versions and conversion remain intact.

First retained browser attempt failed its viewport assertion because a blind
filter toggle opened the newly collapsed panel. Setup now explicitly closes it;
both selector/record viewport and unobstructed hit-test assertions remain.
Second attempt exposed a genuine label ambiguity between the new shortcut nav
and existing Follow-up selector; renamed only the nav. Neither failed invocation
is counted as a pass. Screenshot review compacted initially over-tall mobile
metrics. No retries, relaxed assertions/deadlines or overflow concealment.

## Local acceptance ledger — completed, with historical failures retained

First static lint/typecheck and retained components passed 28/28 (2 files), exit 0.
New theme/CRM plus retained foundation components passed 38/38 (3 files), exit 0.
Final frontend lint, typecheck and all **204/204** components (20 files) passed,
exit 0. Added components prove same-mode account sync retry without duplicating
a changed-mode save and all five canonical manual Follow-up views. Bootstrap
Node/VM tests passed **4/4** inside the normal frontend test command, exit 0,
including denied/invalid storage and legacy appearance; no storage writes.

The existing disposable PostgreSQL CRM integration suite passed **16/16**, exit
0. This is local synthetic data, not hosted readiness proof. Frontend production
dependency audit reported **0 vulnerabilities**, exit 0. Compose config passed;
the three normal application containers remained healthy and were not rebuilt.
An initial sandbox Docker socket denial was resolved with approved engine access.

The first complete new Linux matrix passed **51/51**, exit 0 (8.2m), before the
later Follow-up read guard and radio-reselection/mobile scroll changes. It is
historical evidence, not final-source acceptance. The initial extra suite was
9 pass/3 fail because its contrast diagnostic incorrectly required a `.panel`
ancestor. Measuring actual composited ancestor surfaces retained the same nodes
and **4.5:1** threshold. The corrected final-source extra suite passed **12/12**,
exit 0 (1.1m), including read-only, long-context names, archived option/stage IDs,
keyboard radios and explicit GET retry without replaying a versioned write.

The retained 31-case relationships suite finished **27 pass/4 fail**, exit 1:
three 320px pipeline hit-target assertions and one 360px dialog timeout. A
bounded diagnostic proved the mobile selector's center (y≈94) was intercepted
by the sticky header (bottom≈135), not horizontal overflow. Scoped mobile CRM
scroll padding now accounts for the header; retained setup explicitly positions
the selector with that inset rather than centering a later record. **Both original
simultaneous viewport assertions and the center hit test remain unchanged.**
The four failed journeys then passed **4/4**, exit 0 (57.9s), original 90-second
deadline and zero retries. The 360px timeout did not reproduce; no unproven cause
is asserted. Completed matrix/retained and real-API receipts are recorded below.

Earlier focused attempts (2/5, then 3/5) contained fixture/selector corrections
and two timeouts; a subsequent isolated unchanged run passed 5/5. Those failures
are retained, not counted as passes, and no timeout/retry was increased.

Baseline production build exit 0 with loopback API/socket inputs:
entry 319.97/101.70 gzip kB; CSS 85.03/16.24; CRM lazy chunk 35.67/9.11;
PWA 80 entries/1191.64KiB. Final production build passed, exit 0: entry
322.53/102.47 gzip kB (**+2.56/+0.77**); CSS 92.17/17.32 (**+7.14/+1.08**);
CRM lazy chunk 40.82/10.74 (**+5.15/+1.63**); PWA 82 entries/1207.14KiB.
Existing ineffective client dynamic-import/plugin-timing warnings remain, with
no new dependency, font, external service or decorative network call. Route
lazy loading and server paging retained. Built production preview passed all
three Light/Dark/System pre-React checks, exit 0: React entry deliberately blocked,
empty React root, correct early theme/accent, HTTP 200 JavaScript bootstrap MIME
and bootstrap included in the generated service-worker precache. No authenticated
API requests were made by this smoke.

Backend lint/typecheck/build and **196/196** unit regressions passed, exit 0.
Fresh full frontend dependency audit (including development dependencies) also
reported **0 vulnerabilities**, exit 0. The final retained test edit passed
targeted ESLint; bootstrap/review helpers passed Node syntax checks.

The later final-source two-worker matrix completed **48 pass/3 fail**, exit 1
(9.4m): 1024px Dark appearance navigation, 1024px System initial Lead loading,
and a System appearance deadline. Traces show overlapping missing-content waits
and no demonstrated application exception; a definitive environmental root
cause is **not** established. Unchanged 1024px Dark/System records and appearance
cases then passed **4/4**, exit 0 (52.2s), with one worker. This is not a clean
51-case receipt. The subsequent full, sequential one-worker acceptance sequence
retained original 10s expectations, 30s/90s test deadlines and zero retries.

That one-worker matrix subsequently passed **51/51**, exit 0 (10.9m). However,
actual screenshot review caught low/invisible inherited account text in some
1920px theme-flip captures. Passing DOM assertions alone did not close visual
acceptance. A bounded diagnostic recorded normal semantic colors and reproduced
intermediate inherited-color/surface disagreement after rapid OS flips. Removing
only the new workspace transition did not fix the mismatch. The existing global
reduced-motion rule assigned **0.01ms transitions to every element**, including
elements whose default transition property is `all`.

An isolated zero-duration diagnostic passed four rapid Light/Dark OS changes
and produced a readable 1920px screenshot. The source correction changes only
reduced-motion **transition duration to 0s**; normal 200ms Sun/Moon animation and
the existing reduced animation duration remain. No transition-end-dependent
handlers were found in application source. Added regression cases at
320/1024/1920 assert immediate inherited text colors and zero duration; all
24 appearance matrix cases now assert readable account text before capture.
This strengthens acceptance rather than waiting away or hiding the defect.

The obsolete retained run was deliberately interrupted after 12 passes:
**12 pass, 1 interrupted, 18 not run**, exit 130. None is presented as a complete
31-case result. All prior images/traces/logs are retained. The Linux QA copy now
also includes the existing frontend `.gitignore`, which had been omitted from
the isolated copy, to exclude generated evidence from automatic source scanning.
No causal claim about the earlier timeout failures is inferred from that omission.
Final post-correction frontend lint/typecheck/build passed, exit 0. The expanded
CRM/theme regression suite passed **15/15**, exit 0 (2.3m), including all three
new rapid-OS/reduced-motion cases and the retained 4.5:1 contrast checks. The
320/1024/1920 corrected account screenshots were opened and inspected: inherited
text is readable. Frontend full/production and backend production dependency
audits all report zero vulnerabilities. Completed matrix/retained/real-API
receipts follow below.

## Intended changed-file inventory

Eleven modified tracked files:

- `frontend/index.html`
- `frontend/package.json` (test command only: bootstrap contracts before Vitest)
- `frontend/src/components/ThemeProvider.tsx`
- `frontend/src/hooks/useRecordLink.ts`
- `frontend/src/components/layout/AdminLayout.tsx`
- `frontend/src/pages/Settings/SettingsPage.tsx`
- `frontend/src/pages/CRM/CrmPage.tsx`
- `frontend/src/index.css`
- `frontend/src/test/crm.test.tsx`
- `frontend/e2e-relationships-visual/matrix.spec.ts`
- `frontend/e2e-relationships/workflows.spec.ts`

Nine new intended files:

- `frontend/public/theme-init.js`
- `frontend/src/components/ui/ThemeControl.tsx`
- `frontend/src/test/themeControl.test.tsx`
- `frontend/src/test/recordLink.test.tsx`
- `frontend/e2e/crm-theme-experience.spec.ts`
- `frontend/e2e/crm-theme-regressions.spec.ts`
- `frontend/e2e/review-crm-theme.mjs`
- `scripts/theme-bootstrap.test.mjs`
- `docs/reviews/V2-12B_BATCH3_CRM_THEME_EXPERIENCE.md`

The four pre-existing untracked reports are preserved, not Batch 3 edits. QA
fixtures, logs, screenshots and generated builds remain ignored; no files staged.
No backend, migration, CI, dependency versions/lockfiles, reference or `.gitignore`
edits. The normal frontend test command now includes the four bootstrap contracts;
no additional install is required.

## Security, accessibility and QA boundaries

Source review retains PostgreSQL authority, CRM read/manage separation,
entitlements, composite tenant/branch context, versioned writes, conversion
invariants and Dynamic Forms Studio. Search remains ephemeral; bounded server
queries do not turn a received page into complete totals or financial analytics.
The new Follow-up edit read uses the scoped query cache and AbortSignal, disables
duplicate opening, reports failures and explicitly retries only the GET. Its
authority snapshot prevents a late response opening a form after scope/grant
changes. No automatic versioned write replay or invented reminder delivery.

Theme controls delegate to the existing store/account sync; the paint bootstrap
only validates and reads existing appearance fields and writes root presentation.
It never persists tokens, invents a second theme authority or weakens CSP. Native
switch/radios, selected/checked state, visible focus, Space/Enter/arrow keys,
System live changes and reduced motion are covered. Scoped contrast tests are
not a claim of a complete WCAG audit, physical-device or non-Chromium coverage.

The in-app browser bridge was unavailable (`sandboxPolicy` metadata error);
Linux Playwright/Chromium supplied local automated visual evidence instead.
Task-owned QA containers are labelled `com.ekavio.qa=v212b-batch3`. The first
disposable PostgreSQL attempt hit a Windows-reserved port and remains preserved
in Created state; the working disposable instance uses loopback port 55430.
Normal application/older QA containers, volumes and reference sources were not
discarded. Real-API test screenshots/traces are disabled by their existing
configuration to avoid capturing synthetic authentication handoffs. Only
sanitized HTTP-fixture captures are used for visual review.

## Final responsive review

The corrected source matrix passed **51/51**, exit 0 (12.3m), one Linux Chromium
worker, zero retries, unchanged deadlines. All 24 appearance cases include the
new inherited-text/zero-duration checks. Normal motion remains separately tested
at 160–250ms with unchanged control geometry; persisted pre-React Dark and
server paging/filter privacy also pass.

Evidence root: `frontend/test-results/v212b-batch3-linux/` (ignored).
`matrix-motion-final/test-results/crm-theme/` contains **168 original viewport
PNGs**. `review-records-{width}.png` and `review-appearance-{width}.png` are
**16 derived contact sheets**, all opened and reviewed. They group 144 captures;
representative originals, including long phone names, branch-time Follow-up
actions and the corrected 1920px account, were also opened at readable size.
Original captures and all earlier failures remain unchanged.

| Width | Initial Light / Dark / System review | Observations |
| --- | --- | --- |
| 320 | Reviewed | Two-column attention tiles; wrapped identity; native mode controls wrap safely in Settings; phone drawer and actions fit. |
| 360 | Reviewed | Legible Follow-up scheduling and controls; no document overflow; clear account/Appearance selection. |
| 390 | Reviewed | Strong drawer hierarchy, long assignee/name wrapping, readable notes and canonical creation time. |
| 430 | Reviewed | Mode choices fit one row; CRM tabs/cards and manual actions remain reachable. |
| 768 | Reviewed | Existing auto-fit summary can be 3+1; two-column drawer facts and contained server table. |
| 1024 | Reviewed | Desktop sidebar and context header fit; Follow-up actions, page controls and centered account dialog remain contained. |
| 1440 | Reviewed | Four aligned summary tiles, clear search/filter grouping and readable fixed-width drawer. |
| 1920 | Reviewed | Content max-width retained; no excessively stretched drawer; previously invisible account text is now readable. |

CRM captures retain their initial selected mode (System resolves to the emulated
Dark OS). Appearance/account capture filenames name the **initial test mode**:
the sequence deliberately ends in **System/Dark**, after testing explicit modes
and live OS Light/Dark changes. Those images are not falsely presented as three
different final palettes. Scoped contrast, keyboard, focus restoration and
native selected-state assertions supplement visual inspection.

Before comparison: accepted-source `relationships-visual/390-light-*.png`;
after comparison: `matrix-motion-final/test-results/crm-theme/390-light-*.png`.
No hosted screenshots or real customer data are used. The final retained
relationships matrix passed **31/31**, exit 0 (9.1m), including all eight widths,
three modes, Lead/create/review/conversion/Follow-up forms, Supplier/Purchasing
regressions, read-only/empty/error states and short-phone footer/focus/discard.

The first real-API CRM suite finished **14 pass/1 fail**, exit 1 (2.7m). Its
768px Light case remained at login with a pending/disabled submission at the
unchanged 10-second URL expectation, not an observed credential rejection. A
bounded equivalent workflow with metadata-only observers passed **1/1**, exit 0
(14.5s): browser login returned HTTP 200 in approximately 235ms and subsequent
refreshes succeeded. No bodies, headers or credential values were recorded by
that observer. The original delay's cause remains **unverified**; no login,
timeout or rate-limit source change was made. The unchanged original 15-case
suite subsequently obtained clean receipts, detailed below.

Important artifact boundary: Playwright error-context snapshots can contain
**disposable synthetic fixture credentials**, even with real-API screenshots and
traces disabled. The entire QA tree remains ignored, unstaged and unpublished;
do not include it in a publication commit or public artifact handoff. No real
customer/provider credentials are used in these workflows. Earlier failures
are preserved rather than silently overwritten. Completed shared-shell/Customer
and remaining real-API acceptance receipts are recorded below.

## Final scope/error-path review

The unchanged original CRM real-API rerun passed **15/15**, exit 0 (2.3m).
The first six-case real relationships invocation was **4 pass/2 fail**, exit 1
(2.1m). The sort case tried to select a control inside the newly collapsed
filters; its setup now opens the actual panel, keeps every original assertion,
and additionally checks the server's successful `sort=oldest` response.

The CRM scope case exposed a genuine deferred deep-link cleanup race: a new
workspace could mount against the old Router location before replacement
committed and reopen an old Lead dialog (the server correctly returned not
found in the new branch). A URL-ready precondition made the diagnostic pass,
but **was removed as an application fix**. A deterministic frozen-Router unit
test reproduced it against the old hook (**1 pass/1 fail**, exit 1). The hook
now records consumed field names in a **WeakMap keyed by that exact Router
location object**, not IDs or persistent storage. Forced remounts cannot reuse
that stale location; unrelated query criteria and fresh explicit history entries
remain supported. The initial corrected unit rerun passed **2/2**, exit 0;
full gates now include a third explicit-navigation regression. The real scope
test retains its original immediate actions and no-dialog assertion, adding
only a post-switch URL-consumption assertion. No deadlines/retries are relaxed.

Review also closes the failed Follow-up read's Retry path after management
revocation: both the read and its success callback require current management
authority, and the error has no Retry action for a read-only user. The existing
late-authority component assertion now explicitly checks absence of that action.
Server authorization was always retained; this is a client-side editor guard.

Layout/theme source is unchanged by these final guards. Passed visual/theme
matrices are retained; affected deep-link, permission, conversion, Customer and
error-path checks are rerun against the guards rather than repeating unrelated
expensive screenshots. Final post-guard frontend lint/typecheck/build, **4/4**
bootstrap contracts and **204/204** components (20 files) passed, exit 0.
The final six real relationship workflows passed **6/6**, exit 0 (1.8m), with
the original immediate scope-switch actions. The final focused browser guards
passed **15/15**, exit 0 (2.3m), and the final-code CRM real-API rerun passed
**15/15**, exit 0 (2.6m). Fresh-device account preference persistence passed
**3/3**, exit 0 (34.0s), including Light reselection, Forest accent and live OS
changes in System. The retained shared-shell/keyboard/accessibility/Foundation
selection passed **51/51**, exit 0 (6.1m). Dedicated retained Customer acceptance
passed **32/32**, exit 0 (5.1m), including all eight widths and three modes,
server paging/filter reset, uncertain-create protection, scope/deep links,
configuration retries, denied reads, retained drafts and mobile focus.

### Final acceptance receipts

All rows below completed with exit code **0**. Counts exclude historical failed,
interrupted and diagnostic invocations; there is no new remote CI run for this
uncommitted source.

| Gate | Final result | Evidence / source matching |
| --- | --- | --- |
| Frontend lint / typecheck / production build | PASS | Final source after both authority/deep-link guards |
| Bootstrap contracts / component tests | 4/4 + 204/204 (20 component files) | Normal frontend `npm test`, final source |
| Backend lint / typecheck / unit / build | PASS; 196/196 units | Backend source unchanged throughout |
| Disposable PostgreSQL CRM integration | 16/16 | Includes parent test; schema, versions, conversion, scope, custom fields and time contracts |
| New CRM/theme responsive matrix | 51/51; 12.3m | `matrix-motion-final`; final visual/motion source, later nonvisual guards covered below |
| Retained relationships visual matrix | 31/31; 9.1m | `retained-motion-final`; same visual-source qualification |
| Focused final CRM/theme guard regressions | 15/15; 2.3m | `guard-regressions-final`; final source |
| Authenticated disposable CRM journeys | 15/15; 2.6m | `real-crm-guard-final`; final source |
| Authenticated retained relationships | 6/6; 1.8m | `real-relationships-final-run`; final source, immediate scope actions retained |
| Fresh-device account preferences | 3/3; 34.0s | `real-preferences-accepted`; final source |
| Foundation / keyboard / a11y / shared-shell selection | 51/51; 6.1m | `shared-shell-accepted`; final source; representative Customer, Queue, Settings, CRM and Dashboard |
| Retained Customer acceptance | 32/32; 5.1m | `customers-accepted`; final source |
| Production bootstrap smoke | 3/3 | Repeated after final build with React entry blocked; Light/Dark/System, MIME and precache |
| Dependency audits | Zero vulnerabilities | Frontend full + production; backend production (not backend full development audit) |
| Docker | Config valid; three normal services healthy | No unnecessary normal-image rebuild; only isolated QA used for tests |

The eight completed browser selections total **204 distinct selected cases**
(51+31+15+15+6+3+51+32), not 204 newly authored cases or a full-repository CI
claim. Logs live under the ignored QA root; raw failing receipts remain there.
Full final frontend static/unit gates plus retained Customer, shared-hook and
real relationship tests cover the last nonvisual changes; unchanged visual
matrices were not needlessly repeated.

### Final review and remaining limits

All 20 intended files were reviewed, with an empty index and no provider/code
publication. The four protected planning reports and canonical V2-10 register
retain their original hashes. Backend source, migrations, CI, lockfiles,
`App.tsx`, `.gitignore` and references are unchanged. Secret-pattern and artifact
checks found no sensitive artifacts in intended changes. Generated builds,
screenshots and ignored synthetic-credential error contexts must stay out of Git.

No essential selected local regression remains failing. Earlier non-reproducing
timeouts remain unexplained and recorded, rather than attributed speculatively
to Linux or declared never to have happened. Coverage is Linux Chromium with
automated local fixtures and scoped accessibility/contrast checks, not complete
WCAG certification, Safari/Firefox, physical-device or hosted acceptance.
Tablet auto-fit attention tiles can use a 3+1 arrangement without clipping;
some viewport captures show only the beginning of a below-fold Follow-up card,
supplemented by readable full-card originals. Existing build warnings remain.
No new product feature, My Work implementation or pilot GO decision follows.

### Final Git and QA handoff

Final `main`, HEAD, origin/main and fresh remote main still equal
`0d5ec643e1e0de8c5d8e2dee6d06903c8eb896b6`. The working tree intentionally has
11 modified tracked files and nine new intended files, plus the four unchanged
protected untracked reports (24 status entries). Nothing is staged. No commit,
push, tag, deployment, provider mutation or remote CI trigger was performed.
`git diff --check` passes; Git's LF-to-CRLF notices are informational.

After acceptance, the verified task-owned API on loopback 5011 and the two
label-verified Batch 3 QA containers were stopped. Their containers, files,
evidence and volumes were preserved; the unsuccessful reserved-port container
remains Created. No claim is made that forced Windows process termination
executed the QA server's graceful database-drop handler. Normal application
services remain healthy and older QA services were not stopped. Publication
requires separate owner approval followed by review and exact-commit CI.

## Future feature priorities — proposals, not implementation

| Feature | Value / target | Existing capability / missing backend | Complexity / security / cost | Recommendation |
| --- | --- | --- | --- | --- |
| My Work / Team Tasks | High: staff own due work; managers assign/review | CRM Follow-up type `task` is Lead-linked; HR My Work is leave/calendar, not a general task authority. No general Task routes/schema found. Needs separately approved aggregate/API/RBAC. | Medium-high; branch/assignee privacy, concurrency, audit, recovery. PostgreSQL/storage cost; no paid adapter required. | Next separately approved architecture batch, then small implementation batches. |
| First-run guided setup | High: owners/admins reduce empty-workspace friction | Existing organization/branch/stage/forms operations and permissions; no approved new setup-progress API | Low-medium UI direction; no inferred grants or auto-seeding. No new running service. | Pilot-usability audit/prototype after explicit approval. |
| Role-aware shortcuts / Forms Studio discovery | High: staff find existing work | Navigation/grants and current authorized attention links exist | Low; preserve RBAC/entitlement, avoid hidden capability claims; no new cost. | Bounded existing-capability UX batch. |
| Full drag/drop CRM / bulk edits/import | Medium-high: sales managers | One Lead page and versioned commands; requires board paging, batch commands/import validation and conflict model | High; data leakage, atomicity, duplicate imports, resource bounds | Separate backend/security scope, not a visual approximation. |
| Automated reminders / WhatsApp / omnichannel / enquiry capture | Hypothesis: potentially valuable, not verified demand | Manual follow-ups only; missing consent/delivery/outbox/provider/retention contracts | High; PII, opt-out, delivery/idempotency, recurring provider charges | Validate demand and review adapters/cost before approval. |
| Payment automation / payroll / accounting / POS | Hypothesis: transaction breadth | Current billing/dues/purchasing are not these authorities | Very high; money, statutory/financial rules, reconciliation/security/provider costs | Independent domain milestones, not CRM enhancements. |
| Kiosk / biometric / hardware | Hypothesis: some attendance/retail users | No approved device/biometric contracts | High; sensitive data, device trust/support and equipment costs | Discovery and privacy/security approval first. |
| AI assistants | Hypothesis: unverified ROI | No authorized LLM service or AI data boundary | High PII/correctness risk, external inference charges | Defer pending requirements, authorization and cost proof. |

### Proposed My Work architecture direction

Stories: staff view/update their assigned scoped work; managers assign, reassign
and see authorized branch work; overdue uses server business time. Separate
`tasks.read_own`, `tasks.manage_own`, `tasks.read`, `tasks.manage` proposals, not
new existing grants. Membership/branch/tenant composites and live grants enforce
visibility server-side; operators get no automatic tenant bypass.

Propose a tenant/branch `work_tasks` aggregate (bounded title/details, creator and
assignee membership, server due instant, canonical status, version, timestamps),
immutable `work_task_events`, constrained composite foreign keys and indexed
bounded own/team queries. Exactly define terminal/reactivation policy before
coding. Versioned transitions, transaction locks/audit, uncertain-create safety
and reviewed idempotency prevent duplicates or lost updates. No hidden task
creation from CRM; any Lead link is explicit and composite-constrained.

Notification writes would use the existing scoped transactional notification boundary only after approval;
no automatic external delivery/scheduler inferred. Acceptance needs own/team
RBAC, branch/tenant negatives, revoked memberships, concurrent update/conflict,
due-time boundaries, pagination, recovery count/referential checks and retained
CRM/HR regressions. Additive migration, backup/restore acceptance and count-only
recovery matrix updates require separate milestone approval. Maintenance includes
permission catalogue, retention, bounded jobs and ongoing solo-developer support.

## Controlled release preparation — 2026-10-15

Subsequent explicit owner approval permits one normal commit and push of exactly
the 20 inventory files, then exact-new-commit CI and read-only verification of
the named Render frontend. Earlier local-only authorization/receipts above are
historical, not a prohibition overriding this approval. No completion tag,
provider changes, backend alignment, hosted authentication or later feature is
approved. The immutable commit/CI/deployment result belongs in the release
handoff, not a self-referential amendment or additional evidence commit.

Fresh main/HEAD/origin/remote checks matched the accepted starting SHA. Baseline
CI38569953650 was reverified completed/success, attempt 1, on that exact SHA.
The four protected reports and both canonical V2-10 files retain their recorded
SHA256 values. The report-derived 20-file inventory matches the actual 11
modified/nine new files; nothing else is intended for publication. Complete
frontend source/public trees match the preserved Linux QA copy byte-for-byte.
The two final nonvisual guards and their source-matched passing regressions are
already distinguished from unchanged retained visual paths above. Earlier
failed/interrupted runs remain preserved, not recast as successes.

Fresh release lint and TypeScript passed. The initial full component invocation
finished **203 pass/1 fail**, exit 1: the read-only CRM empty-state test still
showed mocked queries loading at its unchanged wait deadline. An unchanged
isolated diagnostic passed **1 selected case** (11 unselected cases, not counted
as mandatory passes). The complete unchanged suite then passed **204/204** in
20 files, exit 0, with one worker, plus **4/4** bootstrap contracts. No test
assertion, timeout, retry policy or application source was changed.

The first fresh focused Chromium invocation was **14 pass/1 fail**, exit 1:
320px reduced-motion navigation exceeded the original 30s deadline before any
theme assertion. Its trace shows document, bootstrap and several scripts HTTP
200 but pending Vite module responses; the captured page is blank. The precise
underlying delay is unverified, not asserted to be a product or Linux defect.
After inspection and completion of the static/component workload, the unchanged
15 cases plus three focused pre-React/motion/server-paging cases ran sequentially
and passed **18/18**, exit 0 (1.8m). Original deadlines and zero retries remain.
This bounded diagnostic rerun is not an automatic retry or extra unique coverage.

Production/PWA build passed, exit 0, with the identical loopback build inputs:
entry **322.53/102.47**, CSS **92.17/17.32**, CRM **40.82/10.74** decimal kB/raw
and gzip; precache **82 entries/1207.14KiB**. Lazy chunks remain separate and no
speed improvement is claimed. Existing ineffective dynamic-import/plugin timing
warnings remain. Representative retained 320px records and 1024px appearance
sheets were reopened and reviewed; appearance prefixes still denote initial
mode, as documented. No material source/visual defect requiring redesign found.

Release evidence lives under ignored `frontend/test-results/v212b-batch3-linux/`
in distinct `release-preflight-20261015*` paths. These fresh runs overlap retained
coverage and are not added to the 204 distinct selected browser-case total.
Full source/security review found no backend/schema/dependency/reference import,
new external request, invented metric, secret or authority relaxation. Normal
services and protected readiness records remain independent. Release acceptance
requires successful exact-new-commit mandatory CI and actual deployment/public
smoke evidence; neither is assumed from local checks or automatic deploy status.
**NO-GO FOR REAL CUSTOMER DATA; Render Free remains staging-only.**
