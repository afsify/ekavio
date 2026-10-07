# V2-08F public website and commercial UX acceptance

Date: 2026-10-07. Starting main: `b0789ad505fd3059d6df71d0d6eef4e9c9dbbbca`.
Checkpoint: `pre-v2-08f-public-commercial-ux`, annotated and pushed at that baseline.
Decision: product-experience completion only; **NO-GO FOR REAL CUSTOMER DATA**.

## Product and brand audit

The old public entry was a small catalogue/contact experience, not a complete
business-facing narrative; generic identity decoration and an unused starter social
sprite did not form a shared brand. Replace them with an original folded-E SVG mark,
EkaVio wordmark and shared lockup. Public raster exports are reproducible through
`frontend/scripts/generate-brand-assets.mjs` using existing Chromium, not image services.

Sticky desktop/mobile navigation provides Product, Modules, Pricing, FAQ, Login and
Request Access, alongside Light/Dark/System. Mobile navigation traps keyboard focus,
closes with Escape and restores focus/scroll. The skip link appears on focus. Dark
public accents are intentionally lighter for readability; content wraps without
page-level horizontal overflow at all six acceptance widths.

Landing: business-oriented hero, five business types, three manual-start steps,
clearly illustrative workspace, four factual module cards, shared CORE foundation,
three practical value statements, restrained security section, eight FAQs and final
CTA. Footer links are real; `/privacy` explains current purpose/storage/staging limits.
No fake customer counts, trial/payment promises, certifications, support address,
clinical record/POS/payroll claims, third-party trackers or new dependency.

## Pricing, intake and commercial lifecycle

Migration 017 is additive and preserves 001–016 checksums and old fixed prices.
Explicit fixed/contact mode, NULL contact estimates, meaningful negotiated reasons
and immutable accepted request intent are enforced in PostgreSQL as well as services.
Existing offers with missing fixed-cycle prices remain unavailable, never inferred
contact prices. Canonical module metadata supplies human capabilities; no new table
is needed for marketing copy. Annual savings appear only for positive exact fixed
price comparisons. The public/operator draft card is shared.

Included add-ons are removed/labeled/disabled on plan selection; independent add-ons
preserve the plan. Backend overlap/duplicate/publication checks remain independent.
The three-step wizard reviews a server quote; stale pricing fingerprints and a final
transactional recomputation prevent old reviewed totals from silently being accepted.
Contact details use existing India-default E.164 normalization. Submission payloads
never contain client totals or activation instructions. Receipt/reference copying,
safe next steps, reset and recoverable loading/error/rate-limit states are implemented.

References are independent random 128-bit `EV-REQ-` values, uppercase/bounded/unique,
backfilled for historical requests, immutable and free of PII/time/sequence information.
Operator-only intake searches reference/business/contact/normalized-phone/email with
bounded bound literal substring parameters, status filter and newest-first pagination.
Immutable request intent is separated from operator notes and final agreed terms.

Manual agreement UI requires an explicitly entered amount; contact terms require
a reason. Payment records still assert manually received funds and require exact
settlement before onboarding. Invitations remain one-time, expiry-aware and raw
handoff links component-memory-only. Customers choose their own password. Atomic
provisioning, tenant/operator boundaries and consumed-link rejection are unchanged.
Billing and renewal surfaces show frozen human package names and persisted progress;
renewal remains idempotent/manual, with no gateway, automatic charges or fake invoices.

## Metadata, privacy, PWA and accessibility

Titles cover public and account actions. Public canonical origin is a validated
credential-free HTTPS build setting; default `https://ekavio.afsify.com`. No token/query/
fragment appears in metadata. Index/sitemap allow only `/` and `/privacy`; account and
internal routes are noindex/disallowed. Original self-hosted 1200×630 social image,
192/512/maskable icons and EkaVio manifest use the same mark. Existing service-worker
API/Socket exclusions and no authenticated runtime caching remain intact.

Semantic headings, labels/error descriptions, keyboard focus, 44px controls, honest
disabled selection states and mobile focus restoration are covered by automated checks.
This is not a claim of a formal WCAG audit, screen-reader certification or Lighthouse
score. Anonymous screenshots were visually inspected; menu visibility, skip-link
visibility, dark accents and over-wide single pricing cards were corrected afterward.

## Local automated evidence

Backend clean install/lint/typecheck/build and 182 unit/contract tests pass.
All 29 database integration files pass: analytics 17, Attendance 9, cutover 6,
migration 6, audit 1/migration 1, commercial cutover 9, renewal 10, corporate 1/
migration 1, Dues 8/cutover 6/migration 4, fields 19, identity 22/cutover 15,
Inventory 9/cutover 7/migration 4, manual commercial 9, Mongo retirement 1,
operational foundation/migration/runtime 1 each, administration 25, parity 7,
PostgreSQL chain 17, public intake 5 and new public experience 6.

New database checks cover 016→017 upgrades with historical request/price preservation,
fresh chain/idempotency, mode constraints, references/search/history immutability,
contact agreements and stale/invalid selections. Backup envelope/tooling/watchdog:
15 tests pass; this does not extend hosted restore proof to 017.

Prior Playwright suites: foundation 19, identity 11, administration 18, fields 14,
analytics 13, all pass. Managed in-app browser initialization failed before navigation
because sandbox metadata lacked `sandboxPolicy`; the prompt-authorized existing local
Playwright/Chromium fallback was used. No operator manual clicking was required.
Windows managed web-server cleanup initially stalled; owned QA servers and explicit
opt-in external-server flags resolved that harness issue without changing CI defaults.
A whole-backend bind initially exposed Windows esbuild binaries in Linux; the correct
read-only src/tests/migration mounts resolved it without application changes.

Frontend clean install, lint, typecheck, all 66 component tests and production/PWA
build pass. Thirteen component cases cover the new brand/cards/wizard/metadata/theme
behavior. The new public/commercial Playwright suite passes 24/24: generated asset
contract, fixed/contact/stale/error paths, full real PostgreSQL lifecycle and eighteen
six-width × three-theme combinations (360/390/768/1024/1440/1920; Light/Dark/System).
After final mark-color/renewal-copy corrections, all seven affected lifecycle/mobile/
desktop cases pass again. Final 4xx-envelope/5xx-redaction correction is included in
the final frontend gates and affected onboarding lifecycle recheck.

The real disposable-browser flow creates a request, reviews/approves it as operator,
enters explicit negotiated terms and STAGING TEST DATA settlement, obtains a one-time
invitation, lets its recipient choose a password, logs in and reads tenant Billing.
Consumed invitation inspection returns 410. A manual renewal is settled/applied;
repeat apply returns the same applied timestamp/end period, not a second extension.
Customer initial and renewal payment history remain readable. No real payment occurs.

Backend production audit, frontend full audit and frontend production audit each
report zero vulnerabilities. Both npm ci installs also report zero vulnerabilities.
No package/lockfile dependency additions. Deprecation notices for existing transitive
packages and existing ineffective dynamic imports of client/toast are disclosed,
not bypassed. Final entry JS is 390.16 kB / 125.35 kB gzip, versus V2-08E 528.09 /
167.16: approximately 26.1% smaller raw, 25.0% smaller gzip. Landing is separately
20.81 / 6.36; CSS 63.55 / 12.07. PWA precache is 973.49 KiB / 72 entries;
precache of public build assets is not caching authenticated API responses. No claimed
Lighthouse score, hosted latency or production load benchmark.

Docker config, production builds and normal three-container startup pass. PostgreSQL
17.11 remains pinned/unchanged; backend and frontend are healthy. Local standard
migration/status reports 001–017 applied. Local live/ready, home, login, privacy,
onboarding, manifest, three PNG icons, social art, robots and sitemap return HTTP 200.
Manifest MIME is `application/manifest+json`. Bounded backend/frontend runtime logs
show zero uncaught/fatal/exception/error markers. Temporary legacy-test Mongo is stopped;
Atlas is neither written nor deleted. Owned QA services are stopped after acceptance.

## Hosted evidence (2026-10-07)

Using existing staging configuration in memory, unchanged TLS-enabled Neon URL and
standard migration code: before, 001–016 applied/checksums matched and only 017 pending;
then ONLY accepted 017 applied; afterward all 17 source checksums matched/applied.
No row data, connection string, credential or authority latch was printed/changed.
This is schema evidence, not authenticated product or extended restore acceptance.

Read-only probes: `https://api.ekavio.afsify.com/health/live`, `/health/ready`,
`https://ekavio.afsify.com/`, `/login`, `/manifest.webmanifest` and `/sw.js` return 200.
At collection time hosted HTML does not contain the new brand title; the manifest
is served as `binary/octet-stream`, unlike the passing local Nginx MIME. Therefore
**HOSTED V2-08F DEPLOYMENT PROOF OPEN**. Verify the exact deployed commit, current
public metadata/brand/robots/sitemap/icons and Render manifest MIME separately; do
not infer them from push/CI, or claim authenticated hosted acceptance. No real public
access request was made for smoke; no manual browser group is required by this release.

## Operational boundary

All browser credentials, organizations and manual money records were disposable local
QA data, not hosted customer evidence or real funds. No hosted access request was
created for smoke. Purposeful public icons/social art are deliverables; QA screenshots,
traces, videos, .env files, raw tokens, dumps, backups, node_modules and dist are excluded.
No TLS, credentials, encryption keys, normal database image or authority latch changes.
Atlas remains retained and untouched. Render Free is intentionally staging-only.
Extended schema 013–017 recovery proof and final hosted authenticated/deployment
acceptance remain OPEN. V2-09 CRM/Purchase/HR is not implemented or started.

See [ADR 0025](../adr/0025-public-brand-commercial-experience.md).
