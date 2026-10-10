# V2-11C CRM, relationships and purchasing UX audit

Baseline: clean main `49f6fdc8aa18abb0cce7b75f1863ea06142a8e9e`;
accepted annotated V2-11B tag and exact CI `37963905634` verified.
The one annotated `pre-v2-11c-crm-purchasing-experience` checkpoint was
created and pushed at that baseline. **NO-GO FOR REAL CUSTOMER DATA is unchanged.**

## Source evidence and patterns

Revisited read-only local sources, without running reference applications:

| Reference | Source relative to reference root | Adopt / adapt / reject |
| --- | --- | --- |
| Bizforz CRM | `frontend/src/modules/leads/KanbanBoard.tsx`, `frontend/src/components/common/leads/LeadActivityTimeline.tsx`, `frontend/src/modules/followups/FollowUpsPage.tsx` | Adapt explicit stage grouping, human history and daily attention. Keep EkaVio's branch-business-date meaning of overdue, bounded server lists and scoped caches. Reject local sorting as global ordering, persisted contact searches, forecasts and heavy drag dependencies. |
| Biz Auth | `Front-end/src/components/common/Table.tsx`, `Front-end/src/pages/auth/CreateWorkspace.tsx`, `Front-end/src/context/AuthContext.tsx` | Adapt mobile records and explicit review/progress over existing A/B primitives. Retain EkaVio context unmount/cancel and single theme/session stores; no account, OTP, gateway or infrastructure transplant. |
| Levalor PMS (frontend only) | `src/pages/Reception/components/BookingDetails/BookingHeader.jsx`, `src/pages/Reception/components/BookingDetails/BookingTimeline.jsx`, `src/components/elements/AdvancedModal.jsx` | Adapt readable lifecycle, next-action placement and structured retained history. Reject nested dialog chains, hotel billing, branding/effects and inferred backend behaviour. No Levalor backend was supplied or reviewed. |

Paths are grounded in the existing V2-11A comparison and actual local source
searches. `reference/` remains intentionally ignored and read-only; no source,
credentials, dependencies, branding or external service is copied.

## Existing contracts versus UX gaps

Reviewed CRM/Purchasing frontend pages/forms/contracts, shared table/modal/
OperationForm, dynamic fields, Customers, Inventory, operational context and
browser tests; backend routes, services and closed validation policies; ADRs
0026/0027/0029 and Customer/tenancy/field/report/commercial decisions.

| Journey | Existing deficiency | Supported redesign and boundary |
| --- | --- | --- |
| Lead directory / pipeline | Card grid at every size, lengthy filters, count cards navigate away from Pipeline | Explicit server-mode desktop table/mobile records; stage selection retains pipeline and its paginated filtered Lead page. Organization stages/counts only; no unbounded Kanban, forecast or fake next-follow-up. |
| Lead detail / forms | Contact/history mixed; detail and edit/follow-up/conversion traps can overlap | Structured detail, human badges/actions/history, one edit/review/discard dialog at a time, return to refreshed Lead. Preserve dynamic layouts, versions and required fields. |
| Manual follow-ups | Dense action cards, immediate terminal mutation, device timezone risk elsewhere | Branch-local due facts and existing Today/Overdue/Upcoming/Completed views; reviewed creation and explicit terminal confirmation. No scheduler or messaging. |
| Conversion | Browser confirmation rather than visible identity review | Explicit new/existing canonical Customer choice, required shared Customer fields and permanent-link review. No automatic matching, second Contacts store, Sale or payment. |
| Supplier directory | Card-only, long ungrouped form, uncertain create retry | Server alphabetical pages/mobile records, organization identity versus selected-branch history, grouped optional-contact form and reviewed lifecycle. Name alone remains sufficient; no deletion/merge/AP. |
| PO editing | Long form, wall of Add buttons, no final document review | Supplier/date/item/unique-line/value sections, paginated canonical selection, exact BigInt totals and reviewed Draft. Maximum 50 unique lines; no unbounded load, amendments or invented approval. |
| Receiving | Existing correct blank inputs/key retention, inconsistent modal/footer | Single review/discard sheet, exact actually entered positive milli quantities, supplier/reference/branch/stock explanation. Frozen confirmed payload/key survives uncertain responses; no payment, price rewrite or independent reversal. |

CRM has supported newest/oldest/name ordering; Suppliers are fixed alphabetical;
POs support newest/oldest/supplier-name; receipt history is fixed server ordering.
No page is globally sorted in the client. Filters intentionally reset pages.
All list pages remain bounded and keys include user/workspace/authority context.

## Acceptance plan

Real disposable PostgreSQL/Chromium proof for conversion/fields/lifecycle,
canonical receiving/idempotency/rollback/reversal, live independent authority,
server pages and context switches; retain previous browser/domain suites.
Sanitized loaded presentation matrix: 320/360/390/430/768/1024/1440/1920,
Light/Dark/System, details/forms/reviews/history/empty/error/read-only and
short-height/focus/footer/hit tests. Actual images must be visually reviewed.
Tests and release facts belong in the separate final evidence report, never
inferred from code or mock screenshots. No migration/backend rewrite is needed.
