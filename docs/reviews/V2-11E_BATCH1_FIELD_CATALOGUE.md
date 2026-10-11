# V2-11E Batch 1 — Field catalogue and contextual editor

Scope: approved Batch 1 implementation and intermediate publication; not a V2-11E
release or full-milestone acceptance. NO-GO FOR REAL CUSTOMER DATA and Render
Free staging-only restrictions remain unchanged. Batches 2–4 are not authorized
in this session.

## Recovery and preservation

Recovered `main` at `3bfc3baf9359c3270f447eb2789557b74f32c463`; local HEAD,
origin/main and freshly queried remote main agreed before implementation.
The prior untracked `V2-11E_SOURCE_AUDIT_AND_PLAN.md` remains preserved unchanged.
Existing reference source and diagnostic artifacts remain ignored and untouched.

Created and pushed the one authorized annotated checkpoint:
`pre-v2-11e-unified-experience-forms-studio`.
Tag object: `89bd5c5b99f45a42c083e50f477e4e2585863e8d`.
Verified remote peel: `3bfc3baf9359c3270f447eb2789557b74f32c463`.
The checkpoint is unchanged. Batch 1 publication is now authorized separately;
no V2-11E completion tag is authorized.

## Delivered UI

- Six human-readable entity names and thirteen existing type names.
- Loaded-definition-only search and combined lifecycle/type/capability filters;
  factual active/lifetime counts, help, option counts and metadata badges.
- Short visible inspect/edit actions with record-specific accessible names;
  read-only inspection, empty/no-match, skeleton, denied and reloadable error states.
- Shared contextual drawer with identity, behavior, capabilities, options,
  defaults, review and save groups. Existing key/type and saved option keys are
  immutable. Stable option identities/order/archive history are retained.
- Inline presentation validation plus authoritative server errors; original
  version retained during concurrent conflicts, dirty cancellation confirmation,
  pending-write locking and synchronous duplicate-submission guard.
- Uncertain outcomes block replay and direct the user to the authoritative
  catalogue. Exact decimal/currency strings and false checkbox defaults remain
  uncoerced. Choice defaults use saved option identities through DynamicForm.
- Operational-scope keyed workspace discards old configuration/drafts when
  user, tenant, branch, permissions, entitlements or operator context changes.
- Scoped semantic CSS only; Light/Dark/System, shared modal/focus/inputs/badges,
  existing React Query and API mutation infrastructure are reused.

No backend changes, migrations, API contracts, dependencies or record-form engine
changes. No copied reference code, executable organization content, formulas,
conditional fields, new entities/types or field-level permissions.

## Changed files

Modified:

- `frontend/src/pages/Settings/CustomFieldsPage.tsx`
- `frontend/src/index.css`
- `frontend/e2e-fields/forms.spec.ts`
- `.github/workflows/ci.yml` (narrow responsive acceptance integration)

Added for Batch 1:

- `frontend/src/components/forms/FieldCatalogue.tsx`
- `frontend/src/components/forms/FieldDefinitionEditor.tsx`
- `frontend/src/components/forms/fieldDefinitionUtils.ts`
- `frontend/src/test/fieldCatalogue.test.tsx`
- `frontend/playwright.fields-visual.config.ts`
- `frontend/e2e-fields-visual/catalogue.spec.ts`
- `frontend/e2e-fields-visual/review-matrix.mjs`
- `docs/reviews/V2-11E_BATCH1_FIELD_CATALOGUE.md`

The prior audit is included unchanged as a historical audit-phase record.
App.tsx, backend, lockfiles, reference source and .gitignore are unchanged.

## Targeted verification

Final frontend lint and TypeScript checks passed. Full component suite passed
**132/132** across **13 files**, including retained dynamic-field regressions and
11 new catalogue/editor tests. Production build passed with explicit non-secret
loopback API/socket build configuration: 438 modules, 78 PWA precache entries,
317.62 kB entry (101.00 kB gzip), 77.11 kB CSS (15.06 kB gzip), and a lazy
26.00 kB CustomFieldsPage chunk (7.66 kB gzip). The existing API client mixed
static/dynamic-import warning remains; no entry-bundle performance claim is made.

`backend: npm run test:dynamic-fields` passed **19/19** (18 subtests plus parent)
against isolated disposable PostgreSQL, covering typed values, limits, immutable
identities, archives, version checks, atomicity, defaults, retry behavior and
tenant/business-authority boundaries. Later changes were presentation-only.

`frontend: playwright.fields.config.ts` retains fourteen existing cases and adds
two real API/browser cases: stale editor versus concurrent canonical winner;
saved option UUID order/archive/default persistence. It covers create/edit,
record history, previews, canonical entity permissions, foreign tenant/branch,
configuration-only access, entitlements and all thirteen type previews.
Final execution passed **16/16**, with zero retries, after the final component
action-label changes.

These local implementation checks did not include a broad release matrix,
unrelated backend gates, hosted mutations or a Docker production rebuild.
The existing full CI workflow remains required on the exact published Batch 1
commit; earlier V2-11D CI is not Batch 1 acceptance evidence.

## QA provenance and issues found

The managed in-app browser failed before opening a page because its sandbox
metadata lacked `sandboxPolicy`. Used local Playwright Chromium instead, with
disposable authenticated QA fixtures and a retained Linux QA Vite container.
Sanitized visual DTOs are presentation evidence, not database/authority proof.

Initial failures were not counted as passes:

- Windows case collision between a helper and component: renamed the helper to
  `fieldDefinitionUtils.ts`, then reran TypeScript/lint/component checks.
- Ambiguous new control labels: scoped test locators to the editor dialog.
- Reserved `versioned` test key: server correctly rejected it; changed only the
  disposable fixture key, preserving the server restriction.
- One initial System navigation case remained at login within its existing
  deadline. The full unchanged rerun passed; no definitive cause is claimed.
- Initial visual geometry checks passed despite stale Linux Vite CSS/source transforms. Actual
  screenshot inspection exposed cramped checkbox descriptions and clipped long
  summaries. Restarted only the disposable QA Vite server, verified a new
  computed-style and current-visible-label assertions, and reran the matrix.
  Docker bind-mounted changes required another QA restart after final action
  polishing; screenshots from the earlier transforms are not final evidence.
  Its startup dependency
  initialization briefly made Playwright unavailable; waited for readiness,
  without editing dependencies or security policy.
- Corrected two new CSS references to the existing semantic border/text-muted
  tokens. Shortened visible card actions and corrected screenshot scroll framing.
- One final build invocation omitted required build URLs and failed as designed;
  reran with explicit non-secret loopback URLs, without changing environment files.

All original assertions, deadlines and zero-retry policies are preserved. Manual
reruns are explicit; incomplete or failed runs are not acceptance evidence.

## Remaining boundaries and Batch 2 concerns

Layout editor and previews remain existing functionality: no drag-and-drop,
layout-studio redesign, independent preview engine or six-entity form rewrite.
Layout drafts still use the live schema version; capturing their original version,
dirty guards/reset confirmation and independent preview draft state belong to
Batch 2. Definition saves now retain an unrelated unsaved layout rather than
silently clearing it, so Batch 2 must define stale-draft reconciliation explicitly.
Schema/value invalidation remains the existing broad query-prefix behavior.

Search is bounded local definition search, not server-global record search.
Capability flags do not invent module filtering/reporting features. Creation of
choice defaults requires saving stable option identities first. Server validation
remains authoritative; client validation is not a replacement for it.

## Final browser and screenshot review

Final source-verified Linux Chromium execution passed **28/28**, with zero
retries: 24 combinations of 320/360/390/430/768/1024/1440/1920px and
Light/Dark/System, plus empty/error/denied/loading cases. The test checks current
visible action labels and computed editor CSS, not only document geometry.
System-mode OS flips, reduced motion, document/dialog containment, keyboard focus,
opener restoration, input/select bounds and footer hit-testing passed.

Inspected all **24 contact sheets**, showing **192 loaded-state screenshots**:
catalogue cards, editor, actual long-choice controls, inline validation, review,
dirty confirmation, read-only catalogue and inspection. Also inspected all four
320px feedback screenshots. Full-size checks included 320px Light catalogue,
320px Dark options, 390px Light validation, 320px dirty confirmation/inspection,
1024px Dark editor, 1440px Light review and 1920px System catalogue. Long summaries
wrap; controls and footer actions remain readable/usable in scrollable drawers.
No outstanding Batch 1 visual defect was identified in this review.

Final safe presentation evidence is ignored under
`frontend/test-results/v211e-batch1-visual/`: `matrix-{width}-{theme}.png`,
`{width}-{theme}-{state}.png`, and `320-light-{empty,error,denied,loading}.png`.
Contact sheets are review aids; full-size originals are retained. The last change
was test-only empty-state screenshot framing. A PowerShell/native argument
quoting issue selected the full visual suite instead of the intended single case;
that explicit extra run also passed 28/28. No runtime source was changed afterward.

Final lint/typecheck were rerun for the test-file change. Tracked and untracked
whitespace checks passed. Reviewed production/UI source, test additions and
artifact exclusions: no new HTML execution, credential storage/logging, backend
authority changes or secret/environment edits. Only test theme preferences use
localStorage. No files are staged; reference/, environment files, backups,
dependencies, builds and screenshot artifacts remain ignored.

## Batch 1 publication review

Recovery for publication reconfirmed main, HEAD, origin/main and fresh remote at
the accepted V2-11D baseline, with no staged changes. The three modified source/
test files and nine untracked additions matched the implementation inventory.
Both retained browser result manifests report passed with no failed tests;
220 ignored PNGs retain the 196 sanitized captures and 24 reviewed contact sheets.
No runtime source changes followed those successful local checks.

CI previously omitted `e2e-fields-visual/`. A single step now runs its existing
configuration after the retained administration suites, using the already
installed Chromium and the existing isolated Vite web-server lifecycle. The
suite uses synthetic DTOs, rejects configuration writes, disables automatic
traces/screenshots and writes only explicit sanitized presentation captures.
It retains one worker, zero retries and the original deadlines/assertions.
The existing private-fixture artifact exclusions are unchanged.

The publication review reran frontend lint, typecheck, all 132 component tests
and the production build successfully, with unchanged bundle/precache metrics.
The CI YAML parsed successfully using the existing backend YAML dependency;
tracked and new-file whitespace checks passed. No source/test changes invalidated
the retained 19/19 database, 16/16 authenticated-browser or 28/28 visual results.

Publication requires intended-file staging, staged whitespace/security review,
a normal main commit and non-force push, complete exact-head-SHA CI success,
then clean HEAD == origin/main == fresh remote main. The commit SHA and CI URL
are reported in the publication handoff rather than guessed in this document.
This is intermediate Batch 1 only: no completion tag, Batch 2–4 implementation,
hosted provider change or real-data operation is authorized.
