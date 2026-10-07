# ADR 0025: Public brand and commercial experience

Status: Accepted for V2-08F product experience (2026-10-07).

## Decision

Use one original code-native folded-E mark and EkaVio wordmark across the public
site, workspace sidebar, login, account actions and onboarding. Export only
purposeful public PNG icons/social art with the existing local Chromium dependency.
No stock logos, fake support addresses, testimonials, certifications or trackers.
Public appearance reuses Light/Dark/System and the existing preference model;
anonymous appearance is presentation, never authentication or commercial authority.

Public information architecture is Product, Modules, Pricing, FAQ, Login and
Request Access. Explain the four existing paid domains and distinguish the shared
CORE foundation. An illustrative workspace is explicitly an example, not live data.
Privacy is a factual staging overview, not a completed production legal policy.
Security messaging is a section, not an unsupported compliance or uptime promise.

## Explicit pricing and migration 017

Add `017_public_commercial_experience.sql`; never edit 001–016. `pricing_mode`
defaults to `fixed`, preserving existing integer-minor-unit prices and snapshots.
`contact` is explicit, published/selectable for either cycle, and requires both
numeric prices to be NULL. A fixed offer missing the selected cycle is unavailable,
not implicitly contact-priced. Draft/inactive/unavailable offers are not public.
Any contact item makes the entire estimate NULL/discussion-required: no partial
sum, invented zero or annual savings. Savings use exact BigInt arithmetic only
when both fixed prices exist and twelve monthly payments exceed the yearly price.

The existing server quote remains authoritative. The wizard submits selection,
closed business/contact fields and an optional SHA-256 review fingerprint, never
client totals. Fingerprints exclude calculation time but include names, selected
prices and pricing revision. The repository locks selected catalogue records and
pricing, recomputes inside the request transaction, and rejects stale quotes.
An omitted fingerprint preserves old API compatibility, not client price authority.

Selecting a plan removes included add-ons; selecting an independent add-on keeps
the plan. Included add-ons are labeled/disabled. Overlapping modules, duplicate keys,
unknown offers and unpublished offers still fail on the backend independently.
Capability names derive from canonical module definitions: no new marketing metadata
table, feature flags, paid core modules or inferred entitlements are introduced.

## Public reference and immutable request intent

Each existing/new request receives an independently generated random 128-bit,
uppercase `EV-REQ-` reference (32 hexadecimal characters). A database unique index
and format constraint make collisions fail safely; no sequence, timestamp, PII or
request primary key is encoded. It is a support reference, never a bearer credential
or public lookup authorization. Public receipts use it instead of presenting UUIDs.
Legacy receipt IDs remain in the API for compatibility, not as the primary UI label.

Migration 017 makes accepted identity/contact/selection/quote/reference immutable;
status and separate operator notes remain editable under existing operator checks.
Request history cannot be deleted through ordinary writes. Operator search is
bounded to 120 characters and uses bound, literal case-insensitive substring matching
over reference, business/contact names, normalized phone and email. Lists paginate
and count under a repeatable read snapshot, newest first; no global tenant exposure.

## Commercial lifecycle

The three-step Request Access wizard is selection, business/contact and review.
India-default PhoneInput submits normalized E.164; email is recommended, optional.
No request PII is persisted to browser storage. Errors remain recoverable and honest;
stale/unpublished selections require a fresh review. A receipt does not grant access,
create a subscription, confirm payment or provision an organization.

Operator pricing uses explicit fixed/contact controls and the same OfferCard as the
public page for draft preview. Accepted estimates remain distinct from later final
terms. Contact agreements require an explicit negotiated amount and reason; database
constraints prohibit a NULL list subtotal without a meaningful reason. Existing
approval, exact manual settlement, single-use invitation and atomic provisioning
remain unchanged. The customer chooses their password; platform authority is not
granted. Raw handoff links live only in component memory, not MutationCache/storage.

Billing uses frozen human offer names; technical keys remain in collapsed details.
Renewal queue/history use human names and factual persisted progress. Renewals remain
an independent manual aggregate with exact settlement and idempotent application.
No checkout, gateway, recurring charge, payment link or fake invoice is added.

## Metadata, PWA and release boundary

Only `/` and `/privacy` are in the sitemap/index allowlist. Account/internal paths
are noindex; canonical URLs exclude tokens, queries and fragments. A public HTTPS
origin is validated at build time, defaulting to `https://ekavio.afsify.com`.
Self-hosted Open Graph art and original SVG/192/512/maskable PWA icons share the
brand. Nginx serves the manifest as `application/manifest+json`. Existing service
worker API/Socket denylist and empty runtime cache remain unchanged.

Public/account routes are lazy-loaded; the page adds no chart/animation/analytics
dependency, external font or mandatory paid service. Responsive and keyboard checks
use repository Playwright/local Chromium when the managed bridge lacks sandbox
metadata. Authenticated screenshots/traces are not uploaded.

Apply 017 explicitly before deployment through the standard migration command;
startup never auto-migrates. Recovery proof for the extended schema remains OPEN.
Local automated acceptance is not authenticated hosted acceptance or proof of the
exact deployed commit. Render Free remains intentionally staging-only; Atlas is
retained. **NO-GO FOR REAL CUSTOMER DATA** is unchanged. V2-09 requires separate approval.
