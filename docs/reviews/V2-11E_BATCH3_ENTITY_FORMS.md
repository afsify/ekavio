# V2-11E Batch 3 — six-entity forms

Status: targeted local acceptance passed; publication and complete exact-commit
CI are required before Batch 3 acceptance. NO-GO FOR REAL CUSTOMER DATA is unchanged;
Render Free is staging-only. This is an intermediate batch, not milestone release.

## Recovered baseline

Main, origin/main and fresh remote main matched
`2a410b82028b48253aab3487d5816484d291c98b` at recovery. Its accepted Batch 2 CI
is https://github.com/afsify/ekavio/actions/runs/38223216993. The actual preserved
partial diff was four unstaged files (+53/-11), not the estimated five files.
The existing pre-V2-11E checkpoint remains untouched. Reference source remains
ignored and read-only; no dependencies, backend features or migrations changed.

## Source-backed integration matrix

All six integrations use `frontend/src/hooks/useDynamicForm.ts`, the shared
`frontend/src/components/forms/DynamicForm.tsx` renderer and authorized
`frontend/src/components/forms/EntityFields.tsx` detail reads. Server built-ins,
types and entity authority originate in
`backend/src/domains/dynamicFields/policy.ts`; canonical writes and validation
remain server authoritative. ADR 0023 is unchanged.

| Entity / frontend source | Existing canonical workflow retained | Authority / data integrity |
| --- | --- | --- |
| Customer — `frontend/src/pages/Customers/CustomersPage.tsx`, `frontend/src/components/forms/CustomerFormFields.tsx` | Canonical identity, phone, notes, activity; existing dirty modal and create/edit/detail; layout order, optional clearing, historical detail | Independent customers.read/manage; organization identity, no duplicate Contacts model or invented idempotency |
| Lead — `frontend/src/pages/CRM/CrmPage.tsx` | Reviewed create/edit/detail; stages, follow-ups; explicit new/existing Customer conversion, required Customer fields | CRM entitlement plus branch-scoped crm.read/manage, original optimistic version and atomic conversion rollback; no automatic identity matching |
| Service — `frontend/src/pages/Services/ServicesPage.tsx`, `frontend/src/pages/Services/ServiceEditor.tsx` | Modernized reviewed canonical/custom drafts; duration/activity; provider assignment remains separate | CORE services.read/manage, independent staff.read directory; organization catalogue and selected-branch availability; no invented version or command-key API |
| Appointment — `frontend/src/pages/Appointments/AppointmentsPage.tsx` | Reviewed creation/detail/versioned custom-metadata edit | Queue entitlement and queue.read/manage, branch-local time/UTC conversion, original version/idempotency keys; no rescheduling |
| Inventory Item — `frontend/src/pages/Inventory/InventoryPage.tsx` | Reviewed item create/edit/details, exact quantities/prices, append-only stock workflows | Inventory entitlement plus inventory.read/manage; custom metadata cannot create movements or alter receipt history |
| Membership — `frontend/src/pages/Staff/StaffAccessCards.tsx`, `frontend/src/pages/Staff/StaffManagementPage.tsx` | Organization-local membership details/versioned access editor; secure invitations remain separate | staff.read/manage, independent role/branch catalogue permissions, owner/self protections; membership ID, not global User, owns metadata |

## Corrections

- Read-only stored values in archived layout sections are retained in a named
  historical section. Empty detail sections are omitted. Active edit visibility
  and required server validation are preserved.
- Choice groups have visible legends and associated help/errors, stable option
  identities and disabled archived choices. No unsafe HTML/URL rendering added.
- Invalid datetime drafts do not throw; validation requires the existing explicit
  UTC/offset contract, valid date and nonzero year. Milliseconds are preserved.
  Date-only, exact decimal strings and E.164 semantics remain unchanged.
- Currency details use existing exact BigInt rupee formatting and retain the raw
  INR minor-unit representation. No floating-point money conversion.
- Long-label clipping was demonstrated by Linux nested-control geometry and a
  loaded screenshot. Bounded shared field grid tracks and wrapping fix the cause,
  not document-level overflow masking.
- Membership role/status use the standard field styling: the previously compact
  98px native select failed the new readable nested-control assertion. Owner,
  self-access, role eligibility and status restrictions are unchanged.
- A real Lead edit-to-conversion test reproduced a stale cached-version HTTP 409.
  Versioned detail actions now wait for authoritative refresh without destroying
  the detail component's draft state. A deferred-query component regression and
  real PostgreSQL conversion rerun pass; server optimistic checks remain intact.
- Service captures canonical draft/record identity and exact custom patch,
  requires review, guards discard/navigation, locks submission synchronously,
  aborts obsolete authority and ignores late responses. Ordinary rejected drafts
  remain editable. Unknown outcomes (including post-commit refresh failure) block
  replay through modal/SPA route replacement until explicit workspace reload.
  Refresh must succeed before the editor closes. No automatic mutation retry.
- Original-size screenshot review exposed an additional canonical Service fact
  clipping issue: a long unbroken name/description enlarged a nested grid track.
  A DD's self-width check incorrectly passed while its whole container overflowed.
  The strengthened dialog-boundary/body-scroll regression failed before the
  scoped review-facts min-width/wrapping correction, then passed all 24 modes.

## Local acceptance evidence

Focused renderer reproducer: 19 pass / 4 fail before corrections, then 23/23.
Service reproducer: 1 pass / 7 fail before modernization. Focused corrected run:
33/33 (23 renderer, 10 Service), then 40/40 including the deferred CRM regression.
Final full component run: 172/172 in 15 files. Frontend lint/typecheck passed,
including the final scoped CSS change. Production/PWA build passed with public
loopback API/socket configuration (unconfigured build correctly failed closed).
Backend lint/typecheck/build and 196/196 tests passed. All four full/production
dependency audits reported zero vulnerabilities. Root backup/recovery/watchdog/
hosted/NO-GO contracts passed 23/23. These completed, unchanged-backend/dependency
results are reused; no unnecessary repeated backend rebuild or audit is claimed.

Initial real fields browser run: 21/22; one response-loss test incorrectly used
full-page rather than SPA navigation. Corrected focused run: 1/1, including exactly
one real committed Service and no replay. Lead diagnostic attempts corrected an
explicit stage selection and supported detail reopening; the later full candidate
ran 22/23 and exposed the genuine cached-version conversion conflict. After the
source correction, focused Lead 1/1 and final full fields **23/23** passed, exit 0.
No failed, interrupted or merely started suite is counted as a passing full run.

The real fields suite covers Customer create/edit/detail/archival, Service
review/discard/rejected-draft/readback and committed response-loss safety,
Lead custom create/edit/detail plus required Customer conversion, Appointment
creation and versioned metadata/timezone, Inventory and Membership writes and
readback, independent manager/read-only/config-only/tenant/entitlement boundaries,
and retained Batch 1/2 versions, option UUIDs, layout review/context isolation.
All 13 types and original stock/version/atomic/identity contracts are additionally
covered by component and PostgreSQL suites; screenshots are not evidence of
server enforcement for every type in every entity.

Managed browser bridge remains unavailable (missing sandbox-policy metadata).
Local Playwright uses disposable PostgreSQL fixtures for authority checks and
separate sanitized DTOs for presentation. Screenshots and diagnostic logs remain
ignored; private database fixtures are not uploaded as visual evidence.

Affected PostgreSQL suites passed: Dynamic Fields 19/19 and CRM 16/16, isolated
databases, exit 0. Linux focused six-entity 320 Light plus read-only/denied/loading
feedback passed 4/4. The full original Linux **27-case** matrix was recovered with
passed last-run metadata, no failed tests and all expected screenshots; its
terminal handle/exit code was unavailable after interruption and is not invented.
The final affected long canonical-review matrix passed **24/24**, exit 0. The new
CI suite contains 51 cases (24 six-entity modes, 3 feedback, 24 long-review modes).
Final exact-commit CI must independently pass that entire suite.

Retained Batch 1 field catalogue passed 28/28 and Batch 2 layout studio passed
31/31, exit 0. Final affected real PostgreSQL-backed CRM passed 15/15 and
administration passed 6/6, exit 0. Retained Linux foundation passed 61/61,
exit 0, including protected Service create/edit/catalogue consumption, navigation,
theme, context blanking, authorization, focus, dirty drafts and final shell states.
Earlier overlapping candidates had
27/28 Batch 1 (read-only reload navigation deadline) and 14/15 CRM (detail-close
navigation deadline). Assertions, deadlines and zero retries are unchanged;
the completed reruns above pass without any assertion or timeout weakening.

### Loaded screenshot review

All eight widths (320, 360, 390, 430, 768, 1024, 1440, 1920px) were reviewed in
Light, Dark and System through 24 loaded contact sheets, each containing 23
original entity/editor/native-control/choice/history/conversion/review/discard
states. Additional original-size screenshots were inspected for small controls,
exact currency/UTC, archived sections, Membership fields, 1024px conversion and
1920px nested Inventory controls. All 24 corrected long canonical-review images
and four read-only/denied/loading feedback images were loaded and reviewed.
There are **580 sanitized original images plus 24 contact sheets** under ignored
`frontend/test-results/batch3-linux-corrected/`; diagnostics are retained separately.
No image/log/build/reference source is intended for Git staging.

Tests assert document/dialog geometry, nested native-control widths, footer
visibility and hit targets, keyboard focus containment, System changes,
reduced motion and no page errors. Actual screenshot inspection found the long
review defect that the original self-width assertion missed; wrapping now fixes
the layout cause rather than masking horizontal overflow. This is focused
Chromium acceptance, not a claim of exhaustive screen-reader/device certification.

### Build/runtime/security

Final build: 444 modules; entry 319.55 kB / 101.59 kB gzip; CSS 78.69 / 15.32 kB;
lazy Services 11.37 / 3.88 kB; CRM 35.63 / 9.09 kB; PWA 79 entries / 1179.34 KiB.
Batch 2 measured 443 modules, entry 319.47 / 101.54 and 78 entries / 1174.09 KiB.
No performance improvement is asserted. Existing mixed static/dynamic API import
warning remains; no dependencies or second framework were introduced.

Compose configuration, the prior implementation build and final scoped-CSS
frontend-only build/refresh passed, exit 0. Final three normal services
(frontend/backend/PostgreSQL 17.11) are healthy. Live, ready, root and login
returned HTTP 200; final runtime scan inspected 30 lines with zero error-signature
matches. Backend/database runtime were not restarted by the final refresh.
No local server-major upgrade, hosted write, authority latch or Atlas deletion.

Service drafts remain memory-only, full authority scoped and abort/late-response
guarded; no credentials, unsafe HTML, executable fields or persistent draft data.
The uncertain outcome latch stores only the current authority key, never draft
values or credentials. It cannot prove an aborted server write did not commit;
verification/reload remains explicit. APIs independently enforce RBAC/entitlements,
organization/branch boundaries, versions, required values and atomic writes.

### Intended changed-file inventory

- Runtime: shared `DynamicForm.tsx`, `formSchema.ts`, `index.css`; Services
  `ServicesPage.tsx` / new `ServiceEditor.tsx`; narrow `CrmPage.tsx` and
  `StaffAccessCards.tsx` corrections.
- Tests: renderer/CRM components and new `services.test.tsx`; real
  `e2e-fields/forms.spec.ts`; retained `e2e/product-experience.spec.ts` now reviews
  Service before saving; administration fixture has optional independent grants,
  leaving existing default callers unchanged; new sanitized entity forms suite,
  review-matrix helper and Playwright config.
- Acceptance: CI adds the deterministic sanitized six-entity matrix while
  retaining private artifact exclusions. This report, PROJECT_CONTEXT, README and
  V2-11 roadmap correct stale overall-E-deferred statements.

There are 21 intended files. Backend, migrations, package manifests/locks, Compose,
environment files, `.gitignore`, ADR 0023 and Batch 1/2 reports remain unchanged.
Reference source remains ignored/read-only and untracked.

### Gate commands and totals

| Gate | Completed local result |
| --- | --- |
| Frontend `npm run lint`, `typecheck`, `test`, configured `build` | Pass; 172/172 components, 15 files; final CSS lint/typecheck/build also exit 0 |
| Backend `npm run lint`, `typecheck`, `test`, `build` | Pass; 196/196, exit 0 |
| Backend `test:dynamic-fields`, `test:crm` with disposable POSTGRES_TEST_URL | 19/19 + 16/16, exit 0 |
| Frontend `test:e2e:fields`, `test:e2e:crm`, `test:e2e:administration` on existing loopback QA | 23/23 + 15/15 + 6/6, exit 0 |
| Linux `playwright.fields-visual.config.ts`, `playwright.layout-visual.config.ts`, foundation config with current external QA URL | 28/28 + 31/31 + 61/61, exit 0 |
| Linux entity-forms responsive matrix and final long-review affected matrix | 27-case completed metadata recovered; separate final 24/24 exit 0; complete 51-case CI run still mandatory |
| Node backup-envelope/tooling/watchdog/hosted/final-acceptance contracts | 23/23, exit 0 |
| Frontend/backend `npm audit` and `npm audit --omit=dev` | Four passes, zero vulnerabilities |
| `docker compose config --quiet`, build frontend, `up --no-deps -d frontend` | Pass, exit 0; final three healthy services and four HTTP 200 probes |

Root contract command: `node --test scripts/backup-envelope.test.mjs
scripts/postgres-tooling.test.mjs scripts/backup-watchdog.test.mjs
scripts/hosted-acceptance.test.mjs scripts/final-acceptance.test.mjs`.
Linux wrappers change only the existing QA URL/external-server wiring, not
assertions, test deadlines, retry policy or production configuration. Complete
exact-commit CI supplies the retained A–D/domain/security/Docker matrix.

### Publication boundary

Normal main commit/non-force push requires all local gates and staged diff/security
review. Complete exact-new-SHA CI (all retained domain, responsive, security and
Docker gates) is mandatory for acceptance. As in Batch 1/2, its exact commit/run
receipt is verified after publication and recorded in the final handoff and ignored
recovery log, not guessed or recursively embedded into its own pre-commit report.
No V2-11E completion tag or checkpoint change is authorized here.

## Deferred scope

Batch 4 overall premium polish, final cross-module acceptance and the V2-11E
completion tag remain deferred. Conditional fields, formulas, field-level
permissions, new entities, layout variants and new domain APIs require separate
approval. No hosted/pilot GO, paid hosting or deployment is implied by this batch.
Service APIs still offer no server command key or optimistic version contract;
the UI cannot invent conflict enforcement or prove that a lost response did not
commit. Explicit authoritative verification remains necessary for uncertain writes.
