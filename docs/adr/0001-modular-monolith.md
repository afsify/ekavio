# ADR 0001: Modular Monolith

- Status: Accepted
- Date: 2026-09-13

## Context

EkaVio is a low-cost, modular, multi-tenant SaaS product for SMBs. The existing repository already contains a single React frontend, a single Node/TypeScript backend, and shared deployment configuration. The product needs stronger module boundaries, tenant isolation, permissions, correctness, and operability, but there is no measured operational need for independently deployed services.

## Decision

EkaVio will use a modular-monolith architecture.

- Preserve and evolve the current repository instead of performing a greenfield rewrite.
- Add explicit module boundaries incrementally inside the application.
- Keep module ownership, contracts, authorization, and persistence boundaries visible in code and tests.
- Do not introduce microservices or Kubernetes until measured scaling, reliability, organizational, or deployment needs justify their cost.

## Consequences

- The team can improve boundaries while retaining existing working functionality.
- Cross-module coupling must be identified and reduced deliberately.
- A single deployment remains simpler and less expensive to operate.
- Future service extraction remains possible where evidence shows a genuine need.
