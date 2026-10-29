# UX-02A — Business screen refinement

## Scope and baseline

Local validation: 2026-10-29. Branch `feature/ux-02a-business-screens`.
Accepted parent: `dbbe23a5ad1f902b05f099c78130c8a3c5b5b326`, draft UX-01 PR #7.
Resumed the existing ten-file implementation without resetting or transferring it.
The dependent draft PR targets `feature/ux-01-premium-workspace`, not main.
The owner explicitly approved adding that exact branch to CI's pull_request filter;
push triggers and every job/security gate remain unchanged.

## Implemented experience

- Dashboard: quieter business-date controls, readable numeric hierarchy, compact
  attention rows, authorized Tasks shortcut, and a keyboard-operable complete
  workflow directory collapsed by default rather than repeating the sidebar.
  Existing authorized metrics, money formatting and widget customization remain.
- CRM: compact four-metric summary (two columns on smaller screens), clearer
  search/filter and empty-state guidance, restrained tabs and Kanban cards,
  improved follow-up spacing, and permitted next actions before lengthy record
  details. Assignment/lifecycle controls remain grouped below canonical facts.
- Tasks: My/Team scope grouped separately from branch/date context, clearer time
  filters, readable record spacing, high-priority mobile marker alongside the
  existing text badge, and organized detail/create sections. No new task rules.

All production changes are page-local. No UX-01 shared shell, account menu,
selectors, theme definitions, dependencies, backend contracts, permissions,
entitlements, monetary values, migrations or authentication changes.
Server pagination/filtering, optimistic versions and existing scoped queries remain.

## Validation and resource evidence

Sequential commands; one browser/component worker; zero browser retries; original
30-second tests and 10-second assertions. Available RAM at resume 3.05 GiB, commit
headroom 16.0 GiB; before production build available RAM 3.59 GiB. No unrelated
processes terminated. Local demo frontend/backend/PostgreSQL were not changed.

| Gate | Result |
| --- | --- |
| Existing dependency installation | Normal npm ci completed, 579 packages; lockfile unchanged |
| Full frontend ESLint | PASS, exit 0 |
| TypeScript `tsc -b` | PASS, exit 0 |
| Focused components: premium-dashboard, crm, crmWorkbench, tasks | 62/62 PASS, 4 files, exit 0 |
| Production build | PASS, exit 0; 99 PWA precache entries; manifest, sw.js and Workbox emitted |
| Accepted-parent production baseline screenshots | 27/27 PASS, exit 0 |
| Candidate UX-02A browser suite | 31/31 PASS, exit 0 |
| Dialog viewport recapture subset | 6/6 PASS, exit 0; overlap with the 31, not additional distinct tests |

The initial sandbox component attempt failed before discovery with EPERM renaming
its temporary transform cache (zero tests executed). The permitted retry passed.
The initial baseline development-server run timed out during page.goto/load before
an application assertion. Production baseline assets passed all 27 without changing
deadlines. This isolates the validation path from development transformation/startup;
it does not prove a specific underlying dev-server root cause.
Production Vite reported the existing ineffective dynamic-import warning for
api/client.ts; no new dependency or runtime error was introduced by this change.

Focused components retain server-page/window, scoped-state, permission, lifecycle,
and failure behavior coverage. New browser cases verify server query attention and
limit, read-only Task/Lead actions, empty/reset behavior, unsaved Lead draft guard,
keyboard directory disclosure, dialog Escape/focus return, accessible control names,
no document overflow and System OS-theme changes. These are synthetic intercepted
API fixtures, not PostgreSQL integration proof or a formal accessibility audit.

## Visual evidence

Ignored local artifact roots: `frontend/test-results/ux02a-before/` and
`frontend/test-results/ux02a-after/`. Each captures Dashboard, CRM directory, Kanban,
Lead details, Tasks directory/detail/create at 320, 768 and 1440 px in Light, Dark
and System (dark OS, then light OS transition asserted).

Actual images inspected include before dashboard-1440-light, tasks-320-dark and
crm-768-system; after dashboard-1440-light, dashboard-768-light, dashboard-320-dark,
crm-320-light, crm-768-dark, kanban-1440-system, tasks-320-light and tasks-1440-system.
Viewport checks additionally inspected lead-320-dark-viewport,
task-form-768-system-viewport and task-detail-1440-light-viewport.
The before/after Dashboard removes a large repeated directory, CRM brings summary
and actions closer to records, and Tasks makes scope and time-window distinctions
clearer. Names wrap and controls remain readable with no document overflow.

Full-page captures stitch fixed navigation/drawers at scroll offsets; they must not
be used alone to judge modal positioning. Supplemental viewport captures show the
correct fixed header/footer and scrollable form. Small-tablet CRM table labels can
still wrap within narrow cells; nothing is removed, but further density tuning is
a candidate follow-up. No claim of exhaustive assistive-technology certification.

## Bundle observations

Raw/gzip kB, parent -> candidate: Dashboard JS 8.28/3.08 -> 8.38/3.10;
CRM JS 46.23/12.06 -> 47.03/12.31; Tasks JS 27.50/8.52 -> 27.66/8.55.
Candidate page CSS: Dashboard 2.19/0.76, CRM 5.43/1.33, Tasks 8.34/1.85.
No dependencies added; routes remain lazy-loaded. Parent snapshot and working-tree
global CSS sizes differ with source-scanning context, so no global bundle reduction
is claimed from this comparison.

## Intended inventory

- `.github/workflows/ci.yml` (explicitly approved exact PR-base filter only)
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/pages/Dashboard.css`
- `frontend/src/pages/CRM/CrmPage.tsx`
- `frontend/src/pages/CRM/LeadPipelineBoard.tsx`
- `frontend/src/pages/CRM/workbench.css`
- `frontend/src/pages/Tasks/TasksPage.tsx`
- `frontend/src/pages/Tasks/Tasks.css`
- `frontend/src/test/premium-dashboard.test.tsx`
- `frontend/e2e/ux02a-business-screens.spec.ts`
- `frontend/playwright.ux02a.config.ts`
- This report.

Screenshots, traces, dependencies, dist, archive and ignored baseline snapshot are
local evidence only and excluded from the commit. No credential files are included.

## Acceptance boundary and next work

Local page refinement accepted on the evidence above. Exact published-head full
Linux CI remains separately required; do not infer it from local passes. The draft
depends on unmerged PR #7 and must not be merged independently. No deployment,
hosted migration, provider setting change or real-data testing occurred.

UX-02B candidates, not started: page-specific Customers/Services/Queue/Appointment
and stock/purchasing refinements; additional tablet density and assistive-technology
review. No new backend capabilities are included or promised.

**NO-GO FOR REAL CUSTOMER DATA. Render Free remains synthetic staging-only.**
