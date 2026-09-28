# V2-06B5C Manual Renewals Review

- Date: 2026-09-28
- Starting commit: `3dc1ec39c0200102486be69e2e0900137c593af5`
- Starting exact CI: GitHub Actions run `36391978163` (success)
- Checkpoint: `pre-v2-06b5c-manual-renewals`
- Authority: PostgreSQL
- Scope: operator-driven renewal, manual settlement, continuous extension/reactivation, and tenant renewal history

## Outcome

V2-06B5C adds the complete low-cost continuation path after the accepted initial onboarding:

```text
Initial onboarding
  -> Active subscription
  -> Renewal due / expired
  -> Operator-reviewed renewal
  -> Server package and price snapshot
  -> Negotiated INR amount
  -> Manual settlement
  -> Atomic apply
  -> Extended or reactivated subscription
```

The workflow has no payment gateway, automatic charge, recurring-billing engine, Redis/queue, hosted scheduler, SMS, WhatsApp API, paid email, or AI dependency. The entitlement service still fails closed at the canonical period boundary.

## Migration 008 and relational model

Forward-only migration `008_manual_subscription_renewals.sql` leaves migrations 001 through 007 unchanged and adds:

- `commercial_renewals`, a separate aggregate with organization/subscription linkage, continuous/reactivation kind, exact cycle/package/list-price snapshots, `BIGINT` INR amounts, prior/new periods, operator actors, and lifecycle metadata;
- `manual_renewal_payments`, separate from initial B5B payments, with positive integer paise, narrow methods, idempotency, immutable confirmed facts, and explicit void metadata;
- `commercial_renewal_events`, an append-only audit record for creation/finalization, payment record/void, paid, applied, cancelled, and reactivated actions;
- composite subscription ownership and focused organization/time, status/period, payment/time, event/time, and one-actionable-period indexes;
- database triggers that reject historical-field mutation, terminal renewal mutation, payment fact edits/deletes, and event updates/deletes.

The migration is tested both from an empty database through 001-to-008 and from an accepted 001-to-007 database upgraded to 008. PostgreSQL remains the sole commercial runtime authority; no Mongo read, write, mirror, or fallback was added.

## Lifecycle and period rules

The implemented state machine is:

```text
awaiting_payment -> paid -> applied
         |           |
         +-----------+-> cancelled
paid -> awaiting_payment after an explicit payment void
```

Applied and cancelled records are terminal. Duplicate application safely returns the applied record. A partial unique index and transaction locks prevent two actionable renewals for one subscription/prior-period boundary.

For an unexpired active/trialing subscription, `renewal_starts_at` must exactly equal the authoritative `current_period_ends_at`. No fixed 30-day month is calculated. The operator supplies exact reviewed timestamps and the end must be later than the start.

An already-expired active/trialing subscription uses the explicit `reactivation` kind. Its reviewed start cannot be before the application-time clock; applying the fully settled renewal returns the canonical subscription to active status and preserves the expired prior period in renewal history. Suspended, cancelled, and inactive subscriptions fail closed and require a separate operator resolution rather than payment overriding their state.

## Package and pricing authority

Finalization locks and reloads the canonical subscription, current plan, add-ons, billing cycle, and published prices. It snapshots the package and price facts before accepting the operator's negotiated amount. Browser-provided plans, add-ons, list subtotals, currency, actors, statuses, or entitlement changes are rejected by strict schemas.

B5C preserves the currently effective package. Future package/module scheduling is not inferred; changes remain a separate explicit commercial administration mutation. This ensures a future renewal cannot enable a paid module early.

Published list totals are calculated by the backend in exact paise. A list-different total, zero total, or incomplete public price requires an explicit reason. No price is invented when a public price is absent.

## Manual payment and application behavior

Renewal payments support `upi`, `bank_transfer`, `cash`, and `other`. Partial entries are allowed, retries are idempotent per renewal, and overpayment is rejected. Only this equality permits apply:

```text
sum(confirmed, non-void renewal payments) == agreed_total_minor
```

A correction voids a confirmed row with actor, reason, and timestamp; it does not edit or delete the financial fact and it recomputes settlement. A complimentary renewal needs an explicit reason and reaches `paid` without a fake payment.

Application uses one transaction with a consistent subscription-then-renewal lock order. It rechecks platform authority, organization/subscription linkage, lifecycle, exact settlement, canonical prior period, cycle, package, and non-ended target period. It updates the canonical subscription and add-on windows, marks the renewal applied, and appends events atomically. Concurrency tests prove a double apply extends the period once, concurrent finalization creates one actionable renewal, and a forced mid-transaction error rolls back both subscription and renewal changes.

## Operator and customer surfaces

`/commercial/renewals` is inside the existing platform-operator shell. Its paginated server-filtered views cover expiry within 30 days, expired subscriptions, in-progress renewals, paid renewals awaiting application, recently applied renewals, and all subscriptions. It derives expiry and seconds remaining from canonical timestamps. A read-only operator preview loads the current package and server-calculated list pricing before negotiated terms are entered; finalization reloads those facts under lock. Operators can then finalize exact terms, append/void payments, see settlement, confirm before apply, cancel, and start the next cycle after terminal history.

Every mutation route is protected by authentication plus `requirePlatformOperator`; the PostgreSQL repository repeats the identity-level operator check. A tenant header cannot convert a tenant administrator into a platform operator.

Customer Billing remains reachable under `billing.read` even when paid modules expire. It shows canonical status/period, a neutral approaching-expiry or expired message, the initial B5B agreement/payment history, and tenant-scoped renewal/payment history. It has no self-renew, Pay Now, checkout, or automatic billing action. Customer projections omit operator identities and are selected only by the server-resolved organization context.

## Verification coverage

The dedicated B5C disposable PostgreSQL suite passes 10/10 tests and covers:

- clean and accepted-upgrade migration paths;
- active continuous renewal, explicit expired reactivation, suspended/cancelled/inactive refusal, organization/subscription mismatch, missing subscription, duplicate actionable renewal, invalid boundaries, server pricing, negotiated/incomplete-price reasons, and operator-only creation;
- partial/exact/overpayment handling, payment retry idempotency, immutable confirmed facts, reasoned void, settlement reversal, and post-apply void refusal;
- entitlement enabled immediately before expiry, failed closed at expiry, and restored after valid apply;
- concurrent and repeated apply, concurrent finalization, forced rollback, canonical period/add-on updates, terminal history, tenant scoping, and secret-free append-only events.

Unit/contract coverage also verifies strict input rejection, operator middleware on every mutation, tenant read-only Billing, protected frontend routing, PostgreSQL-only runtime composition, and absence of gateway/webhook/scheduler code.

## Hosted staging and operational boundary

Migration 008 is not part of normal backend startup. During closeout, the existing ignored secure staging environment was used without printing credentials: status showed migrations 001 through 007 applied and only 008 pending; the explicit migration command applied 008; the follow-up status showed all eight applied. Hosted API liveness/readiness and the frontend returned HTTP 200 afterward. This proves the migration and basic health only; it does not claim the B5C application commit was already deployed or that a hosted renewal workflow was manually exercised. The staging bootstrap was not rerun.

No large manual browser validation loop is required for this development milestone. Hosted staging remains internal development/testing only. The previously open V2-06B4 backup/restore proof remains required before real pilot or customer data; B5C does not change that status.

## Explicit exclusions

V2-06B5C does not add automatic renewal, recurring charges, a gateway, automatic payment verification, tax invoices, SMS, WhatsApp, paid email, a scheduler, Attendance/Inventory/Dues work, or V2-06C. Package changes remain an explicit separate commercial operation.
