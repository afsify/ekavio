# V2-11E Batch 2 — Form Layout Studio

## Scope and source baseline

Intermediate Batch 2 only. **NO-GO FOR REAL CUSTOMER DATA** is unchanged;
Render Free remains staging-only. No Batch 3/4, V2-12, milestone completion tag,
hosted changes, new backend capability, migration or dependency upgrade.

Recovery verified clean `main`, with HEAD, origin/main and fresh remote main at
`c8ec6ce86b3f8ca2a4c79daa42e8e99f2195ce02`. Exact Batch 1 CI run
[38169434367](https://github.com/afsify/ekavio/actions/runs/38169434367) succeeded.
The existing annotated `pre-v2-11e-unified-experience-forms-studio` checkpoint
remains at `3bfc3baf9359c3270f447eb2789557b74f32c463`; it was not recreated.
Applicable project context, source audit, Batch 1 acceptance, ADRs 0023/0029,
form renderer/hooks, scoped authority/query keys and existing tests were read.
Ignored environments, references and diagnostic artifacts were preserved.

## Implemented experience

- One existing shared organization/entity create/edit/view layout for Customer,
  Service, Appointment, Inventory Item, Membership and Lead.
- Desktop placement catalogue beside ordered sections; mobile stacked editor.
  Labels, immutable keys, field types, required status and placement are explicit.
- Accessible section/field movement buttons and section selectors; title,
  permitted visibility and empty-section archival controls; 20-section and
  100-placement limits remain intact. No drag dependency or new layout variant.
- Unchanged Save disabled, dirty status, original-snapshot discard, scoped reload,
  review-before-save and explicit dirty consequences for default reset.
- Display-only General/Additional information fallback places new fields without
  claiming authority for default reset. Generated draft section IDs resolve
  first-edit movement to the formerly unplaced section correctly.
  Moving a new field into an existing 20-section layout drops only the now-empty
  generated fallback, never a saved section; the persisted limit remains 20.
- Batch 1 catalogue, definition editing, inspection and immutable key/type and
  historical option behavior retained.

## Frozen draft and write correctness

`layoutDraft.ts` captures an independent schema, authority, entity, exact version,
original ordered section/placement/visibility/status snapshot and editable copy
at the first edit. Bounded semantic comparison checks ordered persisted values,
not incidental object property order or unrelated DTO metadata.

Subsequent definition/schema refreshes never replace the draft base version.
Review snapshots the command; confirmation is synchronously duplicate-guarded.
The existing versioned PUT submits that captured version. Pending operations
disable mutation/departure actions. Success is announced only after the write
and authoritative scoped refresh. Validation/409 failures retain the draft and
version. A stale layout is not automatically merged, rebased or retried.
Unknown write outcomes block blind replay and require deliberate verification.
The verification latch is independent of mutation-error/dialog state: failed
reload cannot unlock editing/reset. Reload itself locks editing while pending.
Reload errors do not produce a success announcement or unhandled rejection.

Reset POST uses the existing server-computed reset contract. Its minimal
transport section is not a client-generated default layout. Definitions and
stored custom values are never deleted by presentation changes.

## Navigation, context and authority

The page is keyed by the existing operational authority tuple, with another
entity-keyed workspace. Forced organization, branch, account, permission,
entitlement or operator replacement remounts immediately; it never waits on a
discard dialog. A synchronous store subscription aborts an in-flight layout
request on authority replacement before axios can select another context's
headers. Before/after-write and refresh checks reject obsolete results.
Queries retain existing authority/entity keys and abort signals. Refresh
invalidates only the captured entity/scope schema and dependent record values.
Denied configuration unmounts the entire editor/preview/guard subtree, even if
the query retains a cached successful schema or discard confirmation is open.

User-initiated entity, internal link, workspace/branch, sign-out and browser
departure are guarded. BrowserRouter can commit a window-target popstate
synchronously, so App installs a small history relay before mounting it.
Only the active layout page owns a callback; cleanup removes it on unmount or
authority replacement. Controlled Back cancellation restores the current entry;
explicit discard permits the requested traversal. No router replacement, state
library, authorization-by-navigation or persistent draft storage was introduced.

## Independent live preview

`LayoutPreview` owns disposable component-local values. It does not use the real
record draft/defaults/cache/write APIs. The existing `DynamicForm` renders the
captured schema and current unsaved layout. Built-ins are disabled illustrative
controls, dynamic controls retain shared required/help/validation and exact
date/datetime/decimal semantics. Unsaved layout and exclusion of unsaved
definition edits are explicit. Closing, entity/authority replacement or clearing
samples resets values; opening preview does not mark a layout dirty.

## Changed-file inventory

- `frontend/src/pages/Settings/CustomFieldsPage.tsx`
- `frontend/src/components/forms/{layoutDraft.ts,FormLayoutStudio.tsx,LayoutPreview.tsx}`
- `frontend/src/hooks/{useLayoutStudio.ts,useLayoutNavigationGuard.ts}`
- `frontend/src/App.tsx` — early, bounded history relay only
- `frontend/src/components/layout/TenantSwitcher.tsx` — context select guard markers
- `frontend/src/components/ui/AdvancedModal.tsx` — topmost-dialog Tab recovery after
  a pending submit disables the focused button; existing modal lifecycle retained
- `frontend/src/index.css` — layout/preview-scoped responsive rules
- `frontend/src/test/layoutStudio.test.tsx`
- `frontend/e2e-fields/forms.spec.ts`
- `frontend/e2e-layout-visual/{studio.spec.ts,review-matrix.mjs}`
- `frontend/playwright.layout-visual.config.ts`
- `.github/workflows/ci.yml` — one sequential synthetic responsive acceptance step;
  existing private fixture artifact exclusions unchanged
- This report. Original source audit and Batch 1 report remain intact.

## Local acceptance evidence (CI required for intermediate acceptance)

- Final frontend component run: **155/155**, 14 files, exit 0, including all
  **23 layout cases**, with one worker and original deadlines. An earlier
  parallel run had a retained supplier test's 5s resource timeout; assertions
  and deadlines were not increased. The full single-worker rerun passed.
- PostgreSQL dynamic-field/layout contracts: **19/19**, exit 0. Includes genuine
  concurrent stale layout rejection, atomicity, required placement, typed values,
  tenant/entitlement boundaries, bounded counts and query behavior.
- Final real PostgreSQL-backed browser acceptance: **20/20**, exit 0. Includes
  original 16 cases, a genuine concurrent winner followed by definition-driven
  schema refresh and stale PUT version 0 rejection, preview non-mutation and
  server reset, six-entity draft/sample isolation, and the saved 20-section edge.
  An earlier 17/18 run failed an exact accessible selector; the label/locator
  correction passed its isolated rerun and this full acceptance run.
- Frontend full and production-only audits and backend production-only audit:
  **0 vulnerabilities**, exit 0. No package or lockfile changes.
- Mongo runtime/source retirement: **4/4**, exit 0.
- Strict NO-GO/evidence and hosted-acceptance safety contracts: **8/8**, exit 0.
- Final frontend lint/typecheck/build: exit 0 using explicit non-secret local
  API/socket settings. Production build: 443 modules, index 319.47 kB / 101.55 kB
  gzip, 78 PWA precache entries / 1174.06 KiB. Existing mixed static/dynamic API
  client import warning remains; no new dependency or renderer replacement.
  An earlier build correctly refused missing VITE_API_URL; not counted as pass.
- Final Linux layout visual/navigation acceptance: **31/31**, exit 0.
  An earlier 30/31 run failed only its newly added denied-refresh stimulus: a
  non-bubbling document event did not reach Query's window focus listener.
  Correct window dispatch plus explicit HTTP 403 assertion passed **1/1**, exit
  0. No application assertion, deadline, query behavior or retry policy changed.
  The complete final run passed and regenerated the screenshot set.
- Retained Batch 1 Linux catalogue/editor acceptance: **28/28**, exit 0.
  Final affected denied-feedback rerun: **1/1**, exit 0, after denial teardown.
- Retained Linux foundation navigation/accessibility/theme regression: **61/61**,
  exit 0, including original responsive matrix, context switching and routes.
- Docker Compose quiet validation: exit 0. Existing backend, frontend and
  PostgreSQL containers are healthy; those baseline images were not rebuilt,
  and are not claimed as new Batch 2 container-build evidence.

The managed browser bridge was unavailable (`sandboxPolicy` metadata missing).
Existing isolated Chromium/Playwright infrastructure is used instead. The Linux
QA server uses read-only source mounts, synthetic DTOs and QA-only polling to
avoid demonstrated stale Docker-bind Vite caches. Local real workflows use
disposable PostgreSQL fixtures, with traces/screenshots disabled. Synthetic
visual tests are presentation evidence, not server/hosted authority evidence.

Loaded screenshot review completed for all **24** width/theme contact sheets:
320, 360, 390, 430, 768, 1024, 1440 and 1920px in Light/Dark/System. Eleven loaded
states per combination cover workspace, movement, review, failed write, dirty
discard, mobile/desktop preview, reset, validation and both native-control
captures. Also inspected separate read-only, denied, error and loading captures.
Actual file count: **268 synthetic PNG captures + 24 matrices = 292 PNGs**.
Original-size spot checks at 320, 1024 and 1920px confirmed wrapped long labels,
readable choices, usable modal footers and native date/datetime boundaries.
No horizontal overflow, clipped native control, broken footer or unreadable
layout was found in this reviewed set. System OS switching, reduced motion,
keyboard movement and modal focus were also asserted. These are Chromium/local
checks, not real-device, screen-reader-user or hosted acceptance claims.

Only explicit sanitized screenshots may be CI artifacts. No private data,
credentials, reference source, screenshots, logs or builds are intended for Git.
Full exact-final-SHA GitHub CI (including retained domains, browser
regressions and Docker Compose gate) must succeed before intermediate acceptance.

### Reproducible commands and fixture boundaries

- Frontend: `npm run lint`, `npm run typecheck`, `npm test -- --maxWorkers=1`,
  `npm run build` (explicit local VITE_API_URL / VITE_SOCKET_URL).
- PostgreSQL: backend `npm run test:dynamic-fields` against the isolated QA
  database; no hosted data or source mappings.
- Real Chromium: `npx playwright test --config playwright.fields.config.ts`,
  reusing QA-only servers at 5011 / 4175 with the existing external-server flags.
- Linux: original configs `playwright.layout-visual.config.ts`,
  `playwright.fields-visual.config.ts`, `playwright.config.ts`; ignored local
  wrappers override only baseURL to the owned polling QA server at 4174.
  `FOUNDATION_QA_EXTERNAL_WEB=1`; source/public mounts remain read-only.
- Sanitized contact sheets: `node e2e-layout-visual/review-matrix.mjs`.
- Security: frontend `npm audit` and `npm audit --omit=dev`, backend
  `npm audit --omit=dev`, `npm run test:mongo-source-contract`, and root
  `node --test scripts/final-acceptance.test.mjs scripts/hosted-acceptance.test.mjs`.
- Docker configuration: `docker compose config --quiet`.

Playwright retries remain zero, shared assertion deadlines remain 10 seconds,
and suites run sequentially. The actual denied read is awaited, not inferred
from a mock registration. Real authenticated fixture traces/screenshots remain
disabled and CI's private directory exclusions are unchanged.

### Final source and safety review

The complete intended diff was reviewed. Changes are 17 source/test/CI/report
files; backend, DB schema, dependencies/lockfiles, environment files, original
source audit, Batch 1 report and `.gitignore` are unchanged. `reference/` remains
ignored and untracked; no reference source was installed, executed or copied.
New runtime components use no persistent preview/draft storage, unsafe HTML,
credential logging or record write endpoint. Navigation is not an authorization
boundary; existing APIs still enforce fields and independent entity authority.
Scoped aborts/remounts and unknown-outcome verification protect cached drafts.
The 20-section/100-placement limits and required visibility remain enforced.
Staged path and whitespace/artifact checks are required immediately before commit.

## Deferred work and publication

Batch 3 still requires the separately approved six-entity consumer-page UX and
Service editor alignment. Conditional fields, formulas, new entity types,
field-level permissions and new backend/security/database capabilities remain
outside this batch. No automatic reconciliation/merge is offered.

Publication is a normal main commit/non-force push only after local acceptance
and staged diff/security review. As in the accepted Batch 1 convention, exact
commit/run evidence is verified after publication and reported in the handoff,
not guessed or recursively self-hashed in this pre-commit report. There is no
V2-11E completion tag and no checkpoint movement. Current publication status:
**NOT YET COMMITTED OR ACCEPTED**.
