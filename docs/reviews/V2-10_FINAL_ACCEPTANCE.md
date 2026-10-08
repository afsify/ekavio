# V2-10 final product and operational acceptance

Date: 2026-10-08. Decision: **NO-GO FOR REAL CUSTOMER DATA**.
Local engineering acceptance and public staging evidence are distinct from
exact deployed-build acceptance, authenticated hosted acceptance and operations.
The evidence validator accepting this register is **not** pilot approval.

## Baseline, continuation and change boundary

Verified clean `main`, HEAD/origin/fresh remote
`5e78ef16536e7b9062303394f6345907666af9f0` (`v2-09c-hr-plus`). One annotated
`pre-v2-10-final-acceptance` checkpoint was pushed; its tag object is
`801692333382097aff894e1ee00934369bdff4a2`. Interrupted working changes were
preserved, including recovery verification/tests, CI, hosted-checker safety and
new responsive/public acceptance tests. No reset, restore, stash, clean, branch
or replacement checkpoint was used.

No business module, historical migration, live data repair, guessed source
mapping, Atlas write/deletion, hosting purchase or security-policy relaxation.
The narrow runtime correction is suspension: active pilot/support grants had
kept optional modules enabled after subscription suspension. The pure regression
and actual HTTP matrix reproduced it before correction. Suspension now denies
all seven optional modules at request time; independent grants absent a
suspended subscription, CORE and existing permission/dependency gates remain.
See the clarification in [ADR 0009](../adr/0009-postgresql-commercial-runtime-authority.md).

## Inventory and evidence registers

The [machine-readable inventory](V2-10_PRODUCT_INVENTORY.json) covers all 17
requested CORE areas, all seven commercial modules, and existing audit/corporate
capabilities: 26 domain entries. Each records route families, permissions,
entitlement, tenant/branch scope, actual read/write workflows, negative/browser
evidence locations and separately blocked authenticated hosted proof. Navigation
is not capability evidence. CORE Customers/Services do not need Queue; Reports
and widgets require their own domain permissions/modules; Suppliers are
organization-owned, canonical Purchase Orders require independent Inventory,
and HR self-service is not team-review authority or Attendance.

The [acceptance matrix](V2-10_ACCEPTANCE_MATRIX.json) contains 45 scoped gates
across Functional, Security, Tenancy, Commercial, Database, Deployment, Recovery,
Monitoring and Operational readiness. Only PASS/FAIL/BLOCKED/NOT APPLICABLE are
valid. Blockers contain prerequisite, responsible role, next action, class,
automation/approval boundary and pilot-mandatory flag. The validator rejects
missing mandatory gates, evidence-free PASS, disguised local hosted proof,
excluded mandatory gates and GO with blockers or without human approval.

CI is intentionally a **post-commit** gate. This pre-commit register cannot
claim success for its own not-yet-created commit. The exact Actions run and any
neutral tag must be recorded in the final handoff only after success; they do
not close hosted/operational blockers.

## LOCAL automated acceptance

| Gate | Evidence |
| --- | --- |
| Backend dependencies/quality | Fresh `npm ci`; final lint/typecheck/build; 196/196 unit/source tests |
| Frontend dependencies/quality | Fresh `npm ci`; lint/typecheck; 94/94 components; production/PWA build with explicit non-secret URL configuration |
| Existing database regressions | All 32 accepted integration files: 296/296, including migration upgrades/checksums, identity, administration, fields, reports/attention, money/stock and all commercial modules |
| Added database acceptance | Recovery 10/10 and live authority/realtime 19/19: 325 distinct tests in 34 integration files; additional preflight 17 and Mongo source 4 pass |
| Affected reruns | Commercial cutover/renewal/manual activation/migration 45/45 after suspension correction; commercial browser 24/24 rerun; no double-counting |
| Root operational contracts | Backup encryption/tooling/watchdog 15/15; hosted-checker safety 3/3; final evidence validator 5/5 |
| Original browser suites | Foundation 19, identity 11, administration 18, fields 14, analytics 13, commercial 24, CRM 15, Purchasing 18, HR 15: 147/147 |
| Missing shell acceptance | 12/12 added: 360/390/768/1440, Light/Dark/System; Customers, Services, Queue, Appointments, Settings; overflow and uncaught-error assertions retained |
| Dependency security | Backend full/production and frontend full/production audits each report zero vulnerabilities |
| Compose | Config/build/start passed; affected backend rebuilt; three normal services healthy, no normal Mongo container/authority |
| Runtime probes/logs | Local live/ready/root/login 200; local manifest `application/manifest+json`; bounded 150-line backend/frontend review: zero runtime-error and sensitive-value pattern matches |

Foundation/shell use disposable HTTP **frontend contract** fixtures; they do not
prove server tenancy. The eight identity/domain browser suites use a disposable
PostgreSQL harness. Real authenticated screenshots/traces are disabled and
excluded from CI upload. Accepted unchanged suites were not needlessly restarted
after the interruption; completion records were inspected and affected work rerun.
An initial final frontend build correctly refused missing URL configuration;
the required explicit non-secret build inputs were then supplied and build passed.
New test selectors were aligned with real headings rather than weakening UI
assertions. Early matrix fixtures lacked branch timezone and Purchasing's
independent Inventory read permission; those setup errors were corrected before
the remaining real suspension defect was fixed.

## Security, tenancy and commercial correctness

The actual HTTP matrix exercises each optional module with missing grant,
missing permission, allowed access, explicit revoke and archived replacement
role. It tests suspension with active grants, owner/admin/manager/HR/staff live
permissions, inactive/revoked memberships, positive-control foreign organization
and branch denials, platform operator separation, and revoked session CORE
denial. Domain integrations independently cover foreign resource IDs,
membership/assignment references, same-user multi-organization isolation,
filtered reports and CSV, expiry, immutable facts and concurrency.

Actual local Socket.IO polling **and** WebSocket tests use both tenants as
positive event controls: authorized synthetic delivery, no foreign event after
forged joins, rejected foreign context/disallowed origin, reconnect delivery,
real HTTP logout disconnect, and session/membership revocation checked by the
publisher. Direct QA database revocations are detected at the next event; this
is not a claim of continuous provider monitoring or immediate unsolicited
disconnect after arbitrary external SQL. Hosted authenticated realtime is BLOCKED.

Dues charges/payments/adjustments/reversals retain exact per-customer journal
semantics, without cross-customer credit netting or labeling receipts Revenue.
Inventory receives/consumes/adjusts/reverses exact canonical movements with
idempotency and projection checks. Purchasing preserves exact line amounts,
partial/full receipts, concurrent/replayed commands and reversal protection.
HR does not invent actual attendance. No floating-point money authority added.

Identity QA covers phone/verified-email resolution, generic unknown/unverified
denial, rotation/replay, logout/revocation, password change/recovery, one-time
verification/invitation, expiry/concurrency, existing-account linking and scoped
context. Capture email is LOCAL; no real SMTP delivery was performed. Targeted
review retains live RBAC, strict fields/plain-text rendering, bounded parameterized
queries, safe CSV/redirect mappings, secret hashes/redaction and rate limits.
Private leave/review text stays out of generic attention, audit, availability,
widgets/reports/CSV. No regulatory or penetration-test certification is claimed.

## HOSTED PUBLIC (read-only)

The managed browser bridge failed before navigation because sandbox metadata
was unavailable. The authorized repository Chromium fallback performed 12/12
anonymous public cases at all four widths and three themes. Home, pricing/request
section, onboarding, privacy and login rendered branded metadata without overflow
or uncaught page errors. All non-read API requests, including anonymous refresh,
were blocked during these visual checks; no form or login submission occurred.
A public mobile screenshot was visually reviewed and remains ignored/local.

The six exact security headers pass on `/` and `/login`; CSP retains exact API
HTTPS/WSS connect origins. Approved-origin OPTIONS returned 204 with matching
origin/credentials; foreign origin returned 403 without permission. Live, ready,
root/login, manifest, service worker, robots and sitemap returned 200. Initial
live response was 22,973ms; subsequent ready 269ms, root263ms/login132ms. These
bounded observations are not uptime, throughput, authenticated CSP or exact-build
proof. Worker was JavaScript rather than SPA HTML; manifest JSON/icon metadata
and public-only sitemap were checked.

**FAIL:** hosted `/manifest.webmanifest` still returns `binary/octet-stream`.
The generated filename and local nginx MIME are correct, but neither changes the
Render edge response. Provider access is unavailable. Add the narrowly scoped
Render `Content-Type: application/manifest+json` rule and reverify actual
response/browser behavior; do not weaken nosniff/CSP or claim installability
from HTTP200. [Render documents relative-path header rules](https://render.com/docs/static-site-headers).

## HOSTED DATABASE and commercial-marker conclusion

Bounded read-only metadata verified hosted PostgreSQL **18.6**, accepted
checksums 001–020 and zero pending. Catalogue metadata showed 359 CHECK, 225 FK,
3 exclusion constraints and four historical deliberately NOT VALID checks.
Metadata existence is not full row-invariant or application proof. No migration,
validation-state repair, subscription change or latch activation occurred.

The query was the correct `public.commercial_runtime_authority` singleton,
not a normal runtime selector: zero rows. Four operational and two final-domain
markers exist with no invalid authority values. ADR0009/migration003 and
`commercialAuthority.ts`/`sharedCoreRepository.ts` show the marker is an initially
empty durable latch recorded by explicit post-preflight activation; later
migrations do not replace it. Normal runtime remains source-selected PostgreSQL,
with no Mongo fallback. The missing latch does **not** prove record corruption,
but its intended offline shadow-write guard is unclosed: acceptance FAIL.
Historical V2-05D evidence describes local activation, not current hosted closure.
Use the approved read-only reconciliation/preflight and separately authorized
explicit activation procedure; never insert a marker merely to turn a gate green
or replay legacy source over current commercial data. Hosted authenticated
entitlement behavior itself remains BLOCKED without approved accounts/build proof.

## BACKUP, actual recovery attempt and limitations

Five consecutive real **scheduled** successes were verified:
`37753178575` Oct8, `37595004518` Oct7, `37439620172` Oct6,
`37287329616` Oct5, `37188886071` Oct4. The first two trigger/result metadata
were reconfirmed after resume through public read-only API. Earlier Oct3 failure
and historical manual runs are not reclassified as schedule proof.

Latest [scheduled run](https://github.com/afsify/ekavio/actions/runs/37753178575)
used workflow SHA `dad5bebdce0296280f7f61a7b066a0eb6a08a8ce`, not a hosted
application revision assertion. Artifact `11538871700`,
`ekavio-postgresql-37753178575-1`, was nonexpired, 439,765 ZIP bytes, with 35-day
retention to `2026-11-12T08:57:09Z`. ZIP digest
`0b2f946e2e75aeb9fff0740aee0f01552f5ec660a3ecd2f9a329a20e2705887b`.
The downloaded ZIP remains outside Git and has exactly encrypted `.evb` plus
`.evb.json`; no plaintext dump, private key or credentials. Envelope 438,717
bytes, SHA256
`2f313c11a1f4846dc5c01c655b16799310d3778a3521caad648ea1be803ea935`
matches the manifest, whose completion timestamp is `2026-10-08T08:57:09.100Z`.
Tooling is pinned PostgreSQL18.6; normal Compose/CI PostgreSQL17.11 is unchanged.
The second run's detailed artifact metadata was not newly retrieved after the
resume credential-manager failure; this does not erase the actual consecutive
schedule/run evidence or independently validated latest retained payload.

The approved recovery-key path was recovered from the earlier explicit operator
prompt—not guessed from unrelated directories. The existing key was accessed
only as an outside-Git decryption input, never printed/copied/uploaded. AES-GCM/
RSA authentication and plaintext checksum passed: 437,791 bytes, SHA256
`e247e770ddabd0cfe0c85dfb57e8e16b33018dac7c2c3dcc059cadc442df1175`.
Pinned pg_restore18.6 recognized 761 TOC entries and pg_dump major18.

A new labeled, loopback-only PostgreSQL18.6 container received the custom archive
with `--exit-on-error --no-owner --no-acl`, **no --clean**. Restore succeeded
from `2026-10-08T15:35:10.353Z` to `15:35:17.745Z` (UTC).
**001–019 checksums applied; 020 pending.** The extended verifier correctly
refused. No migration was applied to manufacture recovery-through-020 proof.
This archive predates HR schema020, even though the live database is now current.

**BLOCKED:** a newer genuine post020 archive is required. An attempted new
existing-workflow dispatch was rejected before execution by the security reviewer
because the hosted sensitive payload/destination transfer needed explicit
approval. No dispatch or workaround occurred. One narrow approval was requested
for encrypted-only GitHub Actions transfer under existing 35-day retention.
A future manual run may prove a new restore, never consecutive scheduling.

This run's exact checksum-verified plaintext and label/image-verified owned
`--rm` container/anonymous volume were removed, and absences verified. Original
encrypted ZIP/envelope/manifest and private key were retained. No normal volume,
live Neon target, Atlas or unrelated historical plaintext was touched. Previous
historical plaintext custody/cleanup remains a separate operator requirement.

The versioned verifier `v2-10-recovery-integrity-v1` explicitly reviews through
020 and derives expected/applied count from migration discovery, rather than a
stale fixed total. Extra applied migrations are reported as additional scope,
not silently certified for future domain-specific invariants. It runs a bounded
consistent read-only snapshot: all public table counts, every present FK and
CHECK row invariant (including deliberate NOT VALID legacy checks), disabled/
missing required history guards, HR exclusion presence, stock projections and
reversals, Dues reversals, CRM conversion shape, receipt/movement/over-receive and
leave/publication relationships. Corruption and future-migration regressions pass.
These LOCAL proofs do not validate absent HR data in the genuine019 archive.
Empty restored domains would prove structure only, not populated recovery or
restored application behavior; no PG18 dump-to-PG17 restore claim is made.

Watchdog policy and actual run PASS: latest backup within 30h, retained exact
artifact; successful watchdog `37753291824` and scheduled watchdog `37738557700`.
Tests fail closed on age/future times, latest failure, missing/expired/wrong
artifact, malformed metadata and API outage. Workflow success is not recipient
delivery, independent scheduler coverage, Neon PITR, monthly restore rehearsal
or a guaranteed RPO/RTO. Those remain explicitly blocked.

## Operations, capacity, performance and release

Render Free remains **staging-only by operator choice** and cannot satisfy the
approved always-on pilot gate. No paid resource or hidden keepalive was created.
Read-only Render/Neon provider credentials, actual plan/metrics/billing/PITR
controls and bounded hosted logs are unavailable. Verified SQL access does not
prove account recovery permission, provider quota/window or costs. Numeric cost
certification and throughput/RPO/RTO guarantees are not invented. A controlled
pilot needs approved organization/staff/modules/data/support limits and a budget;
none is inferred from limited smoke responses.

Primary/backup responders, recovery/review owner, support hours/privacy escalation,
real alert acknowledgement and independent monitors are not privately evidenced.
The release/incident runbooks specify the required registers and safe drills,
not fictional assignments or notifications. Exact Render frontend/backend SHAs,
last-good provider artifacts and actual rollback rehearsal are BLOCKED. Known
source baseline is not an authenticated deployed last-good image. Never downgrade
schemas or enable Mongo to simulate rollback after PostgreSQL writes.

Final local bundle: entry392.19kB/~125.83gzip, CSS63.62/~12.09; PWA79 entries,
1064.24KiB. Reports8.63/2.88, Dashboard5.13/1.93, CRM29.49/7.56,
Purchasing21.59/5.99, HR24.83/7.03 (kB/gzip). Lazy routes remain; existing
ineffective dynamic-import warnings are recorded, not threshold-hidden. Review
confirmed bounded report export/filter limits, batched field/widget projections,
CRM paging, stock queries, receipt row locks and bounded HR windows. Test timings
are isolated correctness observations, not supported pilot load estimates.

See [strict decision/actions](V2-10_GO_NO_GO.md) and
[release procedure](../runbooks/V2-10_RELEASE_ACCEPTANCE.md). Before any evidence
tag, require coherent commit, push, exact successful CI and clean main equal to
fresh remote. Installed Git Credential Manager currently requires interactive
authentication; no credential or provider access was fabricated. Pending
push/CI/tag is not a falsely closed release.
