# V2-08B identity, account recovery and secure staff invitations

## Baseline and scope

Clean main started at `84bc981d06e1f5cb2f376d7433495caf3368cef9`, equal to origin/main
and verified remotely. Personal EkaVio Git identity was retained. Annotated checkpoint
`pre-v2-08b-identity-account-recovery` was created/pushed at that exact baseline.
No reset, restore, stash, clean, branch switch or existing-user work was discarded.

This is product implementation, not a pilot review. **NO-GO FOR REAL CUSTOMER DATA**
is unchanged. Render Free remains staging-only by choice and Atlas is retained.
No V2-08C, mandatory SMS, phone OTP, gateway, paid AI or hosted customer fixtures.

## Implemented contract

See [ADR 0021](../adr/0021-identity-email-recovery.md) and
[operations](../runbooks/IDENTITY_EMAIL_RECOVERY.md) for the complete rationale.
Phone-or-email classification is explicit; verified email and phone use one password/
session path, with one legacy phone-body alias. Unknown/unverified/wrong credentials
are generic; legacy canonical collisions remain explicit and fail closed.

Migration 013 adds normalized email identities, purpose-bound hash-only challenges,
preferences, staff invitations/branch assignments and closed append-only identity
audit. No applied 001–012 SQL is changed. Global usable-email and one-pending/
one-verified constraints, purpose target shape, composite FKs and narrow preferences
are enforced relationally. No destructive phone backfill or identity guess is made.

New phones use server libphonenumber-js E.164 normalization with explicit IN-local
compatibility. Registration, commercial owner and staff acceptance share collision
locks; old phone text is untouched. Email promotion preserves prior verified identity
until the replacement verifies, then invalidates obsolete recovery challenges.

Secrets use 32 random bytes, SHA-256 storage, 24h verification/30m reset/48h invitation,
revocation and exactly-once locked consumption. Reset atomically replaces the hash,
consumes the challenge and revokes all sessions, then disconnects sockets. Transient
hash guards prevent old-password login issuance after reset; compare-and-swap prevents
password change from overwriting a concurrent reset. New-password policy is centralized
at 12 characters minimum/72 UTF-8 bytes maximum; existing passwords still sign in.

EmailService is SMTP-provider neutral with pinned Nodemailer 10.0.15 (Node >=20,
MIT-0) and libphonenumber-js 1.13.14 (MIT, same frontend version). Official
[SMTP documentation](https://nodemailer.com/smtp) informed required STARTTLS/implicit
TLS, certificate verification, timeouts and disabled payload logging; official
[message configuration](https://nodemailer.com/message) informed disabled file/URL
content access. Dependency audit is part of final acceptance, not assumed from a
version string. Capture is injected only in disposable tests, never an environment
option/production endpoint. HTML/text templates have no remote images or passwords.

Recovery responses do not disclose recipient/account/no-email/pending state. SMTP
latency is outside the public response; delivery is bounded best effort, not a durable
queue or guarantee across restarts. Delivery failures revoke unused challenges and
record metadata-free categories. Disabled email remains a safe staging boot option.
DB cooldowns and invalidation work across processes; existing IP/API limits are kept,
with a DB-serialized organization invitation cap. Audit stores only closed actions,
outcomes and canonical IDs, including no target on public recovery requests.

Staff has no administrator password field; the old POST /staff password-creation API
returns 410. Email invitations can establish verified email through mailbox-token
possession; manual handoff has no email authority. No membership exists before
acceptance. Acceptance rechecks issuer and branch state, atomically creates a normal
identity/membership/assignments and consumes the link. Existing identities cannot be
taken over; authenticated linking remains V2-08C. Commercial onboarding retains its
accepted atomic/single-use/settlement boundaries and recommends optional recovery
email, pending only, with legacy phone-only compatibility.

Authenticated appearance is per-user PostgreSQL state, not organization theme. It
hydrates at login/refresh, saves optimistically with ordered requests and local fallback,
and restores across sessions/devices. System follows live OS changes. Anonymous
appearance stays local. Mail/recovery/invitation pages scrub fragments, keep tokens
out of storage/cache keys, and re-inspect same-page replacement links.

## Automated acceptance evidence

Actual local PostgreSQL/Express/Socket.IO plus capture email complements the retained
V2-08A contract-fixture suite. No real SMTP, hosted customer account, operator-created
fixture or manual browser loop is required. Managed browser bootstrap failed before
navigation (`sandboxPolicy` metadata missing); requested local Playwright was used.

New database coverage includes zero → 013, prior 001–012 → 013, unchanged legacy
ambiguity, phone/verified-email login, duplicates, verification/resend/revoke/expiry/
replacement, generic recovery, phone-to-email recovery, wrong-purpose/expired/reused
reset, concurrent reset/invitation redemption, session/hash race guards, no takeover,
cross-tenant invitation/branch rejection, no operator escalation, preference persistence/
invalid input and closed append-only audit. Existing schemas' strict migration-count
assertions are advanced to 13, not removed; domain assertions remain.

Browser coverage: phone and verified-email login, generic failures, captured verification/
reset, revoked prior session, new-password login, used-link rejection, Settings status,
all three modes and accent in fresh device contexts, live System changes, staff invite/
accept/login/reuse/role navigation, and 390/768/1440 routes without overflow/page errors.
Recovery runs at 390px. No raw action-link/password traces or screenshots are collected;
identity failure contexts are excluded from CI uploads. Existing 19 browser tests remain.

Final gate record is completed after validation below. Exact final commit/CI/tag identity
is reported at closeout, not inferred from a previous milestone.

| Gate | Result |
| --- | --- |
| Backend install/lint/typecheck/unit/build | PASS; 150/150 unit/contract tests |
| New identity PostgreSQL suite | PASS; 22/22 including parent, no skips |
| Preserved database/compatibility suite chain | PASS; PostgreSQL/parity/cutover, commercial, operational, Attendance, Dues, Inventory, corporate, audit and Mongo-retirement suites; source contract 4/4 |
| Frontend install/lint/typecheck/unit/PWA build | PASS; 20/20 unit tests; manifest and service worker generated |
| PostgreSQL-backed identity browser | 11/11 PASS, including one-time manual handoff/acceptance |
| Product-experience browser regressions | 19/19 PASS |
| 390/768/1440/no overflow/no page errors | PASS |
| Runtime/full frontend dependency audits | Zero vulnerabilities |
| Docker config/build/health/probes/log review | PASS; normal PostgreSQL/backend/frontend healthy; required five routes HTTP 200; manifest/SW 200; startup logs clean |
| Complete diff/security/artifact review | PASS; no actual env/credentials, raw action links, backup/key/build/browser artifacts staged |

Failures were diagnosed, not waived: initial QA harness lacked the new dependency;
one cooldown fixture tried to move an expired row's creation past its expiry; an old
commercial assertion required its accepted conflict text; Light re-selection needed
an actual save/retry handler; reopening a used fragment on the same page needed fresh
inspection. None required weakening password, token, tenancy or regression assertions.
The final Mongo source contract lacked root docker-compose.yml in the test container;
the unchanged repository-context command passed 4/4. Final collision review added
trunk/dialing-prefix coverage and reran backend gates and the complete new identity
database suite successfully. Empty-route screenshots were visually reviewed locally;
safe mobile/desktop layout matched the automated no-overflow checks. Disposable QA
databases were removed and the offline Mongo compatibility container stopped; normal
database volumes and Atlas were retained. Root backup/encryption/tooling/watchdog
regressions passed 15/15. Non-blocking build chunk-size/dynamic-import warnings remain
visible, not suppressed.
Manual invitation handoff is held only in modal state, never returned into React
Query's mutation cache. Browser acceptance verifies closing/reloading does not
redisplay it and manual acceptance cannot confer a verified email.

## Deferred and deployment facts

External real SMTP smoke and hosted migration/deployment behavior are not claimed.
Apply 013 through an explicit release job before hosted deployment; disabled SMTP
does not waive the schema prerequisite. Operator support recovery, authenticated
existing-identity linking, custom roles and broader staff/branch lifecycle are later
work. No proof that historical recovery evidence covers new 013 invariants is invented.
Challenge/identity retention and production provider/operating evidence remain before
real data. V2-07 NO-GO and all unclosed recovery/always-on/monitoring gates remain.
