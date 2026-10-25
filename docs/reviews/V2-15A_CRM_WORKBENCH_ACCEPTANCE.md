# V2-15A CRM Workbench — implementation and acceptance checkpoint

Owner-authorized implementation began on 2026-10-24 (Asia/Calcutta). The initial startup record below predates the implementation progress appended later in this report.

## Verified baseline

- New isolated worktree: `C:\Projects\ekavio\.cache\v215a-crm-workbench`.
- New branch: `feature/v2-15a-crm-workbench`.
- Base/HEAD: `800340a590941a471544fb5d4a2903bb5683cbeb`.
- PR #5 was independently confirmed draft and unmerged at that SHA.
- CI run `39949097298`: completed successfully; foundation job has 88 successful steps, no skipped steps.
- Fresh remote main: `374fe470e4c2f0c1ac3e30078dea2ec9f68fb7c4`.
- Original checkout remains `feature/v2-12c-tasks`, with its six untracked review reports preserved. Existing worktrees were not edited.

## Material safety blocker

Entry available RAM was 1,551,264 KiB (1.48 GiB). A subsequent diagnostic reported only 87,684 KiB (85.63 MiB) available. Committed memory was 20,316,372,992 bytes against a 35,081,060,352-byte limit (18.92 / 32.67 GiB). Physical availability and committed-memory headroom are different limits. Lightweight file reads stalled; no build, browser, dependency install or test was started in this worktree.

Largest observed private-memory consumers included Code PID 19640 (1,020,932,096 bytes), Brave PID 28468 (936,497,152 bytes), Brave PID 18244 (669,380,608 bytes), Brave PID 21944 (552,660,992 bytes), and Defender PID 5340 (505,057,280 bytes). These samples do not establish the cause of the physical-memory collapse. No unrelated program was terminated and no system settings were changed.

## Resume without recreating the worktree

1. Recheck physical RAM and commit headroom before tests; aim for several GiB available physical RAM and at least 6–8 GiB commit headroom.
2. Continue the bounded source/reference inspection from the owner's V2-15A prompt. Reconnaissance is incomplete; no new reference mapping is claimed complete.
3. Existing CRM already provides server-paginated leads, stage/status/assignment filters, branch-time follow-up views, record drawers, activity and conversion APIs. Inspect their exact contracts before selecting the implementation changes.
4. Preserve existing security, scope/version/draft protection and the accepted S2 session/dependency fixes. Implement in this branch only.
5. Complete focused tests, responsive evidence and the authorized draft publication after the correction is reviewable and focused checks pass. Transfer heavy acceptance to Linux CI when needed, without claiming interrupted checks passed.

Only this local checkpoint was added; no application changes, commits, push, PR creation, merge, provider changes, hosted migration or deployment occurred in V2-15A.

The preceding resource-blocked entry is retained as historical evidence, not the current implementation verdict.

## Resume progress — 2026-10-24

Branch and HEAD were reverified unchanged. Resource recovery measured 4,563 MiB available physical RAM, 14.16 GiB committed and 18.52 GiB commit headroom before tests; subsequent slow-run diagnostics showed 4,219 MiB available and 18.15 GiB commit headroom. No unrelated process was stopped. Matching-lockfile package-directory junctions reuse the intact S2 dependency installation; Vite/test caches remain private to this worktree. No dependencies were installed or upgraded.

Implemented source (local, not yet accepted/published):

- `frontend/src/pages/CRM/LeadPipelineBoard.tsx`: original, read-only stage workbench using existing authorized `/crm/leads` queries, all supported filters and server totals. Three stages visible at a time, five records per independently paginated stage; API page ceiling 200 is explicit. Never groups one directory page into a pretend complete pipeline. No drag/drop mutation or fabricated revenue/follow-up counts.
- `frontend/src/pages/CRM/workbench.css`: scoped semantic-token layout; three desktop columns, stacked compact screens, wrapping text, native accessible controls. No global overflow suppression or new theme/library.
- `frontend/src/pages/CRM/CrmPage.tsx`: directory/board toggle, no unused directory fetch while board/follow-ups are active; in-memory view/filter/page retention while a Lead is open; role/membership changes additionally remount incompatible UI; explicit Back action and focusable detail section shortcuts; edit Lead returns to its detail; edit existing follow-up directly from active Lead detail with existing versioned form/draft safeguards.
- `frontend/src/test/crmWorkbench.test.tsx`: nine focused component checks for bounded scoped fetching, authoritative totals, independent pages, stage-window preservation, filter reset, retries, organization/branch and membership/role reset.
- `frontend/e2e/v215a-crm-workbench.spec.ts`: targeted synthetic browser journeys and representative 390/768/1440 Light/Dark/System screenshot checks; validation pending at this checkpoint.

Focused component evidence: first run 38 passed / 4 failed (new test fixture returned an invalid array instead of a form-schema object); corrected the fixture without changing assertions or product validation. Final rerun **42 passed, 0 failed, 0 skipped**, three files (`crmWorkbench`, retained `crm`, retained `crmConfiguration`), 26.10 seconds, exit 0, one worker. This is mocked frontend acceptance, not new PostgreSQL integration proof.

Static gates and browser checks are in progress. No acceptance, CI or publication is claimed yet.

## Bounded source/reference mapping

No reference was executed, installed, modified or copied. Original branding and semantic design tokens are retained. Paths are exact local source paths relative to `C:\Projects\ekavio\reference`:

| Reference | Observed pattern / existing EkaVio | Applied original improvement |
| --- | --- | --- |
| `biz_crm-main/frontend/src/components/common/leads/LeadKanban.tsx` | Fixed stage columns group a received array and derive visible value totals. EkaVio already had canonical stage selectors and a server-paged directory. | Original independently fetched stage columns; authoritative filtered totals, bounded stage windows and explicit per-stage paging. No copied fixed stages, totals, revenue or drag implementation. |
| `biz_crm-main/frontend/src/components/common/leads/LeadActivityTimeline.tsx` | Human-readable activity timeline and empty-state presentation. EkaVio already has canonical paged events and branch-time timestamps. | Keyboard shortcuts focus existing history/follow-up headings; retain genuine server events instead of a decorative timeline. |
| `Biz_auth-main/Front-end/src/components/layout/AdminSidebar.tsx` (`GroupExpanded`) | Contextual grouped native navigation with active-state cues. EkaVio already has permission-aware shell/navigation. | Local pipeline presentation controls and explicit return context; no duplicated global shell or new authentication integration. |
| `le-valor-resort-wayanad-main/src/pages/Dashboard/Dashboard.jsx` (error/retry block) | Distinct error feedback and an explicit retry action. | Reuse EkaVio ErrorState per stage, hide stale successful totals after an error, retry only that bounded read. No hotel/revenue domain adoption. |

Prior read-only external reconnaissance used Twenty (`https://twenty.com`), Frappe CRM (`https://github.com/frappe/crm`), ERPNext (`https://github.com/frappe/erpnext`), Zoho CRM (`https://www.zoho.com/crm/`) and EspoCRM (`https://github.com/espocrm/espocrm`) for workspace/view/detail concepts only. Odoo access timed out and the supplied Freshworks CRM URL returned 404; neither is claimed as verified detailed source evidence. No external assets, dependencies, licensing-sensitive code or services are introduced.

## Requirement reconciliation

- **Existing + enhanced:** server directory/search/filter/sort and pipeline selection; new optional server-backed Kanban. Directory stays the default and uses the retained 20-row shared server table/mobile cards.
- **New:** five-row independently paged stage columns, three-stage windows, scoped/filter-key resets, stage errors/retry/empty/loading states, readable company/owner/status/source cards.
- **Existing + enhanced:** canonical detail/contact/custom fields, versioned stage/assignment/conversion actions, branch-time activity and follow-ups. New direct edit-follow-up, section focus shortcuts, explicit Back and edit-to-detail return.
- **Existing, retained:** Today/Upcoming/Overdue/Completed/All from `/crm/followups`, selected branch timezone, active-Lead pending semantics, terminal history and versioned create/edit/review/discard protections. No browser-clock regrouping or fabricated task counts.
- **Security:** scoped query keys and abort signals; remount on user/org/branch/permissions/entitlements plus role/membership replacement. Route-level `crm.read` and independent CRM entitlement checks remain unchanged; `crm.manage` still controls writes. Server routes/services retain organization/branch validation, existing expected versions and canonical conversion. New board issues GET only.
- **Deferred by contract:** no canonical Tasks-to-Lead relationship exists in the inspected Tasks domain/UI; no invented link or copied Follow-up-as-Task data. Durable Saved Views require separately approved schema/API/security work (V2-15B). No new backend endpoint, migration, automation, financial claim or cross-session search persistence.
- View/filter/page state is session-memory UI state while navigating into/out of the drawer, not a durable saved view. Switching presentation away from a mounted board can reset its internal stage pages; changing authority intentionally discards incompatible state. At API page 200, narrow filters; the board explicitly states the 1,000-match paging ceiling per stage.

## Staging remains independently gated

The candidate descends from PR #5 (`800340a...`), which already includes PR #4 ancestry. Do not merge the same integration histories independently or cherry-pick duplicate copies. PR #5 and PR #4 must retain their draft/dependency gates until the owner approves an integration strategy. Migration 021, PostgreSQL 18 hosted compatibility, identity-bound encrypted backup/recovery proof and rollback compatibility remain release prerequisites. Coordinate/hold main-triggered provider auto-deploy before an independently authorized integration; this task changes neither main nor provider settings. Verify actual frontend and backend immutable deployed SHAs independently, then run synthetic-only login/workspace/CRM smoke. CI is not deployment evidence. No hosted database, backup, recovery, Render or Neon operation is performed here.

## Final local acceptance — 2026-10-25 (Asia/Calcutta)

Baseline and pre-publication HEAD: `800340a590941a471544fb5d4a2903bb5683cbeb`; branch `feature/v2-15a-crm-workbench`. The implementation revision is the commit containing this report, identifiable with `git log -1 --format=%H -- docs/reviews/V2-15A_CRM_WORKBENCH_ACCEPTANCE.md`. No main, ancestor PR or hosted revision is changed by local acceptance. Final resource reading: 2,839 MiB physical RAM available, 13.00 GiB committed, 19.67 GiB commit headroom. Heavy tools were sequential; no unrelated programs, paging settings, Docker or WSL were altered.

### Before / after

| Journey | Before | Accepted result |
| --- | --- | --- |
| Pipeline | Stage selector/counts above one server directory; honestly not a complete Kanban | Retained directory plus optional real stage board, independent pages/totals, three-stage windows, all supported server filters and explicit page ceiling |
| Lead navigation | Closing returns to the list, but cancelling an edit opened from detail did not reopen that Lead | Explicit contextual Back; page/search survive detail and edit; edit/cancel returns to the same Lead |
| Lead next steps | Existing add-follow-up and conversion; follow-up editing in the separate queue | Direct versioned follow-up edit from active Lead detail; keyboard shortcuts focus real follow-up/activity sections |
| Daily actions | Existing canonical Today/Overdue/Upcoming queues | Retained exact server view parameters, branch-local review and manual semantics; verified Lead create/review/save/return and existing queue failures/read-only access |

### Exact intended file inventory (six)

1. `frontend/src/pages/CRM/CrmPage.tsx` — integrate board, retain authority-bound workspace state, contextual Back/edit return, detail section focus and direct follow-up edit.
2. `frontend/src/pages/CRM/LeadPipelineBoard.tsx` — bounded server-stage reads, authoritative totals and independent pagination, scoped cancellation, original accessible record cards and honest states.
3. `frontend/src/pages/CRM/workbench.css` — route-local semantic-token styling and responsive layout, no global overflow concealment.
4. `frontend/src/test/crmWorkbench.test.tsx` — **12** new component cases (the original nine plus permission/entitlement replacement and late-response cancellation).
5. `frontend/e2e/v215a-crm-workbench.spec.ts` — **17** new discoverable default-suite cases, synthetic HTTP fixtures only; zero retries and unchanged default deadlines.
6. `docs/reviews/V2-15A_CRM_WORKBENCH_ACCEPTANCE.md` — retained checkpoint/history and final bounded acceptance evidence.

No backend, schema, migration, dependency/lockfile, CI, credential, asset, reference or provider configuration changes. Prior protected reports, other worktrees, `.cache` artifacts and ignored reference sources are excluded from staging. The paths above are repository-relative: the worktree physically resides under `.cache`, but `.cache` itself is never committed.

### Actual test results

| Gate | Final result / provenance |
| --- | --- |
| Full frontend ESLint | PASS, exit 0; completed original `npm run lint`, not an interrupted process |
| Final changed-file ESLint | PASS, exit 0 on all four changed TypeScript/TSX files after final test additions |
| TypeScript | PASS, exit 0 after correcting type annotations and Testing Library option types in the new test; no production contract relaxation |
| Production/PWA build | PASS, exit 0; 2,240 modules, 95 precache entries / 1,273.56 KiB. Existing mixed static/dynamic API-client import warning remains; no new chunk-size failure |
| Focused components, final | **45 passed, 0 failed, 0 skipped**, 3 files, exit 0, 54.50s: new workbench 12 + retained CRM/configuration 33. Historical 42/42 is superseded, not added |
| Production Chromium run | **15 passed, 0 failed, 0 skipped**, exit 0, 1.0m; original workbench journeys, independent permission/entitlement gates and nine visual cases |
| Final additional/recapture selection | **16 passed, 0 failed, 0 skipped**, exit 0, 1.3m; two added directory/follow-up journeys + five retained CRM pipeline/error/contrast cases + nine recaptured visual cases |
| Unique final browser coverage | **22 distinct cases** = 17 new + 5 retained. The nine visual cases executed twice for capture quality are not double-counted |
| Diff whitespace | PASS before publication; no assertion, retry, deadline or authorization guard weakened |
| New local PostgreSQL/Docker/full backend matrix | NOT RUN in this frontend-only batch; no backend contract changed. Full integrated acceptance is delegated to the single new exact-head Linux CI, not inferred from mocked tests |

Initial development-server browser attempt: **3 passed, 1 failed**, exit 1. The trace shows an unexpected full document navigation to `/crm` during the pipeline click, followed by missing Kanban control; it does not establish a CRM server assertion failure or a definitive cause of the navigation. A completed test run also stalled in development-server teardown; only the verified task-owned Vite process was stopped after preserving its artifacts. The same functional error/retry assertion passed unchanged against production assets. No timeout increase, retry, skip, force click or security weakening was introduced. Original failure evidence remains under `frontend/test-results/v215a-focused/`.

Initial component run: 38 passed / 4 failed due to the new fixture's invalid form-schema response. Corrected fixture; final 45/45 above supersedes it. All authorized selected local gates are complete; no interrupted result is counted as a pass.

### Responsive and accessibility review

Loaded and visually inspected all **27 recaptured images**, naming pattern `frontend/test-results/v215a-final/{390,768,1440}-{light,dark,system}-{board,detail,followups}.png`. System was tested with dark OS preference; retained accessibility tests also check semantic contrast. Prior captures remain under `frontend/test-results/v215a/`; production run status is retained separately in `v215a-production/.last-run.json`, and final additional selection in `v215a-final-regressions/.last-run.json` (both passed, no failed IDs).

Desktop now visibly captures three stage columns/cards; tablet/mobile stack without document or card horizontal overflow. Long synthetic names wrap, statuses/owners remain readable, branch-time labels are explicit, and mobile drawer occupies the available screen without bottom-navigation overlap. Native controls retain the established touch/focus tokens. Browser assertions cover trapped drawer focus, Escape, restored opener, focusable section headings, unsaved-edit protection, correct read-only controls, stage pagination and explicit read retry. Retained Light/Dark/System CRM contrast assertions passed. Screenshots are viewport evidence, not proof that every below-fold control is simultaneously visible; pagination and actions were exercised separately. No new reproducible visual defect required a source correction.

### Security and performance conclusions

New component checks establish organization/branch reset, membership/role reset, permission/entitlement reset, abort of a pending old-branch page and suppression of its late response. Browser checks establish no CRM record request without the independent route permission/entitlement, plus read-only controls and drawer focus. These frontend fixtures are not new proof of server-side cross-tenant rejection; unchanged server checks and PostgreSQL authority require integrated CI. Existing session transport, mutation replay prevention, versioned writes and conversion remain untouched.

CRM remains lazy-loaded: production `CrmPage` JS **46,462 bytes** (12.00 kB gzip), scoped CSS **1,850 bytes** (0.63 kB gzip). No trustworthy matching pre-change built bundle was available, so no fabricated byte delta is reported. At most three five-row stage reads are active for the selected board window; unused directory reads are disabled in board/follow-up mode. No decorative network calls or added dependencies.

### Verdict and publication boundary

**LOCALLY ACCEPTED for the bounded V2-15A CRM workbench candidate.** Full exact-head Linux CI, merge/integration approval and every staging release prerequisite remain separate. Durable Saved Views, drag/drop, automatic reminders, Tasks-to-Lead relationship design and other new backend capabilities are explicitly deferred; V2-15B is not started.

Publish only this feature branch and create a DRAFT PR dependent on draft PR #5. Existing CI runs only for PRs targeting main, so the proposed main comparison necessarily contains the unmerged PR #5/#4 ancestry as well as this six-file V2-15A increment. It must not be represented as a standalone six-file main diff or merged independently. Trigger the normal full workflow once by opening the draft; record exact SHA/run status externally after publication, without a report-only follow-up commit that would invalidate exact-head CI. No completion tag is authorized.

**NO-GO FOR REAL CUSTOMER DATA remains unchanged. Render Free remains synthetic staging-only. No merge, deployment, hosted migration or provider write is authorized.**

## Exact-head CI failure and bounded dependency correction — 2026-10-25

The original six-file UI candidate was committed/pushed as `d6ecce499caeff4d01406312e3ea9521427fe6cb` and published in DRAFT PR #6, dependent on #5. [Exact-head CI 40199813099](https://github.com/afsify/ekavio/actions/runs/40199813099) FAILED at **Audit backend dependencies** (exit 1). The application, PostgreSQL, browser, Tasks, Forms Studio, session and Docker gates did not execute; skipped gates are not passes. No application regression was established by that audit failure.

Only the failed dependency gate was investigated. Backend audit reported 4 vulnerable packages (2 high, 2 moderate). A bounded frontend audit confirmed the same fast-uri/Zod advisories plus a build-serialization advisory: 3 vulnerable packages (1 high, 1 moderate, 1 low). No forced audit fix, threshold relaxation, ignored advisory or unrelated upgrade was used.

| Package | Previous lock | Corrected lock | Scope |
| --- | --- | --- | --- |
| body-parser | 2.3.0 | 2.4.0 | Backend; upstream-required content-type 2.1.0, iconv-lite 0.7.3 and qs 6.16.1 are the only additional transitive updates |
| fast-uri | 3.1.8 | 3.1.9 | Both locks |
| nodemailer | 10.0.15 | 10.1.4 | Backend exact manifest pin retained, advanced to upstream-fixed version |
| zod | 4.4.3 | 4.6.7 | Both locks, within existing same-major declared range |
| serialize-javascript | 7.0.7 | 7.1.4 | Frontend build dependency, within existing parent range |

Upstream patch floors were checked against the primary advisories: [body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828), [fast-uri](https://github.com/advisories/GHSA-w74x-v6f9-j3xg), [Nodemailer](https://github.com/advisories/GHSA-85x2-q946-cp5h), [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [serialization](https://github.com/advisories/GHSA-m5mm-p8h7-m29v). Every changed lock entry was reviewed; no unrelated package change was found. HTTP/session/SMTP TLS policy, schemas and application code are unchanged.

Additional files for this correction (four, giving **ten distinct branch-increment files** including the six above):

- `backend/package.json` — exact Nodemailer pin only.
- `backend/package-lock.json` — four audit targets and body-parser's three required dependencies.
- `frontend/package-lock.json` — three confirmed audit targets only; no frontend manifest change.
- `backend/tests/dependencySecurity.test.ts` — three offline regressions: backend/frontend security-version floors and the quoted greater-than recipient-domain parser case. No email is sent and no hosted resource is used.

Post-correction evidence:

- Full backend npm audit: **0 vulnerabilities**, exit 0.
- Full frontend npm audit: **0 vulnerabilities**, exit 0.
- Task-local backend `npm ci --ignore-scripts`: PASS, exit 0, 313 packages; existing shared dependency installations and original worktrees untouched.
- Focused backend selection (`dependencySecurity`, `authSession`, `identityAccount`, `authMiddleware`, `authorizationTenancy`, `profileSession`): **63 passed, 0 failed, 0 skipped, 0 cancelled**, exit 0, 18.41s. Includes the three new offline regressions, one-winner refresh rotation, revocation, cookie preservation, tenant isolation and SMTP fail-closed boundaries.
- Focused backend ESLint and backend TypeScript: PASS, exit 0, sequential with a 1,024 MiB Node heap cap.
- Resource check: 2,364 MiB physical RAM available and 18.89 GiB commit headroom; free disk approximately 37 GiB. No unrelated process termination or paging modification.

The original frontend 45/45 components, 22 distinct browser cases, screenshots and production build remain valid evidence for the unchanged **UI source at d6ecce4**, not fabricated proof of the updated dependency runtime. The shared frontend installation was intentionally not rewritten. Post-correction frontend clean install/build/full regressions, full backend/PostgreSQL/Tasks/Forms/session/Docker acceptance remain **PENDING the new exact-head Linux CI**. No additional full local browser matrix or build was repeated against stale dependencies. The follow-up correction commit is separately reviewable and does not rewrite the original UI commit.

The final PR description must distinguish the original six-file UI increment from this dependency-only CI repair. Publish normally to the same V2-15A branch, keeping PR #6 DRAFT and #1–#5 unchanged. The automatic synchronize run for the corrected exact SHA is the required new candidate CI; do not manually rerun the known-vulnerable old candidate. Full integrated acceptance remains withheld until all mandatory gates succeed.
