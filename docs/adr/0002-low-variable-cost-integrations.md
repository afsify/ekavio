# ADR 0002: Low-Variable-Cost Integrations

- Status: Accepted
- Date: 2026-09-13

## Context

EkaVio targets price-sensitive SMBs and must keep core workflows useful even when a tenant does not purchase third-party messaging, AI, or payment services. Mandatory metered integrations would increase variable cost, operational risk, and vendor dependency.

## Decision

Core product workflows must not depend on:

- the WhatsApp API;
- SMS;
- paid AI; or
- automated payment-gateway integration.

These capabilities may be introduced later as optional adapters. Base workflows should favor in-app notifications, public links, QR codes, manual sharing, PDF/export, and manual payment reconciliation.

## Consequences

- Core workflows remain available without paid external services.
- Adapter contracts should isolate future providers from domain logic.
- Tenants may opt into automation without making it a prerequisite for other tenants.
- Manual fallbacks must remain clear, secure, and auditable.
