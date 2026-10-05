# V2 product completion roadmap

V2-07 remains **NO-GO FOR REAL CUSTOMER DATA**. Hosted authenticated acceptance is intentionally deferred until product completion and automated final acceptance. This program does not close recovery, ownership, monitoring or always-on hosting gates. Render Free is staging-only by operator choice; Atlas remains retained.

| Milestone | Scope |
| --- | --- |
| V2-08A | Product experience foundation: themes, responsive shell, canonical Customers/Services, Settings, phone input, human labels, commercial presentation and automated local QA |
| V2-08B | Identity/account recovery: reviewed phone-or-email identity, verified email, password recovery, durable per-user preferences, staff invitation design |
| V2-08C | Organization administration/RBAC: organization profile fields, branch CRUD, custom roles, permission/audit visibility, staff lifecycle |
| V2-08D | Dynamic fields and form layouts with safe schemas and authorization |
| V2-08E | Dashboards, reports and notifications; no invented metrics or mandatory messaging provider |
| V2-08F | Public website and commercial UX completion |
| V2-09 | Optional separately approved CRM, Purchase and HR extensions |
| V2-10 | Automated final acceptance, hosted tenancy/realtime, recovery/operations evidence and separate strict GO/NO-GO review |

## Core foundation versus commercial modules

Core experience: Dashboard, Customers, Services, Branches, Staff, roles/permissions foundation, Profile, Settings, Billing shell, basic Reports shell, Help/support and authorized audit visibility. A screen is not a new sellable module. Existing API permissions and entitlement boundaries remain authoritative; current Customer/Service endpoints require Queue entitlement and `queue.read`/`queue.manage`. Separating those canonical backend gates is a future explicitly reviewed policy change, not frontend permission bypass.

Commercial modules retain keys `queue`, `attendance`, `ledger`, `inventory`, presented as Queue & Appointments, Attendance, Customer Dues and Inventory. Entitlement (commercial availability), permission (membership authority), and navigation visibility remain separate decisions.

## Deferred work

Do not build email login/OTP/recovery, custom-role tables, custom fields/forms, Leads/Deals/follow-ups, suppliers/purchasing, leave/payroll, gateways, WhatsApp/SMS or paid AI in V2-08A. Service reference price exists canonically but is not invoicing/accounting; price administration and broader branch availability administration require their own reviewed enhancement. No fake organization fields, reports, audit feeds or support contact details.
