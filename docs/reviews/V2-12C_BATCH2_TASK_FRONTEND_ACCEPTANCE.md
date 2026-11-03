# V2-12C Batch 2 — My Tasks / Team Tasks frontend

2026-10-16. **Local Batch 2 acceptance: PASS.**
Not committed, published, deployed or commercially activated.
**NO-GO FOR REAL CUSTOMER DATA. Render Free remains staging-only.**

## Baseline and preservation

`main`, HEAD, origin/main and fresh remote main matched
`374fe470e4c2f0c1ac3e30078dea2ec9f68fb7c4`. Accepted baseline CI is
[38736930221](https://github.com/afsify/ekavio/actions/runs/38736930221), not a new
run for this uncommitted tree. No applicable AGENTS.md was found. Starting tree:
27 tracked modifications, 10 new Batch 1 files and five protected untracked
planning reports, empty index. A SHA-256 snapshot of all 42 starting files was
taken before Batch 2 and compared afterward; all remain byte-identical.

Read PROJECT_CONTEXT, approved Batch 0 design, Batch 1 acceptance/ADR and actual
Task policy, repository, service, router and tests. No reference audit was repeated.
Batch 1 backend, migration 021, its acceptance and architecture reports remain
intact. Historical 001–020, canonical V2-10 registers, references, prior QA output,
lockfiles, environment files, branding/assets and theme engine are unchanged.

## API and UI audit

Source authority: `backend/src/domains/tasks/{policy,repository,service}.ts` and
`backend/src/routes/taskRoutes.ts`, not reference-project DTOs. Inspected existing
App/router, navigation/sidebar/layout/switching, AppStore, HTTP interceptors,
Customer, CRM, HR, AdvancedTable, WorkspacePrimitives, Input, AdvancedModal and
layout navigation guard. Reuse the existing visual/auth/query system; no second UI
library, font, dependency or runtime fixture data.

| Existing API | Frontend use |
| --- | --- |
| GET `/api/tasks` | own/team; title search, status, priority, attention=today/overdue/upcoming, team-only assignee, due/recent sort, page/limit |
| GET `/api/tasks/assignees` | Manager-only bounded eligible membership/name picker and filter; never arbitrary staff directory |
| GET `/api/tasks/:id` | Current facts, branch timezone/server time and returned allowedActions |
| GET `/api/tasks/:id/history` | Paged canonical events, actor, version, state/field/deadline changes and reason |
| POST `/api/tasks` | Title, description, priority, canonical assignee, branch-local nullable deadline and durable command key |
| PATCH `/api/tasks/:id` | Only changed editable fields, expectedVersion and command key |
| POST `/api/tasks/:id/status` | Permitted todo/in_progress/completed transition with expectedVersion/key |
| POST `/api/tasks/:id/cancel` or `/reopen` | Explicit manager lifecycle decision, nonblank reason, version/key |

Responses are `{data: ...}`; list/history/roster use their actual inner paged DTOs.
UI pages contain at most 20 items, capped at server page 200. No full-dataset load,
local dataset filtering, invented count, scheduler, notification or new endpoint.
Only the server's filtered total is displayed. Today and Overdue may overlap.
History contains no fabricated activity or description snapshots. Creator name is
not supplied by the detail DTO; the actual creation event identifies its actor,
instead of inventing a creator display name from an ID.

## Experience delivered

- Separate lazy `/tasks` route and concise Tasks navigation under Team & workforce.
  Existing HR Plus / My Work route/name/semantics remain untouched.
- My Tasks for `tasks.read_own`; Team Tasks for `tasks.read`. Both require effective
  `tasks` entitlement. Creation and roster require `tasks.read` + `tasks.manage`.
  No operator/creator bypass. Direct access handles absent session/context,
  entitlement and read grant without fetching unauthorized Task collections.
- Title/description hierarchy, status/priority/overdue badges, branch clock labels,
  server search/reset/filter/sort/paging, desktop rows and compact mobile cards.
  Search stays visible; additional filters use the existing disclosure with an
  active-filter count so phone users reach their tasks without a wall of controls.
  Empty, pending, terminal-error and read-only states distinguish missing evidence
  from zeroes. No default commercial activation or misleading purchase action.
- Drawer with current identity/facts, full plain description, assignment health,
  lifecycle buttons from allowedActions and paged actual history. Inactive/removed
  branch assignment is retained honestly for explicit manager resolution.
- Create/edit forms reuse Inputs, section hierarchy, eligible roster and modal
  footer. Title/assignee/reason requirements, bounded text and pending controls;
  explicit review/confirm. Only deadline is nullable. Edit patches never include
  create defaults; omitted fields retain their values.
- Deadline input is branch-local, not browser-zone conversion. Display uses server
  branch zone, preserving UTC instants/seconds and backend DST validation. A clear
  sends localDue:null; description clearing sends an empty string, not null.

## Commands, errors and private scope

Each deliberate command has one crypto UUID key and the exact payload/version.
An immediate in-flight ref prevents double submission before React paints busy
state. No optimistic status change, background mutation retry or new-key replay.
Network/5xx uncertainty freezes inputs and retains the command in memory; only
explicit **Retry identical command** can recover it. A real response-loss test
commits the request, aborts the response, then recovers with the same key and proves
exactly one Task exists. Drafts/keys are not written to local/session storage.

400 preserves editable input. 401/403/404 require restored current authority or
closing/reloading; 409 freezes the stale decision instead of silently merging.
Confirmed server success invalidates scoped list/detail/history/roster queries.
Query keys include user/org/branch/membership and canonical permission set; requests
consume AbortSignal, queries have no retries and no retained inactive cache.
Old-scope queries are cancelled/removed on replacement, drafts/details unmount and
late command results cannot update an unmounted workspace. User-initiated dirty
navigation/context changes ask before discard; forced authority replacement never
retains private records merely to protect a draft.

An application-shell correction sorts permission sets in its workspace identity:
reordering equivalent grants must not destroy an open draft. A component regression
proves DOM/draft preservation on reorder and replacement on actual revocation.
No role default, policy, entitlement grant or backend contract was changed.

## Accessibility and responsive QA

Shared focus trap, Escape/restoration, nested discard confirmation, visible focus,
44px controls, safe-area footer and scrollable modal body are retained. Long titles
wrap locally; no document-overflow suppression. Semantic statuses, labeled controls,
announced pending/errors and existing contrast tokens/reduced motion are reused.
Light/Dark/System and the Sun/Moon control are unchanged. System is tested with a
dark OS preference; API-persisted appearance is used because login correctly
restores server preferences over an unrelated local-storage initializer.

Required widths: 320, 360, 390, 430, 768, 1024, 1440, 1920. The base matrix covers
My/Team directories, detail, editor, creation, dirty confirmation, empty/error and
mobile navigation. A complementary matrix covers genuine stale-version conflict,
visible history and genuine read-only records at every width/theme. Geometry checks
cover document, dialog/control horizontal bounds and dialog/footer vertical bounds.
Loaded Team captures wait for an actual row, not just the section heading.

The in-app browser connection was attempted but failed due to missing sandbox
metadata. Existing Playwright/Chromium was used instead. Owned Linux QA container
`ekavio-v212c-batch2-linux` uses existing local immutable image
`sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27`
(Playwright 1.63.0 noble); source/dependencies are read-only and only new ignored
QA output is mounted writable. An allowlisted loopback proxy connects named local
QA ports, not hosted APIs. Windows Node 24.16.0 API, Linux PostgreSQL 17.11 fixture,
Linux Chromium/Node 24.20.0 runner; no new Node 20 remote CI claim.

### Final screenshot review

Reviewed all eight refreshed `screenshots/review-{width}.png` contact sheets after
the final source-matched suite, with original-resolution spot reviews of phone
creation/history/conflict, tablet details and desktop directories. Required state
captures: **303 PNGs** — 12 states × 24 width/theme combinations, plus 15 mobile
navigation captures (five narrow widths × three themes). Eight contact sheets and
one initial-viewport diagnostic are additional review artifacts, not extra tests.
The two matrices use independent disposable records; these are state-coverage
screenshots, not fabricated history for one shared business record.

Review outcome: consistent semantic Light/Dark/System surfaces, readable wrapped
long titles, compact initial mobile record access, visible create/filter controls,
contained form/drawer scrolling, retained footer actions and safe-area spacing.
Read-only, conflict, actual history, empty and error states remain distinct. The
stronger initial-title assertion passes without scrolling it into view. No remaining
visual blocker found. This is Chromium review, not a physical-device, screen-reader
or complete WCAG certification. Retained Dashboard/Customers screenshots are
reviewed separately with their regression receipts.

## Evidence receipts

Ignored new evidence root: `frontend/test-results/v212c-batch2-linux/`; associated
component/quality/build logs use `frontend/test-results/v212c-batch2-*`.
Older QA directories were not used as write targets.

| Gate | Actual completed result |
| --- | --- |
| Frontend components | 229/229 across 21 files, exit 0; includes 25 Task/scope cases |
| Theme-bootstrap contracts | 4/4, exit 0; separate Node runner, not additional components |
| Frontend lint / TypeScript | PASS, exit 0; lint-final-compact.log and tsc -b in final build |
| Production build | PASS, exit 0; build-final-compact.log; explicit local non-secret URL settings |
| Backend lint / TypeScript | PASS, exit 0; includes new test-only QA harness in lint, no runtime edits |
| Backend Task/entitlement/RBAC policy selection | 46/46, exit 0; backend-contracts.log; overlaps retained Batch 1 units |
| Full frontend npm audit | Zero vulnerabilities, exit 0; unchanged lockfile |
| Compose config | PASS, exit 0; --quiet, no resolved environment output |
| Final complete Tasks production suite | 54/54, exit 0; tasks-final.log; zero skips/retries |
| Included real Tasks production workflows | 6/6; included in 54, not additive |
| Included base responsive matrix | 24/24; included in 54, all eight widths and three themes |
| Included conflict/history/read-only matrix | 24/24; included in 54, all eight widths and three themes |
| Retained PostgreSQL-backed CRM browser suite | 15/15, exit 0; retained-crm.log |
| Retained PostgreSQL-backed HR browser suite | 15/15, exit 0; retained-hr.log; HR My Work unchanged |
| Retained shell/accessibility selection | 27 conclusive case passes: 26 in initial selection (exit 1), remaining case focused rerun 1/1 (exit 0); retained-shell.log + retained-shell-focused.log |
| Final Task screenshot review | PASS; eight refreshed width/theme contact sheets and original spot checks |
| Final diff/security/preservation review | PASS; exact 62-entry allowlist, all 42 starting hashes unchanged, whitespace/asset/lockfile/register checks, empty index |

The six real workflows cover owner create/edit/reassign/cancel, staff progress,
manager reopen, read-only custom role, no entitlement, membership/branch revocation,
foreign tenant/branch negatives, version conflict, scope discard, response loss,
server pagination/search/priority/assignee filtering and focus restoration. They use
ordinary login/session/middleware and PostgreSQL, not mocked authorization. Only
bounded error injection deliberately simulates network/503 failures.

The final current-source complete suite finished 54/54 in 7.2 minutes, exit 0.
This supersedes earlier development/interrupted and pre-density screenshots; no
failed aggregate command is used as a successful gate. The default new browser
configuration builds/previews the production artifact; the accepted local run
used the equivalent explicitly selected external loopback QA servers.

Retained shell selection: nine Dashboard width/theme cases, nine Customers cases,
three Dashboard contrast/keyboard cases, three CRM read-only/contrast cases and
three dirty-draft/compact-navigation/context-switch regressions. Its first CRM
Light case reached the unchanged 30-second deadline while contrast targets were
still absent (zero measured elements). The other 26 completed. A single focused
rerun after development compilation was warm passed in 12.4 seconds, preserving
all contrast/count/keyboard assertions and zero retries. The initial trace and
failure are retained in a separate output directory; no claim that the original
27-case command exited 0. This is a disclosed development-harness cold/readiness
sensitivity, not a proven new Task or CRM business defect. Future exact-commit CI
remains mandatory and is not replaced by this local evidence.

Reviewed representative retained Dashboard originals at 320 Light and 768 Dark,
and Customers originals at 390 Light, 768 System and 1440 Dark, alongside automated
overflow, theme, focus and contrast checks. These retained presentation fixtures
are mocked HTTP data, not additional PostgreSQL authority proof. Task/CRM/HR real
journeys above separately exercise normal middleware and disposable PostgreSQL.

Retained Batch 1 unit/integration/archive receipts remain applicable because every
Batch 1 file is unchanged. Do not sum overlapping runs, count aborted/not-run cases
as passes, or describe a failed aggregate command as successful. No new CI ran.

### Findings and diagnostic runs

- Added missing Tasks entry to Billing's exhaustive module icon map; metadata only.
- Replaced render-time ref access with a stable state initializer, preserving the
  lint rule rather than disabling it.
- Corrected required synthetic SQL timestamps in the new isolated harness.
- Scoped jsdom locators to table/dialog: responsive desktop/card copies coexist.
  Pagination test waits for the real enabled state before clicking. Assertions
  were retained, not deleted.
- Corrected native combobox and normalized datetime test inputs. Geometry inspection
  is batched so conditional controls cannot invalidate nth-element handles; bounds
  assertions were strengthened, not relaxed.
- Visual inspection found the expanded filters dominated the first mobile screen.
  Reused FilterPanel to disclose advanced filters without losing their state,
  keeping search and active reset visible. The stronger 320px assertion then exposed
  excess supplemental spacing/copy; tightened only Task mobile density, suppressing
  desktop explanations (not task data/actions/pagination), and omitted inactive
  reset. Kept the 50%-in-viewport assertion and deadline; its 320px rerun passed.
  Added filter-open captures and reran affected current-source quality/browser gates.
- Initial development Linux aggregate stopped on a read-only navigation interruption:
  25 completed passes, one failure, three not run. The 24 responsive cases completed,
  but that command was not a PASS. Login/context read grants independently matched;
  no speculative backend/RBAC fix was made. The stable production build subsequently
  passed all six real workflows unchanged. Do not claim a conclusively diagnosed
  application defect from the development interruption.
- Initial dev harness emitted express-rate-limit creation warnings on its per-actor
  reset. The new test-only harness now schedules fresh app creation asynchronously;
  ordinary middleware/thresholds remain unchanged. Expected unauthenticated refresh
  401 and explicit negative-test errors are not concealed as runtime failures.
- A build/preview invocation without required VITE URL settings failed safely;
  reruns supplied explicit loopback settings. No environment file was edited.
- Existing client static/dynamic-import warning and tool timing/color notices are
  retained. No retries, deadline increases, skipped assertions or parallel heavy
  browser suites were introduced.

## Production performance

Before values were read from existing pre-task build output before rebuilding,
not estimated from source. That cached artifact was not independently SHA-attested;
this is an observed before/after size comparison, not a separately rebuilt baseline.
Final build remains route-lazy and adds no dependencies.

| Asset | Before bytes | After bytes | Difference |
| --- | ---: | ---: | ---: |
| Entry JS | 322,535 | 323,046 | +511 |
| Global CSS | 92,171 | 92,192 | +21 |
| Lazy Tasks JS | absent | 23,181 | new; Vite gzip 7.54 kB |
| Lazy Tasks CSS | absent | 3,153 | new; Vite gzip 0.97 kB |

No decorative network query, chart, avatar/image, animation library, export,
unbounded staff/task list or persistent full-dataset cache was introduced. Search
is bounded and server-owned. This is bundle evidence, not a production load test.

## Exact Batch 2 inventory

Modified frontend files (6):

- `frontend/src/App.tsx`
- `frontend/src/commercial/catalogue.ts`
- `frontend/src/components/layout/AdminLayout.tsx`
- `frontend/src/components/layout/NavigationIcon.tsx`
- `frontend/src/components/layout/navigation.ts`
- `frontend/src/pages/Billing/BillingPage.tsx`

New frontend files (12):

- `frontend/src/pages/Tasks/TasksPage.tsx`
- `frontend/src/pages/Tasks/contracts.ts`
- `frontend/src/pages/Tasks/forms.tsx`
- `frontend/src/pages/Tasks/Tasks.css`
- `frontend/src/test/tasks.test.tsx`
- `frontend/playwright.tasks.config.ts`
- `frontend/e2e-tasks/helpers.ts`
- `frontend/e2e-tasks/tasks.spec.ts`
- `frontend/e2e-tasks/tasks-responsive.spec.ts`
- `frontend/e2e-tasks/tasks-guarded-responsive.spec.ts`
- `frontend/e2e-tasks/local-linux-proxy.mjs`
- `frontend/e2e-tasks/review-matrix.mjs`

New non-frontend files (2):

- `backend/tests/tasksBrowserServer.ts` — isolated QA infrastructure only
- `docs/reviews/V2-12C_BATCH2_TASK_FRONTEND_ACCEPTANCE.md`

No Batch 1 file, historical migration, production backend, package/lockfile, CI,
runtime configuration or canonical register was changed in Batch 2. Exact final
review: **33 tracked modifications + 29 untracked files = 62 entries**; empty index.
That is 37 preserved Batch 1 implementation files + five protected reports + 20
Batch 2 files. All five protected reports and the entire 42-file starting snapshot
remain byte-identical. No QA/build/backup/credential/reference artifact is staged.
Application source was frozen before the final 54-case production run; subsequent
edits are confined to this report. Nothing was committed, pushed or tagged.
Fresh remote main was rechecked at the accepted SHA. Only this batch's local QA
frontend/API processes and owned Linux browser container were stopped after review;
the container was not removed. Pre-existing containers and all QA receipts remain.

## Release boundary, limitations and next proposal

Owner's Batch 2 prompt states **both Render frontend and backend auto-deploy main**.
This is owner-supplied evidence, not newly inspected provider metadata. Batch 1's
earlier unverified-provider statement is preserved as historical evidence. A push
is deployment-risking; nothing was committed/pushed/tagged/deployed.

Combined release needs independently approved, named hosted database/schema/
001–020 checksum inspection, reviewed pending 021, current encrypted backup and
recovery proof, previous-binary-on-021 rollback compatibility rehearsal, coordinated
operator/release window and migration before module activation. Readiness SELECT 1
does not prove 021. Optional Task access remains fail-closed but is not a schema
barrier. No real grants, live Tasks, hosted authentication/SQL or provider actions.

Future publication must wire the new Task browser configuration into mandatory
exact-commit PostgreSQL/browser CI with private fixture artifact exclusions,
coordinate both auto-deploy services, verify actual deployed SHAs/schema, and
perform separately approved staging acceptance. No destructive down migration or
claim that the existing local 17-to-17 archive proves hosted PostgreSQL 18 recovery.

Read-only Team users cannot use the manager-only eligible-roster endpoint; no
unauthorized staff discovery was added. In-memory drafts do not survive a reload
or forced scope loss. A user must resolve uncertainty before discarding a command
key; no unsafe automatic persistent replay was added. No Task custom fields,
Kanban, calendar, recurrence, scheduler, automation, notifications, imports, AI,
messaging, employee tracking or new backend capability.

Suggested Batch 3, **not started/approved**: separately design authorized Dashboard
Task projections and deep links using real backend counts. Do not derive global
metrics from Task pages or merge Tasks with HR/CRM records.

Local implementation has no remaining known blocker in this approved scope.
Physical-device/assistive-technology certification, load testing, hosted schema/
deployment/acceptance, backup/recovery and publication authorization remain outside
this local PASS. The retained cold-development test sensitivity is disclosed above.

**STOP after local Batch 2. NO-GO FOR REAL CUSTOMER DATA; Render Free staging-only.**
