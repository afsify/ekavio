# R1-B seat enforcement — local acceptance checkpoint

## Current continuation — 2026-11-06

Status: **LOCALLY ACCEPTED** for the approved backend-only scope. All mandatory
local gates pass. This section supersedes the preserved earlier blocked
checkpoint below. No push, PR, main change or hosted operation is authorized.

Worktree and branch remain unchanged. Starting HEAD is
`27faab9e9db1eeced356173df8713a9e19ef8160`.

### Recovery compatibility resolved

The owner explicitly approved the historical replay contract. The first old
failure was the new seat guard treating a faithful historical import as fresh
allocation. The other failures followed its transaction rollback. The erroneous
guard was removed from that internal import boundary, not from online services.

`PostgresSharedCoreRepository.apply()` now additionally validates the complete
legacy snapshot on direct calls and retains exclusive catalogue coordination,
ordered organization locks, legacy-key upserts, atomic rollback and the existing
commercial-authority recovery latch. Missing/suspended historical subscriptions,
membership status and identity relationships remain unchanged. Repeated replay
is idempotent; the original parity/constraint assertions were retained.

This is not a general-purpose seat bypass: no new HTTP parameter or service flag
exists. A source-contract test restricts repository consumers to the offline
shadow migration orchestration and CLI. That CLI loads `MongoSharedCoreSource`,
not caller JSON. Schema validation verifies IDs/relations, NOT external source
authenticity. Independent historical-source reconciliation and explicit operator
recovery approval remain required by the established import runbook; they were
not performed against hosted data here. A trusted process with direct database
credentials remains outside HTTP authorization, as before.

The repaired foundation suite explicitly proves preserved over-capacity history
cannot authorize a new staff allocation. Normal allocation still fails closed,
including non-production registration and the staging bootstrap path that uses
it. New licensed organization creation must use canonical commercial onboarding;
there is no automatic trial or free first membership.

### Remaining enforcement and locking completed

- Catalogue reconciliation validates every effective-capacity change, including
  inactive-plan reactivation, not just numeric reductions. A failing update
  rolls back globally; an unchanged historical over-capacity state is retained.
- Finalize/apply renewal both acquire catalogue -> organization -> subscription
  -> renewal coordination. New organizations in registration/onboarding are
  uncommitted and not visible to competitors; catalogue coordination is acquired
  first there too.
- Ordinary online seat mutations use shared catalogue coordination; global
  catalogue/replay writers use exclusive coordination. Capacity is evaluated on
  the same transaction client using existing entitlements and database time.
- Future renewal evaluates its future package but counts currently reserved
  invitations. Tests prove failed application retains paid settlement and the
  original period, then succeeds after an explicit reservation release.
- PostgreSQL tests cover last-seat races, acceptance versus issuance, downgrade
  versus issuance, an observed real advisory-lock waiter during catalogue edits,
  suspension versus acceptance, and finalize/apply/catalogue concurrency.
- Failed delivery cleanup is checked for invitation revocation, unused challenge
  revocation and retained safe audit events. Fake email only; no real delivery.
- Inactive memberships retain seats, revoked reactivation needs capacity, and
  suspended/cancelled subscriptions keep memberships but deny new allocation.

No known online allocation bypass remains in the reviewed production writers.
These tests are bounded evidence, not a claim that all possible interleavings
or direct privileged SQL are covered. The optional public seat-summary API was
not added; the canonical internal summary is available for a later UI batch.

### Execution safety and final-version test results

The prior refused command was NOT a test failure. Automatic approval review
reported a usage-limit error. The same command was resubmitted through approval
after read-only confirmation of PID 3220, this worktree's `.cache/r1-seat-qa/data`,
loopback port 55487, 32 MiB shared buffers and 20 connections. No alternative
launcher was used to evade review. Available RAM was 5.08 GiB. Tests used their
own randomly named databases and normal cleanup. The preserved QA cluster was
not stopped/recreated; demo services and other worktrees were untouched.

| Final check | Result |
| --- | --- |
| Seat calculation, replay source contract, seat integration, catalogue and concurrency | 30/30 PASS, exit 0 (10 units + 19 integration children + parent) |
| Renewal, future-capacity rejection and cross-operation locking | 12/12 PASS, exit 0 (11 children + parent) |
| Identity account | 23/23 PASS, exit 0 |
| Organization administration | 25/25 PASS, exit 0 |
| Manual commercial/onboarding | 9/9 PASS, exit 0 |
| PostgreSQL foundation/recovery | 18/18 PASS, exit 0 |
| Analytics / CRM / Dynamic Fields / HR / Purchasing / Tasks | 17 / 16 / 19 / 30 / 22 / 29 PASS respectively |
| Combined final licensed-fixture run | 199/199 PASS, exit 0; includes foundation, identity and organization checks above |
| Backend complete units | 253/253 PASS, exit 0; includes the 10 capacity/source-contract units |
| Final backend lint | PASS, exit 0 |
| Final backend typecheck/build | PASS, both exit 0 |
| Whitespace/artifact review | PASS; final staging rechecked before commit |

All successful runs had zero skips/cancellations. Counts include Node parent
tests; do not sum overlapping runs as distinct business scenarios. The earlier
114/114 run and 22/22 renewal/unit selection are intermediate evidence, not
extra distinct scenarios. The initial new malformed-snapshot regression failed
because validation threw synchronously despite its Promise contract; `apply()`
is now async and the unchanged rejection assertion passes.

NOT RUN: Mongo-dependent commercial cutover, identity cutover, operational-runtime
and parity integrations (no verified isolated Mongo dependency); Docker Tasks
restore proof (no Docker execution); finalAuthority/browser harnesses (frontend
socket client/dependency installation absent). No replacement credentials,
hosted services or installation was used to manufacture these passes. These
optional checks remain required evidence before a broader CI/release claim.

### Final reviewed change inventory (33 files)

Production (10): `backend/src/postgres/seatCapacity.ts`,
`accountRepository.ts`, `commercialRepository.ts`,
`commercialRenewalRepository.ts`, `manualCommercialRepository.ts`,
`organizationAuthorization.ts`, `sharedCoreRepository.ts`, `staffRepository.ts`
under that same directory; plus
`backend/src/services/identityAccountService.ts` and
`backend/src/services/organizationAdministrationService.ts`.

Test command (1): `backend/package.json` adds `test:seat-capacity`; no dependency
or lockfile change.

Tests/helper (21, under `backend/tests/`):

- `helpers/licensedAccounts.ts`, `seatCapacity.test.ts`, `seatCapacity.integration.ts`
- `postgres.integration.ts`, `commercialRenewal.integration.ts`, `commercialCutover.integration.ts`
- `identityAccount.integration.ts`, `organizationAdministration.integration.ts`
- `analyticsNotifications.integration.ts`, `crm.integration.ts`, `dynamicFields.integration.ts`
- `hr.integration.ts`, `purchasing.integration.ts`, `tasks.integration.ts`
- `finalAuthority.integration.ts`, `identityCutover.integration.ts`, `operationalRuntime.integration.ts`
- `persistenceParity.integration.ts`, `tasksRecovery.integration.ts`
- `identityBrowserServer.ts`, `tasksBrowserServer.ts`

Report (1): this checkpoint. The broader test file list is necessary because
strict registration invalidates unlicensed synthetic setup. Licensed setup is
test-only, supplies staff capacity before membership insertion, preserves legacy
identity mappings, and grants no modules. Existing authorization assertions
remain intact. Parity now explicitly asserts PostgreSQL's intentional rejection
of unlicensed registration before comparing licensed identity projections.

No frontend, migrations, CI, dependencies, pricing catalogue or provider settings
changed. `.cache`, PostgreSQL data/logs, `backend/dist` and `node_modules` remain
ignored and excluded from the commit.

### Release boundary

LOCAL: accepted for a local-only checkpoint; the commit containing this report
records the reviewed candidate (full SHA reported in the handoff). CI: NOT RUN. GITHUB PR: none
created/changed. HOSTED FRONTEND/BACKEND: untouched. POSTGRESQL MIGRATION: no
source or hosted change, existing 21 migrations only in disposable test DBs.
RECOVERY: local historical-replay compatibility passed; no hosted restore or
backup proof claimed. CUSTOMER/PILOT RELEASE: **NO-GO FOR REAL CUSTOMER DATA**.
Render Free remains staging-only. Next step after the local checkpoint is owner
review and separately authorized publication/CI, not automatic deployment.

## Earlier checkpoint — preserved history, superseded above

Observation date: 2026-11-05. Verdict: **BLOCKED — NOT LOCALLY ACCEPTED**.

## Preserved baseline

- Worktree: `C:\Users\DELL\.codex\worktrees\r1-seat-entitlement-enforcement\ekavio`
- Branch: `feature/r1-seat-entitlement-enforcement`
- HEAD/base: `27faab9e9db1eeced356173df8713a9e19ef8160`
- No reset, stash, clean, recreation, commit, push or provider operation.
- Other worktrees and the synthetic demo were not modified.
- Current changes are an uncommitted candidate, not a release-ready patch.

## Implemented candidate

One canonical calculation reuses the existing effective-entitlement evaluator on
the mutation's own PostgreSQL transaction client. It returns occupied, reserved,
allowed, available and over-capacity values. Active/inactive memberships count;
revoked memberships do not. Valid pending invitations count unless their target
already has a counted membership. Null/invalid limits fail closed.

Guards cover strict initial registration (rollback without a subscription),
atomic commercial owner onboarding, invitation creation/replacement/acceptance,
internal staff creation, revoked-member reactivation, explicit subscription
changes and renewal application. Failed email delivery revokes an unused
invitation and unused challenges transactionally, with safe audit history and no
network call inside the lock. Suspended/cancelled subscriptions retain members
but cannot grow. Ordinary numeric downgrades below usage roll back.

The renewal regression exposed a compatibility error: legitimate future renewal
periods must not be rejected just because they are not effective today. Renewal
checks now evaluate the resulting package at the later of database time and the
canonical renewal start, while counting current occupied/reserved usage. Normal
membership/invitation writes still require current eligibility. Test scenario
dates are shifted together relative to today, preserving existing period,
settlement, concurrency and entitlement assertions.

## Locking evidence and limitations

- Seat mutations take shared transaction-level catalogue advisory lock, then
  the organization row, before identity/invitation/subscription locks.
- Catalogue reconciliation and shared-core import take the exclusive catalogue
  lock before ordered organization row locks. A second connection is not used
  to evaluate capacity inside the mutation.
- Real PostgreSQL last-seat invitation concurrency passed: exactly one winner.
- Existing concurrent renewal application/finalization regressions passed.
- This is NOT complete deadlock/race proof. Catalogue-versus-invitation and
  catalogue-versus-renewal races have not been exercised.
- Further review is required for `finalizeRenewal`: it retains subscription-first
  locking and inserts an organization-referencing renewal, while application
  now locks organization before subscription. The potential reverse-order/FK
  lock interaction must be resolved and tested, not assumed safe.
- Catalogue reconciliation currently validates reductions; reactivation of a
  formerly inactive catalogue plan with existing over-capacity usage needs
  explicit coverage/review before complete enforcement can be claimed.

## Confirmed blocker: historical recovery is not a new staff operation

`PostgresSharedCoreRepository.apply()` copies historical identities, memberships
and commercial state. The existing PostgreSQL regression intentionally restores
a suspended subscription and an organization without a subscription, retaining
their membership/audit facts. The added guard sees those rows as growth from an
empty target and rejects with `Organization staff capacity is not available`.

Observed `npm run test:postgres`: **4 passed / 5 failed**, exit 1, no skips.
The first failing child is `apply preserves state and is idempotent`. Subsequent
constraint/parity failures and the failing parent result from the rolled-back
fixture. Later tests in that parent did not execute; they are not passes.

Do not change historical suspended/inactive facts into active subscriptions just
to pass this suite, and do not add a generic capacity bypass. A narrowly defined,
explicitly authorized historical-replay contract must distinguish preservation
of source membership facts from new runtime capacity growth, while retaining
exclusive catalogue coordination and protecting native live data. That decision
is separate from the already approved strict-registration and suspension rules.
No such exception was implemented in this continuation.

Other synthetic suites still call ordinary `registerAdmin()` as fixture setup;
these must migrate to explicit licensed setup without weakening registration
tests. Only identity-account and organization-administration setup was adapted
here. Cross-engine parity assertions also need deliberate policy review, not an
automatic import replacement.

## Validation evidence

The earlier command-review refusal was a review-service usage-limit failure.
The existing loopback-only QA process was inspected and the PostgreSQL commands
were explicitly resubmitted through approval. No denied command was bypassed.

All DB checks used the isolated QA cluster on loopback port 55487, with random
per-suite databases and normal suite cleanup. No hosted database or demo DB was
used. The QA cluster remains local under this worktree's ignored `.cache`.
Latest available physical RAM: **5.40 GiB**. The later unprivileged Windows
performance-counter query failed, so no current commit-headroom figure is claimed.

| Check | Result | Evidence qualification |
| --- | --- | --- |
| Final focused capacity command | 24/24 PASS, exit 0 | 9 units + 14 integration children + parent; not 24 distinct business scenarios |
| Backend complete units | 252/252 PASS, exit 0 | Earlier candidate revision; not rerun after the final renewal-only correction |
| Identity account integration | 23/23 PASS, exit 0 | Licensed synthetic setup; before final renewal-only correction |
| Organization administration integration | 25/25 PASS, exit 0 | Licensed synthetic setup; before final renewal-only correction |
| Manual commercial integration | 9/9 PASS, exit 0 | Before final renewal-only correction |
| Commercial renewal integration | 10/10 PASS, exit 0 | Final renewal correction; includes parent plus 9 children |
| PostgreSQL foundation/shadow regression | 4 PASS / 5 FAIL, exit 1 | Historical replay conflict above; later cases unexecuted |
| Final backend lint | PASS, exit 0 | Final source revision |
| Final backend typecheck | PASS, exit 0 | Final source revision |
| Final backend build | PASS, exit 0 | Final source revision |
| Whitespace check | PASS | Rechecked after checkpoint addition |
| Mongo-backed commercial cutover/parity | NOT RUN | No approved, verified disposable Mongo environment supplied for this continuation |
| Cross-catalogue mutation concurrency | NOT RUN | Required remaining acceptance work |

The initial renewal run had 8 PASS / 2 FAIL (failed child and parent); the final
10/10 rerun supersedes it. No retries, skips or weaker assertions were added.
Counts in this table must not be summed as unique scenarios.

## Exact change inventory

Modified production files:

- `backend/src/postgres/accountRepository.ts`
- `backend/src/postgres/commercialRenewalRepository.ts`
- `backend/src/postgres/commercialRepository.ts`
- `backend/src/postgres/manualCommercialRepository.ts`
- `backend/src/postgres/organizationAuthorization.ts`
- `backend/src/postgres/sharedCoreRepository.ts`
- `backend/src/postgres/staffRepository.ts`
- `backend/src/services/identityAccountService.ts`
- `backend/src/services/organizationAdministrationService.ts`

New production file: `backend/src/postgres/seatCapacity.ts`.

Modified tests:

- `backend/tests/commercialRenewal.integration.ts`
- `backend/tests/identityAccount.integration.ts`
- `backend/tests/organizationAdministration.integration.ts`

New tests/helper:

- `backend/tests/helpers/licensedAccounts.ts`
- `backend/tests/seatCapacity.integration.ts`
- `backend/tests/seatCapacity.test.ts`

New report: `docs/reviews/R1B_SEAT_ENFORCEMENT_LOCAL_CHECKPOINT.md`.
No frontend, dependency, migration or provider configuration changes. The local
QA installation/data/logs remain ignored; nothing is staged.

## Next safe action and release states

Approve a bounded historical-replay policy, then finish the recovery guard,
remaining licensed fixtures, catalogue/reactivation coverage and cross-operation
lock-order tests. Rerun affected suites before a local commit. No commit is
permitted on the strength of the focused passes alone.

- LOCAL: blocked, changes preserved, no commit.
- CI: not run for this candidate.
- GITHUB PR: none created or changed; no push.
- HOSTED FRONTEND: untouched.
- HOSTED BACKEND: untouched.
- POSTGRESQL MIGRATION: no source/hosted migration change; existing 21 applied only in disposable test DBs.
- RECOVERY: historical shared-core replay compatibility is blocked; no real recovery performed.
- CUSTOMER/PILOT RELEASE: **NO-GO FOR REAL CUSTOMER DATA**; Render Free remains staging-only.
