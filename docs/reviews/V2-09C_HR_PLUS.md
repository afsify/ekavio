# V2-09C HR Plus

Date: 2026-10-08. Local implementation acceptance PASSED; exact-commit release gate required.
**NO-GO FOR REAL CUSTOMER DATA** remains unchanged.

## Baseline and design

Clean main baseline `7b9da10ec780b170274c12f70c1e437dff1ee584` matched origin and
fresh remote; annotated `v2-09b-suppliers-purchasing` peeled there. Annotated
`pre-v2-09c-hr-plus` was created and pushed once at that accepted baseline.
No branch/reset/restore/stash/clean, historical migration rewrite, Atlas write,
guessed source mapping or later milestone was used.

[ADR 0028](../adr/0028-hr-plus.md) defines the membership authority, commercial
defaults, conservative permission matrix, organization-wide whole-day leave,
full-branch reviewer coverage, snapshots, calendar DATE semantics, precise UTC
shifts, immutable publication, exclusions, cross-table locks, idempotency, privacy,
notifications, reports, UI and deliberate payroll/legal/compliance deferrals.
Migration 020 is additive. 001–019 remain unchanged. Native HR data is never
invented as legacy Mongo source authority.

## Evidence register

- HR PostgreSQL: final **30/30** passed (29 subtests plus parent), including
  started-approved-cancellation denial, same-global-user organization isolation,
  live archived-role self denial, actual PostgreSQL DST inputs and direct-SQL races.
- Backend clean install/lint/typecheck/build and **195/195** unit/source tests pass;
  final lint/typecheck also pass after the multi-actor QA harness change.
- Backup envelope/tooling/watchdog contracts: 15/15 passed.
- Frontend clean install, final lint/typecheck, **94/94** component tests (eight HR),
  production/PWA build pass. Existing ineffective-dynamic-import warnings are
  non-failing and unrelated; no dependency or lockfile changes.
- All **32 distinct database integration files / 296 tests** pass across the current
  run and affected reruns. Attendance runtime 9, migration 6 and cutover 6 pass
  (**21/21**); no Attendance writes/status/history/entitlement changes. Additional
  preflight **17/17** and Mongo source contracts **4/4** pass. A historical commercial
  fixture initially retained native HR catalogue rows: test-only preparation was
  corrected and commercial cutover rerun **9/9**. Production parity stays strict.
- HR Chromium **15/15** pass: owner UI setup/holiday/template/draft/publication,
  employee schedule/request, separate HR approval, immutable conflict, HTTP tenant/
  branch/subject/custom-role/inactive-member isolation, module independence, four
  nonempty reports/CSV privacy, widgets/attention and responsive acceptance.
- Prior Chromium suites: foundation **19**, identity **11**, administration **18**,
  dynamic fields **14**, analytics **13**, commercial **24**, CRM **15** and
  Purchasing **18** pass: **132 prior browser tests**, **147** including HR.
- HR responsive checks: **360/390/768/1440 × Light/Dark/System**, no document overflow
  or uncaught page errors. Disposable 390px dark modal screenshot was visually
  reviewed after switching to the existing styled controls. It remains ignored,
  outside Git and excluded from CI artifact uploads, along with authenticated traces.
- Managed browser bootstrap failed on missing sandbox metadata. The explicitly
  authorized local Chromium fallback used real local PostgreSQL/generated fixtures,
  not mocked HR authority. No manual operator testing or hosted private employee data.
- Four backend/frontend full/production audits report **zero vulnerabilities**.
- Docker configuration/build/startup pass. Final frontend source was rebuilt using
  cached dependencies after the visual fix. Normal PostgreSQL/backend/frontend are
  **three healthy services**; local 001–020 match. Live/ready, `/`, `/login`, `/hr`
  return **HTTP 200**; bounded startup logs show no runtime errors. SPA route 200 is
  not authenticated acceptance; Chromium supplies the local workflow evidence.
- Only after every local gate passed, hosted 001–019 history/checksums matched;
  only pending **020** was applied through the standard advisory-locked runner.
  Hosted **001–020** now match, zero pending; `btree_gist` is installed. Ignored
  staging connection configuration stayed in memory; TLS/credentials were unchanged.
  No hosted employee/leave/shift records were created. Hosted
  `https://api.ekavio.afsify.com/health/live` and `/health/ready` return **HTTP 200**;
  this is not authenticated HR or exact deployed-build proof.
- Complete source/diff/security/artifact review found no new credentials, real
  employee/medical data, environment files, backups/dumps, private keys, generated
  builds/dependencies or QA evidence. Existing CI database strings are unchanged
  disposable fixture credentials, not hosted secrets. All changed documentation
  links resolve. Historical migrations/lockfiles are unchanged. Release still
  requires push, exact-commit CI success, annotated completion tag and clean main.
- Owned local QA API/Vite processes and the two verified disposable QA containers
  were stopped after acceptance; their temporary generated fixtures are reproducible.
  Normal Compose remains healthy, retained normal volumes and Atlas untouched.

## Corrections and performance review

No assertion was waived. Migration development corrected the actual dashboard
constraint name and polymorphic-trigger field handling. A leave count query's
unused actor parameter gained an explicit UUID type. Role switching exposed a
shared live-authority cache key missing user identity: the key now includes it,
and the full four-actor walkthrough/regressions pass. HR scope set ordering is
stable. A long local walkthrough initially exhausted the unchanged deployed IP
limit; the disposable test-only server models distinct client phases per actor
rather than changing production thresholds. Startup under concurrent host build
load exceeded the helper window; explicitly ready, separately managed QA servers
were used. A final check called a nonexistent `test:components` script; repository
`npm test` then passed. These are not skipped acceptance checks.

Final edge-case review after the initial implementation push found that availability
ignored the following day of a published overnight shift. A new PostgreSQL test
reproduced `No published shift` instead of `Scheduled`. The bounded roster query now
includes the previous starting date and classifies every snapshot-local date touched
by the half-open interval; an exact midnight end does not mark the next day. The
expanded 30/30 HR suite passes. Shift lists/widgets/daily coverage reports still
describe starting business dates, rather than inferred hours actually worked.
Affected final backend lint/typecheck/195 tests/build, HR browser 15/15 and
backend-only cached Docker rebuild/healthy startup all pass. Local health remains
HTTP 200 with clear backend startup logs; hosted 001–020 checksums still match,
without reapplying any migration. The temporary correction QA services/container
were stopped after testing. Release requires CI on the NEW final commit; success
of the earlier candidate cannot authorize its tag.

Leave caps are 90 calendar days, reads 366, availability/repeats 31; repeat batches
are one employee/at most 31 rows. Pages cap at 100 rows/200 pages, UI 20 rows; search
is bounded at 200 characters. Types/templates cap at 30/50. Batched roster, shift
and leave reads avoid a query per employee. Scope/history/pending indexes and GiST
exclusions support relational access. Reports reuse 366-day/row/byte budgets and
formula-safe CSV. Notifications batch at most 100 recipients. Writes serialize on
one organization row with 5-second lock/10-second statement waits: deliberately
conservative small-business concurrency, not a throughput/large-roster benchmark.
HR is lazy-loaded (~24.83 kB, ~7.03 kB gzip in the accepted local build); no new
calendar library, paid dependency, provider or correctness-critical scheduler.

## Closeout and retained gates

Hosted migration proves schema/public health only, never hosted authenticated HR
or exact deployed-build acceptance. The final release is the exact main commit
with successful GitHub CI to which annotated `v2-09c-hr-plus` peels; this document
cannot embed its own future commit hash. Final hash/run/tag evidence is returned
in the release report. No milestone tag is created before exact CI acceptance.

Extended hosted recovery through 020 remains **OPEN**. Always-on hosting remains
**OPEN**; Render Free remains staging-only and Atlas retained untouched.
**NO-GO FOR REAL CUSTOMER DATA** is unchanged. V2-10's separately authorized
scope is final automated/product and hosted tenancy/realtime acceptance, exact
deployment, recovery/operations evidence and strict GO/NO-GO; it has not started.
No manual operator testing was required for V2-09C local acceptance.
