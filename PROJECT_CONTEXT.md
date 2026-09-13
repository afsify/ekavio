# EkaVio Project Context

- Product: EkaVio.
- EkaVio is a low-cost, modular, multi-tenant SaaS platform for small and medium businesses.
- Initial market: Kerala.
- The source code is the truth for the current implementation.
- The EkaVio Master Strategy v3.0 is the target direction.
- Preserve existing working functionality; this is not a greenfield rewrite.
- The chosen architecture is a modular monolith.
- The client direction is a mobile-first React progressive web app (PWA).
- The backend direction is Node.js with TypeScript.
- PostgreSQL is the intended transactional system of record and will be adopted incrementally.
- WhatsApp API, SMS, payment-gateway automation, and paid AI are optional adapters, not core dependencies.
- Backend authorization is mandatory. Frontend menu hiding is never authorization.
- Tenant isolation, permissions, entitlements, money correctness, stock correctness, backups, and tests take priority over feature count.
- Use one feature branch per milestone.
- Every implementation milestone ends with lint, typecheck, tests, build, diff review, and the exact results.
- Architecture decisions live in repository ADRs.
- Current milestone: V2-00 baseline only. It documents the repository without changing application behavior.
