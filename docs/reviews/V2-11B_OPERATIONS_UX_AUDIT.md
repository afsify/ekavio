# V2-11B daily operations UX audit

Baseline: `bdefe1aba0648cf3d40221c185cae05635b6789e`, clean main.
Existing annotated `pre-v2-11b-daily-operations` is retained and published;
its remote peeled target was verified against the baseline. This audit precedes
implementation. **NO-GO FOR REAL CUSTOMER DATA remains unchanged.**

## Evidence and shared direction

Source: the five `frontend/src/pages/{Queue,Appointments,Attendance,Ledger,Inventory}`
pages, `pages/Services/ServicesPage.tsx`, `hooks/useQueue.ts`, `hooks/useInventory.ts`,
`hooks/useDynamicForm.ts`, WorkspacePrimitives, AdvancedTable, AdvancedModal,
CustomersPage, exportUtils and the corresponding backend routes/controllers,
schemas, domain repositories/services and integration tests. ADRs 0004/0005,
0012/0017/0018/0019/0027 and the accepted cutover/RBAC/Purchasing reviews define
authority. Later CORE customer/service permissions supersede historical Queue gates.

The accepted V2-11A reference comparison supplies layout lessons, not copied code:
Bizforz C3/C4/C5 group daily tasks and next actions; Biz Auth A2/A5 distinguish
workspace and mobile records; Levalor P3/P4 separate details from work-specific
actions. Retain EkaVio's single theme/shell, explicit server tables, typed dynamic
fields, focus-return dialogs, safe-area sheets and cancellation on context switch.
No reference source execution, dependencies, auth, branding or infrastructure.

| Workflow | Current flow / friction | Verified backend support | Planned experience / mobile | Authority and acceptance |
| --- | --- | --- | --- | --- |
| Queue | Active table, false-zero summary fallback, icon-only progression, nested minimal Customer modal | GET active waiting/serving only; bounded page; atomic number allocation; expected-version transitions waiting→serving/cancelled, serving→completed/cancelled; post-commit branch events | Three factual counters, desktop table/mobile token cards, named next action/detail/confirmation, search Customer + branch Service + review; canonical shared Customer form | Queue entitlement/read/manage; Customers and Services independent CORE permissions; retained retry key; Socket hints invalidate, reconnect refreshes; no invented completed history/search/wait estimate |
| Appointments | Device-local today/time, daily table, immediate creation/check-in, unstructured detail | Required branch date; branch timezone conversion with DST gap/fold rejection; Service duration; assigned Provider list; custom values version; atomic idempotent check-in | Server business date from existing CORE Dashboard projection, Previous/Today/Next, branch-time range cards, searchable bounded selectors, optional assigned Provider, duration preview, reviewed creation, details/check-in/custom fields | Queue entitlement/read/manage plus independent selector permissions; no availability claim; no scheduling edit endpoint fabricated; preserve histories and exact versions |
| Attendance | Complete roster/cards and factual summary; three cramped mark buttons; sticky correction overlaps navigation; history count only | Branch-today daily roster; explicit unmarked; optional branch-local times; initial idempotency; reasoned expected-version correction; immutable history endpoint | Adaptive roster, clearly labelled local roster filter, mark/correct full-screen form, before/proposed facts, inline errors, correction history drawer | Attendance entitlement/read/manage, active branch-assigned membership; unmarked≠absent; no shift/leave inference; test all marks, reasons/history, conflicts/time boundaries |
| Customer Dues | Search/select plus filters; card-only journal; sticky create/reversal; Customer creation gate incorrectly tied to Queue | Exact decimal-string input/paise DTO; server organization/branch balance; type/date/customer paging; append-only journal/reversal; organization-wide overpayment rejection | Separate balance scopes, Charge/Payment/Adjustment CTAs, adaptive reviewed form, desktop journal/mobile cards/detail/reversal; explicit current-page CSV | Ledger entitlement/read/manage; customers.manage CORE link; BigInt previews only, server authoritative; preserve command keys, signs, concurrency, duplicate reversal; formula-safe text exports |
| Inventory | Large card grid with many actions, history below list; no desktop table or action preview | Organization catalogue, branch quantities/location, bounded search/status/low-stock endpoint, exact 3-decimal stock, custom fields, permanent movements/full reversal | Catalogue/Low stock view, table/mobile cards, details/history drawer, contextual receive/consume/adjust, exact labelled preview/review, reasoned reversal | Inventory entitlement/read/manage; inactive item rules; stock nonnegative/idempotent/concurrent; Purchasing receipt marker blocks independent reversal; permission-gated Purchasing links only |

## Contract gaps and boundaries

No new endpoint or migration is needed for this scope. Existing
`GET /analytics/dashboard` is CORE and already returns authorized branch timezone
and business date. Appointment dates/times must wait for it rather than silently
falling back to the device clock. Its metrics are not treated as Queue list totals.
Queue lists active records only: terminal status removes the record after a
successful transition; no fake completed-list tab. Service/provider options are
bounded server responses, not globally filtered received subsets. Inventory
low-stock is its own supported endpoint, not a current-page local filter.
Attendance filtering is explicitly over the complete received branch/day roster.
Dues accepts exact human decimal strings; the backend owns conversion to paise.

Shared gaps: form/retry feedback, dirty close warning, semantic status labels,
review before permanent facts, scoped cancellable query keys, current-page export
formula safety. Reuse existing components rather than build another framework.

## Automated acceptance plan

Real disposable PostgreSQL/Chromium journeys for all five domains; positive and
negative HTTP authority matrix including Appointments; exact money/quantity,
idempotency, concurrent mutation, Purchasing linkage, timezone/DST and correction
history regressions. Retain all established browser suites and cross-module
navigation/context smoke. Sanitized loaded presentation fixtures cover five pages
at 320/360/390/430/768/1024/1440/1920 × Light/Dark/System, forms/details/confirmation,
empty/error/filter states, focus, no document overflow or bottom-nav overlap.
Screenshots remain ignored; actual images must be inspected. Local evidence is
not hosted/provider/production acceptance or comprehensive WCAG certification.
