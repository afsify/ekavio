# V2-09A CRM & Follow-ups acceptance

Date: 2026-10-07. Starting main: `7a467f2f2ab72c9183af8aca428ba5b3047f80d5`.
Existing annotated checkpoint: `pre-v2-09a-crm-followups`, pushed at that baseline.
Status: local product acceptance complete; release is gated on exact-commit CI.
Decision: product completion only; **NO-GO FOR REAL CUSTOMER DATA** remains unchanged.

## Delivered scope

See [ADR 0026](../adr/0026-crm-followups.md) for authority, schema, transaction and
shared-engine decisions. PostgreSQL migration 018 creates organization stages,
selected-branch leads/follow-ups, append-only activity and safe stage-admin history.
`crm` / **CRM & Follow-ups** is optional and initially unpublished; Pilot Core and
existing subscriptions receive no CRM grant. Owner/admin/manager receive crm.read
and crm.manage; staff/HR do not. Custom-role replacement remains authoritative.

CRM handles bounded contact information, assignment, explicit stage order/archive,
active/lost/archived/converted leads, manual closed-type follow-ups and retained
plain-text notes. New/reassigned staff must be active and branch-assigned; history
survives inactivity. Branch-local dates and wall-clock inputs use existing timezone
conversion. Completed/cancelled follow-ups are terminal; optimistic conflicts are 409.

Explicit conversion creates a canonical Customer with required shared fields or
links a selected active same-organization Customer. Atomic rollback and exactly-one
concurrent conversion protect identity; reuse is rejected and no Sale is recorded.
Phone/email duplication is allowed as distinct enquiries, never silently merged.

Lead is the sixth entity in the existing 13-type dynamic field/layout engine, with
searchable text, closed typed filters, stable options and reportable columns. Two CRM
reports reuse existing branch-safe formula-neutralized bounded CSV. Four dashboard
widgets omit unauthorized CRM facts and do not require reports.read. Generic
assignment notifications respect active authority, preferences and dedupe; no due
scheduler or marketing provider is promised. Authorized Customer detail shows a
bounded selected-branch CRM origin, not another contact identity.

Responsive `/crm` includes factual attention cards, bounded lists/filter/pagination,
stage-count pipeline cards, stage configuration, shared Lead forms/detail, accessible
stage selector, staff assignment, follow-up dialogs/completion, explicit conversion,
timeline, loading/retry/empty states and human labels. Light/Dark/System use the
existing shell. Organization/branch keys reset workspace drafts on context change.

## Corrections found by acceptance

- Commercial snapshot readers now respect an existing atomic transaction; otherwise
  an internal COMMIT could break conversion rollback. Required-field failure and
  concurrent conversion directly cover this functional correction.
- Stage updates no longer clear an unrelated activity-note draft during refresh.
- Historical fixture-only catalogue preparation keeps Mongo/shared-core parity
  faithful to the old source. No invented CRM Mongo mapping or weakened production
  preflight. Current native catalogue remains five modules and is tested separately.
- Migration 018 explicitly rejects a lost lead with a NULL reason and enforces the
  sixth typed entity's non-NULL identity predicate; prior migrations are untouched.

## Evidence register

Final local results below are actual completed gates, not interrupted-run assumptions.

| Gate | Result |
| --- | --- |
| Backend clean install/lint/typecheck/186 unit tests/build | PASS |
| Frontend clean install/lint/typecheck/72 component tests/build | PASS |
| Backup/envelope/tooling/watchdog contracts | PASS 15/15; not extended recovery proof |
| Dependency full/production audits, both projects | PASS, 0 vulnerabilities |
| Final 30-file PostgreSQL regression and dedicated CRM suite | PASS 244/244; dedicated CRM 16/16 |
| Prior foundation/identity/admin/fields/analytics/commercial Chromium | PASS 19 / 11 / 18 / 14 / 13 / 24 |
| CRM Chromium workflow/security/responsive suite | PASS 15/15; final owner workflow recheck PASS |
| Production/PWA bundle | PASS; lazy CRM 29.49 kB / 7.56 kB gzip; main 390.66 kB / 125.46 kB gzip; 74 precache entries / 1004.99 KiB |
| Compose build/normal runtime/health/bounded logs | PASS; three healthy services; temporary Mongo stopped, retained volume |
| Local live/ready/root/login/CRM | PASS, HTTP 200 for all five paths |
| Hosted live/ready | PASS, HTTP 200 for both; initial bounded live cold-start timeout resolved on warmed retry |
| Hosted migration/status | Only pending 018 applied after all local gates; 001–018 applied/checksums matched |
| Complete diff/security/artifact review | PASS; no added credentials, backups or generated QA/build artifacts; prior 001–017 and lockfiles unchanged |
| Mongo runtime source contracts | PASS 4/4; no Mongo/legacy CRM runtime |
| Release gate | Push coherent main commit; require its exact CI success before annotated `v2-09a-crm-followups`; final SHA/run/tag recorded by Git and final report |

CRM Chromium covers explicit recommended setup, typed required Lead field, active
staff assignment, stage movement, plain note and updated activity, manual follow-up
creation/completion, searchable custom text, both CRM reports and CSV, factual
dashboard visibility, required Customer fields/conversion, canonical Customer origin,
second-conversion rejection, unentitled/read-only/tenant/branch negatives and
360/390/768/1440 Light/Dark/System without document overflow or page errors.
The final affected analytics suite was rerun 13/13 after preference changes.
The first pushed CI run passed 14/15 CRM browser cases but timed out switching
accounts: the test navigated to login before asynchronous sign-out finished.
The test now requires the logout HTTP 200 and visible login form before the next
login; no production code, timeout, authority assertion or artifact policy changed.
Release still requires successful CI on the subsequent exact correction commit.
The corrected full local CRM suite passed 15/15; frontend lint/typecheck also passed.

The first concurrent foundation run had a loading/retry timeout; its focused check
and full 19-test single-worker rerun passed without changing assertions. Early
historical catalogue regression failures were corrected in test fixtures only;
the final entire 30-file chain is green. Existing build warnings about ineffective
dynamic imports remain non-failing; no new dependency or mandatory cost is introduced.

All authenticated QA uses disposable local PostgreSQL and example.invalid/local
fixture data; credential-bearing traces/screenshots/videos are disabled and excluded
from CI artifacts. The managed browser connection failed before navigation due to
missing sandbox metadata; repository Playwright/Chromium was the authorized fallback.
No manual operator browser testing is required for this local acceptance.

## Operations and deferred scope

Apply accepted 018 through normal PostgreSQL migration tooling only after local
acceptance. Check matching 001–017 history before applying; do not print staging
connection strings, change TLS or create hosted CRM customer records. Hosted schema
and public health are not authenticated CRM or exact deployed-build evidence.

Atlas remains retained/untouched. Temporary local Mongo is compatibility-test-only
and must be stopped for normal three-service acceptance without deleting retained
volumes. No normal Mongo connection, CRM collection or authority latch is introduced.
No new package/paid provider is required; browser search is bounded PostgreSQL, not
search SaaS. No campaign/reminder scheduler, arbitrary reports, importer, predictive
scoring, revenue forecast, Deal, SMS/WhatsApp, payment gateway or paid AI is added.

Render Free remains intentionally staging-only; always-on hosting stays OPEN.
Extended recovery through 013–018 and hosted authenticated/deployment acceptance
remain OPEN. V2-09B Suppliers/Purchasing, V2-09C HR Plus and V2-10 final acceptance
are deferred/not started. This review does not issue pilot GO.
