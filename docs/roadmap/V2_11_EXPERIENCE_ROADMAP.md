# V2-11 experience roadmap

**NO-GO FOR REAL CUSTOMER DATA remains unchanged.** No phase starts automatically.

| Phase | Scope | Preserve / acceptance boundary |
| --- | --- | --- |
| V2-11A | Source-backed reference review, semantic shared UI, desktop/tablet/mobile shell, context/profile/navigation, factual Dashboard and Customers exemplar | Automated local workflow/visual/all-module smoke, exact-commit CI and annotated completion tag; no pilot GO |
| V2-11B | Implemented daily operations: Queue, Appointments, Attendance, Customer Dues and Inventory work layouts | Reviewed actions, bounded server pages/mobile cards, branch-time conversion, canonical status/history, exact journal/stock arithmetic, authority and idempotency; local acceptance and exact-commit CI/tag release gate, no pilot GO |
| V2-11C | Implemented CRM/Follow-up relationship work and Supplier/Purchasing documents/receiving | Server tables/mobile records, canonical fields/stages/atomic conversion, exact frozen lines, blank actual receipt quantities and identical retry, independent module dependencies; local acceptance and exact-commit CI/tag release gate, no pilot GO |
| V2-11D | Implemented organization/branch/role/staff/HR administration, reports/notifications and billing experience | Bounded canonical directories, reviewed guarded commands, membership/operator separation, self/broad HR privacy, server report/export scopes, exact settlement and lifecycle; local acceptance plus exact-commit CI/tag release gate, no pilot GO |
| V2-11E | Final cross-domain polish, accessibility/performance/responsive acceptance and public/account cohesion | Broad automatic regressions and loaded visual QA; hosted/recovery/operations GO gates stay independent |

Future scopes above are UX direction, not authorization to create new business
features. Arbitrary saved filters, global Customer sorting, general activity or
upcoming-work projections, drag layouts, extra notifications/integrations and
report builders require reviewed API/security scope. Do not infer missing backend
capability from absent UI. No reference branding/code, hotel domain, gateway,
OAuth, Mongo authority, messaging stack or paid infrastructure is adopted.

See [reference mapping](../reviews/V2-11A_REFERENCE_UX_ANALYSIS.md),
[ADR 0029](../adr/0029-ekavio-design-system.md) and
[A acceptance](../reviews/V2-11A_EXPERIENCE_FOUNDATION.md).
See [B source audit](../reviews/V2-11B_OPERATIONS_UX_AUDIT.md) and
[B acceptance](../reviews/V2-11B_DAILY_OPERATIONS_EXPERIENCE.md).
See [C source audit](../reviews/V2-11C_CRM_PURCHASING_UX_AUDIT.md) and
[C acceptance](../reviews/V2-11C_CRM_PURCHASING_EXPERIENCE.md).
See [D source audit](../reviews/V2-11D_ADMINISTRATION_UX_AUDIT.md) and
[D acceptance](../reviews/V2-11D_ADMINISTRATION_EXPERIENCE.md).
V2-11E is delivered in approval-gated intermediate batches: see the
[source audit and plan](../reviews/V2-11E_SOURCE_AUDIT_AND_PLAN.md),
[Batch 1 field catalogue](../reviews/V2-11E_BATCH1_FIELD_CATALOGUE.md),
[Batch 2 layout studio](../reviews/V2-11E_BATCH2_LAYOUT_STUDIO.md) and
[Batch 3 entity forms acceptance register](../reviews/V2-11E_BATCH3_ENTITY_FORMS.md).
Batch 4 final cross-domain/public/account polish and broad
accessibility/performance acceptance remain deferred. No batch starts automatically. Complete
Branch/Staff paging, new report builders and new commercial capabilities require
separately reviewed backend/security work, not a client-only approximation.
