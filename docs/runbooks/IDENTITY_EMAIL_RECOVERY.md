# Identity, email and staff invitation operations

V2-08B is product completion, not pilot approval. **NO-GO FOR REAL CUSTOMER DATA**
remains. Render Free remains staging-only; Atlas remains retained. There is no SMS,
paid-provider, Redis or mail-queue requirement.

## Release and configuration

Apply `013_identity_email_recovery.sql` through the existing explicit, session-capable
PostgreSQL release migration command before deploying this backend. From built
`backend/`, with DATABASE_URL supplied securely, run `npm run db:migrate:status`,
`npm run db:migrate`, then status again; require 001–013 applied/checksums unchanged.
Do not run migration automatically on every web startup. Local acceptance does
not prove hosted migration or delivery. This milestone does not read/modify hosted
SMTP credentials or require the operator to create test accounts.

Email may remain `EMAIL_TRANSPORT=disabled` for disposable staging. Set the exact
`APP_PUBLIC_URL` even when disabled if manual staff handoff is needed. Hosted origins
must use HTTPS, no userinfo/query/path/trailing slash. Existing phone login remains
supported, but self-service recovery needs a verified email and operational mail.

To enable any compatible SMTP provider, configure backend-only secret settings:
EMAIL_TRANSPORT=smtp, SMTP_HOST, SMTP_PORT, SMTP_SECURE=true/false, SMTP_USER,
SMTP_PASS, EMAIL_FROM and APP_PUBLIC_URL. `true` means implicit TLS; `false` still
requires STARTTLS. Certificate verification is mandatory; never set insecure TLS
overrides. Sender is a single validated mailbox. No credentials belong in VITE
variables, source, command lines, screenshots or logs. Capture/console transports
cannot be configured for deployment. Review provider policies, sender/domain
verification and quotas before enabling; real-provider smoke is later hosted acceptance.

## User recovery and verification

Phone-or-verified-email login uses `{identifier,password}`. The legacy `{phone,password}`
body remains a temporary mutually exclusive compatibility alias. Duplicate legacy
phone identities require authenticated operator resolution, never guessing/backfill.
No historical phone/password is rewritten by this release.

Settings → My Profile shows verified and pending addresses. Add/change proposes a
pending address and sends a 24-hour fragment link. Resend waits 60 seconds and
invalidates the previous link. An old verified email remains usable for login and
recovery until the new one is verified atomically. A pending address may be reserved
globally; do not resolve a conflict by taking over another user's identity.

Forgot password accepts a phone or email and never reveals whether it exists or
its destination. A phone can initiate mail only when that identity has a verified
email. Links last 30 minutes. Reset consumes once, revokes every session and
disconnects sockets. Sign in again. Reuse/expiry/revocation show a safe invalid-link
state with a new-reset entry point. No SMS fallback, support bypass, operator-set
password or automated identity linking is available.

All new passwords require at least 12 characters and at most 72 UTF-8 bytes. There
are no composition rules; existing valid passwords still work. Do not email passwords.

## Mail outage

Disabled mail yields the same safe unavailable response regardless of identifier.
Configured-provider failures do not change public recovery responses or disclose a
recipient. Recovery delivery is bounded best effort in-process, not guaranteed:
process restart may lose delivery. Wait the cooldown and retry. Verification/invite
UI reports an unavailable delivery; the unused failed challenge is revoked.

Investigate only metadata-free `Account email delivery unavailable` signals and
closed `email.delivery_failed` audit category. Inspect provider settings privately;
never enable Nodemailer debug/body logging, export SMTP errors containing credentials,
or copy action links into issue trackers. Restore configuration without changing
DATABASE_URL/TLS/session secrets. Existing phone sign-in is not disabled by mail outage.
An account lacking a verified email has no self-service recovery: advanced support
recovery is deferred and must not bypass authentication.

## Staff handoff, replacement and revocation

Authorized owners/admins use Staff → Invite staff: name, valid phone, optional email,
built-in non-owner role and active same-organization branches. There is no password
input. Email delivers directly; acceptance of that email-delivered secret proves
mailbox control. Without email, show a no-store single-use link once to the admin
for private handoff. Closing it removes it from component memory; it cannot be fetched.

Links expire after 48 hours. Re-invite the same phone after 60 seconds to replace;
the older challenge is revoked. Revoke pending invitations from Staff. Issuance is
limited to 20 per organization per 15 minutes plus existing IP limits. Failed email
delivery requires replacement after cooldown. Replacements keep old factual rows.

Acceptance rechecks issuer authority and branches, creates a normal identity and
active membership atomically and consumes the invitation. Existing identities fail
closed, including if another account appears after issuance. Reuse never changes a
password. Do not create a new guessed identity or manually edit membership/email
rows to bypass this; safe authenticated existing-account linking is V2-08C work.

Commercial owner onboarding recommends recovery email and retains an access-request
email when omitted. It remains pending until the owner verifies in Settings. Existing
phone-only historical/staging requests remain compatible and never gain operator status.

## Automated acceptance and retention

Backend: npm ci, lint, typecheck, test, build, test:identity-account and existing
database regressions. Supply POSTGRES_TEST_URL only for a local `/postgres` maintenance
database; tests create/drop exact `ekavio_v208b_*` disposable databases. EmailCapture
is injected, never sends SMTP and never prints action URLs. Do not point QA at hosted data.

Frontend: npm ci, lint, typecheck, test, build, test:e2e, test:e2e:identity. The latter
starts a separate local Express/PostgreSQL/capture server and Vite, serially creates
disposable generated users and real sessions, and tears down its exact test database.
IDENTITY_QA_EXTERNAL_API is an explicit local harness option for a loopback-published
Docker QA container; it is not a frontend build/runtime feature. QA-only __test paths
exist only in excluded backend/tests, not the compiled/deployed server. There is no
manual email-reading/link-clicking/operator-created-fixture prerequisite.

Do not retain secret-bearing browser traces/screenshots/failure contexts. Identity
failure artifacts are excluded from CI uploads. Only empty-route images without
fragments/passwords are visually reviewed. Ignore all test outputs in Git/Docker.

Audit is append-only. Challenges retain hashes for evidence; active rows are bounded
by uniqueness, cooldowns and expiry. Define access-controlled expired/consumed challenge
retention and archival before real data; this release adds no destructive purge job.
Pending email reservation/identity-link disputes need authenticated resolution, not
arbitrary deletion. Backups cover the whole database; later recovery acceptance must
include migration 013 identity/prefs/invitation invariants, not only historical 001–012.
