# V2-12B Batch 2 — Premium Customer Management

2026-10-14 (Asia/Kolkata). Local implementation and acceptance only; publication
requires separate owner approval. **NO-GO FOR REAL CUSTOMER DATA remains unchanged.
Render Free remains staging-only.** No Batch 3 work or provider operation.

## Verified baseline

`main`, HEAD, origin/main and fresh remote main matched
`7c2e5ce768c525c76af08c9a9646fa50207de8c7` before editing and at reconciliation.
Exact accepted [CI 38518453813](https://github.com/afsify/ekavio/actions/runs/38518453813)
was independently read as completed/success on that complete SHA. Initially no
tracked, staged or unstaged changes; only the four preserved untracked reports.
No applicable AGENTS.md found. PROJECT_CONTEXT, ADR 0029 and the accepted Batch 1
report were reviewed. No checkpoint, reset, restore, stash, cleanup or Git rewrite.

The four strategy/V2-12A reports and both V2-10 canonical decision/register files
remain SHA256-identical to the starting evidence. Reference sources and the
intentional reference ignore rule remain untouched. Customer before/after phases
and failure artifacts are preserved. Retained shared-screen tests refresh their
fixed-name generated PNGs in the Batch 2 QA directory; their logs/traces are kept
in distinct per-invocation directories. No QA directory or source was deleted.

## Source audit and capabilities

| Source | Established contract retained |
| --- | --- |
| `frontend/src/pages/Customers/CustomersPage.tsx` | Organization directory; 250ms server search, bounded pages/sizes, one typed custom filter; fixed alphabetical server order; permission-gated commands; scoped cancellable queries and deep-link identity |
| `frontend/src/components/ui/AdvancedTable.tsx` | Explicit server mode never searches/sorts a received subset; canonical totals/pagination, loading/error/retry and desktop/mobile renderers |
| `frontend/src/components/ui/WorkspacePrimitives.tsx` | Semantic search, filter toggle/chips, states, sections, badges and pagination |
| `frontend/src/components/ui/AdvancedModal.tsx` | Modal/full-screen mobile sheet and drawer; focus trap, Escape, return focus and safe-area footer |
| `frontend/src/components/forms/CustomerFormFields.tsx` and `frontend/src/utils/customerDraft.ts` | Shared reception/directory canonical inputs and save path; unchanged name/phone/notes/status limits, phone compatibility and payload normalization |
| `frontend/src/components/forms/EntityFields.tsx`, `DynamicForm.tsx`, `formSchema.ts`, `frontend/src/hooks/useDynamicForm.ts` | Existing 13 types, configured section order/visibility, required fields, new-only defaults, archived history/choices, exact money/date semantics and scoped patches |
| `frontend/src/components/crm/CustomerCrmContext.tsx` | Existing bounded selected-branch converted-Lead links only with CRM permission and entitlement |
| `backend/src/controllers/customerController.ts`, `backend/src/routes/customerRoutes.ts`, `backend/src/domains/customers/repository.ts` | Existing PostgreSQL canonical/custom transactions, independent read/manage authority, parameterized search/filter and server paging; creation/update timestamps; no Customer optimistic-version API |

Before editing, retained accepted mobile/desktop screenshots and fresh loaded
390/1440 Light directory/detail/create/edit captures were inspected. Concrete
deficiencies: expanded filters crowded mobile records, one chip reset unrelated
criteria, mobile identity differed from desktop, edit was icon-only, metadata was
undisplayed, form descriptions were sparse and save failures lacked guidance.
Reception already guarded uncertain non-idempotent creation; the directory did not.

## Implemented changes

- Clear Customer heading/action hierarchy and a bounded search/filter panel.
  Optional filters start collapsed; existing controls, comparison choices and API
  semantics remain available. Separate search/filter removal and Reset all;
  private values remain ephemeral, never URL/storage preferences.
- Consistent initial/avatar and readable names; distinct statuses and labeled
  View/Edit actions. Customer-only table sizing prevents tablet action labels
  wrapping into multiple lines. Mobile cards retain full names and reachable actions.
- Structured identity, contact, notes, canonical/custom sections and existing CRM
  origin context. Real API creation/update timestamps explicitly display UTC;
  unavailable metadata is not invented. Technical identifiers stay in disclosure.
- Canonical name guidance and interaction-triggered inline required-name feedback;
  phone/notes descriptions are linked accessibly. Configured dynamic sections get
  semantic panel styling, without duplicating the field-definition editor or
  overriding the layout engine. Shared reception fields retain the same contracts.
- Schema/value loading, save announcements, read-only/empty/error/retry feedback
  and retained-draft advice. Save remains guarded; existing dirty confirmation and
  beforeunload protection remain. Lost/5xx create outcomes block replay using the
  existing uncertain-write classifier and explain that discarding a local draft
  cannot undo a potentially committed record. No invented idempotency/version API.

No backend implementation, route, schema, migration, dependency, font, branding,
theme store, authorization, entitlement, scope-switching or navigation-focus change.
No extra API request types or decorative analytics/counts. Existing lazy routes,
PostgreSQL authority, audit/data integrity and CRM conversion behavior remain.

## Verification ledger

Completed evidence is distinguished from failed attempts and repeated coverage.
All browser suites use Linux Chromium and zero retries; original per-suite test
and assertion deadlines remain unchanged. Only disposable local fixtures used.
Private authenticated runs disable automatic screenshots and traces.

| Gate | Result |
| --- | --- |
| Frontend lint / TypeScript / production-PWA build | PASS after final action-sizing change; affected helper/test lint also PASS |
| Full frontend components | 192/192, 18 files; includes five new Customer field tests |
| Backend lint / TypeScript / build / source-unit suite | PASS; 196/196 units, no skip/cancel |
| PostgreSQL dynamic fields | 19/19 runner tests |
| Retained runtime authority / legacy-isolation integration | 1/1 with separately isolated required legacy fixture |
| Customer synthetic acceptance | 80 distinct passing cases: recovered56 plus24 expanded-filter/dirty-dialog cases; repeated final24 action-sizing and final3 recovery/deep-link cases are not double-counted |
| Real PostgreSQL-backed Customer/form/reception workflows | 7 distinct passing cases: new2 Customer journeys, retained branch/filter/read-only/tenant1, select/layout/history1, ordinary manager1 and reception2 |
| Retained shared-screen, keyboard, accessibility and scope regression | Final separate clean50/50, exit0 (3.7 minutes); earlier failures preserved below |
| Candidate frontend Docker build | PASS; separate image, unchanged pinned bases and UID101 |
| Candidate local static routes/manifest | `/`, `/login`, `/customers`, manifest200; manifest `application/manifest+json`. Static route200 is not authenticated access proof |
| Compose configuration / existing normal runtime | PASS; normal PostgreSQL/backend/frontend healthy and untouched |
| Frontend complete dependency audit | Zero vulnerabilities; no package changes |
| Final whitespace/security/artifact review | Source/security review and whitespace check PASS; no staged files, secrets/builds/reference/test-results in intended inventory |

Diagnostic history retained: initial baseline2/4 and first focused8/9 had invalid
exact label-text locators; accessible combobox locators corrected, baseline4/4
and full54/54 then passed. A component-only unsupported test option was removed
after TypeScript caught it; final192 components and static gates passed.
The first database invocation was19/20 because the retained legacy-isolation case
required MONGO_TEST_URL; its genuine1/1 rerun used only a new disposable fixture,
never Atlas. One retained ordinary-manager run timed out after returning to Login;
unchanged isolated rerun1/1 and final choice/manager invocation2/2 passed. Its
root cause is unproven; no auth assertion, deadline or security policy was weakened.
No failed/incomplete attempt is relabeled a pass.

## Responsive and screenshot review

Required widths:320/360/390/430/768/1024/1440/1920; Light/Dark/System, with dark OS
preference for System capture and live switch back to Light asserted.
Reviewed all eight final contact sheets covering loaded directory/detail/create/edit,
plus representative original captures and lower scroll content/error states.
Visual review found tablet View/Edit labels wrapping despite global overflow checks.
The scoped width/nowrap correction was verified24/24 with an added one-line-label
assertion, without hiding document overflow or changing shared table behavior.

Ignored evidence root: `frontend/test-results/v212b-batch2-linux/`.
Before: `customer-experience/before-corrected/`.
Final directory/details: `customer-experience/final-actions/` (96 PNGs, including
full directories and lower drawer views). Forms/states: `customer-experience/final/`
(205 PNGs including8 earlier review sheets; earlier table captures retained, not
the final corrected table evidence). Final review sheets:
`customer-experience/review-final-{width}.png`. Final uncertain-state captures:
`customer-experience/final-extra/`. Original screenshots remain separate from
contact sheets. Known Chromium sticky-sidebar full-page paint gaps are not masked;
loaded viewport captures are primary shell evidence.

Named controls, long names, unavailable contact/notes/records, form errors, drawer
entry/Tab boundaries/Escape/trigger restoration, short-height dirty drafts and live
scope replacement are tested. These are scoped accessibility checks, not a WCAG,
physical-device or hosted-authentication certification.

## Bundle comparison

Same loopback API/socket build inputs; decimal kB / gzip kB. Both accepted baseline
and candidate builds were actually run. Docker candidate produces the same assets.

| Output | Accepted baseline | Final candidate |
| --- | --- | --- |
| Entry JS | 319.91 /101.68 | 319.97 /101.70 |
| CSS | 81.16 /15.69 | 85.03 /16.24 |
| Customers lazy chunk | 12.16 /4.41 | 15.57 /5.34 |
| CustomerFormFields | 1.21 /0.58 | 1.76 /0.82 |
| Dashboard | 8.51 /3.18 | 8.51 /3.18 |
| AdvancedTable | 3.79 /1.71 | 3.79 /1.71 |
| DynamicForm | 8.43 /3.22 | 8.43 /3.22 |
| PWA precache | 79 /1183.85KiB | 80 /1191.64KiB |

Growth is bounded presentation/help/error markup and scoped CSS; a tree-shaken
phone icon gets a shared chunk. No package/assets/font/animation library added.
Transfer-size evidence is not a claim of faster runtime/network latency. Existing
client static/dynamic-import and build plugin-timing warnings remain.

## Intended source/document inventory

Five modified files:

- `frontend/src/pages/Customers/CustomersPage.tsx`
- `frontend/src/components/forms/CustomerFormFields.tsx`
- `frontend/src/index.css`
- `frontend/e2e-experience/workspace.spec.ts`
- `frontend/e2e-fields/forms.spec.ts`

Five new files:

- `frontend/e2e/customer-experience.spec.ts`
- `frontend/e2e-experience/customer-experience.spec.ts`
- `frontend/src/test/customer-experience.test.tsx`
- `frontend/e2e/review-customers.mjs`
- `docs/reviews/V2-12B_BATCH2_CUSTOMER_EXPERIENCE.md`

Existing tests only add the deliberate Filters opening interaction; no meaningful
assertion removed. The four original untracked reports are not part of this batch.
Screenshots/traces, local bridge, synthetic database state, dist and references stay
ignored. No `.env`/credential/backup/resume/reference source enters the intended diff.
Nothing staged; no commit, push, tag, hosted action or exact-new-commit CI is claimed.

## Limits and proposed separately approved Batch 3

Customer optimistic version conflicts, new status/multi-filter/sort APIs, advanced
dynamic types/conditions/formulas/field permissions, history/balances and new backend
business capabilities are deferred, not invented. No full all-domain browser/database
matrix or hosted Customer authentication is claimed. The retained Login timeout
above remains an unexplained diagnostic even though genuine final reruns passed.

## Recovery reconciliation and final receipts (2026-10-14)

Expected working tree recovered: five modified files and five new Batch 2 files,
plus four protected untracked reports. The earlier approximate eleven-file count
is not substituted for the actual ten-file intended Git inventory. Nothing staged;
HEAD/origin/fresh remote still the accepted SHA, and exact accepted CI still success.
No implementation restart, backend edit or new checkpoint.

Current source and retained Linux `/qa` snapshot matched byte-for-byte:

- CustomersPage: `c177dc6bc1384e9644d4519bc381b1b3fcbe173435a9704f73c05de13a52027b`
- CustomerFormFields: `1f12f7bd65b52cbdafc074824c8ccbf695dfe447dc2e129c64d81e32e75275ea`
- CSS: `9d15d00eaaa5915efeb086061b7da7aeee5ccbde8af9986817dc1582dd8b9261`

No application source changed during recovery. Added only focused test assertions,
the screenshot helper's recovery mode and this evidence reconciliation. Retained
before/after, final-action and lower-dialog captures therefore remain applicable;
the later CSS adjustment targets directory actions, not form layout. New24 cases
capture expanded filters and unsaved confirmations across every required width
and theme, including complete reset, retained drafts and return focus. The focused
server test now additionally proves both active chips remain visible while the
filter controls are collapsed. Reviewed all eight additional recovery sheets.

Recovered terminal receipts from this conversation and completed retained artifacts:
Customer54/54 exit0; final action-sizing24/24 exit0; extra3/3 exit0; real Customer3/3
exit0; reception2/2 exit0; final select/layout/history plus ordinary manager2/2 exit0.
Duplicate cases are not added to distinct totals. Database history remains19 passes
in the first20-test invocation (exit1 for missing legacy prerequisite), followed by
the remaining runtime1/1 exit0; this is20 passing cases, not a rewritten20/20 run.
The preserved ordinary-manager failure shows Login after navigation; there is no
retained evidence proving expiry, fixture disposal, cross-test/branch leakage or
an application regression. Its unchanged1/1 and final2/2 reruns genuinely passed.

Recovery frontend fail-fast command: lint0, TypeScript0, components192/192 (18 files)
and production/PWA build0. Bundle measurements above reproduced exactly. Final
affected test/helper lint0. Candidate static container was healthy before teardown, UID101;
normal runtime untouched. No additional real/database suites were required because
the application and fixture contracts did not change in recovery.

The lost terminal receipt for the older shared-screen run was not inferred from
its `passed` last-run artifact. A new74-case recovery invocation completed72 passes,
two failures, exit1: Queue and Settings390/Dark stalled in initial `page.goto` until
the unchanged30s deadline. Network traces contained only their document requests,
without recorded HTTP responses, before UI assertions. No server error in bounded
QA logs establishes a cause. Unchanged focused rerun of both plus the strengthened
filter case passed3/3, exit0 (19.9s). The original failures remain unexplained, not
relabeled; no assertion, retry or timeout was changed. New24 Customer cases passed
within that completed invocation. The separate clean50-case retained run then
passed50/50, exit0 (3.7 minutes), including both navigation cases. This resolves
the final shared-screen gate without rewriting the failed72/74 invocation.

New bounded logs: `frontend/test-results/v212b-batch2-recovery/browser.log`,
`focused.log`, `retained-clean.log`. Failure traces stay in the original
`v212b-batch2-linux/recovery-final-regressions/`; source-matched new sheets are
`customer-experience/review-recovery-{width}.png`. No private auth traces/screenshots
or sensitive artifacts are included in the intended Git diff.

Final distinct browser coverage:80 Customer presentation/interaction cases,
50 retained shared-screen/accessibility/scope cases and7 real PostgreSQL workflows.
These are coverage across the recorded invocations, not a fabricated single137/137
run. All required final local gates now have passing evidence. Full intended diff
review confirms unchanged query/mutation payloads and server authority, retained
phone/dynamic-form contracts, bounded paging, and create replay blocked at both
submit-button and submit-handler boundaries. No runtime credential persistence,
provider write, backend/migration change or new dependency is present.
`git diff --check` passes; nothing staged; the four protected reports and canonical
V2-10 files remain byte-identical. Ten intended Batch2 files are retained for owner
review. No commit/push/tag/deployment/new-commit CI or Batch3. **Local Batch2
acceptance is justified; publication remains explicitly unapproved.**

Only the four containers independently verified with the `v212b-batch2` ownership
label were stopped after acceptance. No container, volume, database, image or
artifact was removed; normal and older QA services were untouched. The already
absent loopback API listener was not restarted unnecessarily. Working tree remains
five modified plus five new intended files and four preserved planning reports;
no stage/commit/push/tag/deployment. Next action requires explicit release approval.

Proposed Batch 3: existing-capability CRM relationship/detail density, authorized
Customer-origin links and consistent bounded record/filter actions after a focused
source/rendered audit. Preserve CRM conversion, versions, branch scope and grants;
no pipeline automation, new endpoint or backend feature implied. **Not started.**

Await owner review/publication approval. NO-GO and Render Free staging-only unchanged.
