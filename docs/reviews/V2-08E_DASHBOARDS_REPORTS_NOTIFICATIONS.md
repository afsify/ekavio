# V2-08E: Dashboards, reports and notifications

Date: 2026-10-07. Product foundation only. **NO-GO FOR REAL CUSTOMER DATA** unchanged.

## Baseline and release boundary

Started on clean `main`; HEAD, origin/main and freshly checked remote main matched
`64f0fd59be3979a3ecf1b30ba3f8377a99f9f3d7` (`feat: add dynamic fields and form layouts`).
V2-08D completion tag peeled to that commit. Personal Git identity was retained.
Annotated `pre-v2-08e-dashboards-reports-notifications` was created/pushed there once.
Hosted prior migrations 001–015 were applied with matching checksums, freshly checked
through the standard runner; hosted migration evidence is not an application-deploy
or authenticated browser claim. No reset/restore/stash/clean or feature branch.

## Delivered architecture and scope

[ADR 0024](../adr/0024-dashboards-reports-notifications.md) records the complete widget,
metric, report/access/filter/scope, notification/event/recipient and cost catalogues.
Additive 016 separates PostgreSQL personal layouts, notification preferences,
own-recipient attention and append-only export audit. Canonical repositories remain
sole business authority; no Mongo fallback/dual-write or startup migration.

- Dashboard is CORE without reports.read. Server returns only authorized domain and
  entitled widgets; Customer/Service need no Queue subscription. Eleven factual
  widgets have human labels, exact values, scope descriptions and safe domain links.
  Hide/reorder/reset is organization/user/version scoped, not stored authority.
- Organization overview independently omits unauthorized counts/commercial legal name,
  adds operating-profile completion and permission-aware links. Operator-only overview
  derives five canonical organization/subscription/request/renewal/offer counts.
- Ten curated reports cover Customer, Service, Appointment, Queue, explicit Attendance,
  Dues balances/journal, current Inventory/movements and Membership directory. Each
  requires reports.read + domain read + relevant paid entitlement. Staff excludes
  global login contact/credentials. Dues are not revenue and stock is not sales.
- Operational reports are selected-branch only. Customer/Staff organization-owned
  directories remain org scoped. A caller branch must match selected authorization;
  foreign relationship filters/branch assignments fail server-side. No multi-branch
  paid aggregate or privileged client preset. Human relationship pickers are bounded.
- Branch IANA business dates use inclusive local start/exclusive next midnight bounds.
  Attendance uses DATE; timestamps/custom datetime use branch local display. Periods
  default 30 days, maximum 366. Current stock/all-time branch balances reject date
  filters rather than pretending a period balance. Summaries use identical filters.
- All five accepted dynamic-field entities support active reportable optional columns,
  batch typed values, exact money/numbers, Yes/No and archived historical option labels.
  Non-reportable/archived/foreign definitions cannot be selected. Customer reuses one
  typed filter; presentation hiding is not falsely described as field-level RBAC.
- Fresh server CSV reauthorizes/requeries, applies selected filters/columns, writes
  human metadata/headers, exact money and UTF-8 BOM, and neutralizes formula/control
  prefixes with quoted apostrophe-prefixed text. Only successful metadata-only exports
  enter append-only tenant audit, never rows/search/custom values/PII.
- Hard CSV ceiling 2,000 rows/5 MiB; conservative adaptive row budget reserves overhead,
  measures legacy canonical text/arrays before row loading and budgets selected typed
  custom text/options. Ordinary conservative cap 638 rows; wide columns lower it.
  Over-budget requests fail, never truncate. Pages 25 default/100 max/200 pages, 50
  selected columns, search 200 chars, per-statement timeout 10 seconds. Existing
  organization/branch/date indexes are reused, custom values are batched, relationship
  choices add at most three queries of 100 choices. EXPLAIN/small fixtures do not prove
  production-scale latency. Serialization size also fails closed.
- Notifications implement only optional Organization category: active Membership
  update and active custom-role update affecting its active assigned members. Generic
  title/message has no raw user/role/customer/custom data. Recipient resolution is
  server-side and transactional with canonical changes, org/user/target/version
  deduplicated; no client-recipient API. Own bell/center/read/unread/read-all/preferences
  use a 60-second foreground poll/focus revalidation, not new Socket.IO rooms.
- Unread is retained. Explicit `notifications:prune -- --apply` deletes at most 1,000
  messages read more than 90 days ago; never audit/business rows. No request correctness
  depends on a cron or sleeping Render process. General notification email is deferred;
  accepted verification/reset/invitation mail is unchanged.

## Automated acceptance evidence

| Gate | Result |
| --- | --- |
| Backend/frontend clean npm ci | Passed; no dependency additions/upgrades |
| Backend lint/typecheck/unit/build | Passed; 179/179 unit/contract tests |
| Analytics/report/notification PostgreSQL | 17/17 (16 subtests + parent); repeat run against final backend |
| Database regression chain | All 28 integration files passed; affected organization administration rerun 25/25 |
| Migration | Fresh disposable schema + 015 upgrade, unchanged 001–015 checksums, repeated 016 apply/idempotence |
| Mongo runtime source boundary | 4/4; legacy messages/notifications remain retired, new attention is PostgreSQL only |
| Backup/envelope/tooling/watchdog | 15/15 |
| Frontend lint/typecheck/component/PWA build | Final passed; 53/53 components including synchronous checkbox feedback regressions |
| V2-08E Chromium | Final 13/13; loaded records, long labels/values, actual mobile no-match/readback, one control set and foreign export negatives |
| Prior Chromium foundation/identity/admin/forms | 19/19, 11/11, 18/18, 14/14 passed; 75 browser tests total including V2-08E |
| Responsive | 390/768/1440 × Light/Dark/System all passed with actual loaded content; no document overflow or page errors |
| Dependency audits | Backend/frontend full and production: zero vulnerabilities; transient registry TLS error retried successfully |
| Docker config/build/up | Passed; final PostgreSQL/backend/frontend healthy; offline Mongo and disposable browser harness stopped; retained volumes preserved |
| Local HTTP/logs | 200: live/ready, root/login/dashboard/reports/notifications; bounded normal logs showed no error/fatal/exception/unhandled signatures |
| Hosted 016/status | Only pending 016 applied through standard runner after all final local gates; 001–016 applied with matching checksums |
| Hosted public health | 200: api live/ready and frontend root/login; schema/public-health only, no authenticated hosted evidence implied |

PostgreSQL tests execute every closed report; prove independent permission/entitlement,
CORE-without-Queue, foreign branch/resource, closed date/filter/column rejection,
all five typed/reportable entities, reportable flag changes, archived choice labels,
exact large currency/CSV escaping, shared filter summaries and conservative long-text
export rejection without audit leakage. Dues tests include charges/payments/both
adjustments/full payment reversal, two customers, negative credit and a second branch;
positive debt remains 9,000 minor units, journal net 8,500 and second branch 1,000.
Inventory uses the canonical 1.250 quantity / 2.000 threshold, not a shadow stock sum.

Notification tests prove actual canonical mutation hooks, role fan-out, active assigned
membership policy, preferences, dedupe, foreign recipient/read protection, read/unread/
read-all, ownership FK/trigger, read retention separate from audit and canonical admin/
platform SQL. Browser fixtures are disposable generated PostgreSQL organizations and
credentials only; no operator-selected fixture or hosted authenticated evidence.

Functional QA exposed and fixed asynchronous controlled-input feedback and report
chooser unmounting during refetch. The staff mutation previously deleted unchanged
assignments referenced by immutable Dues; it now retains them and fails 409 for
history-referenced removals, without weakening history constraints. Bell title markup
and the report-selector locator were corrected without loosening data/API assertions.
Exact-commit CI exposed a controlled-checkbox timing issue: mutation cache callbacks
alone could let React restore the prior checked state. Dashboard layout and notification
preferences now update a context-scoped draft synchronously inside the input event,
cancel stale reads and retain server revalidation before clearing that draft. Two
pending-persistence component regressions cover immediate feedback; original browser
assertions remain unchanged and the complete affected 13-test suite passed again.
The strengthened visual checks wait for actual records, not Suspense/loading screens,
and keep mobile filter controls unique when the modal is open. Visual review found
the base button CSS overriding desktop hiding; a scoped selector fixes the mobile
Filters button, tested as absent on desktop. Mobile tests prove no-match filtering
and restoration, not merely typing into a control. The extra definition fixture now
asserts the verified existing HTTP-200 contract (not an invented HTTP-201).

Managed in-app browser bootstrap failed before navigation because bridge sandbox
metadata lacked `sandboxPolicy`. Repository Playwright Chromium fallback was used,
with authenticated traces/screenshots off except a deliberately disposable report
preview kept locally and excluded from CI upload/staging. No manual browser group.

## Cost, security, artifacts and release discipline

Final PWA build: lazy Reports 10.56 KB / 3.27 KB gzip, Notifications 2.82 / 1.10,
Dashboard 5.01 / 1.88; main 528.09 / 167.16 KB; 54 precache entries / 959.33 KiB.
Existing non-blocking mixed-import and
500-KB chunk warnings remain; no large chart/form/report framework or new dependency.
Manifest/service worker build successfully; authenticated API data/credentials are
not added to service-worker cache or persisted browser storage.

Final source/diff review preserves pinned images, TLS/CORS/registration/security and
Atlas. Candidate-path and sensitive-literal inspection found no new real secret or
generated artifact. The existing CI-only database connection is a disposable workflow
fixture, not a provider credential. Ignore/staging guards exclude env files, credentials,
dumps/backups/envelopes/keys, screenshots/traces/videos, node_modules and dist.
Push coherent main; verify exact-commit CI success before annotated
`v2-08e-dashboards-reports-notifications`; tag must peel to final SHA; clean main must
equal origin/main and fresh remote main. Release metadata belongs to Git/Actions,
not guessed pre-commit IDs in this document.

Saved presets, general notification email, low-stock/provider/invitation/Billing events,
scheduled reminders, broader custom/multiselect filters, uniqueness, organization-wide
paid aggregates, Sales/POS and paid adapters are explicitly deferred. V2-08F public
website/commercial UX is not started. No provider console/authenticated hosted smoke
or new recovery proof is fabricated. Include 016 in later recovery proof; existing
pilot operational blockers and **NO-GO FOR REAL CUSTOMER DATA** remain unchanged.

## Changed-file inventory

The reviewed implementation, tests, CI and documentation consist of 59 files:

- `.github/workflows/ci.yml`
- `PROJECT_CONTEXT.md`
- `README.md`
- `backend/package.json`
- `backend/postgres/migrations/016_analytics_notifications.sql`
- `backend/src/controllers/analyticsController.ts`
- `backend/src/domains/analytics/dashboardService.ts`
- `backend/src/domains/analytics/policy.ts`
- `backend/src/domains/analytics/queries.ts`
- `backend/src/domains/analytics/reportService.ts`
- `backend/src/domains/customerDues/repository.ts`
- `backend/src/domains/inventory/repository.ts`
- `backend/src/domains/notifications/service.ts`
- `backend/src/routes/analyticsRoutes.ts`
- `backend/src/routes/index.ts`
- `backend/src/routes/notificationRoutes.ts`
- `backend/src/routes/organizationRoutes.ts`
- `backend/src/routes/reportRoutes.ts`
- `backend/src/scripts/notificationPrune.ts`
- `backend/src/services/analyticsService.ts`
- `backend/src/services/organizationAdministrationService.ts`
- `backend/tests/analytics.test.ts`
- `backend/tests/analyticsNotifications.integration.ts`
- `backend/tests/attendanceMigration.integration.ts`
- `backend/tests/commercialRenewal.integration.ts`
- `backend/tests/corporateMigration.integration.ts`
- `backend/tests/customerDuesMigration.integration.ts`
- `backend/tests/dynamicFields.integration.ts`
- `backend/tests/identityAccount.integration.ts`
- `backend/tests/identityBrowserServer.ts`
- `backend/tests/inventoryMigration.integration.ts`
- `backend/tests/manualCommercial.integration.ts`
- `backend/tests/mongoRetirement.test.ts`
- `backend/tests/organizationAdministration.integration.ts`
- `backend/tests/postgres.integration.ts`
- `backend/tests/publicCommercial.integration.ts`
- `docs/adr/0024-dashboards-reports-notifications.md`
- `docs/reviews/V2-08E_DASHBOARDS_REPORTS_NOTIFICATIONS.md`
- `docs/roadmap/V2_PRODUCT_COMPLETION_ROADMAP.md`
- `frontend/e2e-analytics/analytics.spec.ts`
- `frontend/e2e/fixtures.ts`
- `frontend/package.json`
- `frontend/playwright.analytics.config.ts`
- `frontend/src/App.tsx`
- `frontend/src/components/analytics/CustomerReportFilter.tsx`
- `frontend/src/components/analytics/NotificationBell.tsx`
- `frontend/src/components/analytics/contracts.ts`
- `frontend/src/components/layout/AdminLayout.tsx`
- `frontend/src/components/layout/navigation.ts`
- `frontend/src/hooks/useNotifications.ts`
- `frontend/src/index.css`
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/pages/Notifications/NotificationPreferences.tsx`
- `frontend/src/pages/Notifications/NotificationsPage.tsx`
- `frontend/src/pages/Reports/ReportsPage.tsx`
- `frontend/src/pages/Settings/OrganizationPage.tsx`
- `frontend/src/pages/Settings/SettingsPage.tsx`
- `frontend/src/test/analytics.test.tsx`
- `frontend/src/test/foundation.test.tsx`
