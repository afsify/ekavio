# V2-12C Batch 2B — Tasks UX refinement

2026-10-16. **Local Batch 2B implementation and acceptance: PASS. Not published.**
**NO-GO FOR REAL CUSTOMER DATA. Render Free remains staging-only.**

## Recovery and preserved baseline

`main`, HEAD, origin/main and fresh remote main match
`374fe470e4c2f0c1ac3e30078dea2ec9f68fb7c4`. Accepted baseline CI is
[38736930221](https://github.com/afsify/ekavio/actions/runs/38736930221);
no new commit or CI is claimed. Starting inventory: 33 tracked modifications,
29 untracked files, empty index. Recovery adds only `tasks-attention.spec.ts`;
all 62 original file hashes still match the captured starting snapshot.
No applicable AGENTS.md found. PROJECT_CONTEXT and Batch 0/1/2, Customer and CRM
acceptance records were reviewed. Original reports remain historical, unchanged.

The managed browser bootstrap failed before navigation (missing sandbox metadata).
Existing local Linux Chromium is used, with read-only source/dependency mounts,
ordinary application middleware and a unique synthetic PostgreSQL database. New
ignored evidence root: `frontend/test-results/v212c-batch2b/`. Older QA evidence
is preserved. No company reference application was installed/executed or contacted.

The interrupted Docker command was **not executed**: automatic command review hit
its usage limit, not a failed application assertion or unsafe-action determination.
It was resubmitted through normal approval after continuation; no bypass was used.
Earlier preview startup without required process-local VITE URLs failed safely;
fixed only the local command environment. A misquoted initial grep started the
wrong selection against the unavailable preview; that diagnostic run was stopped,
not accepted. Corrected before-state runs have separate output paths.

## Focused source and before-state findings

Audited `frontend/src/pages/Tasks/{TasksPage.tsx,forms.tsx,contracts.ts,Tasks.css}`,
`pages/CRM/CrmPage.tsx`, `pages/Customers/CustomersPage.tsx`, `pages/Dashboard.tsx`,
shared `WorkspacePrimitives`, `RelationshipRecords`, `AdvancedTable`,
`AdvancedModal`, and accepted semantic styles in `src/index.css`.

Read-only supplementary reference: `reference/biz_crm-main/frontend/src/modules/
tasks/{TaskTabs,TaskTable}.tsx`. Its assigned-by/tagged scopes, browser-relative due
calculation, counts and extra lifecycle are **not** EkaVio contracts. No code,
branding, assets, dependencies or reference auth was copied.

Actual loaded 390 Light and 1440 Light Tasks directory/detail/form captures and
matching 390 Light CRM were inspected before application edits. Concrete issues:

- Deadline shortcuts/Completed are buried in expanded selects; unlike CRM's
  Follow-up choices, everyday work views are not immediately discoverable.
- Active filters have generic copy rather than independently removable chips.
- Task titles have body-weight styling; table priority/status share one busy cell,
  and deadline/assignment read like undifferentiated text.
- Mobile cards have an unstructured secondary action, while assignee/deadline have
  little visual hierarchy. Both named title and explicit View access should remain
  available, as in the accepted Customer pattern, with a clearer action footer.
- Drawer lifecycle actions follow the entire potentially 5,000-character
  description, requiring excessive scrolling to start/complete work.
- Forms have little visual grouping; assignment follows schedule rather than
  ownership-first flow, and review lists field keys rather than readable facts.

Reuse CRM/Customer concepts: semantic section navigation, restrained badges,
independent FilterChip removal, server directories, structured identity/facts,
reviewed commands and compact mobile actions. Do not copy CRM analytics: Task
API supplies filtered totals, not global attention counts. Keep all/current page
facts separate from complete-dataset claims. No backend behavior change.

`tasks-attention.spec.ts` is intended regression coverage, not a disposable
diagnostic: it seeds through the real Task API, completes one task, verifies real
overdue/completed details and canonical permitted/absent actions at all eight
widths/themes. It complements the existing directory/form/conflict matrix, not
additional authority proof from mocked screenshots. Fixtures require only the
existing loopback Task browser server and disposable PostgreSQL harness.

## Implementation and security boundary

- Visible All/Today/Overdue/Upcoming/Completed work choices use exact existing
  `attention` or `status=completed` parameters. `aria-pressed` represents selection;
  changing the work view preserves unrelated search/priority/assignee/order, resets
  only the page and mutually exclusive status/deadline criteria. No aggregate counts.
- Shared FilterChip offers independent criterion removal outside collapsed filters.
  Reset remains explicit; pending/results are announced with server-filtered totals.
  Criteria remain ephemeral, not persisted in URL/storage or loaded into memory.
- Readable Task identity, restrained status/priority/deadline hierarchy, genuine
  assignee icons/names, bounded desktop columns and compact mobile fact/action rows.
  Overdue is both text and semantic tone; null dates retain No deadline.
- Drawer identity and canonical permitted actions precede long description text.
  Responsibility/deadline and actual completion/cancellation timestamps are separate
  from creation/update metadata. No creator name is invented; actual history remains
  server-paged and displays real actors, versions, dates, reasons and changed fields.
- Forms group information, eligible assignment, priority/deadline and review/save.
  Review shows actual chosen assignee, priority, local deadline and human field names.
  No command preparation, version, null/omission, validation, draft, uncertain-outcome
  replay, query key or authority contract was replaced. Search/paging of assignees
  still uses the authorized eligible endpoint, not a local full-directory filter.
- Only Task classes changed. Existing theme tokens, reduced motion, shared focus
  containment/Escape/restoration, modal safe-area/footer, lazy route, cancellable
  scoped queries and all backend/RBAC/entitlement contracts remain unchanged.

Initial focused components passed 28/28, exit 0. Pre-guard full components passed
234/234 across 21 files, exit 0; four theme-bootstrap Node contracts separately
passed. Lint, TypeScript and production build exited 0. A new test's
unsupported Testing Library `exact` option was caught by TypeScript and removed;
exact accessible-name assertions remain. No lint rule/assertion was disabled.

Before captures completed: separate mobile 1/1 and desktop 1/1, Dark/System/
read-only 8/8, overdue/completed 2/2; all exit 0. Matching CRM comparison 6/6,
exit 0 (390/1440 × Light/Dark/System), superseding the duplicate early mobile run.
Original-resolution mobile/desktop identity, details, edit/create and CRM directory/
detail were visually inspected. System resolves a dark OS, separately tested from
the explicit Dark preference. These are actual loaded captures, not file counts.

Initial focused production browser selection: 3 passed, 1 failed, exit 1.
The new keyboard test pressed Tab before asynchronous drawer actions existed.
It now waits for the actual loaded action and asserts initial Close focus before
checking the same successive Tab positions. Unchanged deadlines/retries; corrected
keyboard + 768 attention/contrast/hit-test selection passed 2/2, exit 0.
Initial full browser invocation also exposed the new contrast probe measuring
only five view buttons while records were pending. Added an explicit positive
loaded-record assertion before measuring; kept minimum nine targets and 4.5:1.
The original failures remain recorded, not relabeled as successful commands.

### Genuine application defect found by real workflows

The first 79-case aggregate finished **75 passed / 4 failed**, exit 1, 10.8 minutes.
Two were the contrast setup issue above. Owner cancel and staff progress exposed
an actual frontend stale-version race: actions moved earlier in the drawer could
be used while a successful prior command's background detail refresh retained
the previous version. The owner cancel snapshot retained version 2 after a version
3 reassignment; the server correctly returned 409. This is not a backend defect,
and no version/authorization assertion was weakened.

Task action buttons now disable while `selected.isFetching`, with an explicit
refresh announcement. The next form uses the returned current version, not an
optimistic increment. Added a deferred-query component test proving all lifecycle/
edit buttons stay disabled, cannot open a new decision, then use version 4 after
the fresh response. Its first immediate assertion preceded React Query's scheduled
notification; corrected setup waits for rendering while retaining every disabled/
payload assertion. Focused Task components now **31/31**, exit 0. All **six unchanged
real Task workflows** then passed, exit 0 (51.8 seconds).

Final visual source review also scopes directory-title typography/hover to actual
buttons (so the drawer identity retains its larger heading and has no fake link
affordance) and aligns priority/deadline controls to the top rather than stretching
the priority select to the help text's height. Since the app changed, complete
current-source browser acceptance is rerun with new artifact paths; previous
75/79 is not treated as a final PASS. No retries or deadline increases.

Final current-source components: **235/235**, 21 files, exit 0, including 31 Task/
scope cases; four theme-bootstrap contracts independently pass, exit 0. Final full
lint, TypeScript and rebuilt production/PWA artifact pass, exit 0.
`build-version-guard.log` and `components-accepted-source.log` are the final artifact/component
receipts; earlier runs are retained diagnostics, not additional unique tests.

The final application source is frozen at SHA256:

- TasksPage.tsx: `9D7A92794F3760D116CE034017D0CE60E87E1B744C8D3D996853350C618FDD2F`
- Tasks.css: `5FA8B3901E5EC41A5A25248C941BC5F1936D32AD33E19370E79179D982ADC475`
- forms.tsx: `8905716D2BF4F13B35C3D5395DDF9303477B62FFF24F03020719661BB1D5772C`

Built assets `TasksPage-Bl08Gb1N.js`, `TasksPage-DJqsoJzR.css`,
`index-3RuVk2lI.js` and unchanged `index-evdf1oXb.css` match the sizes below.
Generated CSS independently contains the final button-scoped title and schedule
alignment corrections. No application edits follow this build.

### Measured production bundles

Both starting and candidate builds actually ran with the same explicit loopback
API/socket inputs. No environment file, dependency, font or public asset changed.

| Asset | Before bytes | Candidate bytes | Delta |
| --- | ---: | ---: | ---: |
| Entry JS | 323,046 | 323,088 | +42 |
| Global CSS | 92,192 | 92,192 | 0 |
| Lazy Tasks JS | 23,181 | 26,933 | +3,752 |
| Lazy Tasks CSS | 3,153 | 5,864 | +2,711 |

Tasks gzip JS 7.54 → 8.34 kB; CSS 0.97 → 1.51 kB. Entry gzip 102.60 → 102.62 kB.
Global CSS gzip 17.33 kB unchanged. Growth is route-local presentation, shortcuts,
review markup and scoped styles, not decorative network calls or packages.
Existing ineffective client dynamic-import/plugin timing notices are retained.

### Intended Batch 2B inventory

Refined existing unpublished Batch 2 files (six):

- `frontend/src/pages/Tasks/TasksPage.tsx`
- `frontend/src/pages/Tasks/Tasks.css`
- `frontend/src/pages/Tasks/forms.tsx`
- `frontend/src/test/tasks.test.tsx`
- `frontend/e2e-tasks/tasks-responsive.spec.ts`
- `frontend/e2e-tasks/review-matrix.mjs`

New (two):

- `frontend/e2e-tasks/tasks-attention.spec.ts`
- `docs/reviews/V2-12C_BATCH2B_TASK_UX_REFINEMENT.md`

QA output/logs/screenshots/build artifacts remain ignored and unstaged. Original
Batch 1/2 reports and five planning reports are not part of this batch's edits.

### Final acceptance receipts

All commands below completed; no skipped/interrupted test is counted PASS. Browser
suites ran sequentially, one worker, zero retries, original 45s Task / 10s expect
and retained 30s suite deadlines. Windows Node 24.16.0 application/tooling, existing
Linux Playwright 1.63.0 Chromium/Node 24.20.0 runner and local PostgreSQL 17.11.
This is not new exact-commit Ubuntu/Node 20 CI or hosted authentication evidence.

| Gate | Final result / exit | Receipt under ignored Batch 2B root |
| --- | --- | --- |
| Complete frontend components | 235/235, 21 files; 0 | components-accepted-source.log |
| Included Task/scope components | 31/31; included above, not additive | same full component run |
| Theme-bootstrap Node contracts | 4/4; 0, separate runner | same frontend test command |
| Full frontend lint | PASS; 0 | lint-release-local.log |
| TypeScript | PASS; 0 | typecheck-release-local.log |
| Production/PWA build | PASS; 0 | build-version-guard.log |
| Complete final-source Task production browser suite | **79/79; 0; 12.2 minutes** | tasks-accepted-source.log |
| Included real PostgreSQL Task workflows | 6/6; inside 79 | same complete suite; earlier focused six not added |
| Included base responsive matrix | 24/24; inside 79 | eight widths × three themes |
| Included conflict/history/read-only matrix | 24/24; inside 79 | all eight widths/themes |
| Included attention/sticky-header/contrast matrix | 24/24; inside 79 | all eight widths/themes |
| Included keyboard-only completion | 1/1; inside 79 | normal middleware and real committed history |
| Fresh accepted CRM comparison | 6/6; 0 | crm-comparison.log; mocked HTTP presentation, unchanged source |
| Retained Customer/shell/accessibility selection | **16/16; 0; 2.1 minutes** | retained-final.log |
| Review helper syntax / affected helper ESLint | PASS; 0 | node --check / lint-last-helpers.log |
| Complete image review generation | PASS; 0 | review.log; missing required image fails rather than skips |
| Source/security/whitespace/index/preservation | PASS; 0 | direct Git/hash/allowlist checks below |

The final clean 79-case command supersedes all earlier diagnostic attempts. The
24 attention cases retain minimum nine contrast targets and 4.5:1, assert selected
ARIA state, real open-overdue versus completed records, 44px control height and
unobstructed control centers after keyboard focus returns from lower records,
including 768px. Existing real workflows retain all original payload/history/count,
eligibility, cancellation/reopening, no-entitlement/revocation, foreign-tenant/branch,
partial-update, stale-version, unsaved-draft and response-loss assertions.

The retained 16 comprise nine Customers cases (390/768/1440 × three themes),
three overview contrast/accessibility cases, dirty-draft/short-height protection,
compact keyboard navigation, authoritative context switching and mobile modal/
drawer Escape/focus restoration. All original test sources/assertions unchanged.
Prior Batch 2 HR My Work **15/15** and backend/recovery receipts remain retained
source-matched evidence, **not newly executed** or added to current totals; no
shared style/component or HR source was modified. No unnecessary broad rerun.

### Final visual review

Reviewed actual loaded before images and matching accepted CRM presentation at
390/1440 Light/Dark/System, then **all eight** final `review-{width}.png` sheets
and `before-after.png`. Before/after pairs cover My/Team, detail, creation, editing
and read-only; these are independent synthetic records, not one claimed continuous
record history. Original-resolution spot reviews include final 320 Dark details,
320 Dark overdue focus, 390 Light completed/history, 320 Light error, 768 System
edit schedule and 1024 Dark Team directory. Prior before-state originals were
reviewed for the actual deficiencies above, not merely counted.

Widths: **320, 360, 390, 430, 768, 1024, 1440, 1920**. Each covers explicit Light,
Dark and System (dark OS preference). Final screenshot root `accepted-shots/`:
18 states × 24 width/theme combinations + 15 narrow navigation captures = **447
required PNGs**. One initial-fold diagnostic, eight contact sheets and one paired
comparison produce 457 files total; images are not test counts. Earlier runs and
their failed evidence remain separate and were not overwritten.

Review outcome: clear selected work views without fabricated counts; readable
long titles, real semantic priority/status/overdue labels, bounded desktop columns,
compact mobile fact/action rows, higher drawer actions, grouped ownership/schedule
inputs, correct priority control height, readable actual history and distinct
read-only/conflict/error states. All initial-title visibility, document/dialog/
input/footer bounds, focus containment/Escape/restoration and filter hit-target
assertions pass. No global overflow concealment, hidden Task records or relaxed
assertions were used. No remaining visual blocker found in this scope.

This is scoped Chromium/keyboard/computed-contrast evidence, not full WCAG,
physical-device or assistive-technology certification. Shared mobile confirmations
retain their existing full-height safe-area presentation; no new modal system.

### Source/security and preservation review

The starting 62-file snapshot remains available for direct SHA256 comparison.
Only the six enumerated existing frontend/test files differ; all other **56**
starting files remain byte-identical, including every Batch 1 file, the test-only
backend browser harness, both original acceptance reports and five planning
reports. Exactly two new files are introduced by Batch 2B. No backend, route,
migration, commercial/RBAC policy, recoverability or old test assertion changes.
No new environment/credential, console logging, unsafe HTML, persistent Task
draft/command storage, unbounded query, package or asset. All Task queries retain
AbortSignal, scoped identities, zero retries and no inactive private cache.

CRM, Customers, Dashboard, HR, shared shell/components/styles, `.gitignore`,
lockfiles and approved public assets remain outside this batch's changes.
Both canonical V2-10 registers retain their recorded SHA256 values. Reference
sources remain ignored/read-only. Normal Git whitespace checks pass, empty index.
A command-local `core.autocrlf=false` diagnostic misinterpreted existing CRLF as
trailing whitespace; normal repository normalization passed without rewriting
any file or changing Git configuration.

Retained Batch 1 backend units/SQL/concurrency/recovery and Batch 2 CRM/HR/shell
receipts remain source-matched. No broad backend/Docker rebuild or full HR matrix
is repeated for Task-only presentation. Fresh CRM comparison exercises unchanged
presentation; a bounded retained Customer/navigation selection is the additional
shared-screen check. Mocked CRM/Customer screenshots are not PostgreSQL authority
evidence; real Task workflows use the ordinary app and local PostgreSQL.

### Final Git and combined readiness

Fresh remote main, origin/main and HEAD remain the accepted SHA; branch `main`.
**33 tracked modifications + 31 untracked files = 64 entries**, nothing staged.
This is the original 62-file unpublished Batch 1/2 state plus this addendum and
the attention test, not 64 new Batch 2B changes. The six refined files and two new
files above are the exact Batch 2B inventory. All 56 non-refined starting hashes,
including every backend/Batch 1 file, original reports and five planning reports,
remain unchanged. The three final application hashes above match the tested build.
QA, dist, reference and environment files are ignored; no backup, credential,
generated build or diagnostic is staged. No dependency/lockfile/asset change.

Combined backend + frontend Tasks are **locally accepted** within the approved
scope. No known local Task implementation gate remains open. Physical/assistive
device QA, load/capacity, current hosted schema recovery, real grants and staging
rollout are not claimed. Retained dependency audits are unchanged historical
evidence; no new audit/remote CI, Docker candidate build or provider inspection.

Only this batch's owned loopback QA services and labeled Linux browser container
are stopped after the completed review; no container, volume, evidence, source or
encrypted archive is deleted. Pre-existing normal/QA containers are preserved.
No claim of an independently verified database-drop/cleanup receipt is made.

## Publication boundary

No commit, push, tag, deployment, hosted SQL/provider operation or real entitlement
change. Owner states both Render services auto-deploy main; publication needs a
separately approved coordinated 021 rollout, named database/schema/checksum review,
current encrypted backup/recovery proof, prior-binary compatibility/rollback plan,
mandatory exact-commit Task CI and independently verified deployed revisions.
Readiness SELECT 1 is not a migration barrier. Local PostgreSQL 17 proof is not
hosted PostgreSQL 18 recovery. No Dashboard Batch 3, notifications or new feature.
