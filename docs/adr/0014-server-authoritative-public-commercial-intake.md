# ADR 0014: Server-Authoritative Public Commercial Intake

- Status: Accepted
- Date: 2026-09-25
- Scope: V2-06B5A public commercial catalogue, pricing, and access requests

## Context

EkaVio already has PostgreSQL-authoritative modules, plans, add-ons, subscriptions, and entitlement evaluation. It did not have public list pricing or a durable acquisition workflow. The landing page could describe pilot access but could not show operator-approved prices, calculate an estimate, or store a structured request for review.

The first commercial acquisition step must remain low cost and must not weaken the existing entitlement boundary. The product has no approved final INR prices, payment gateway, invoice workflow, or automated onboarding workflow. Contact data submitted before an organization exists is personal data and cannot use an organization-scoped audit model.

## Decision

### Extend the canonical catalogue

Public pricing attaches directly to an existing available plan or add-on. PostgreSQL migration `006_public_commercial_intake.sql` adds one optional pricing record per offer. INR amounts are nullable non-negative `BIGINT` minor units. A published record must have a monthly or yearly amount. Publication state, ordering, an optional marketing label, timestamps, and the responsible operator are stored with the record.

There are no seeded prices. Until a platform operator configures and publishes a price, the public catalogue returns the offer with `pricing: null` and the UI says “Contact for pricing.” Unpublished amounts and labels never cross the public API boundary. The internal `legacy-import` plan and inactive or unavailable offers are not public.

Only an authenticated platform operator can read staged pricing or mutate a pricing record. The repository independently verifies the actor's PostgreSQL platform role in addition to the HTTP middleware. Every pricing mutation appends an immutable PostgreSQL audit event.

### Server-authoritative quotes and requests

The public client submits only a billing cycle and selected plan/add-on keys. The backend reloads the current PostgreSQL catalogue, rejects unknown, inactive, unavailable, unpublished, unsupported-cycle, duplicate, or module-overlapping selections, orders the accepted items deterministically, and sums exact integer minor units. Quote preview and final submission use the same calculation. The final submission always recalculates; a client total is rejected by the strict request schema.

An accepted request stores business/contact fields, normalized E.164 phone, optional email/note, selections, billing cycle, INR subtotal, and an immutable JSON price snapshot. It starts as `pending`. Public callers receive only an opaque UUID receipt, status, accepted subtotal/cycle/currency, receipt time, and a neutral acknowledgement; contact details are not echoed.

The B5A operator transitions are:

- `pending -> contacted | approved | rejected`
- `contacted -> approved | rejected`
- `approved` and `rejected` are terminal in B5A

The schema reserves `activated` for a later workflow, but B5A APIs cannot select it. Status and internal-note changes append pre-tenant PostgreSQL audit events. Approval does not create an organization, membership, subscription, add-on assignment, entitlement override, invoice, payment, or activation.

### Low-cost abuse controls

The public submission route uses the existing single-process in-memory rate-limiter pattern with five requests per IP per 15 minutes. PostgreSQL serializes submissions by normalized phone and rejects another request for the same phone during a ten-minute cooldown. Strict allowlists, request body limits inherited from Express JSON parsing, maximum field/selection lengths, and E.164 normalization provide additional controls. No Redis, invasive fingerprinting, analytics SaaS, SMS, WhatsApp, or email dependency is introduced.

### Registration transition

Hosted staging runs in production mode. `POST /api/auth/register` now returns 404 in production so a public caller cannot bypass Request Access and create an organization directly. Non-production tests and explicit migration/bootstrap code can continue using controlled registration paths. There is no shared browser secret. B5B must introduce a reviewed onboarding mechanism before production registration is reopened.

## Consequences

- PostgreSQL is authoritative for all public pricing and access-request state.
- Operator pricing must be configured before an offer can be selected for a priced request.
- Public list estimates are informative; final commercial/payment terms remain a manual B5B concern.
- Contact data is available only through the platform-operator boundary and must follow future retention/privacy policy work.
- Process-local IP limiting matches the accepted one-instance staging topology. Horizontal scaling requires a separate shared limiting decision.
- The landing page can provide real catalogue and quote behavior without a payment gateway.
- Existing subscription and entitlement evaluation remain unchanged and authoritative.

## Alternatives rejected

### Hard-code assumed rupee prices in React or seed SQL

Rejected because no business prices were supplied and browser values are not commercial authority.

### Accept a client-calculated total

Rejected because it permits stale or manipulated pricing and cannot create a trustworthy request snapshot.

### Create accounts or subscriptions when a request is approved

Rejected because payment confirmation, negotiated terms, onboarding, and activation belong to V2-06B5B.

### Add a payment, messaging, queue, or analytics provider

Rejected because none is necessary for public intake and each would add cost, privacy, and failure dependencies.
