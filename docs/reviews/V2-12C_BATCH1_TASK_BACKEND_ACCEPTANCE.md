# V2-12C Batch 1 — Canonical Task backend local acceptance

2026-10-16 final local acceptance (implementation began 2026-10-15).
**Local backend acceptance: PASS. Not published or deployed.**
**NO-GO FOR REAL CUSTOMER DATA. Render Free remains staging-only.**

## Starting state and authorization

`main`, HEAD, origin/main and fresh remote main matched
`374fe470e4c2f0c1ac3e30078dea2ec9f68fb7c4`. GitHub metadata independently
confirmed exact [baseline CI 38736930221](https://github.com/afsify/ekavio/actions/runs/38736930221)
completed/success. No tracked/staged edits initially. The four existing strategy/
V2-12A reports plus Batch 0 were untracked and preserved byte-identically.
No applicable AGENTS.md found. Reference sources remain ignored/read-only and
were not re-researched, executed, copied or changed.

Owner approved local backend implementation, not another architecture audit.
Applied [ADR 0030](../adr/0030-work-tasks.md) and approved Batch 0 policies.
No frontend implementation, hosted SQL, provider action, commercial activation,
commit, push, tag or deployment was performed. Canonical readiness registers remain
unchanged. V2-12C now names this explicitly approved backend work, not an automatic
extension of the old V2-12B recovery prompt.

## Aggregate, migration and commercial contract

Verified 001–020 inventory; added `021_work_tasks.sql`. Historical migrations and
checksums are unchanged. Both 020→021 upgrade and fresh 001→021 were tested, with
idempotent reruns and exact 21-migration assertions.

- `work_tasks`: immutable UUID/org/branch/creator, one required canonical assignee,
  bounded title (200)/optional plain-text description (5,000), low/normal/high,
  nullable UTC deadline and recorded input zone, fixed status, version, server
  lifecycle timestamps and last canonical actor/action/reason.
- `work_task_events`: trigger-created append-only action/version/actor/time,
  before/after state/assignee/deadline/priority/zone and changed field names.
  No description copies, credentials, employee contacts or HR reasons.
- `work_task_commands`: immutable org-scoped key, normalized fingerprint, actor,
  branch and minimal original result `{id, version, eventId}`. No automatic pruning.

Composite org/branch/task/membership FKs, positive versions, fixed values, retained
identities, unique task/version history and result keys, scope/due/recent indexes
and history/deferred-completion guards enforce the aggregate. Historical branch
assignment rows are not permanent FKs: removal must revoke access without erasing
or preventing retention of Task history.

`tasks` / `module-tasks` is a separate optional purchasable capability. Catalogue
metadata alone is not a grant. No public price, plan membership, automatic
subscription, existing-organization entitlement or Pilot Core inclusion was added.
Only synthetic local fixture organizations were explicitly entitled.

## API contracts implemented

Every route is under `/api/tasks`, authenticated through existing JWT/session/
context middleware, commercially gated, no-store, strictly validated and freshly
authorized by the domain on the same transaction client.

| Method/path | Contract |
| --- | --- |
| POST `/api/tasks` | Manager create: title, optional description/priority/localDue, assignedMembershipId, idempotencyKey; initial todo/version 1 |
| GET `/api/tasks` | scope=own (default) or team; server search/status/priority/attention/assignee/sort/page/limit; no client-side global filtering |
| GET `/api/tasks/assignees` | Manager-only eligible active same-branch members, ID/name only, server search/paging |
| GET `/api/tasks/:id` | Current own/team record, canonical metadata, version and allowedActions |
| PATCH `/api/tasks/:id` | Manager-only open details/deadline or same-branch reassignment; expectedVersion and idempotencyKey |
| POST `/api/tasks/:id/status` | Permitted progress only; status/expectedVersion/idempotencyKey; no detail/assignment/identity edits |
| POST `/api/tasks/:id/cancel` | Manager-only open cancellation, expectedVersion/key/nonblank bounded reason |
| POST `/api/tasks/:id/reopen` | Manager-only completed→todo, expectedVersion/key/nonblank bounded reason |
| GET `/api/tasks/:id/history` | Same live record scope, paged immutable events and minimized actor display |

Page 1–200, limit 1–100 (default 20), search ≤200; due/recent stable ordering.
Own scope cannot select an assignee. List/count share identical predicates and a
repeatable-read snapshot; data/total/page/limit include timezone/businessDate/
serverNow. Title search escapes literal `%`, `_` and backslash and uses parameters.
Empty results are honest zeroes. Invalid input 400, missing/invalid auth 401,
permission/context/entitlement 403, inaccessible/foreign records 404, stale keys/
versions/state or bounded lock conflicts 409. No raw SQL/body is returned on error.

## Permissions, state and authority

| Role/default | Own read/progress | Team read/management |
| --- | --- | --- |
| Staff | tasks.read_own + tasks.manage_own; current assignee only | None |
| Owner/admin/manager | Own pair | tasks.read + tasks.manage, selected authorized branch only |
| HR | No automatic Task grants | No automatic Task grants |
| Custom role | Only explicit configured grants; management requires corresponding read | Replacement, never union; existing grant-subset rules retained |

No entitlement, inactive/revoked membership, removed assignment or archived custom
role denies access. Operator/creator status confers no bypass. Assignment additionally
requires active membership and own read/progress capability in the same branch.

| From | To | Who |
| --- | --- | --- |
| todo | in_progress/completed | Current assignee with own pair, or team manager |
| in_progress | todo/completed | Same |
| todo/in_progress | cancelled | Manager with explicit reason |
| completed | todo | Manager with explicit reopen/reason |
| cancelled | none | Immutable terminal history |

Completed details freeze until explicit reopen; cancelled tasks cannot be reopened,
edited or deleted. Reopen clears current completed_at but preserves prior completion
history. Reassignment removes prior own detail/history/progress/replay authority.
Inactive/removed assignees remain recorded; authorized managers can explicitly
resolve open work. No HR leave inference, attendance write or cross-branch transfer.

## Transactions, retries and dates

Existing PostgreSQL pg/ALS atomic composition is retained; no driver/ORM rewrite
or Neon provisioning. Commands lock organization then authority inputs and record,
recheck live roles/membership/branch/entitlement, compare expectedVersion, mutate,
create one trigger event and retain one command result. A deferred database guard
requires all three to commit together. Failure in event/command persistence rolls
everything back. No automatic retries or lost-update overwrite.

Commercial writers do not all take the administration org lock. Task-specific
shared locks protect relevant module/subscription/override/plan/add-on rows and
membership/role/assignment inputs before fresh checks; new org-scoped grant rows
need FK key-share on the locked organization. Other modules' commercial policy is
unchanged. Deterministic barriers prove queued membership revocation is honored
and in-flight commercial inputs stay protected until atomic completion, followed
by immediate denial after revocation.

Fingerprints bind normalized command/payload/task/org/branch/actor/version/key.
Identical retries return the original minimal result, including after further
versions; altered keys/payload/scope/actor conflict. Current record authority is
required even for replay. Creation/progress duplicates commit once under concurrency.

Existing branch-IANA conversion stores UTC and rejects invalid/DST gap/fold input.
Overdue = open deadline strictly before serverNow; Today = branch half-open day,
Upcoming starts tomorrow. Today and Overdue overlap, not additive totals. Null
deadlines stay reachable; no scheduler or browser-clock authority.

## Local acceptance receipts

Ignored evidence: `frontend/test-results/v212c-batch1/`. No incomplete test is
counted PASS. Counts below are Node runner totals (including parent acceptance
tests), not screenshots or invented assertion counts.

| Gate | Actual result / exit | Receipt |
| --- | --- | --- |
| Backend units/source/security contracts | 219/219; 0 | backend-units-final.log; includes 23 new Task policy cases and existing Mongo source boundary |
| Final focused Task + entitlement/RBAC selection | 75/75; 0; no skips/cancellations | final-acceptance-focused.log; 24 Task units, 29 Task integration runner cases, 22 entitlement/organization contracts |
| Dedicated Task PostgreSQL + real Express API/security/concurrency/recovery | 29/29 in final focused selection; 0 | final-acceptance-focused.log supersedes previous tasks-final.log 28/28 |
| Populated custom archive/restore | 1/1; 0 | tasks-restore.log |
| Retained 20-file integration selection | 269 conclusive passes across completed selection and focused rerun | retained-integration.log + legacy-parity-corrected.log; explained below |
| Encryption/tooling/watchdog/final-register/hosted-checker safety contracts | 23/23; 0 | operational-contracts.log |
| Final backend TypeScript | PASS; 0 | final-acceptance-typecheck.log |
| Final backend lint | PASS; 0 | final-acceptance-lint.log |
| Final backend production build | PASS; 0 | final-acceptance-build.log |
| Backend npm audits, full and omit=dev | Both 0 vulnerabilities; exit 0 | backend-audit-all.json / backend-audit-production.json |
| Docker Compose config | PASS; 0 | bounded `docker compose config --quiet`; no environment values rendered |

The retained selection covered PostgreSQL/shared core, commercial and identity
cutover, organization RBAC, identity/recovery, dynamic fields, analytics/notifications,
CRM, Purchasing, HR, public intake/experience, manual activation/renewal, Attendance/
Dues/Inventory/corporate migration, current recovery and the existing seven-module
live HTTP/Socket.IO authority matrix. Existing business assertions were preserved.

Initial combined selection finished **245 passed / 2 failed**, exit 1: commercial
and identity legacy parity stopped because MONGO_TEST_URL was absent. Those were
not accepted as passes. Only those two files were rerun against a new synthetic
loopback Mongo fixture: **24/24**, exit 0. Thus 245 + 24 = **269 distinct final
retained passes**, not a claimed single 269-test command. Other passing suites were
not repeated. Combined with Tasks and archive restore, **299 database/integration
runner tests** have completed successfully across 22 distinct files.

The final 75-case selection overlaps the retained 219-unit receipt: do not add
those totals as unique coverage or claim a fresh full 220-unit run. Since the
broader runs, only focused tests and documentation changed, not production code,
migration or restore logic. Existing broader and archive receipts remain applicable.
Final Compose validation also exited 0 on October 16.

The archive test used pinned local PostgreSQL 17.11, custom format/no-owner/no-acl,
PGDMP signature and pg_restore --list validation, then restored into a different
unique disposable database. Exact current migration/checksum/public-table counts
matched; 2 Tasks, 4 events and 4 command results recovered; all integrity counts zero
and completed/cancelled API facts retained. Archive bytes remained in memory and
were cleared; no plaintext backup file or real hosted archive was used. Encryption
envelope round-trip/tamper/wrong-key/cleanup contracts passed independently.

Current recovery semantics explicitly review 021: required tables and enabled
guards, all restored FKs/CHECKs, Task event projection/chain and command/actor/action
consistency. Missing table/guard and corrupted history/command proof fail closed.
Future 022 remains checksum-checked but not automatically domain-certified.

Local backend ran Node **24.16.0** on Windows with Linux PostgreSQL/Mongo Docker
fixtures. Future exact-commit Ubuntu/Node 20.20.2 CI is **not run or claimed** in
this local-only batch. No browser/frontend matrix was necessary or performed.

## Genuine findings fixed and retained limitations

- First migration attempt exposed PL/pgSQL CASE parsing in a guard; parenthesized
  the expression and reran fresh/upgrade proof. No accepted historical SQL edited.
- A policy unit exposed create defaults leaking into PATCH and silently clearing
  omitted fields. Explicit optional update fields now preserve description,
  priority/deadline; a title-only regression and no-op rejection remain asserted.
  Final unit/API regressions additionally prove description-only, priority-only and
  deadline-only patches preserve omitted fields; explicit localDue null clears
  only the deadline pair, empty description clears text, other null canonical
  values are rejected, and stale versions leave facts/events/commands unchanged.
- Catalogue uniqueness expectations now explicitly include Tasks (8 modules), not
  a removed assertion. Latest-schema counts are exactly 21, historical counts/
  checksums unchanged. Test-only historical catalogue helpers exclude native Tasks
  from old migration fixtures instead of inventing Mongo Task mappings.
- The first unit run had the old seven-module expectation; corrected final units
  are 219/219. Earlier diagnostic failures are not final acceptance results.
- Existing legacy Mongo compatibility emits a Mongoose `new` option deprecation;
  it was not suppressed or changed as unrelated runtime-retired code. Tests pass.
- Git emits existing Windows LF→CRLF normalization warnings; whitespace checks pass,
  no Git policy or bulk line-ending rewrite was introduced.

No outstanding known implementation blocker for this local backend scope.
Production load/capacity, hosted schema/deployment/authenticated acceptance, current
hosted encrypted restoration (post-020 and now new 021 scope), retention/storage
growth and pilot operations remain independently OPEN. Org-level serialization and
bounded snapshot locks favor correctness over unmeasured throughput. No automatic
history/command expiry or recovery repair is introduced. No real-customer GO.

## Exact intended changed-file inventory

37 intended files, including this report; five preserved untracked reports are
**not** implementation files. No frontend source, lockfile, environment, backup,
reference, generated asset or ignored diagnostic is intended for publication.

New (10):

- `backend/postgres/migrations/021_work_tasks.sql`
- `backend/src/domains/tasks/policy.ts`
- `backend/src/domains/tasks/repository.ts`
- `backend/src/domains/tasks/service.ts`
- `backend/src/routes/taskRoutes.ts`
- `backend/tests/tasks.test.ts`
- `backend/tests/tasks.integration.ts`
- `backend/tests/tasksRecovery.integration.ts`
- `docs/adr/0030-work-tasks.md`
- `docs/reviews/V2-12C_BATCH1_TASK_BACKEND_ACCEPTANCE.md`

Modified wiring/contracts/context (7):

- `.github/workflows/ci.yml` — two additive mandatory future Task/restore steps; no existing gate removed
- `backend/package.json` — two test scripts, no dependency changes
- `backend/src/commercial/catalogue.ts` — optional Task metadata/key only; plans unchanged
- `backend/src/services/authorizationPolicy.ts` — four grants/defaults and precise labels
- `backend/src/routes/index.ts` — mount dedicated Task namespace
- `backend/src/postgres/restoreIntegrity.ts` — reviewed 021 Task integrity
- `PROJECT_CONTEXT.md` — narrow local-backend status and boundaries

Modified retained tests/fixture compatibility (20):

- `backend/tests/analyticsNotifications.integration.ts`
- `backend/tests/attendanceMigration.integration.ts`
- `backend/tests/commercialCutover.integration.ts`
- `backend/tests/commercialEntitlements.test.ts`
- `backend/tests/commercialRenewal.integration.ts`
- `backend/tests/corporateMigration.integration.ts`
- `backend/tests/crm.integration.ts`
- `backend/tests/customerDuesMigration.integration.ts`
- `backend/tests/dynamicFields.integration.ts`
- `backend/tests/helpers/historicalCatalogue.ts`
- `backend/tests/hr.integration.ts`
- `backend/tests/identityAccount.integration.ts`
- `backend/tests/inventoryMigration.integration.ts`
- `backend/tests/manualCommercial.integration.ts`
- `backend/tests/organizationAdministration.integration.ts`
- `backend/tests/postgres.integration.ts`
- `backend/tests/publicCommercial.integration.ts`
- `backend/tests/publicCommercialExperience.integration.ts`
- `backend/tests/purchasing.integration.ts`
- `backend/tests/recoveryAcceptance.integration.ts`

## Handoff and next boundary

### Hosting and migration release risks — publication is not approved

1. **Backend auto-deploy is UNVERIFIED.** Historical transferred Render evidence
   names `ekavio-api-staging` (`srv-dappsjrtqb8s73dcg2s0`), repository/main/root
   backend, but does not expose its auto-deploy setting. Branch configuration is
   not proof of automatic deployment. No provider inspection was authorized in
   this batch. Treat a future push as potentially deploying until separately
   authorized, current read-only provider evidence establishes the setting.
2. **Routes can precede schema.** `backend/src/routes/index.ts` mounts Task routes;
   `backend/src/server.ts` startup checks `SELECT 1`, and readiness uses database
   connectivity, not migration status. `backend/Dockerfile` starts the server,
   not migrations. Healthy readiness therefore does not certify 021. A push must
   not substitute for a coordinated, separately approved migration/release plan.
3. **Hosted prerequisites remain OPEN.** Owner must separately authorize the exact
   project/database/role, current schema identity and 001–020 checksum inspection,
   pending 021 review, current backup/recovery evidence, migration window and
   responsible operator, migration execution, post-apply status/integrity checks,
   exact artifact CI and independently verified deployed SHA. Existing staging
   runbook uses a single release migration job, not per-instance startup writes.
   No hosted SQL, migration, backup transfer/restoration or provider change occurred.
4. **Optional access is fail-closed, not a schema barrier.** Missing Tasks module/
   entitlement resolves false; route entitlement middleware denies before Task
   table access. No plan includes Tasks and no real grant was created. This does
   not make deployment before migration safe: a grant with missing tables would
   fail, and new catalogue reconciliation against pre-021 constraints is unsafe.
   Require 021 verification before activation; keep all real grants disabled.
5. **Rollback is only structurally assessed, not rehearsed.** Additive tables and
   unchanged historical columns support old-domain compatibility. The previous
   commercial projection casts module keys and its entitlement reducer considers
   only known modules; it does not thereby grant Tasks. However, old migration
   tooling rejects an applied 021 absent from its source inventory; catalogue/
   operator paths and the actual previous binary on 021 were not fully rehearsed.
   Do not claim complete rollback compatibility from current regression passes.
6. **Preserve state on rollback.** No destructive down migration or event/command
   deletion is supplied. A previous backend cannot certify or operate new Tasks.
   A full restoration could lose post-backup writes and requires separate recovery
   approval and rehearsal. Local 17.11-to-17.11 synthetic archive proof is not a
   current hosted PostgreSQL 18 backup/restore proof or permission to execute 021.
7. **Release remains blocked on separate owner approval**, not on a known failing
   local backend gate. Publication, coordinated schema rollout, activation and
   frontend Batch 2 are independently bounded decisions. No new remote CI exists
   for these uncommitted changes; NO-GO and Free staging-only restrictions stand.

Final preservation review: all five protected planning reports and both canonical
V2-10 registers retain their recorded SHA-256 values. Historical 001–020, frontend,
scripts, lockfile, Compose configuration and `.gitignore` remain unchanged. The
index is empty; 27 tracked modifications plus 10 new implementation files and five
protected untracked reports remain. QA output/reference sources stay ignored;
no backup, credential, environment file or generated build output is included.

No dependency additions, installation, frontend bundle/style/UI change or external
service. Existing application containers and older QA evidence remain unchanged.
Only owned disposable QA infrastructure was used; fixture databases are removed
by test cleanup. Intended changes remain unstaged/uncommitted on main at the
accepted starting SHA. Preserve all five pre-existing reports and canonical
readiness registers; future staging must use an exact reviewed file allowlist.

Publication requires separate owner approval, fresh remote reconciliation, staged
security/artifact review and exact-new-commit mandatory CI. New Task/restore CI
steps are prepared, not evidence that remote CI has executed.

Proposed Batch 2 (not started): original My Tasks/Team Tasks server-paged directory,
mobile cards, scoped detail/history and guarded create/edit/progress/lifecycle forms
using these APIs. Extend frontend catalogue typing as needed, keep HR My Work
unchanged, no new backend business capabilities. Require own/team/revocation/draft/
conflict/keyboard regressions and eight widths × Light/Dark/System, followed by
separate publication approval. Dashboard/notifications/custom fields remain deferred.

**STOP after Batch 1. NO-GO FOR REAL CUSTOMER DATA; Render Free staging-only.**
