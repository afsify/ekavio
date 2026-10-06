# ADR 0021: Verified email identity, recovery and secure staff invitations

- Status: Accepted
- Date: 2026-10-05
- Scope: V2-08B; extends ADRs 0003, 0004, 0008 and 0015 without changing their runtime authority or cookie boundaries

## Decision

PostgreSQL remains the sole identity/session/membership authority. `identifier`
is explicitly classified as email or phone; the legacy `phone` body is accepted
only as an alternative, never together. Both use one password/session path.
Email is trimmed/lowercased for lookup and must be verified. Invalid/unknown/
unverified identifiers and wrong passwords receive `Invalid credentials`.
Existing duplicate phones retain the explicit migration-required conflict; no
arbitrary identity is selected.

Migration 013 is additive. `user_email_identities` retains display and normalized
email, pending/verified/replaced state and verification time. Partial unique
indexes enforce globally unique usable addresses and at most one pending and one
verified address per user. The verified address survives a pending change; one
transaction retires it only when the new address is verified. A composite FK
binds a verification challenge to its actual email owner. Replaced identity rows
retain history but cease to be login/recovery authority.

`identity_challenges` uses Node crypto 32-byte random base64url secrets with only
SHA-256 digests in PostgreSQL. Purpose and relational target shape are constrained.
Verification lasts 24 hours, reset 30 minutes, and staff invitation 48 hours.
Tokens are single-use, revocable, row-locked, rechecked at commit and delivered in
URL fragments. Public inspect/consume requests send tokens only in POST bodies.
React scrubs fragments immediately, retains secrets only in component memory and
never uses them in query-cache keys. Same-page replacement links are re-inspected.

Reset locks the user and challenge, replaces the bcrypt hash, consumes the
challenge and revokes every refresh session atomically, then disconnects sockets.
Exactly one concurrent redemption wins. Login session issuance takes a user share
lock and checks the hash it actually verified, so an in-flight old-password login
cannot create a session after reset. Password change uses compare-and-swap against
the verified prior hash and cannot overwrite a concurrent reset. The canonical
new-password policy is 12 characters minimum and 72 UTF-8 bytes maximum, without
composition requirements. Existing valid passwords remain usable for login.

The pinned server `libphonenumber-js` matches the frontend policy/version. New
identity writes require valid E.164, with IN interpretation for explicitly
supported local inputs. Legacy exact values remain selectable; valid old formatted
IN/international values, including supported trunk/dialing prefixes, are compared
without rewriting them. Canonical collisions
fail closed. All new registration, staff acceptance and commercial owner writes
share a phone advisory-lock/collision contract. There is no guessed or destructive
phone backfill. Internal legacy staff/account repository fixture contracts are
retained, not exposed as administrator-selected-password product APIs.

## Email and abuse

Provider-neutral EmailService has a reviewed pinned Nodemailer SMTP adapter and
explicit dependency-injected test capture. Environment transports are only
`disabled` or `smtp`; capture/console cannot be enabled through production config.
SMTP requires validated sender, credentials, exact APP_PUBLIC_URL, verified TLS
(implicit TLS or required STARTTLS), timeouts, no payload logger, and no file/URL
attachments. HTML/text templates have no remote images or unnecessary PII.
Disabled email permits staging boot but all recovery identifiers receive the same
unavailable response. Eligible recovery requires a verified destination; phone
alone is not a recovery channel and there is no SMS fallback.

Forgot-password returns the same accepted body for unknown, no-email and unverified
accounts. It never returns a recipient. SMTP latency/failure is excluded from the
public request response through bounded best-effort in-process delivery. This is
not a durable mail queue: a restart may lose a message and users can retry after
the cooldown. A failed delivery revokes its unused challenge and records only an
unavailable category. No delivery guarantee or perfect timing-equivalence is claimed.

The existing single-instance IP limit covers login/recovery/verification/inspection/
reset/acceptance. Database user locks enforce a 60-second verification/reset cooldown
and revoke obsolete challenges across processes. Invitation replacement has a
60-second phone cooldown; an organization advisory lock caps issuance at 20 per
15 minutes across processes. Existing global API limits are preserved. Historical
challenge retention is an explicit operational policy, not an unbounded active set.

## Staff and commercial owners

Invitations store canonical organization, issuer, name, phone, optional email,
built-in non-owner role and normalized branch assignments. Composite FKs reject
foreign branches. Only `staff.manage` can issue/list/revoke; raw manual handoff is
returned once with no-store headers only when no email is provided. Replacing a
link revokes its predecessor. Inspect exposes safe organization/name/role only.

Acceptance rechecks expiry, issuer's active owner/admin membership and active
assigned branches. A single transaction creates a normal identity, membership and
assignments only after the recipient chooses a password, then consumes the link.
It never sets platform-operator status. Possession of an email-delivered invitation
is accepted as mailbox-control proof and creates a verified email identity.
Manual invitations have no email and cannot grant verified email by that path.
An existing phone/email is rejected at issuance and rechecked at acceptance; no
password/email is overwritten and no identity is silently attached. Authenticated
existing-user organization linking remains V2-08C.

Commercial onboarding preserves settlement checks, owner-chosen passwords, hash-only
single-use tokens and atomic provisioning. Optional recovery-email input is strongly
recommended; absent input retains the access-request email when present. It is
pending only, not mailbox proof. Settings guides verification immediately after
phone login. Requiring email unconditionally would break accepted phone-only
requests/staging fixtures, so those remain compatible.

## Preferences, audit and evidence

`user_preferences` stores only per-user Light/Dark/System and a curated accent,
never organization branding or a JSON settings blob. Login/refresh hydrate server
preferences; anonymous appearance remains local. UI changes optimistically and
serializes server saves with a local fallback/retry notice. Fresh-device login
restores server appearance. System continues following live OS changes.

Identity-level `account_security_events` is append-only with closed action/outcome
columns and canonical actor/invitation identifiers. It is independent of a selected
tenant and historical audit latches. Recovery-request events contain no target.
No email/phone text, passwords/hashes, action URL, raw token, cookie/header or SMTP
credential can be stored in its columns. Unexpected HTTP/auth errors are generic.

Tests inject capture email into disposable local PostgreSQL/Express/Socket.IO;
production has no capture endpoint. Browser failure traces/screenshots are disabled
for secret-bearing flows; identity failure artifacts are excluded from CI uploads.
Only explicit empty-route, fragment-free visual images are taken locally. Existing
unit, database and frontend suites remain in CI. Hosted SMTP and migration/release
evidence remain separate: migration 013 must precede V2-08B hosted deployment.
This decision does not approve a pilot, change Render Free or authorize Atlas deletion.
