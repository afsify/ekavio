# V2 product completion roadmap

V2-07 remains **NO-GO FOR REAL CUSTOMER DATA**. Hosted authenticated acceptance is intentionally deferred until product completion and automated final acceptance. This program does not close recovery, ownership, monitoring or always-on hosting gates. Render Free is staging-only by operator choice; Atlas remains retained.

| Milestone | Scope |
| --- | --- |
| V2-08A | Product experience foundation: themes, responsive shell, canonical Customers/Services, Settings, phone input, human labels, commercial presentation and automated local QA |
| V2-08B | Implemented identity/account recovery: explicit phone-or-verified-email lookup, optional provider-neutral SMTP, single-use verification/reset, recipient-chosen staff invitations and durable per-user preferences; local automated acceptance, no pilot GO |
| V2-08C | Implemented organization administration/RBAC: additive 014, operating profile, safe branch lifecycle, custom replacement permissions, staff lifecycle, authenticated existing-account linking, safe audit and operator directory; automatic local acceptance, no pilot GO |
| V2-08D | Implemented additive 015: five entity types, 13 typed fields, stable options/history, shared canonical form renderer, versioned layouts, safe configuration RBAC, Customer search/filter and automated local acceptance; no pilot GO |
| V2-08E | Dashboards, reports and notifications; no invented metrics or mandatory messaging provider |
| V2-08F | Public website and commercial UX completion |
| V2-09 | Optional separately approved CRM, Purchase and HR extensions |
| V2-10 | Automated final acceptance, hosted tenancy/realtime, recovery/operations evidence and separate strict GO/NO-GO review |

## Core foundation versus commercial modules

Core experience: Dashboard, Customers, Services, Branches, Staff, roles/permissions, Profile, Settings, Billing shell, basic Reports shell, Help/support and authorized audit visibility. A screen is not a new sellable module. V2-08C explicitly separates Customers/Services from Queue entitlement using dedicated server-side `customers.read/manage` and `services.read/manage`; tenant isolation remains mandatory. Queue/Appointments retain Queue entitlement and `queue.read/manage`. This is an accepted backend policy change, not frontend bypass.

Commercial modules retain keys `queue`, `attendance`, `ledger`, `inventory`, presented as Queue & Appointments, Attendance, Customer Dues and Inventory. Entitlement (commercial availability), permission (membership authority), and navigation visibility remain separate decisions.

## Deferred work

V2-08D delivers the bounded shared form foundation. V2-08E may consume reportable
metadata, add reviewed other-entity/multiselect filters and custom reportable CSV
exports, and separately design safe custom-value uniqueness. No bulk importer or
full report builder is implied. See [V2-08D acceptance](../reviews/V2-08D_DYNAMIC_FIELDS_FORM_LAYOUTS.md).
V2-08E does not begin automatically; NO-GO and the existing operational gates remain.

V2-08C implements authenticated existing-identity linking, custom tenant roles and
organization-local staff lifecycle. Owner transfer/support bypass remain deferred.
Real SMTP/provider smoke and hosted migration/deployment acceptance remain separately
required later. Migration 013 must precede V2-08B deployment. Recovery and retained
schema proof must eventually include its new invariants. No new milestone begins
automatically; V2-07 NO-GO is unchanged.

Do not build email login/OTP/recovery, custom-role tables, custom fields/forms, Leads/Deals/follow-ups, suppliers/purchasing, leave/payroll, gateways, WhatsApp/SMS or paid AI in V2-08A. Service reference price exists canonically but is not invoicing/accounting; price administration and broader branch availability administration require their own reviewed enhancement. No fake organization fields, reports, audit feeds or support contact details.
