# V2-06B5A Public Commercial Intake Review

- Date: 2026-09-25
- Starting commit: `ae41fb77a019933a5146d095e6667e3657db2b28`
- Checkpoint: `pre-v2-06b5a-public-commercial-intake`
- Authority: PostgreSQL
- Scope: public catalogue, operator-configured list pricing, server quotes, access requests, and operator review

## Outcome

V2-06B5A adds the first real commercial acquisition layer while stopping before payment or activation:

```text
Public catalogue
  -> server-calculated list-price preview
  -> Request Access
  -> PostgreSQL pending request
  -> platform-operator review
  -> V2-06B5B manual payment/onboarding (not implemented here)
```

No INR price was invented or seeded. An available plan or add-on remains visible as “Contact for pricing” until a platform operator supplies and publishes at least one billing-cycle amount.

## Relational changes

Forward-only migration `006_public_commercial_intake.sql` adds:

- `public_offer_pricing`: one optional INR price configuration for an existing plan or add-on, exact `BIGINT` monthly/yearly minor units, publication, ordering, label, timestamps, and operator attribution;
- `public_offer_pricing_events`: append-only operator pricing audit snapshots;
- `commercial_access_requests`: contact data, billing cycle, canonical selections, server subtotal, immutable price snapshot, lifecycle status, and notes;
- `commercial_access_request_events`: append-only submission/status/note history.

Indexes support public ordering, operator status/time queues, per-phone cooldown lookup, and audit history. Constraints enforce target identity, INR, billing cycles, statuses, non-negative amounts, selection counts, JSON object snapshots, and actor rules. Migrations 001–005 are unchanged.

## Public APIs

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/public/commercial/catalogue` | Safe active/available plans and add-ons with published price data only |
| `POST` | `/api/public/commercial/quote` | Server-authoritative preview from selection keys and billing cycle |
| `POST` | `/api/public/access-requests` | Recalculate and persist a request; return a safe receipt |

The public catalogue excludes internal UUIDs, actor/user/organization data, audit data, legacy IDs, overrides, staged amounts, and `legacy-import`. Strict input objects reject unknown fields, including a client-supplied subtotal.

## Pricing and calculation

- Currency is INR for this milestone.
- Money is stored as integer paise and serialized as decimal strings.
- Monthly and yearly prices are separately nullable.
- Published pricing requires at least one configured cycle.
- Quote items are sorted by offer type/key before summation and snapshot storage.
- A plan and add-on cannot both claim the same module in one request.
- The final request always recalculates against current PostgreSQL values, even after a preview.

## Request lifecycle and non-grant boundary

B5A supports `pending -> contacted | approved | rejected` and `contacted -> approved | rejected`. `activated` is reserved at the database layer but is not accepted by the B5A mutation API. Approval does not write `organizations`, `memberships`, `subscriptions`, `subscription_add_ons`, or `entitlement_overrides`.

The public response does not echo business/contact fields. Platform-operator APIs may list and inspect request PII because review requires it; tenant owners/admins and unauthenticated callers are rejected.

## Operator APIs and UI

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/billing/operator/public-pricing` | Review public and staged pricing |
| `PUT` | `/api/billing/operator/public-pricing/:offerType/:offerKey` | Create/update/publish a price |
| `GET` | `/api/billing/operator/access-requests` | Paginated/status-filtered review queue |
| `GET` | `/api/billing/operator/access-requests/:requestId` | Inspect one request |
| `PATCH` | `/api/billing/operator/access-requests/:requestId` | Valid status transition and/or internal note |

All routes require authentication and `requirePlatformOperator`; pricing/request repositories re-check the PostgreSQL actor role. The React route `/commercial/requests` is shown and rendered only for the server-returned platform-operator flag, but this client guard is convenience rather than authority.

## Abuse, privacy, and registration

- IP limit: five submissions per 15 minutes in the accepted one-process deployment model.
- Phone cooldown: ten minutes, normalized through the shared E.164 utility with reviewed India calling-code handling and serialized with a PostgreSQL advisory lock.
- Public input has strict allowlists, maximum lengths, email validation, and at most eight add-ons.
- No request body or contact data is logged or broadcast through Socket.IO.
- Production `POST /api/auth/register` is unavailable. Explicit non-production and bootstrap/repository paths remain for controlled engineering use.

## Frontend

The landing page fetches the public catalogue and never hard-codes a price. It renders mobile-first plan/module cards, monthly/yearly selection, exact INR formatting, “Contact for pricing” for drafts, server quote results, validated contact fields, and a neutral receipt. The CTA is “Request Access”; there is no buy/pay/subscribe claim.

The operator page manages price publication and request review. Approved requests visibly state that commercial/payment activation is completed manually in the next workflow.

## Verification scope

Automated coverage includes safe projection, hidden draft/internal data, monthly/yearly calculation, malformed/oversized input, email and selection validation, duplicate/nonexistent/unpublished/unavailable/incompatible offers, ignored/rejected client totals, safe receipts, phone/IP throttles, platform authorization, valid transitions, append-only audit events, PostgreSQL migration from accepted 001–005 state, and proof that request submission does not provision commercial access.

Acceptance results on 2026-09-25:

- backend `npm ci`, lint, typecheck, build: pass;
- backend unit/contract suite: 113/113 pass;
- B5A PostgreSQL migration/intake suite: 5/5 pass;
- shared-core PostgreSQL: 17/17 pass;
- persistence parity: 7/7 pass;
- cutover preflight: 17/17 pass;
- identity cutover: 15/15 pass;
- commercial cutover: 9/9 pass;
- operational foundation, migration, and runtime suites: 1/1 each pass;
- frontend `npm ci`, lint, typecheck, and production/PWA build: pass;
- Compose configuration and full rebuild/start: pass; backend, frontend, PostgreSQL, and MongoDB healthy;
- local HTTP runtime: liveness/readiness, landing, login route, operator SPA route, public catalogue, existing login/subscription/Queue, pricing publication, quote, request submission, operator list, and `pending -> contacted -> approved` all pass;
- recent backend/frontend container log scan: zero error/exception/fatal matches.

Frontend has no dedicated component-test runner. Public rendering, selection, quote-only arithmetic, successful receipt state, operator guards, and absence of client entitlement mutation are covered by TypeScript/build plus repository contract tests; the built landing and operator routes were also served through the production Nginx image.

## Explicit exclusions

V2-06B5A does not add payment collection, negotiated price capture, payment confirmation, invoices/receipts, onboarding links, account provisioning, subscription activation, renewals, SMS, WhatsApp, paid email, Redis, paid AI, or analytics tracking. V2-06B5B and V2-06C were not started.
