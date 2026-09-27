# V2-06B5B Manual Commercial Activation and Customer Onboarding Review

- Date: 2026-09-27
- Starting commit: `52f3ae599f97a37e03674d44d894a61a938e24f5`
- Starting completion tag: `v2-06b5a-public-commercial-intake`
- Checkpoint: `pre-v2-06b5b-manual-commercial-activation`
- Authority: PostgreSQL
- Scope: negotiated agreement, manual-payment bookkeeping, one-time onboarding, atomic provisioning, and tenant billing visibility

## Outcome

V2-06B5B completes the deliberately manual, provider-independent commercial activation path:

```text
Public Catalogue
  -> Request Access
  -> Platform-Operator Review
  -> Approved
  -> Negotiated Agreement
  -> Manual Payment
  -> Secure One-Time Onboarding
  -> Atomic Organization Provisioning
  -> Subscription Activation
  -> Customer Login
```

The workflow has no payment gateway, SMS, WhatsApp API, paid email, Redis, external queue, or paid AI dependency. A platform operator verifies an offline payment and manually shares a one-time link through a human-selected channel. The customer alone chooses the password.

## Relational changes

Forward-only migration `007_manual_commercial_activation.sql` adds:

- `commercial_agreements`, separate from the immutable B5A request snapshot, with canonical final selections, server-calculated list-price snapshot, negotiated INR amount, exact period, billing fields, actor, lifecycle, and eventual organization link;
- `manual_commercial_payments`, with positive integer paise, narrow methods, idempotency keys, immutable confirmed facts, and safe void metadata;
- `commercial_onboarding_invitations`, containing only a SHA-256 token hash, expiry, creator, revocation, and consumption state, with one active invitation per agreement;
- `organization_billing_profiles`, linked one-to-one with both activated organization and agreement;
- `commercial_activation_events`, an append-only record of material operator and provisioning actions.

The migration is safe for ordered initialization from 001 through 007 and upgrade from accepted 001 through 006. Accepted migrations were not edited.

## Agreement and pricing authority

Only an `approved` access request can be finalized, and only once. The repository independently verifies that the actor is a PostgreSQL platform operator. It reloads current catalogue records under transaction locks and rejects missing, unpublished, inactive, unavailable, duplicate, unsupported-cycle, or module-overlapping selections.

Money is INR integer paise stored as `BIGINT` and serialized to JavaScript as decimal strings. The backend calculates and snapshots the current list subtotal; strict schemas reject a browser-provided list total. The operator supplies the negotiated amount. A zero amount or any difference from list requires an explicit adjustment reason. The exact reviewed timestamps are stored; no fixed-day month arithmetic is used.

The implemented lifecycle is:

```text
awaiting_payment -> paid -> onboarding_pending -> activated
```

`cancelled` is schema-reserved, but no unsafe cancellation mutation is exposed in this milestone.

## Manual payment behavior

Supported methods are `upi`, `bank_transfer`, `cash`, and `other`. Multiple partial entries are supported, but invitation issuance requires:

```text
sum(confirmed, non-void payments) == agreed_total_minor
```

Overpayment is rejected rather than treated as settlement. A zero-value complimentary agreement requires an operator reason and needs no fake payment record. Record retries are idempotent per agreement. Confirmed payment rows cannot be deleted or have their financial facts edited; an error is preserved as `void` with an actor, reason, and timestamp.

These records are operator assertions that money was received. They are not gateway confirmations, PCI processing, tax accounting, or statutory invoices.

## Invitation and public onboarding security

The service generates 32 random bytes and returns a base64url raw token once in `/onboarding#token=...`. Only its SHA-256 hash is stored. Invitations expire after 72 hours, are revocable, are single-use, and are protected by row locks and a one-active-invitation constraint. Reissue revokes the earlier active invitation; an old raw token can never be recovered.

The public React route reads the URL fragment into component memory, immediately removes the fragment with `history.replaceState`, never uses local or session storage, and sends the token only in strict POST bodies to:

| Method | Path | Result |
| --- | --- | --- |
| `POST` | `/api/public/onboarding/inspect` | Safe business, display-name, offer, period, and expiry summary |
| `POST` | `/api/public/onboarding/complete` | Customer password and reviewed IANA timezone; atomic provisioning |

Both endpoints use low-cost process-local IP rate limiting. No GET or query-string secret endpoint exists. Invalid, expired, revoked, used, or superseded tokens fail with the same controlled boundary.

## Atomic provisioning and identity safety

Onboarding completion revalidates settlement, request/agreement state, catalogue availability, timezone, and token state in one PostgreSQL transaction. It serializes by normalized phone and fails closed when that phone already belongs to a user. B5B does not silently link an existing identity across organizations.

The successful transaction creates exactly one:

- user with a bcrypt customer-chosen password and `platform_role = NULL`;
- organization;
- active `Main` branch with the reviewed IANA timezone;
- active owner membership and Main-branch assignment;
- organization billing profile;
- active `manual` subscription with the agreement's exact cycle and period;
- assignment for each finalized add-on.

It then consumes the invitation, links and activates the agreement, transitions the access request to `activated`, and appends onboarding/provisioning/subscription events. Any error rolls back the complete set. A concurrent second redemption fails safely.

Effective access is still computed only by the accepted entitlement service from the canonical plan/add-ons and expiry. No B5B frontend code grants modules or writes overrides.

## Operator and tenant surfaces

The existing `/commercial/requests` platform-operator page now presents original request intent alongside a staged workflow for agreement, payment, and onboarding. The one-time raw link is held only in component state, is labeled as shown once, and must be replaced if lost. Every operator endpoint is behind authentication plus `requirePlatformOperator`; repository mutations repeat the platform-role check.

The authenticated tenant Billing page calls `GET /api/billing/commercial`. Backend organization context, not a browser-supplied target, scopes the response. It shows the active subscription and exact period, final agreement amount, manual payment history, and billing profile. It does not expose operator notes, token records, audit identifiers, or another tenant's data, and it explicitly states that payment records are not statutory tax invoices.

## Verification coverage

The dedicated unit/contract and disposable PostgreSQL coverage proves:

- approved/operator-only agreement finalization, canonical price calculation, incompatible/invalid/duplicate rejection, negotiated-price reasons, exact periods, one agreement per request, and strict money inputs;
- tenant/unauthenticated route boundaries, positive/narrow/sensitive-field payment validation, idempotency, partial/exact/overpayment behavior, zero-value behavior, append-only facts, and reasoned voids;
- high-entropy token generation, hash-only persistence, one-time raw return, safe inspection, expiry, revocation, replacement, used-token failure, and absence of secrets from events;
- exactly-once concurrent redemption, expected entity counts and links, owner/non-operator identity, bcrypt storage, exact subscription/add-ons/period, login and refresh compatibility, entitlement expiry behavior, and complete rollback on a forced mid-transaction conflict;
- tenant-scoped billing reads and no cross-tenant/operator-state mutation path;
- B5A public pricing/request/regression behavior and the production registration guard.

Closeout validation on 2026-09-27 passed backend install, lint, typecheck, unit/contract tests, build, all accepted PostgreSQL suites, migration status, clean 001-to-007 and upgrade 001-to-006-to-007 coverage, frontend install/lint/typecheck/production build, Compose configuration, full four-container runtime health, HTTP liveness/readiness/landing/login/onboarding checks, and runtime log inspection. The dedicated B5B PostgreSQL suite passed 9/9 tests.

## Hosted staging boundary

Pushing `main` does not prove hosted B5B deployment. Before hosted B5B validation, an operator must use the accepted direct/session-capable Neon migration URL to run migration status, explicitly apply migration 007, recheck status, and confirm the hosted application deployment is on this milestone commit. The hosted database URL must remain outside source, logs, and reports.

V2-06B4 remains partial. Its deferred Queue/realtime, Billing, logout/session, private-log, and backup/restore evidence remains open; B5B does not convert that partial review into pilot approval.

## Explicit exclusions

V2-06B5B does not add a payment gateway, automatic payment verification, statutory GST invoices, invoice numbering, recurring charges, renewal, expiry reminders, messaging automation, Attendance/Inventory/Dues migration, V2-06B5C, or V2-06C. Manual renewal remains future V2-06B5C work.
