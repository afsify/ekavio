# V2-10 release acceptance and evidence procedure

Current policy: **NO-GO FOR REAL CUSTOMER DATA**. This procedure is not permission
to purchase resources, mutate real tenants, activate latches or restore live data.
Use [evidence](../reviews/V2-10_FINAL_ACCEPTANCE.md),
[matrix](../reviews/V2-10_ACCEPTANCE_MATRIX.json),
[inventory](../reviews/V2-10_PRODUCT_INVENTORY.json) and
[prioritized actions](../reviews/V2-10_GO_NO_GO.md).

## Preserve and classify

Verify main/status/HEAD/origin/fresh remote and the existing checkpoint; do not
reset/restore/stash/clean or create a replacement checkpoint. Read current
instructions and inspect existing results before rerunning. Record LOCAL, CI,
HOSTED PUBLIC, HOSTED AUTHENTICATED, HOSTED PROVIDER, BACKUP, RECOVERY and
OPERATIONS separately. A passed source test or navigation link is not hosted
proof. A blocker needs prerequisite, role, exact action and approval boundary.

Run `node scripts/check-final-acceptance.mjs` and
`node --test scripts/final-acceptance.test.mjs scripts/hosted-acceptance.test.mjs`.
Validator PASS means only that evidence/status rules are internally valid; its
printed NO-GO and mandatory blockers are authoritative, not a pilot percentage.

## Engineering gates

Use existing backend/frontend package scripts, all accepted database integrations,
preflight/Mongo source contracts, encryption/tooling/watchdog contracts and all
nine existing Playwright configurations. Include
`tests/recoveryAcceptance.integration.ts` and `tests/finalAuthority.integration.ts`.
The latter's real transport client uses the existing frontend dependency, so
install both projects before running it. CI executes it after frontend install.
No QA server/root is compiled into production dist.

Clean dependency installs are needed when dependencies/lockfiles change or at
fresh acceptance baseline; preserve already-passed unchanged installs afterward.
Run final lint/typecheck/unit/build and affected integration/browser gates after
real edits. Supply explicit non-secret VITE API/socket origins for production
build, never credentials. Keep assertions and production rate limits intact.
QA client phases use independent app limiters only in disposable test harnesses,
not deployed configuration. Socket metadata contains synthetic event flags only.

Use owned loopback-only disposable databases for QA; normal Compose remains
three PostgreSQL/backend/frontend services. Validate Compose, build/start, health
and bounded sanitized logs; never remove normal volumes or all Docker resources.
Full/production audits remain independent. Sensitive authenticated browser
traces/screenshots are disabled/excluded, while anonymous evidence stays ignored.

## Hosted default safety and exact candidate

Default business checks are READ-ONLY. Inject approved disposable credentials
privately through the four `EKAVIO_STAGING_*` environment names supported by
`scripts/check-hosted-acceptance.mjs`; never print values or response bodies.
Confirm distinct server-returned STAGING V207C/V210 organization names **before**
domain enumeration. The checker verifies secure cookie/refresh/logout and current
CORE/seven-module positive reads plus forged-context rejection; foreign Customer,
Dues and Inventory positive fixture absence is BLOCKED, not PASS. Its three
contract tests are synthetic local HTTP tests, not hosted app evidence.

The broader V2-10 requirement also needs Service/Appointment/Queue/Attendance,
CRM/Supplier/PO/Leave/Shift/field/report/notification resources, membership/filter/
CSV controls and actual events. Do not call the narrower script alone full hosted
acceptance. Use approved synthetic STAGING V210 fixtures and existing route/API
contracts to automate those controls. Any business fixture write requires an
explicit staging-only flag plus validated disposable tenant IDs; no subscription
changes just for testing, real payments, customer data or global cleanup.

The checker's local test opt-in permits only explicit HTTP `127.0.0.1:port`, not
an arbitrary credential destination. Never change the default hosted target or
redirect private credentials to a different domain.

Read Render successful deployment metadata independently for frontend/backend:
deployment ID, exact SHA, completion time and rollback artifact. Compare each
with accepted candidate; Git push/CI/HTTP/title are not deployment proof. Check
production classification, public builds, Docker target, precise origins/proxy,
PostgreSQL TLS and live/ready controls. Read bounded logs privately and retain
only sanitized outcomes. No provider access -> BLOCKED.

For the observed manifest MIME failure, use the actual Render Static Site
Headers editor: `/manifest.webmanifest`, `Content-Type`,
`application/manifest+json`. Preserve existing six `/*` rules and precise CSP.
Save/deploy, then recheck actual GET/HEAD, manifest/icons/worker and browser;
local nginx success or Vercel configuration is not acceptance.
[Render header rules](https://render.com/docs/static-site-headers) use relative paths.

Anonymous hosted browser automation is explicitly opt-in:
`EKAVIO_HOSTED_PUBLIC_QA=1`, then run
`npx playwright test --config playwright.public-acceptance.config.ts` in frontend.
It blocks non-read API requests and never submits/login forms. Review only safe
public screenshots. PWA installability and authenticated API/WSS CSP need their
own actual evidence; header strings/polling handshake alone are insufficient.

## Commercial latch discrepancy

Read `public.commercial_runtime_authority` singleton metadata with bounded
read-only SQL. It is an offline shadow-write latch, not runtime storage selection.
Migration003 starts empty; later migrations do not replace it. Current runtime is
source-selected PostgreSQL. No row is not corruption evidence, but current
hosted cutover/latch closure is not proved. Review
[V2-05D](V2-05D_COMMERCIAL_CUTOVER.md), actual history and source/current facts,
then zero-blocker read-only preflight. Activation requires separate approval;
never insert a marker, replay legacy source or fabricate parity just to pass.
Atlas is retained; no writes/deletion or guessed mappings.

## Encrypted backup and extended restore

Inspect actual Actions schedule event, exact attempt/result, retained nonempty
encrypted artifact/manifest, expiry and 30h age. Distinguish schedule vs manual;
inspect at least two consecutive successes. Download only authorized genuine
payloads outside Git; inspect exact ZIP members and SHA/size, preserving encrypted
original. Existing 35-day workflow retention is not proof of unrestricted custody
or of a 14-daily/four-weekly recovery policy without retained usable points.

Use only the explicitly documented approved outside-Git key. Do not search
unrelated homes or display/copy/upload it. Decrypt to a **new non-overwriting**
restricted recovery file with `postgres-decrypt-backup.mjs`. Preserve custom
format, AES-GCM/RSA authentication, checksums, no-owner/no-acl and archive list
validation. Pinned PG18.6 tooling is separate from normal PG17 Compose. Reject
unsupported major targets before creation; never claim PG18 dump-to-PG17 proof.

The Oct8 scheduled archive demonstrably contains001-019. Its successful restore
is not020 proof. Do not migrate a restored019 archive and label it020 recovery.
A fresh post020 encrypted transfer needs explicit operator authorization where
required by the security reviewer; do not bypass a rejected dispatch. A newly
authorized manual backup can prove recovery, not consecutive schedule operation.

For a qualifying archive, create a newly isolated owned/labeled compatible
PostgreSQL target, never live Neon/normal Compose or an existing customer DB.
Restore with exit-on-error/no-owner/no-acl, **no --clean**. Run accepted checksum
status and `recovery:verify` against only that target, with bounded read-only
counts/invariants. Record `coverage.contractVersion/reviewedThrough` and any
additional migrations; new business invariants need explicit reviewed scope.
Require current001-020 and all referential/history/stock/Dues/CRM/receipt/HR
checks. Record empty domains as structural only, not populated recovery or full
restored application proof. Record source/start/end/validation/cleanup times.

After validation or a failed proof no longer needed, remove only this run's
exact checksum-verified plaintext and identity/labeled disposable target/owned
anonymous volume. Verify absences and encrypted/key preservation. Never delete
unrelated historical plaintext, normal volumes or the workspace. Arrange any
historical sensitive-copy cleanup privately with its owner.

Actual Neon PITR/history/window/quota/new-branch permissions/cost require
authenticated account evidence and approved rehearsal, not public documentation
or a DATABASE_URL. Do not invent guaranteed RPO/RTO.

## Operations, rollback and final closeout

Maintain a private versioned primary/backup/recovery/review/support/privacy
register, accepted support hours and escalation/stop criteria. Demonstrate real
acknowledged alerts with safe synthetic notification tests; do not corrupt
backups or take down services. Independent external probes/daily review must
cover GitHub scheduler/outage common-mode failure. Do not use keepalive to hide
Render Free sleep. Suitable always-on class, verified provider limits/costs and
bounded pilot data/organizations/staff/modules need explicit human approval.

Rollback uses verified immutable backend/frontend artifacts and additive-schema
compatibility. Known source baseline alone is insufficient. Stop unsafe writes,
capture preserved evidence, consult recovery owner and rehearse only isolated
targets. No destructive schema downgrade, journal/history rewrite or Mongo
fallback. Follow [incident response](INCIDENT_RESPONSE.md).

Review full diff, staged filenames/content, ignored secret/backup/key/build/test
artifacts and `git diff --check`. Commit coherent passed engineering candidate
on main, push, then verify exact final SHA and every required CI job. If private
Git authentication is unavailable, record push/CI/tag BLOCKED; never fabricate
success. Fix a failed CI honestly and require the new SHA.

Only after exact CI success create annotated `v2-10-acceptance-evidence` with:
"Engineering evidence checkpoint. Not a pilot GO authorization. Remaining
FAIL/BLOCKED gates documented." Push and verify peeled SHA, clean main and
HEAD==origin/main==fresh remote. No pilot GO tag while any mandatory gap remains.
Return the evidence report and STOP; do not start another business milestone.
