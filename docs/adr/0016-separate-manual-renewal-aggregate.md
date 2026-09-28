# ADR 0016: Separate Manual Subscription Renewal Aggregate

- Status: Accepted
- Date: 2026-09-28
- Scope: V2-06B5C subscription renewal, manual settlement, and reactivation

## Context

ADR 0015 defines the initial acquisition agreement, payment, onboarding invitation, and atomic tenant provisioning lifecycle. Those records are historical evidence of how the first organization and subscription were created. Reusing or mutating them for later renewals would erase the distinction between initial onboarding and continued commercial service.

The canonical PostgreSQL subscription and entitlement calculator already enforce access windows. A renewal therefore needs to preserve negotiated history while changing the canonical subscription only after exact manual settlement. It must support continuous renewal and deliberate post-expiry reactivation without adding a payment gateway, recurring charge, scheduler, queue service, SMS, or WhatsApp dependency.

## Decision

### Keep renewal history separate from initial onboarding

Each reviewed renewal is stored in `commercial_renewals`, linked to exactly one organization and canonical subscription by a composite foreign key. It snapshots the current package, billing cycle, published list pricing, list subtotal, negotiated total, prior period, new period, operator identities, and lifecycle timestamps. Initial access requests, agreements, payments, invitations, and provisioning events remain unchanged.

The renewal lifecycle is:

```text
awaiting_payment -> paid -> applied
         |           |
         +-----------+-> cancelled
paid -> awaiting_payment only when a confirmed payment is explicitly voided
```

Applied and cancelled records are terminal. One partial unique index allows only one actionable renewal for the same subscription/prior-period boundary. Historical and financial fields are protected from update/delete by database triggers.

### Preserve the current package for B5C

An operator-only read-only preview loads the canonical subscription, plan, add-ons, and public prices so list pricing is visible before negotiation. Finalization independently locks and reloads those facts. B5C snapshots and renews that effective package; it does not schedule future package changes. Plan/add-on changes remain a separate explicit commercial administration action. This prevents a future renewal from granting modules before its period begins.

Money is exact INR `BIGINT` paise and crosses the TypeScript boundary as decimal strings. The server calculates the public list subtotal. A negotiated amount different from that subtotal, a zero-value renewal, or a package without complete published pricing requires an explicit operator reason.

### Treat renewal payments as append-oriented operator assertions

`manual_renewal_payments` is separate from the initial agreement payment table. It supports `upi`, `bank_transfer`, `cash`, and `other`, positive integer paise, an idempotency UUID, an optional safe reference, paid time, and operator actor. Confirmed facts cannot be edited or deleted. Corrections use the single `confirmed -> void` transition with actor, reason, and time.

Application requires the confirmed non-void sum to equal the agreed total exactly. Underpayment and overpayment fail closed. A reasoned zero-value renewal enters `paid` without a fabricated payment row.

### Apply renewal atomically to canonical authority

Application uses one PostgreSQL transaction and a consistent subscription-then-renewal lock order. It rechecks actor authority, linkage, status, settlement, period, billing cycle, and unchanged package. It then updates the canonical subscription period/status and add-on validity windows, marks the renewal applied, and appends audit events. Repeated or concurrent application returns the already-applied fact without extending the period twice.

For an unexpired subscription, the new start must equal the authoritative current period end. For an already-expired subscription, the operator must explicitly review a non-backdated start. Suspended, cancelled, and inactive subscriptions cannot enter the ordinary renewal path.

### Derive lifecycle windows on demand

The operator queue filters and paginates canonical subscriptions by authoritative timestamps. Expired state and seconds until expiry are computed at request time; no mutable countdown field or background scheduler exists. The entitlement calculator remains the authority: paid modules fail closed at the period boundary and become available again only after a valid renewal has been applied.

## Consequences

- Initial acquisition and every later renewal remain separately auditable.
- A payment record alone never changes entitlements or overrides suspension.
- Continuous renewal preserves access; explicit reactivation does not silently backdate the expired gap.
- Customer Billing can show factual renewal/payment history without exposing operator identities or cross-tenant records.
- The feature adds no recurring infrastructure cost and no external payment or messaging dependency.
- Package changes are not scheduled by renewal and remain an explicit separate operation.
- Hosted databases require explicit forward-only application of `008_manual_subscription_renewals.sql`; application startup does not auto-migrate.

## Alternatives rejected

### Reuse the initial commercial agreement

Rejected because it would conflate acquisition/provisioning with recurring commercial periods and risk rewriting accepted B5B facts.

### Update the subscription when a renewal is finalized or partially paid

Rejected because reviewed terms and bookkeeping do not prove exact settlement or authorize entitlement changes.

### Schedule future package changes inside the renewal

Rejected because the current canonical schema does not provide an effective-dated package assignment that can be proven not to grant modules early.

### Add automatic expiry or recurring-billing jobs

Rejected because timestamp-based entitlement checks and an on-demand operator queue provide correctness without Redis, cron infrastructure, or a gateway.
