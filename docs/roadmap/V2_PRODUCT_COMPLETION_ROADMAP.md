# V2 product completion roadmap

V2-07 remains **NO-GO FOR REAL CUSTOMER DATA**. Hosted authenticated acceptance is intentionally deferred until product completion and automated final acceptance. This program does not close recovery, ownership, monitoring or always-on hosting gates. Render Free is staging-only by operator choice; Atlas remains retained.

| Milestone | Scope |
| --- | --- |
| V2-08A | Product experience foundation: themes, responsive shell, canonical Customers/Services, Settings, phone input, human labels, commercial presentation and automated local QA |
| V2-08B | Implemented identity/account recovery: explicit phone-or-verified-email lookup, optional provider-neutral SMTP, single-use verification/reset, recipient-chosen staff invitations and durable per-user preferences; local automated acceptance, no pilot GO |
| V2-08C | Implemented organization administration/RBAC: additive 014, operating profile, safe branch lifecycle, custom replacement permissions, staff lifecycle, authenticated existing-account linking, safe audit and operator directory; automatic local acceptance, no pilot GO |
| V2-08D | Implemented additive 015: five entity types, 13 typed fields, stable options/history, shared canonical form renderer, versioned layouts, safe configuration RBAC, Customer search/filter and automated local acceptance; no pilot GO |
| V2-08E | Implemented additive 016: individually authorized factual dashboards, personal layouts, ten curated branch-safe reports, bounded formula-safe CSV/reportable fields, own transactional attention center and polling; no pilot GO |
| V2-08F | Implemented original shared brand, responsive public website/themes, additive 017 fixed/contact pricing and immutable request references, three-step server-quoted intake, manual commercial/onboarding/renewal UX, metadata/PWA and automated local acceptance; no pilot GO |
| V2-09A | Implemented optional CRM & Follow-ups: additive 018, guarded branch-scoped Leads/stages/assignments/manual actions, atomic canonical Customer conversion, shared fields/widgets/reports/notifications and automated local acceptance; no pilot GO |
| V2-09B | Implemented optional Suppliers & Purchasing: additive 019, versioned organization Suppliers/branch orders, exact frozen item lines, atomic idempotent partial/full canonical Inventory receiving, reversal protection, factual widgets/reports and automated local acceptance; no pilot GO |
| V2-09C | HR Plus — deferred / not started |
| V2-10 | Automated final acceptance, hosted tenancy/realtime, recovery/operations evidence and separate strict GO/NO-GO review |

## Core foundation versus commercial modules

Core experience: Dashboard, Customers, Services, Branches, Staff, roles/permissions, Profile, Settings, Billing shell, basic Reports shell, Help/support and authorized audit visibility. A screen is not a new sellable module. V2-08C explicitly separates Customers/Services from Queue entitlement using dedicated server-side `customers.read/manage` and `services.read/manage`; tenant isolation remains mandatory. Queue/Appointments retain Queue entitlement and `queue.read/manage`. This is an accepted backend policy change, not frontend bypass.

Commercial modules retain keys `queue`, `attendance`, `ledger`, `inventory`, presented as Queue & Appointments, Attendance, Customer Dues and Inventory. Optional V2-09A adds `crm`, presented as CRM & Follow-ups; V2-09B adds `purchasing`, presented as Suppliers & Purchasing. Both start unpublished without a configured price, Pilot Core inclusion or existing-subscription grant. Supplier administration needs Purchasing alone; canonical item-backed orders require Inventory read and both modules, and receiving independently requires both manage permissions. No automatic dependency grant. Entitlement (commercial availability), permission (membership authority), and navigation visibility remain separate decisions.

## Deferred work

V2-08D delivers the bounded shared form foundation; V2-08E consumes active reportable
metadata and custom CSV, reusing the single typed Customer filter. Broader custom/
multiselect filters, safe custom uniqueness, saved presets, general email, low-stock
events and multi-branch paid aggregates remain deferred. No bulk importer, sales/POS
or full arbitrary report builder is implied. See
[V2-08E acceptance](../reviews/V2-08E_DASHBOARDS_REPORTS_NOTIFICATIONS.md).
V2-08F now completes public/commercial UX; NO-GO and operations gates remain. See
[V2-08F acceptance](../reviews/V2-08F_PUBLIC_COMMERCIAL_UX.md). Migration 017 must
precede other deployments; recovery proof for 013–017 remains separate and OPEN.
V2-09A is separately approved and implemented. See
[CRM acceptance](../reviews/V2-09A_CRM_FOLLOWUPS.md); apply additive 018 before its
deployment. V2-09B is implemented; see
[Purchasing acceptance](../reviews/V2-09B_SUPPLIERS_PURCHASING.md) and apply additive
019 before deployment. Extended recovery through 019 remains OPEN. Purchasing returns,
amendments, Supplier custom fields, notifications and full accounting are deferred.
V2-09C HR Plus and V2-10 final acceptance are deferred and do not begin automatically.

V2-08C implements authenticated existing-identity linking, custom tenant roles and
organization-local staff lifecycle. Owner transfer/support bypass remain deferred.
Real SMTP/provider smoke and hosted migration/deployment acceptance remain separately
required later. Migration 013 must precede V2-08B deployment. Recovery and retained
schema proof must eventually include its new invariants. No new milestone begins
automatically; V2-07 NO-GO is unchanged.

Do not build email login/OTP/recovery, custom-role tables, custom fields/forms, Leads/Deals/follow-ups, suppliers/purchasing, leave/payroll, gateways, WhatsApp/SMS or paid AI in V2-08A. Service reference price exists canonically but is not invoicing/accounting; price administration and broader branch availability administration require their own reviewed enhancement. No fake organization fields, reports, audit feeds or support contact details.
