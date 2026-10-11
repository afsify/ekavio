# V2-11D administration, HR, reporting, notifications and billing UX audit

Baseline: clean main `3fb1165dbff6f62ed15d2a5f95ae1dd360868caf`;
annotated V2-11C completion and exact CI `38066738453` verified against fresh
remote main. One annotated `pre-v2-11d-administration-experience` checkpoint
is published at that SHA. **NO-GO FOR REAL CUSTOMER DATA is unchanged.**

## Source-backed gaps and planned changes

| Source | Actual gap | Supported improvement / boundary |
| --- | --- | --- |
| `Settings/OrganizationPage.tsx`, `useOrganizationData.ts`, backend organization routes/service | Card-only Branches/custom roles, native confirmations, tenant-only query keys, unguarded closing and dense profile/permission forms | Reuse semantic desktop tables/mobile records, structured operating profile, readable permission groups and one edit/review/discard dialog. Scope keys/cancellation include user/branch/live authority. Branches/Members searches return at most 200 server-ordered rows, with no total/paging/sort API: label the bound, never invent global pagination. Role catalogue is canonical configuration, not a fabricated paginated directory. |
| `Staff/StaffAccessCards.tsx`, `StaffManagementPage.tsx` | Card-only memberships, details show only custom fields, native access confirmation, invitation revocation without review | Readable protected identity/organization membership/branch details, canonical dynamic fields, reviewed access/invitation/revocation. Preserve replacement roles, owner/self protections, active branches, recipient-chosen credentials and one-time in-memory handoffs. No identity overwrite, owner transfer or operator grant. |
| `HR/HrPage.tsx`, `forms.tsx`, `contracts.ts`, backend HR policy/service | Card-only leave/shifts, long configuration, draft creation without review, outer dialog can close during an in-flight command | Bounded server tables/mobile records, explicit My Work versus team scope, grouped reviewed configuration/scheduling and guarded sheets. Keep whole days, independent Attendance, all-branch different reviewer, private reasons/notes, branch dates/UTC, overlap/version/key/frozen-history rules. No payroll, balances or auto Attendance. |
| `Reports/ReportsPage.tsx`, analytics contracts/routes/service | Dense catalogue/filter discovery, immediate export, raw result navigation and limited loading/error feedback | Curated human report description, server-page results, collapsed supported filters/columns and explicit export review. Keep authorization intersections, date semantics, exact facts, adaptive row/byte budgets, formula-safe CSV and export audit; no saved arbitrary reports or global subset sort. |
| `Notifications/*`, `useNotifications.ts`, canonical attention service | Dense cards and feedback conflating load/update errors; immediate mark-all; preferences lack per-setting explanation | Personal scoped attention cards, readable unread/category/time, explicit bulk-read review, safe preference feedback. Only existing organization/CRM/HR events and closed deep links; no recipient selection or messaging/scheduler. |
| `Billing/BillingPage.tsx`, `Commercial/*`, existing commercial/renewal contracts and services | Legacy dark utility layout, catalogue versus purchased modules unclear, missing loading/retry states, several immediate commercial mutations | Semantic tenant subscription/limits/modules/add-ons and frozen history; truthful unavailable/pending/expired/suspended steps. Review existing operator actions without inventing prices/payment proof. Preserve exact settlement, historical terms, payment key and frozen uncertain retries, operator-only authority and contact/fixed pricing. |

ADRs 0029, 0022, 0028, 0024, 0015 and 0016 govern. Accepted A/B/C reports
provide table, modal, context and exact-value patterns. The read-only reference
mapping in V2-11A/C supplies grouping/human detail inspiration only; no reference
source, branding, authentication, credentials or infrastructure is imported.

## Explicit exclusions and evidence boundary

No backend capability, migration, dependency, second UI/theme/auth store, paid
provider, entitlement shortcut, owner transfer, payroll, partial-day leave,
arbitrary reporting, gateway, invoice/accounting or automatic external messaging.
Unsupported complete Staff/Branch paging is deferred to reviewed backend work.
No hosted mutation or Atlas access is authorized. Render Free remains staging-only;
V2-10 recovery/provider/deployment/monitoring/ownership gates remain separate.

Authority/workflow proof will use disposable local PostgreSQL; sanitized loaded
visual fixtures will be separately identified. Required 8 widths × 3 themes,
short-height/focus/hit-testing and retained regressions are release gates.
Managed browser connection failed due unavailable sandbox metadata; the expressly
authorized repository Playwright/Chromium fallback will be used. No unavailable
hosted/operator evidence will be claimed. Final outcomes belong in the separate
acceptance report, not this pre-implementation plan.

## Post-implementation Linux finding (2026-10-11)

The first D commit, `b1846b77439e84c0393f0f7cbd504ca9c8290a64`, passed its
local gates but failed Linux CI run `38121116223`: 62/65 D visual cases passed;
the three 320px renewal journeys overflowed. This is a real layout defect,
not evidence that the original document-width assertion was too strict.

Linux-native Vite with Playwright 1.63.0 / Chromium 153.0.8010.12 and DejaVu
Sans reproduced a 325px document inside a 320px viewport. The renewal wrapper
was 246px wide at x=37, but its implicit minimum-content grid track and both
cards were 288px wide, ending at x=325. Nested native form controls supplied
the minimum-content pressure. The Playwright image's original WenQuanYi font
produced a smaller, still incorrect 279px card inside that 246px wrapper; its
right edge stayed within the viewport, explaining an otherwise green check.

The bounded correction explicitly uses zero-minimum grid tracks, shrinkable
direct children and available-width form grids. Phone detail padding is 12px
(20px from 640px), leaving a readable 220px native date/time control. The
desktop 0.85/1.15 split remains. Screenshot review also caught the nested
two-column date control clipping at 1024px despite a passing document check.
Form columns therefore use `auto-fit` with a 240px preferred minimum capped
at the available width, rather than assuming the viewport equals card width.
The permanent matrix additionally requires a readable 220px date control.
Measured corrected cards and track are 246px,
their right edge is x=283, and document scroll width is 320px. No global
clipping, font reduction, authority change or dependency upgrade is involved.

Permanent visual coverage additionally checks both cards against their grid
and captures the filled payment form. Existing document, dialog, focus and
commercial assertions, timeouts and zero-retry policy remain intact. Temporary
font/geometry diagnostics and sanitized screenshots remain ignored, out of Git.
Final verification and release evidence belong in the acceptance report.
