# V2-11A reference architecture and UX analysis

Date: 2026-10-09. Scope: original EkaVio experience foundation, not a reference
application port. **NO-GO FOR REAL CUSTOMER DATA remains unchanged.**

## Evidence and safety

The three actual local directories are `reference/biz_crm-main`,
`reference/Biz_auth-main`, and `reference/le-valor-resort-wayanad-main`.
`reference/` is intentionally ignored. No reference source was modified,
installed, served, staged, or committed. Environment files and embedded
credentials were not copied. Source review is static: large pages were inspected
through relevant sections and contract searches, not executed or certified.
Levalor has only a frontend here; no backend behavior is inferred from its UI.

Paths below are relative to each reference root. CRM frontend prefix is
`frontend/src/`, backend prefix `connect-crm-backend/src/`; Auth frontend prefix
`Front-end/src/`, backend prefix `backend/src/`; PMS prefix is `src/`.
The two keyed matrices together record source, implementation, strengths,
weaknesses, current support, actual gap, recommendation, priority, milestone,
API impact, and security for every entry.

## Source-backed feature comparison

| ID / project / feature | Exact source path(s) | Implementation evidenced by source | UX strength | Weakness / trade-off |
| --- | --- | --- | --- | --- |
| C1 CRM shell | `frontend/src/layout/MainLayout.tsx`, `frontend/src/layout/Sidebar.tsx`, `frontend/src/layout/Header.tsx` | Separate mobile drawer/desktop collapse, nested grouped links, breadcrumbs, profile and notification controls, product gates | Connected workspace; compact navigation | Large header/sidebar; global chat/help integrations; independent theme state |
| C2 CRM dashboard | `frontend/src/modules/Dashboard/Dashboard.tsx`, `frontend/src/modules/Dashboard/widgetRegistry.tsx`, `frontend/src/components/common/dashboard/DashboardToolbar.tsx` | Registry, customization, drag sensors, sizes/templates, focus widgets | Discoverable daily overview and personalization | Complex global customization; optional AI coupling; source is not live metric proof |
| C3 CRM leads | `frontend/src/modules/leads/LeadsPage.tsx`, `frontend/src/modules/leads/lead.api.ts`, `frontend/src/modules/leads/KanbanBoard.tsx` | API search/filter/page/sort parameters; card/table/Kanban views and column preferences; stage mutation | Appropriate work-specific views | Very large pages; persisted query values; hover-only actions need mobile care |
| C4 CRM detail/forms | `frontend/src/modules/leads/LeadDetailsPage.tsx`, `frontend/src/components/common/leads/LeadForm.tsx`, `frontend/src/components/common/leads/LeadActivityTimeline.tsx`, `frontend/src/components/common/leads/LeadKanban.tsx` | Detail sections, contextual next steps, activity groups, inline validation and simple card grouping | Human activity labels; clear next action | Multi-thousand-line detail plus integrations; simple Kanban alone is not server workflow proof |
| C5 CRM follow-ups | `frontend/src/modules/followups/FollowUpsPage.tsx`, `frontend/src/modules/followups/followup.queries.ts` | Today/overdue/date grouping, editing, server queries and empty/error presentation | Task-oriented organization | Query keys shown do not explicitly include user/organization; must not copy cache design |
| C6 CRM components/theme/settings | `frontend/src/components/common/ui/Table.tsx`, `frontend/src/components/common/ui/Modal.tsx`, `frontend/src/modules/settings/Settings.tsx`, `frontend/src/index.css` | External sorting callbacks, pagination, modal portal/Escape/scroll lock, lazy grouped settings and semantic styling | Reusable patterns and settings discovery | Clickable sort headers lack native button semantics; no complete focus-trap proof; decorative glass/glow/external font |
| C7 CRM supporting contracts | `connect-crm-backend/src/modules/leads/lead.routes.ts`, `connect-crm-backend/src/modules/dashboard/dashboardPreference.routes.ts`, `connect-crm-backend/src/modules/dashboard/dashboardPreference.controller.ts`, `connect-crm-backend/src/modules/dashboard/dashboardPreferences.service.ts`, `connect-crm-backend/src/modules/custom-fields/customField.routes.ts`, `connect-crm-backend/src/modules/module-form-layout/moduleFormLayout.routes.ts`, `connect-crm-backend/src/modules/organizationSettings/organizationSettings.routes.ts`, `connect-crm-backend/src/middleware/tenant.middleware.ts`, `connect-crm-backend/src/middleware/permission.middleware.ts`, `connect-crm-backend/src/app.ts` | Leads read plus own/team/all gates; user/org dashboard preferences; org-default/target restrictions; custom fields/layout/settings routes; token org extraction and permission checks | UI features correspond to explicit contracts | Mongo identity/domain persistence; custom-field route file alone does not prove mount-level authorization; no blanket security certification |
| A1 Auth login/recovery/workspace | `Front-end/src/pages/auth/Login.tsx`, `Front-end/src/pages/auth/ForgotPassword.tsx`, `Front-end/src/pages/auth/CreateWorkspace.tsx`, `backend/src/modules/auth/auth.routes.ts` | Password visibility, inline errors, awaited session refresh, OTP recovery, stepped workspace creation; rate-limited auth/invitation/session routes | Clear progress and recovery states | Heavy video/auth visuals; OAuth/OTP architecture differs from EkaVio |
| A2 Auth selection/switching | `Front-end/src/pages/auth/SelectOrg.tsx`, `Front-end/src/pages/auth/SelectProduct.tsx`, `Front-end/src/context/AuthContext.tsx` | Organization cards, assigned/available products, subscription gates, deduplicated same-org switch promise and refresh sequencing | Workspace identity before product choice | Multiple theme/token conventions; same-org deduplication is not proof against all different-org races |
| A3 Auth shell/profile/notifications | `Front-end/src/layout/AdminLayout.tsx`, `Front-end/src/components/layout/AdminSidebar.tsx`, `Front-end/src/components/layout/AdminHeader.tsx`, `Front-end/src/index.css` | Compact rail, grouped admin links, header profile/notification/announcement controls, mobile navigation | Strong context and discoverable account controls | Large multipurpose header; lime/glow styling and independent root theme mutation |
| A4 Auth administration | `Front-end/src/pages/superAdmin/Dashboard.tsx`, `Front-end/src/pages/superAdmin/Organization.tsx`, `Front-end/src/pages/superAdmin/RolesManagement.tsx`, `Front-end/src/pages/superAdmin/users/UserManagement.tsx`, `Front-end/src/pages/superAdmin/users/components/UserCard.tsx`, `Front-end/src/pages/superAdmin/users/components/UserModals.tsx` | Widget save/discard/reorder; server user pages and lightweight org search; role permission groups; selected-membership access/status modals | Human membership distinctions and explicit target organization | Operator-wide UI must not become tenant-admin authority; some filtering is received-subset; many modal responsibilities |
| A5 Auth mobile table/billing | `Front-end/src/components/common/Table.tsx`, `Front-end/src/pages/billing/BillingPage.tsx`, `Front-end/src/pages/billing/BillingProfilePanel.tsx` | Mobile cards, table pagination; subscription/invoice/payment tabs; dirty billing profile and pending-payment feedback | Business status and recovery actions are explicit | Table local sort can mislead on server pages; large gateway-coupled billing screen |
| A6 Auth backing contracts | `backend/src/modules/organization/orgUsers.routes.ts`, `backend/src/modules/roles/role.routes.ts`, `backend/src/middleware/requireOrgMembership.middleware.ts`, `backend/src/modules/subscription/subscription.routes.ts` | Auth/tenant/permission member and role routes; active membership lookup; separate operator subscription router | Supports explicit membership administration | Mongo authority and gateway integrations; no adoption of identity store, default passwords, SMTP requirement or payments |
| P1 PMS shell | `src/components/layout/AdminLayout.jsx`, `src/components/layout/Header.jsx` | Admin collapse/mobile/department/profile navigation; separate public hotel header | Rich operational context and responsive destinations | Public Header is not admin header; user-data local storage, mixed UI dependencies and motion/glow |
| P2 PMS table/select/modal | `src/components/elements/AdvancedTable.jsx`, `src/components/elements/AdvancedSearchSelect.jsx`, `src/components/elements/AdvancedModal.jsx` | External sort bypass, local fallback, search/paging/actions; received-option filtering/keyboard; Escape/scroll lock/dialog roles | Good bounded selection and record affordances | Truthy external-sort switch can accidentally fall back; clickable sorting; static dialog IDs and no complete trap proof |
| P3 PMS dashboard/details | `src/pages/Dashboard/Dashboard.jsx`, `src/pages/Reception/BookingDetails.jsx`, `src/pages/Reception/components/BookingDetails/BookingHeader.jsx`, `src/pages/Reception/components/BookingDetails/BookingTimeline.jsx` | Operational dashboard tabs, detail/billing sections, desktop/mobile action placement and factual event grouping | Next-action placement, human timeline and section hierarchy | Very large pages, nested modal chains and hotel-specific billing workflows |
| P4 PMS reservation/reception | `src/pages/Reservation/ReservationsList.jsx`, `src/pages/Reservation/RoomAvailability.jsx`, `src/pages/Reception/RoomStatus.jsx` | Server filter/page requests, calendar/list availability, operational status cards | Work-specific views rather than identical CRUD screens | Reservations sort received response locally; dense grid/color status needs labels and touch review |
| P5 PMS feedback | `src/components/modal/ConfirmModal.jsx`, `src/components/skeletons/TableSkeleton.jsx` | Explicit confirmation/loading and table-shaped skeleton | Predictable pending feedback | Confirmation trap/unique-ID not established; skeleton imports Ant Design; no backend provided |

## EkaVio mapping, actual gaps and decisions

Classification: **UI** = existing backend capability with experience deficiency;
**existing** = already accepted behavior to preserve; **deferred** = not added in A.
P0 means authority/correctness; P1 means foundation usability; P2 later refinement.

| ID | Relevant EkaVio / existing support | Actual gap / classification | Adopt, adapt or reject | Priority / milestone | Backend/API impact | Security consideration |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | `frontend/src/components/layout/AdminLayout.tsx`, `frontend/src/components/layout/AdminSidebar.tsx`, `frontend/src/components/layout/navigation.ts` | UI: hierarchy/context/account discovery | Adapt grouping, collapse and mobile More | P1 / A | None | Retain live membership, permission and entitlement checks |
| C2 | `frontend/src/pages/Dashboard.tsx`, `backend/src/domains/analytics/dashboardService.ts` | UI: meaningful summary/customization affordance | Adapt registry semantics and touch-safe arrows, not drag framework | P1 / A | Existing dashboard/layout endpoints | Never invent or role-grant metrics |
| C3 | `frontend/src/pages/CRM/CrmPage.tsx`, `backend/src/domains/crm/service.ts` | UI: dedicated richer views; deferred deep redesign | Adapt work views later; reject stored PII queries | P2 / C | No A change | Preserve CRM conversion/version/privacy |
| C4 | `frontend/src/pages/Customers/CustomersPage.tsx`, `frontend/src/pages/CRM/CrmPage.tsx`, `frontend/src/components/crm/CustomerCrmContext.tsx` | UI: customer hierarchy; deferred CRM depth | Adapt sections and contextual edit; avoid nested dialogs | P1 A / P2 C | Existing detail/typed values only | Technical UUIDs collapsed; labels are not authority |
| C5 | `frontend/src/pages/CRM/CrmPage.tsx`, `backend/src/domains/crm/service.ts` | UI: daily-work clarity | Adapt task grouping later | P2 / C | No A change | Preserve organization/user/branch cache isolation |
| C6 | `frontend/src/components/ui/AdvancedTable.tsx`, `frontend/src/components/ui/AdvancedModal.tsx`, `frontend/src/pages/Settings/SettingsPage.tsx`, `frontend/src/index.css` | UI and P0 local-search ambiguity | Adapt native keyboard controls, retry/skeleton/mobile records; reject effects | P0–1 / A | Controlled callbacks, not extra fetches | Visible columns only in local search; one theme store |
| C7 | `backend/src/routes/crmRoutes.ts`, `backend/src/routes/analyticsRoutes.ts`, `backend/src/routes/dynamicFieldRoutes.ts`, `backend/src/middlewares/tenantMiddleware.ts` | Existing capability, not missing backend | Preserve EkaVio contracts; reject Mongo/message architecture | P0 / A | No migrations or API rewrite | Server remains authority; reference routing alone not evidence of safety |
| A1 | `frontend/src/pages/Login.tsx`, `frontend/src/pages/Identity/AccountActionPage.tsx`, `frontend/src/pages/Onboarding/OnboardingPage.tsx`, `backend/src/routes/identityAccountRoutes.ts` | Existing workflows; deeper UX deferred | Adapt inline progress/error consistency only | P2 / E | None in A | No copied OAuth, OTP, default password or gateway |
| A2 | `frontend/src/components/layout/TenantSwitcher.tsx`, `frontend/src/hooks/useAuth.ts`, `frontend/src/store/useAuthStore.ts` | UI: switch visibility and stale-content prevention | Adapt human selectors; unmount/cancel/clear before refresh | P0 / A | Existing refresh/context endpoints | Failed selection retains authorized context; no guessed mappings |
| A3 | `frontend/src/components/layout/AdminLayout.tsx`, `frontend/src/components/analytics/NotificationBell.tsx`, `frontend/src/components/ui/ProfileSettingsModal.tsx`, `frontend/src/pages/Settings/SettingsPage.tsx` | UI: account access and calmer shared shell | Adapt account sheet, appearance controls and icons | P1 / A | Existing preferences only | Credentials stay in memory/HttpOnly cookie |
| A4 | `frontend/src/pages/Staff/StaffManagementPage.tsx`, `frontend/src/pages/Staff/StaffAccessCards.tsx`, `frontend/src/pages/Settings/OrganizationPage.tsx`, `backend/src/services/organizationAdministrationService.ts` | UI: shared shell now, detailed lifecycle later | Adapt scoped human descriptions; reject operator-to-admin shortcuts | P1 A / P2 D | None | Organization administrator is not platform operator |
| A5 | `frontend/src/components/ui/AdvancedTable.tsx`, `frontend/src/pages/Billing/BillingPage.tsx` | UI: table correctness now; billing presentation later | Adapt cards and status detail; reject payment gateway | P0 A / P2 D | No change to exact arithmetic | No local subset sort advertised globally |
| A6 | `backend/src/routes/organizationRoutes.ts`, `backend/src/services/organizationAdministrationService.ts`, `backend/src/postgres/organizationAuthorization.ts`, `backend/src/postgres/authorizationContextRepository.ts` | Existing authoritative contracts | Reject persistence/auth transplant | P0 / A | None | Independent backend denials continue |
| P1 | `frontend/src/components/layout/AdminLayout.tsx`, `frontend/src/components/layout/AdminSidebar.tsx` | UI: mobile reachability and compact desktop rail | Adapt layout hierarchy, not hotel branding | P1 / A | None | No reference user-data browser cache |
| P2 | `frontend/src/components/ui/AdvancedTable.tsx`, `frontend/src/components/ui/AdvancedSearchSelect.tsx`, `frontend/src/components/ui/AdvancedModal.tsx` | UI: explicit mode, keyboard/focus consistency | Adapt discriminated server mode and received-options selector | P0–1 / A | Server sort only if API supports it | Customers retain fixed alphabetical backend order; no unsupported sort |
| P3 | `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/Customers/CustomersPage.tsx`, `frontend/src/components/ui/WorkspacePrimitives.tsx` | UI: structured details/quick actions | Adapt drawer/full-screen sheet and factual metrics | P1 / A | Existing APIs | No booking/billing business domain or fabricated timeline |
| P4 | `frontend/src/pages/Appointments/AppointmentsPage.tsx`, `frontend/src/pages/Queue/QueuePage.tsx`, `frontend/src/pages/Inventory/InventoryPage.tsx` | UI: shared shell now; deep work layouts deferred | Adapt workflow-specific views in B/C | P2 / B–C | None in A | Preserve stock/Dues/HR and branch-time invariants |
| P5 | `frontend/src/components/ui/WorkspacePrimitives.tsx`, `frontend/src/components/ui/EmptyState.tsx` | UI: consistent pending/error/recovery | Adapt small semantic primitives and focus restoration | P1 / A | None | Do not weaken confirmations or expose sensitive failures |

## Quality benchmark (source observations, not aesthetic scores)

| Dimension | CRM | Biz Auth | Levalor frontend | EkaVio A direction |
| --- | --- | --- | --- | --- |
| Navigation clarity | Grouped work and admin | Strong admin/context separation | Department operational hierarchy | Nine presentation groups over unchanged authority catalogue |
| Page hierarchy | Rich but very large leads/detail | Clear steps; dense billing | Useful detail subsections | Compact header, sections, consistent margins |
| Mobile | Cards and drawer | Table-to-card transformation | Bottom operational actions | Persistent bottom navigation, More and full-screen forms |
| Dashboard | Registry/customizable | Draft save/discard | Operational tabs | Authorized facts, quick links and easy hide/order |
| Tables | External callbacks | Local-sort risk | External/local fallback risk | Explicit server/local discriminant; bounded pages |
| Forms | Inline validation | Recovery and dirty profile | Searchable selection | Stable labels/helpers, E.164 and typed dynamic fields |
| Search/filters | Rich server contracts | Server user search | Server filters plus local sorts | Debounced canonical search; one supported typed filter |
| Details | Activity/next actions | Membership-oriented modals | Timeline/sections | Customer contact/notes/custom fields and collapsed IDs |
| Empty/error | Next actions and toasts | Pending/retry feedback | Skeletons/confirmations | Honest skeleton/empty/error with actual retry |
| Settings | Grouped lazy panels | Header account controls | Department/profile menus | Existing Settings plus account sheet |
| Consistency | Semantic palette but effects | Multiple theme conventions | Mixed dependencies | One store and semantic compatibility tokens |
| Accessibility | Native semantics incomplete | Small action/heading risks | Trap/ID/sort risks | Native buttons, focus trap/return, labels and reduced motion |
| Complexity | Very large pages and integrations | Large all-in-one billing/header | Large dashboard/layout | No new UI framework, lazy routes and small primitives |

## Current EkaVio audit and daily journeys

Source authority: `frontend/src/App.tsx`, layout/ui/brand/analytics/forms,
`index.css`, stores/hooks/API, existing component/browser suites; backend
Customer schema/controller/repository and analytics dashboard projections.
CORE Customers/Services remain independent of Queue; optional modules require
commercial entitlement plus relevant permission. HR self-work remains separate
from broad workforce and Attendance authority. Operator destinations remain
independent of ordinary organization administration.

| Journey / actual current page | Existing capability | A change / later experience work |
| --- | --- | --- |
| Create Customer / `pages/Customers/CustomersPage.tsx` | Canonical create/edit, E.164, typed custom fields, RBAC | A exemplar: search/pages/cards/detail/sticky save/dirty warning |
| Appointment / `pages/Appointments/AppointmentsPage.tsx` | Branch-available service, branch-local datetime, idempotency/dynamic fields | A shared modal/server table; B scheduling/workflow polish |
| Queue / `pages/Queue/QueuePage.tsx` | Canonical token transitions, service/customer selection | A honest server paging; B touch-safe service workflow |
| Charge/payment / `pages/Ledger/LedgerPage.tsx` | Exact journal amounts, reversals and own branch | A shell only; B journal/details and confirmations |
| Receive stock / `pages/Inventory/InventoryPage.tsx` | Exact movement/balance projections | A shell/shared components; B stock action hierarchy |
| Lead/follow-up / `pages/CRM/CrmPage.tsx` | Leads, qualified stage movement, follow-ups and atomic customer conversion | A shell; C relationship detail/work views |
| Purchase order / `pages/Purchasing/PurchasingPage.tsx` | Supplier/items, frozen exact lines, partial/full receiving | A shell; C business-document and receiving UX |
| Request/approve leave / `pages/HR/HrPage.tsx` and `forms.tsx` | Self submission, authorized review, explicit branch calendars/schedules | A shell/form primitives; D privacy-aware workforce UX |

These journeys were reviewed, not reimplemented. Deep domain redesign is not
claimed. Unsupported upcoming-work/activity projections, arbitrary saved
filters, global Customer sorting, new reporting/notification events and new
business features need separate approval/contracts; they are not fabricated.

## Architectural trade-offs

Keep original code, existing Lucide icons, TanStack Query and lazy routes. No
reference dependency stack, Mongo authority, telephony/AI, messaging, OAuth,
payment gateway, analytics tracker, external font, or required SMTP is added.
Compatible semantic aliases let untouched domains continue to work, while
Dashboard/Customers establish the target. Server-table callbacks can express
sorting without claiming every backend implements it. Cancel/clear plus
unmounting protects context transitions at the cost of refetching authorized
data. Only harmless page size and compact-navigation preferences persist; names,
phones and custom filter values remain ephemeral. A is a foundation, not seven
final domain redesigns or hosted/pilot acceptance.
