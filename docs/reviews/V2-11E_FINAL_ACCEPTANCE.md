# V2-11E unified experience and Forms Studio acceptance

2026-10-13. **LOCAL ENGINEERING ACCEPTANCE PASSED.**
Release publication requires complete exact-final-commit CI and verified annotated tag.
**NO-GO FOR REAL CUSTOMER DATA remains unchanged. Render Free is staging-only.**

## Accepted starting evidence and recovery

Batch 1: `c8ec6ce86b3f8ca2a4c79daa42e8e99f2195ce02`,
[successful CI 38169434367](https://github.com/afsify/ekavio/actions/runs/38169434367).
Batch 2: `2a410b82028b48253aab3487d5816484d291c98b`,
[successful CI 38223216993](https://github.com/afsify/ekavio/actions/runs/38223216993).
Batch 3: `5f2be374827bf796cb2293b2464d70bb9f63a4be`,
[successful CI 38248440892](https://github.com/afsify/ekavio/actions/runs/38248440892).
Batch 4 independently checked the complete Batch 3 workflow, exact SHA and all
82 successful job steps before implementation. Recovery reconfirmed main,
HEAD/origin/fresh remote at that SHA and preserved the in-progress source/tests.

The original annotated `pre-v2-11e-unified-experience-forms-studio` remains:
tag object `89bd5c5b99f45a42c083e50f477e4e2585863e8d`, peeled commit
`3bfc3baf9359c3270f447eb2789557b74f32c463`, verified locally and remotely.
No checkpoint recreation, history rewrite or working-change discard occurred.
Required context, roadmaps, ADRs 0023/0029, A–D and Batch 1–3 acceptance and
V2-10 evidence/NO-GO/runbook were reviewed. No applicable AGENTS.md was found
in the parent/root/nonreference source scan. Reference sources were not revisited.

The historical [source audit](V2-11E_SOURCE_AUDIT_AND_PLAN.md),
[Batch 1](V2-11E_BATCH1_FIELD_CATALOGUE.md), [Batch 2](V2-11E_BATCH2_LAYOUT_STUDIO.md)
and [Batch 3](V2-11E_BATCH3_ENTITY_FORMS.md) reports remain preserved.

## Bounded cross-domain source audit

Except explicit full paths, frontend source paths below are relative to `frontend/src/`.
Classification: A correctness/security; B accessibility/responsive;
C useful correction using existing APIs; D cosmetic deferred;
E capability needing separate backend/security approval.

| Area / exact source | Finding and disposition |
| --- | --- |
| Dashboard; `pages/Dashboard.tsx`, `components/layout/{AdminLayout,TenantSwitcher}.tsx`, `components/layout/navigation.ts` | Existing server facts, permission-derived destinations, context unmount/cancel/clear and guarded switching retained. Dashboard's actual query family is `dashboardStats`; mismatched consumer refreshes below were corrected (C). No invented upcoming-work or forecast data. |
| Customers / Services; `pages/Customers/CustomersPage.tsx`, `pages/Services/{ServicesPage,ServiceEditor}.tsx`, `components/forms/CustomerFormFields.tsx` | Canonical server paging/CORE permissions, details/shared fields, exact captured Service review, uncertainty guard and historical values retained. No new redesign or API. Broader optimistic Service concurrency requires backend approval (E). |
| CRM / Follow-ups; `pages/CRM/CrmPage.tsx`, `hooks/useOperationalContext.ts`, `hooks/useNotifications.ts` | Source used nonexistent `dashboard` and singular `notification` invalidation keys. Component regression reproduced stale caches; corrected actual keys and confined refresh to submitting authority/account/tenant/branch (C). Existing versions/conversion/manual Follow-ups unchanged. |
| Queue / Appointments / Attendance; `pages/Queue/QueuePage.tsx`, `pages/Appointments/AppointmentsPage.tsx`, `pages/Attendance/AttendancePage.tsx` | Reviewed canonical commands, independent permissions/entitlements, UTC/branch time, retained correction facts, server pages/roster semantics and safe keys retained. Retained workflow/visual acceptance required; no new scheduling or attendance semantics. |
| Dues / Inventory / Purchasing; `pages/Ledger/LedgerPage.tsx`, `pages/Inventory/InventoryPage.tsx`, `pages/Purchasing/{SuppliersPage,PurchasingPage,forms}.tsx` | Exact monetary/quantity displays, reviewed append-only commands, blank actual receipts, canonical stock links and protected reversals retained. Complete paging/filters remain server controlled. Returns/accounting/amendments remain E. |
| Staff / Roles / Organization / Branches; `pages/Staff/{StaffManagementPage,StaffAccessCards}.tsx`, `pages/Settings/OrganizationPage.tsx` | Scoped directories, canonical replacement permissions, reviewed invitations/access and 200-row directory bound retained. Complete Branch/Staff paging is E, not client sorting of a received subset. No global identity or operator privilege changes. |
| HR Plus; `pages/HR/HrPage.tsx`, `pages/HR/forms.tsx`, `pages/HR/contracts.ts` | Source invalidated nonexistent `dashboard`/plural `reports` keys. Successful-request regression reproduced mismatch; corrected `dashboardStats`/`report` with account/tenant/branch prefixes (C). Whole days, privacy, UTC, versions, reviewer coverage and independent Attendance remain canonical. |
| Reports / Notifications; `pages/Reports/ReportsPage.tsx`, `pages/Notifications/{NotificationsPage,NotificationPreferences}.tsx`, `components/analytics/NotificationBell.tsx` | Curated report filters, scoped page caches/export snapshot and own inbox/category/bulk-read semantics retained. Correct consumer refresh above reuses these query keys. Arbitrary report builders/general messaging are E; further cosmetic popover polish is D. |
| Billing / manual Commercial; `pages/Billing/BillingPage.tsx`, `pages/Commercial/{CommercialRequestsPage,CommercialActivationPanel,CommercialRenewalsPage}.tsx` | Existing captured authority, separate operator access, exact negotiated/manual settlement, frozen history, reviewed commands and proven keyed retries retained. No new payment provider, automatic billing or optimistic financial facts. |
| Data & Forms; `pages/Settings/CustomFieldsPage.tsx`, `components/forms/`, `hooks/{useDynamicForm,useLayoutStudio,useLayoutNavigationGuard}.ts` | Accepted six entities/13 types, catalogue, immutable definition/options, frozen layout snapshots, preview, historical values and forced-denial teardown retained. Conditional/formula/uniqueness/field security/variants/new entities are E. |
| Profile / Settings; `pages/Settings/SettingsPage.tsx`, `pages/Identity/EmailSettings.tsx` | Delayed Profile success could rename a replacement account (A). Regression failed before correction. Account-keyed subtree, pre-dispatch identity check, request abort on replacement/unmount and guarded completion prevent old draft/name restoration. No profile cache clearing or new request/API. |
| Public / account / onboarding; `pages/Login.tsx`, `pages/Identity/AccountActionPage.tsx`, `pages/Onboarding/OnboardingPage.tsx`, `components/layout/PublicLayout.tsx` | Login lacked a main landmark, current-password autocomplete and durable form failure feedback; onboarding loading/errors lacked announcement roles (B). Narrow semantic corrections retain branding/themes, server identity/invitation/quote authority and memory-only action tokens. Public/account eight-width matrix added. |

The audit is bounded source review and browser regression acceptance, not a
claim that every legacy expression or every assistive technology is certified.
D/E findings do not enable placeholder actions or expand product capabilities.

## Actual Batch 4 corrections

Profile request abort cannot establish that a previously dispatched server write
did not commit; the correction protects client identity and late-result handling.
Existing server authentication owns the account update. Failed writes retain
the original draft and visible failure feedback. Account replacement remounts
the draft; successful old responses cannot restore the previous account/name.
Normal saves still succeed. No credential persistence, session policy, identity
database or invitation semantics changed.

`components/ui/ProfileSettingsModal.tsx` had a delayed success that also cleared a replacement account's
session. A focused reproducer failed (5 passed/1 failed); the modal now checks
the submitting identity before dispatch/completion and aborts on identity
departure/unmount. Normal password changes retain server revocation and re-login.
An aborted request does not prove that its server write did not commit.
Real browser regressions hold responses only after actual PostgreSQL-backed
writes commit; they are not substituted by mocked visual evidence.

CRM/HR refreshes match actual scoped queries. They do not clear the QueryClient
or invalidate foreign tenants' Dashboard/report/inbox projections. Existing
entity write routes and server authorization are unchanged. Pending command
review and original optimistic-version/idempotency rules remain intact.

Login keeps existing headings, links, theme classes and authentication API;
its failure is a single persistent inline alert rather than a duplicated toast.
Screenshot inspection and a contrast regression exposed the existing low-contrast
Forgot password link on the existing dark-theme Login card. Its existing indigo
shade is now lighter; the public dark accent was already correct and unchanged.
The regression requires 4.5:1 on the composited card background. Onboarding status/error
roles announce existing text without exposing tokens or response internals.

## Acceptance register

Recovered backend lint/typecheck/build and 196/196 unit tests passed, exit 0.
All 34 isolated integration files passed 328/328, zero failures/cancellations/skips;
Final real browser evidence is recorded below.
Preflight's first invocation omitted POSTGRES_TEST_URL and failed setup; the
correctly configured rerun passed 17/17. Mongo source contract passed 4/4.
Root encryption/tooling/watchdog/hosted/final-evidence contracts passed 23/23.
Their initial approval-limited invocation did not execute and is not a test
result. The newly approved run passed. Four dependency audits passed with zero
vulnerabilities. No package, lockfile, image pin, environment or key changed.

Initial account reproducer: 1 passed/1 failed; corrected 2/2. CRM cache reproducer:
7 passed/1 failed; HR cache reproducer: 8 passed/1 failed. Full initial frontend
components passed 176/176. Final account/logout/failure and scoped CRM/HR focused
regressions initially passed 21/21 across three files, exit 0; the later focused
account/password/CRM/HR run passed 24/24, and final full components cover all 181.
A sandboxed early component
runner stalled before results and was stopped; it contributes no pass.

Earlier frontend checks passed 178/178; later 179/179 passed before the password
regressions. A build lacking required VITE_API_URL failed configuration, then a
correctly configured local build passed. The final typecheck caught an unsupported
Testing Library `exact` option in the new password tests; anchored accessible-name
expressions preserve exact matching. The corrected full frontend rerun passed
lint/typecheck/build and 181/181 components in 16 files, all exit 0.
The retained Linux suites passed 442/442: foundation 61, operations 175,
relationships 31, administration 65, fields 28, layout 31, entity forms 51.
The initial public/account matrix passed 25/25 before the final contrast checks.
The updated run passed 24/25; one original-deadline Login load timed out. The
isolated same case passed 1/1, without assertion/deadline changes. A complete
isolated updated matrix then passed 25/25, exit 0 (4.9 minutes), including the
originally timed-out case. Final sanitized Linux acceptance is 467/467: the
retained 442 plus these 25. Partial results were not counted as full acceptance.
The complete real PostgreSQL browser runner passed 173/173: identity 12,
organization administration 18, fields 23, analytics 13, commercial 24, CRM 15,
purchasing 18, HR 15, experience 10, operations 13, relationships 6,
administration 6. The fresh-database final identity rerun including two new
password cases passed 14/14, exit 0; final real workflow total is 175/175, replacing
rather than double-counting the earlier 12. Automatic Windows web startup initially timed out before tests;
the documented external-server mode completed using owned loopback QA servers.
The first 14-case identity attempt passed 13 and failed one: the new race journey
tried to click shell sign-out through an open modal overlay. The corrected journey
uses the existing Cancel action, asserts dialog departure, then signs out while
the committed response remains held. No force-click, weaker identity/cookie
assertion, changed timeout or retry was introduced. The corrected focused case
passed 1/1 and the complete fresh-database rerun passed 14/14. Lint/typecheck
after the journey correction passed again. The initial readiness probe preceded
QA startup; before the final run the readiness probe returned 200. Test workers
used only the ready loopback server and disposable fixtures.
Full Compose build passed before the password fix; the final affected frontend-only
rebuild passed afterward. All three normal services are healthy; live/ready/home/
login returned HTTP 200. Bounded logs were read and contained no runtime errors.
Local PostgreSQL 17, tooling image pins and persistent volumes remain unchanged.
Normal publication is permitted only after the final staged review and complete
successful CI for the resulting exact commit. No local UI result constitutes pilot GO.
No incomplete run will be counted as acceptance. Original assertions, deadlines
and zero-retry policy are preserved.

## Accessibility, responsive evidence and performance

The existing managed browser could not bootstrap because sandboxPolicy metadata
was absent. Repository Playwright/Chromium supplies the authorized fallback.
Real disposable PostgreSQL journeys remain separate from sanitized visual DTOs.
Authenticated traces/screenshots are disabled/excluded. QA evidence stays ignored.

Required widths: 320/360/390/430/768/1024/1440/1920px, Light/Dark/System.
The new public/account matrix covers loaded home/Login/recovery, persistent
failure, generic recovery status, missing onboarding/action links, keyboard
menu containment/return, live System transition and reduced-motion preference.
Its doubled-root-font case is a text-resize approximation, not physical-device
or browser-zoom certification. Retained A–D/Batches 1–3 add loaded business
forms/details/reviews, native-control bounds, footers, context and denial states.
All 27 foundation contact sheets and all 24 sheets for each retained suite were
loaded and inspected, plus two administration state sheets and representative
native-form/detail/review originals. PNG inventories respectively:
298/379/523/913/220/292/604. Tall sheets provide layout overview, not certification
of every text pixel. All 24 corrected public/account matrices were loaded and
reviewed, plus originals for 320 Dark Login error, 390 doubled text, 1024 Light
onboarding and full-page 1440 Dark public content. Final public inventory:
193 originals plus 24 sheets = 217 PNGs. No new visual blocker was found; the
single durable error and readable Login link are visible. Native input placeholders
can truncate at doubled text; controls remain reachable and input values scroll
natively. Screenshots are ignored, sanitized presentation evidence, not hosted
session proof or certification of all WCAG criteria/assistive technologies.
Linux QA used the retained pinned Playwright 1.63.0 Noble container and Node 24.20.0;
the published CI independently checks its established Node 20.20.2 runtime.

Accepted Batch 3 build: 444 modules; entry 319.55 kB/101.59 kB gzip;
CSS 78.69/15.32 kB; Services 11.37/3.88 kB; CRM 35.63/9.09 kB;
79 PWA entries/1179.34 KiB. Final configured Windows build: 444 modules,
entry 319.55/101.58 kB, CSS 78.64/15.31 kB, Login 4.15/1.91 kB,
Onboarding 5.48/2.16 kB, Settings 12.77/4.08 kB, CRM 35.67/9.11 kB;
79 PWA entries/1180.40 KiB. Precache grows 1.06 KiB (about 0.090%).
No performance optimization has been made or improvement claimed. Lazy route
boundaries, one theme/UI stack, bounded schemas/pages and server-owned queries
remain. Existing mixed static/dynamic client imports need a separately justified
change; removing warning text alone would not establish a measured benefit.

## Intended change inventory and exclusions

19 files, with no backend/schema/package/lockfile/environment/approved asset changes:

- `.github/workflows/ci.yml`
- `PROJECT_CONTEXT.md`, `README.md`
- `docs/roadmap/V2_11_EXPERIENCE_ROADMAP.md`
- `docs/roadmap/V2_PRODUCT_COMPLETION_ROADMAP.md`
- `docs/reviews/V2-11E_FINAL_ACCEPTANCE.md`
- `frontend/e2e-identity/identity.spec.ts`
- `frontend/e2e-polish-visual/account.spec.ts`
- `frontend/e2e-polish-visual/review-matrix.mjs`
- `frontend/playwright.polish-visual.config.ts`
- `frontend/src/components/ui/ProfileSettingsModal.tsx`
- `frontend/src/pages/CRM/CrmPage.tsx`
- `frontend/src/pages/HR/HrPage.tsx`
- `frontend/src/pages/Login.tsx`
- `frontend/src/pages/Onboarding/OnboardingPage.tsx`
- `frontend/src/pages/Settings/SettingsPage.tsx`
- `frontend/src/test/accountPolish.test.tsx`
- `frontend/src/test/crm.test.tsx`, `frontend/src/test/hr.test.tsx`

Logs, QA helpers/configs, fixtures, screenshots, builds, backups, keys and ignored
reference sources remain outside staging. CI adds only the sanitized public/account
matrix and retains all authenticated artifact exclusions. No production provider
or credential is used by this local acceptance. ADRs 0023/0029 remain applicable;
this fix does not introduce a new architecture decision.

## Production and release boundary

V2-10 requirements remain independent: suitable approved always-on hosting,
genuine post-020 extended hosted recovery, commercial authority/preflight,
exact deployed frontend/backend SHAs, hosted authenticated two-tenant/session/
role/entitlement/CSV/realtime and SMTP/log evidence, manifest MIME, acknowledged
independent monitoring, private ownership/support/privacy/recovery register,
actual Neon recovery permissions/window/quota/cost and safe rollback rehearsal.
See [strict V2-10 decision](V2-10_GO_NO_GO.md). Atlas and backup originals/keys
are retained. No hosted mutation, provider purchase or real-data onboarding.

Local acceptance completed before normal main commit/non-force push.
Every required GitHub workflow gate must succeed on that final exact SHA before
annotated `v2-11e-unified-experience-forms-studio` publication. The remote peeled
tag, clean main and HEAD/origin/fresh remote equality must be verified.
The tag/verified final handoff supplies immutable commit/run evidence; this
pre-commit report cannot recursively assert its own commit hash.
At this pre-publication review, no completion tag or Batch 4 commit exists.
The immutable release receipt is the verified tag annotation and final handoff;
they must identify the exact final SHA and completed successful CI URL.
Do not start V2-12 automatically.
