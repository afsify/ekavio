# V2-08C organization administration, RBAC and staff lifecycle

Date: 2026-10-06. Baseline: `54e9f6e0788a7d15091c0acfdc67b116b5301f03`.
Checkpoint: annotated `pre-v2-08c-organization-rbac`, pushed at that baseline.
Authority and policy: [ADR 0022](../adr/0022-organization-administration-and-custom-rbac.md).

## Implemented boundary

- `/admin`: factual staff/branch/custom-role/pending-invitation counts, editable
  operating profile, canonical read-only billing legal name and module/access summary.
- `/branches`: scoped search, details, create/edit and active/inactive lifecycle,
  unique codes, validated timezone, version conflicts and no hard delete.
- `/roles`: immutable system-role display, custom least-privilege create/edit/archive,
  server-returned categorized permission catalogue. Assigned archive fails safely.
- `/staff`: searchable history-preserving membership cards with verified email,
  effective role, status, branches and update time; role/branch/status edits,
  secure invitation creation/replacement/revocation and one-time handoff.
- Existing-account invitation acceptance authenticates the exact target account;
  no duplicate identity or credential/global-profile overwrite.
- `/audit`: tenant-only safe event projection, human actors, date/actor/action/category
  filtering, retry/empty states and bounded pagination; closed new events are atomic.
- `/platform`: operator-only read-only organization directory with commercial state,
  enabled modules and active staff/branch counts; no impersonation or credential view.
- Personal Settings link to organization administration without mixing personal
  preference/identity changes with business/role/commercial authority.

## Security review

Live custom permissions replace broad built-in grants and archived assignments deny
all. Mutation authority is rechecked under an organization lock. Grant escalation,
foreign branches/roles/memberships, stale versions, self-role edits and owner
authority changes fail closed. Suspension/revocation preserves other organization
sessions. Branch deactivation cannot strand active memberships. Customers/Services
are explicitly CORE with dedicated read/manage capabilities; Queue/Appointments
remain commercially gated. No role edits commercial entitlement or operator status.
Queue notifications re-resolve live session/membership/branch authority and Queue
entitlement per connected recipient; branch-room possession alone cannot receive
an event. Role/membership/branch writes also disconnect affected organization sockets.
No environment secrets, real users, hosted credentials or migration source payloads
are used in local QA. Failure traces/screenshots are disabled for secret-bearing
identity/admin tests, and both directories are excluded from CI artifact upload.
Only an explicit fragment-free disposable overview image is captured for visual QA.

The acceptance audit discovered newly listed advisories. Compatible patches were
applied narrowly: compression 1.8.2, proxy-addr 2.0.8 and source-map-js 1.2.2.
References: [compression advisory](https://github.com/advisories/GHSA-vc2v-76pw-4v95),
[proxy-addr advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h),
[source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
TLS, proxy trust, cookie security and production registration behavior are unchanged.

## Acceptance evidence

- Backend: clean `npm ci`, lint, typecheck, **156/156** unit/source-contract tests
  and build passed. Final runtime audit: **0 vulnerabilities**.
- Frontend: clean `npm ci`, lint, typecheck, **25/25** unit tests and production
  build passed. Runtime and full audits: **0 vulnerabilities**. Existing bundle-size
  and ineffective-dynamic-import warnings remain non-blocking, not hidden.
- Local Chromium: admin **18/18**, identity **11/11**, foundation **19/19** passed
  (**48** total). Admin/identity use real disposable PostgreSQL sessions; foundation
  tests intentionally use intercepted HTTP fixtures, not hosted authority evidence.
  Admin checks cover 390/768/1440 widths and Light/Dark/System, lifecycle, explicit
  existing-account linking, CORE policy and operator separation, with no page errors.
- All **26 distinct database integration suites** passed across the resumed local
  run: PostgreSQL/parity/identity, commercial intake/activation/renewal/cutover,
  operational foundation/migration/runtime, Attendance/Dues/Inventory and their
  migration/cutover suites, corporate/audit migration/runtime, Mongo retirement,
  identity-account and new organization/RBAC. New RBAC suite: **25/25**, including
  001–013 upgrade, unchanged checksums, effective custom authority and HTTP isolation.
  Clean-to-latest and idempotent migration gates passed; old SQL remains unchanged.
- Backup envelope/tooling/watchdog: **15/15**; Mongo source boundary: **4/4**.
- Docker config, final pinned-image build and healthy startup passed. Normal runtime
  has only PostgreSQL/backend/frontend; offline QA Mongo and browser fixture stopped.
  Local `/health/live`, `/health/ready`, `/`, `/login`, `/settings`, `/admin` returned
  **200**. Recent normal backend/frontend logs contained no runtime error signatures.
  A SPA 200 is not claimed as authenticated normal-tenant evidence.
- Complete source/diff review and artifact/secret-value scan: **59 task files**, no
  ignored staging secret values, private keys, backup/build artifacts or screenshots
  in the commit candidate. No environment file or historical migration is changed.

Initial failures were resolved, not waived: generic API errors now read the safe
nested message; the disposable branch fixture uses a reviewed IANA timezone; latest
schema count assertions are 14. Reusing a browser fixture after an earlier successful
identity run hit its existing-account flow for fixed test phones; fresh disposable
QA restored the intended new-account checks. Windows Vite teardown stalled after
all 11 identity assertions and was diagnosed/cleaned up only for its verified test
process tree. A duplicate foundation launch caused artifact-directory collisions;
the isolated final run passed 19/19. No test assertions were weakened for these
harness problems. Local build URL prerequisites and audit network access were
supplied explicitly for the successful final gates.

## Hosted and operational limits

Ignored staging configuration was loaded only in process memory. Normal migration
status found 001–012 applied and 013 pending; the normal checksum/advisory-lock
runner successfully applied 013. After all local acceptance, the same normal runner
applied only pending **014**; hosted status now verifies **001–014 applied**.
After migration, public hosted backend `/health/live` and `/health/ready`, frontend
`/` and `/login` all returned **200**. This verifies schema/public availability,
not deployment or authenticated acceptance of the new administration UI.
No hosted authenticated/browser/SMTP evidence is fabricated.
Managed browser bootstrap failed before navigation because sandbox metadata was
unavailable; automatic local Chromium and disposable PostgreSQL are used instead.
No long manual browser validation loop is required.

**NO-GO FOR REAL CUSTOMER DATA** is unchanged. Render Free is intentionally
staging-only, Atlas is retained, and later operational/pilot recovery requirements
are not waived by this product-experience milestone. Recovery proof for the newly
extended hosted schema remains a distinct operational requirement. V2-08D's next
product scope remains deferred until separately requested.
