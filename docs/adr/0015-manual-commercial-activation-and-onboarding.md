# ADR 0015: Manual Commercial Activation and One-Time Customer Onboarding

- Status: Accepted
- Date: 2026-09-27
- Scope: V2-06B5B negotiated agreements, manual payments, controlled onboarding, and tenant provisioning

## Context

V2-06B5A ends at an approved commercial access request. That request preserves the customer's original selections and the public list-price snapshot, but approval does not establish final terms, prove payment, create an account, or grant an entitlement. EkaVio needs a low-running-cost path from that approved request to a usable customer organization without depending on a payment gateway, SMS, WhatsApp, paid email, Redis, or a job queue.

The existing PostgreSQL commercial model is already authoritative for plans, add-ons, subscriptions, and effective entitlements. The existing authentication model requires customer-chosen bcrypt passwords, server-side refresh sessions, and unambiguous normalized phone identities. Activation must preserve those boundaries and must not expose onboarding secrets through URLs, storage, logs, or durable records.

## Decision

### Preserve request intent and finalize a separate agreement

An approved request may produce one immutable initial `commercial_agreements` row. The request's B5A snapshot is retained unchanged. Agreement finalization reloads current active, available, published catalogue records, validates compatible and non-duplicate selections, calculates the current list subtotal in exact INR paise, and records a separate negotiated total and final price snapshot. A zero or list-different negotiated total requires a trimmed operator reason.

The agreement records exact operator-reviewed `starts_at` and `current_period_ends_at` timestamps; the end must be later than the start. Its lifecycle is `awaiting_payment -> paid -> onboarding_pending -> activated`, with `cancelled` reserved for a later controlled operation. Only an approved request and a PostgreSQL platform operator can begin this lifecycle. Database uniqueness prevents more than one agreement per request.

### Treat manual payment entries as operator assertions

`manual_commercial_payments` stores positive `BIGINT` INR paise, a narrow payment method, optional safe reference text, paid time, operator actor, and status. It stores no card, PIN, OTP, banking credential, or provider token. Confirmed rows cannot be deleted or edited. A mistake is represented by the only permitted transition, `confirmed -> void`, with actor, reason, and timestamp.

The confirmed non-void sum must equal the agreed total exactly before onboarding can begin. Partial entries are allowed, retries use an agreement-scoped idempotency UUID, and overpayment is rejected. A zero-value complimentary agreement needs an explicit operator reason and requires no artificial payment row.

These records are bookkeeping assertions made by the platform operator. They are not automatic bank verification, PCI processing, tax accounting, or statutory invoices.

### Use hash-only, fragment-delivered onboarding invitations

An invitation is generated from 32 cryptographically random bytes. PostgreSQL stores only its SHA-256 hash. The raw token is returned once in a fragment path such as `/onboarding#token=...`; it cannot be retrieved later. It expires after 72 hours, can be revoked, and is consumed once. Issuing a replacement revokes the earlier unused invitation in the same transaction.

The React page reads the fragment into component memory, immediately removes it from browser history/address state, never writes it to browser storage, and sends it only in HTTPS POST bodies. Public inspect and complete routes have strict schemas and process-local IP rate limiting. Inspection exposes only the business/contact display and subscription summary required by the token holder.

### Provision the tenant atomically

On completion, the backend hashes the customer-selected password using the accepted bcrypt policy and validates a reviewed IANA timezone. PostgreSQL locks the invitation, agreement, and request; rechecks exact settlement and catalogue availability; takes a normalized-phone advisory lock; and fails closed if the phone already belongs to any user. Existing-user linking is intentionally deferred because silent linking would weaken identity authorization.

One database transaction creates exactly one normal user, organization, `Main` branch, owner membership, branch assignment, billing profile, active manual-source subscription, and selected subscription add-ons. It links and activates the agreement, consumes the invitation, and changes the access request to `activated` only after every provisioning write succeeds. The customer user's `platform_role` is `NULL`. A failure rolls back every write, and a concurrent second redemption fails without creating another tenant.

Effective modules continue to come only from the established entitlement service over the canonical subscription and add-ons. No onboarding UI or API writes entitlement overrides.

### Expose factual tenant billing data

The authenticated tenant billing endpoint derives organization scope from the accepted authorization context and returns that organization's subscription, agreement, non-secret payment history, and billing profile. It does not accept an organization ID from the browser and does not expose operator notes, invitation data, audit identifiers, or another tenant's records. The UI labels payment records accurately and explicitly does not call them statutory tax invoices.

### Audit without secrets

Append-only `commercial_activation_events` record agreement finalization, payment record/void, invitation creation/revocation/replacement, onboarding completion, organization provisioning, and subscription activation. Event details contain identifiers and safe state only. Raw tokens, passwords, password hashes, authorization/cookie values, and connection strings are excluded.

## Consequences

- The complete acquisition path works with human payment confirmation and human link delivery; no communication or payment provider is a runtime dependency.
- Negotiated terms remain distinct from the original request and current catalogue pricing.
- One request cannot create multiple initial tenants or subscriptions, even under concurrent redemption.
- Existing-phone customers require explicit operator resolution; multi-organization identity linking remains future work.
- Billing displays factual agreement/payment records but does not implement GST invoices, invoice numbering, recurring charges, or renewal.
- Manual renewal and expiry operations remain V2-06B5C work.
- Hosted staging is not updated merely by merging code. Migration `007_manual_commercial_activation.sql` must be explicitly applied through the direct/session-capable Neon migration URL before hosted B5B validation.

## Alternatives rejected

### Create an operator-selected or default customer password

Rejected because it exposes credentials to staff and communication channels and weakens customer control of identity.

### Persist a plaintext invitation or place it in a query string

Rejected because database access, access logs, browser history, and referrer headers could disclose a reusable provisioning credential.

### Update subscription state when a request is approved or payment is entered

Rejected because approval, bookkeeping, onboarding, and successful atomic provisioning are distinct states. Only completed provisioning means `activated`.

### Add a payment gateway or messaging provider abstraction

Rejected because manual confirmation and sharing satisfy the current business workflow without new cost, credentials, failure modes, or compliance claims.

### Silently attach an existing phone identity

Rejected until a separately authenticated and authorized multi-organization linking flow is designed.
