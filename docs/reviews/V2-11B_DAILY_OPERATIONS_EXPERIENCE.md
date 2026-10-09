# V2-11B daily operations experience

**NO-GO FOR REAL CUSTOMER DATA remains unchanged.** Render Free is staging-only.
This is local engineering acceptance, not hosted production, provider/recovery
acceptance, a pilot GO or complete WCAG certification. V2-11C is not started.

## Baseline, scope and source protection

Accepted main: `bdefe1aba0648cf3d40221c185cae05635b6789e`, V2-11A tag,
exact baseline CI `37887781903`. The original annotated checkpoint
`pre-v2-11b-daily-operations` was preserved, published and verified at that SHA.
No reset/stash/restore/clean, force push, checkpoint recreation or history rewrite.
`reference/` remains intentionally ignored/read-only; no third-party source,
branding, gateway, identity or infrastructure was copied.

The [pre-implementation source audit](V2-11B_OPERATIONS_UX_AUDIT.md) maps
verified API support, reference information-grouping lessons and invariants.
ADR 0029 remains the durable design-system decision. These consumers introduce
no new architecture needing another ADR, backend endpoint, migration or module.

## Before → after and domain correctness

| Workflow | Previous friction | Implemented structure and retained authority |
| --- | --- | --- |
| Queue | Table-only reception, icon-only transitions, nested minimal Customer form | Factual active/waiting/serving counters; bounded desktop rows/mobile token cards; named Serve/Complete, detail/cancel confirmation; searched bounded canonical Customer/branch Service choices and reviewed creation; shared full Customer quick-create returns selection without generating a token |
| Appointments | Device-local date, immediate writes and unstructured detail | Authoritative branch date/timezone; Previous/Today/Next; prominent time ranges/status/provider; Service duration with explicitly nominal DST-sensitive ending preview; assigned Provider choices without availability claims; reviewed canonical creation, detail, version-latched custom-field editing and explicit idempotent check-in |
| Attendance | Cramped buttons, sticky correction, history count without facts | Branch/day factual summary and adaptive roster; Present/Absent/Half-day/Unmarked; labelled complete-loaded-roster filters; mark/correct sheet with existing/proposed facts, branch-local times, required correction reason, frozen version and readable immutable history |
| Dues | Card-only journal, sticky mixed form, Queue-gated Customer creation | Prominent searched Customer selector; separate organization-wide/branch balances; Charge/Payment/Adjustment reviewed flows and exact INR display/effect; server-filtered journal/table/cards/detail; explicit reasoned inverse without deletion; CORE Customer-management link |
| Inventory | Dense multi-action cards, history below catalogue, absent action previews | Bounded searched/status catalogue table/mobile cards; separate canonical Low-stock endpoint/count; structured item/custom fields/history drawer; contextual Receive/Consume/Adjust/Edit and exact labelled review previews; protected receipt markers and authorized Purchasing navigation |

Queue lists active facts only; completed/cancelled records leave the list without
invented terminal-history views, wait estimates or unsupported search/sort. Real
post-commit Socket.IO create/status hints and reconnect invalidate branch-scoped
queries; events are not trusted record authority. Status writes retain expected
version. One held creation key survives failed requests/retries.

Appointments interpret datetime-local through the existing branch contract;
server DST gap/fold/overlap validation remains. 10:30 Asia/Kolkata is 05:00Z, with
30-minute Service ending 05:30Z. Check-in atomically produces one Queue token;
replay does not duplicate it. Custom-field edits latch the opened record version,
so refetch cannot silently turn a stale write into success. Scheduling edit and
unavailable history/Provider availability are not fabricated.

Attendance's Unmarked is never Absent; schedules/leave never create attendance.
Correction reason, previous/new timestamps/status and resulting versions remain
history. Server checks business-date/time/DST rules; no browser-local conversion.

Dues submits exact decimal strings; the server owns INR paise conversion and
organization-wide overpayment rules. BigInt is display/validation preview only.
Reversal appends one exact signed inverse and retains the original; no Delete.
Inventory retains three-decimal stock, nonnegativity and transactional concurrency/
idempotency. Preview results are labelled and revalidated. Reversal retains history;
typed Purchasing receipt linkage prohibits independent reversal in UI and backend.
Only the supported authorized Purchasing route is linked; no guessed PO/receipt IDs.

## Shared patterns, context and accessibility

V2-11A remains the sole theme/shell/component system. OperationForm wraps the
existing accessible modal with edit/review/discard in one focus trap, busy guards,
inline errors, retained reviewed values and applicable command key/version,
dirty close/refresh warning and mobile visible footer. CustomerFormFields/
saveCustomer are shared with Customers;
no second validation/business store. Semantic badges include text, not color alone.
Customer creation has no idempotent replay contract: an uncertain quick-create
response disables resubmission and asks for an authoritative directory check.
A real committed-response-loss browser test proves one Customer and no Queue
token. Appointment field edits and Attendance corrections retain their original
version rather than claiming a command key; Inventory catalogue edit likewise
does not invent a key or optimistic-version contract.
Cancellation-aware operational and dynamic-field keys include user, organization,
branch, permissions/entitlements and query context. Existing keyed workspace
transition unmounts private drafts/views and prevents old-context content flashing.

Desktop tables use explicit server mode; unsupported sort/search controls are
hidden. Inventory/Dues filters reset page intentionally. Customer/Service selectors
are bounded 100 matches (Dues 50) with honest refine-search hints. Movements/list
pages use 20 records. Attendance filter is explicitly local over a complete daily
roster, not misrepresented global search. Errors are not zero balances/empty success.
Loading, first empty, filtered-empty, read-only, entitlement denial, retryable error,
validation, stale version and transient failure have distinct feedback.

Exports are flat authorized **current-page** CSV for Dues/Inventory; no unbounded
history fetch or raw DTO/IDs. Formula-triggering text is neutralized, commas/quotes/
CR/newlines quoted and download object URLs revoked. No new full-history export.

Phone primary records remain one column, compact factual summaries, named actions
and full-screen details/forms above safe-area bottom navigation. Tablet adapts
existing shell; desktop retains operational toolbars/tables. Keyboard focus/traps,
heading/name/status semantics, reduced motion and visible footer checks are scoped
automated evidence, not comprehensive accessibility certification.

## Acceptance evidence

Acceptance results are recorded after final gates below. Exact final CI is a
post-commit release gate and is never inferred from local tests.

- Backend lint/typecheck/build: PASS; unit/source-contract tests: **196/196**.
- Full disposable PostgreSQL/legacy-compatibility integration: **328/328**,
  including the expanded live HTTP/Socket authority matrix **22/22**.
- Operational backup/recovery/watchdog/hosted/strict NO-GO contracts: **23/23**.
- Backend and frontend full/production audits: **0 vulnerabilities**, all four checks.
- Final frontend `npm ci`, lint, typecheck, production/PWA build: **PASS**;
  component tests: **104/104** after the clean install and last source edits.
- Chromium browser checks: **387/387**, with no retries or skipped tests:

| Suite | Passed | Evidence type |
| --- | ---: | --- |
| Identity | 11 | Real PostgreSQL |
| Organization administration | 18 | Real PostgreSQL |
| Dynamic Forms | 14 | Real PostgreSQL |
| Analytics / notifications | 13 | Real PostgreSQL |
| Commercial | 24 | Real PostgreSQL |
| CRM | 15 | Real PostgreSQL |
| Purchasing | 18 | Real PostgreSQL |
| HR Plus | 15 | Real PostgreSQL |
| All-module shell/context | 10 | Real PostgreSQL; 27 destinations × 3 widths × 3 themes, plus context/authority case |
| V2-11B operations | 13 | Real PostgreSQL; five flows, response loss, server paging, authority and five independent branch switches |
| Foundation / V2-11A | 61 | Existing automatic foundation/context/visual regressions |
| V2-11B responsive states | 175 | Sanitized presentation, eight widths and three themes plus action/focus/footer/viewport checks |

Normal Docker Compose config/build: PASS. PostgreSQL/backend/frontend are all
running **healthy**; Mongo is not a normal runtime dependency. Local backend
`/health/live`, `/health/ready` and frontend `/`, `/login`: **HTTP 200**, including
after the final narrow frontend rebuild. Bounded backend/frontend log review:
63 lines in the final ten-minute window, **0 runtime error indicators**. No
expensive database suite was repeated without a source-change reason.

Real browser proof is separate from sanitized presentation DTOs. Database tests
retain duplicate/concurrent posting, exact money/stock, timezone boundaries,
correction histories and actual Purchasing linkage/prohibited reversal. The live
authority matrix covers role/read/manage/custom replacement permissions, absent/
revoked grant, archived/revoked membership, foreign organization/branch, suspension
and authenticated Socket.IO. Frontend button absence is not backend security proof.

Browser fixture suites must run sequentially with their own disposable databases,
as CI does. Reusing a prior Identity database can legitimately turn its fixed-phone
new-staff invitation into existing-account acceptance. The five real branch-switch
journeys are independent cases so deployed IP limits stay unchanged. No assertion
or application security policy was weakened to obtain passing tests.

Visual matrix: all five loaded pages at 320/360/390/430/768/1024/1440/1920 ×
Light/Dark/System; System live OS changes. Additional 390/1440 form/detail/error/
empty/filter/status/review/reversal/discard states and 390×430 shortened form
viewports. Screenshots are sanitized local QA, ignored and never committed;
contact sheets retain originals for full-size image review. Authenticated fixtures
disable traces/screenshots and are excluded from CI artifact upload.

Actual image review included all 24 width/theme contact sheets, original phone/
desktop page and form/detail/review/error/empty captures, plus complementary
390/1440 viewport captures. Final responsive checks passed **175/175**. An added
center-point hit-test found a mobile Appointment action behind fixed bottom
navigation after browser scrolling; operations-only safe-area scroll spacing
fixed it, and the unchanged assertion passed in the full matrix. Viewport captures
also confirm painted desktop branding/navigation, beyond DOM visibility alone.
The managed browser bridge lacked sandbox metadata; explicitly authorized local
Chromium/Playwright provided automatic QA. No operator manual browser test was
required and no authenticated/provider/hosted evidence was fabricated.

Existing regression selectors were adapted to the new named reviewed forms and
item/history drawer, preserving metadata/version/receiving/stock assertions.
Purchasing's deep link verifies the exact item heading, Movement history,
protected receipt warning and absence of independent reversal, rather than the
old combined drawer title. QA fixture app reinitialization can emit the existing
rate-limit initialization diagnostic; deployed rate limits were not changed and
normal Docker runtime review is separate from fixture-server logs.

## Performance and security review

Final Docker production/PWA build: entry JS **431.64 kB / 138.60 kB gzip**, versus
V2-11A **431.73 / 138.69** (−0.09 kB raw and gzip). CSS **74.21 / 14.50 kB gzip**.
The five business pages remain lazy-loaded; no dependency or lockfile change,
chart/animation library, second UI framework or theme store. PWA generates its
service worker and manifest with 73 precache entries. Existing ineffective-dynamic-
import warnings for the already statically imported toast/API modules remain
nonfatal and are not presented as new code splitting.

Reviewed source and full diff for cross-context state, permission/entitlement
guards, exact numeric contracts, held keys/versions, append-only inverses,
Purchasing receipt protection and formula-safe bounded exports. No production
backend implementation, migration, image pin, environment, TLS, backup tooling,
key or authority latch changed. Changed/new-file scans found no private keys,
credential-bearing hosted URLs or token patterns. Reference, dependency/build,
environment, backup and browser evidence remain ignored/out of the staged scope.
Final staged review confirms only the scoped source, tests, CI and documentation.

## Release boundary and deferred work

Final release sequence: coherent commit on main → push → exact-SHA CI success →
annotated `v2-11b-daily-operations-experience` → remote peeled-target verification →
clean `HEAD == origin/main == fresh remote main`. Commit/run/tag facts belong in
the final verified handoff; no speculative release identifiers are recorded here.

V2-11C: CRM/follow-ups and Suppliers/Purchasing UX; V2-11D: organization/branch/
role/staff/HR, reports/notifications and Billing; V2-11E: cross-domain final polish,
accessibility/performance/responsive and public/account cohesion. None implemented
or started by this milestone. Hosted authenticated/deployed-build/provider/ownership/
monitoring/always-on/genuine recovery gates remain independent and OPEN as before.
Render Free stays staging-only; Atlas and backup originals/keys are untouched.
