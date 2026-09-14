# V2-04 Pre-Implementation Commercial Inventory

- Audit baseline: `e86c2085b62529033aa682f4325a9d0d98566c46`
- Scope: executable module, subscription, billing, and frontend guard behavior before V2-04 edits

## Module identifiers

| Identifier | Current use | V2-04 classification |
| --- | --- | --- |
| `queue` | Backend gate, registration default, frontend guard/menu/dashboard/billing, tests, corporate mock data | Canonical operational module |
| `inventory` | Backend gate, frontend guard/menu/dashboard/billing, corporate mock data | Canonical operational module |
| `attendance` | Backend gate, frontend guard/menu/dashboard/billing, corporate mock data | Canonical operational module |
| `ledger` | Frontend route guard/menu/billing | Canonical operational module |
| `khata` | Backend ledger gate and API documentation | Legacy alias; migration compatibility only after V2-04 |
| `digital-khata` | Dashboard local subscription key and mobile navigation query | Legacy alias; migration compatibility only after V2-04 |
| `chat` | Frontend route guard/menu/billing catalogue | Nonfunctional/deferred; must not be sellable or entitlement-gated |

## Backend module gates

- `backend/src/routes/queueRoutes.ts`: `requireModule('queue')`.
- `backend/src/routes/inventoryRoutes.ts`: `requireModule('inventory')`.
- `backend/src/routes/ledgerRoutes.ts`: `requireModule('khata')`.
- `backend/src/routes/attendanceRoutes.ts`: `requireModule('attendance')`.
- `backend/src/middlewares/tenantMiddleware.ts`: loads `Organization`, requires legacy `subscriptionStatus === 'active'`, and checks `Organization.activeModules`.

## Frontend module guards

- `frontend/src/App.tsx`: string-based `ModuleGuard` checks `user.activeModules`; guards `ledger`, `attendance`, `queue`, `inventory`, and nonfunctional `chat`.
- `frontend/src/components/layout/AdminSidebar.tsx`: filters module menu items through `user.activeModules` for `inventory`, `queue`, `ledger`, `attendance`, and `chat`.
- `frontend/src/components/layout/AppLayout.tsx`: uses the legacy `digital-khata` query identifier in mobile navigation.

## `activeModules` reads and writes

- Schema/deprecated source: `backend/src/models/Organization.ts`.
- Runtime authorization reads: `backend/src/middlewares/tenantMiddleware.ts`.
- Auth/context reads and response hydration: `backend/src/services/authService.ts`.
- Registration write (`queue`): `backend/src/services/authService.ts`.
- Corporate fabricated cost/count calculation: `backend/src/controllers/corporateController.ts`.
- Auth-session fixture compatibility: `backend/tests/authSession.test.ts`.
- Frontend session types/hydration: `frontend/src/store/useAppStore.ts`.
- Frontend access/menu reads: `frontend/src/App.tsx`, `frontend/src/components/layout/AdminSidebar.tsx`.
- Frontend billing display read: `frontend/src/pages/Billing/BillingPage.tsx`.
- Corporate fallback/type/table data: `frontend/src/pages/Corporate/CorporateDashboard.tsx`.
- Historical compatibility documentation: `README.md`, ADRs 0003/0004, and the V2-00 baseline.

## Subscription and billing prototypes

- `backend/src/models/Organization.ts`: legacy `subscriptionStatus`, `billingCycle`, and `nextBillingDate` fields.
- `backend/src/cron/subscriptionCron.ts`: unused cron mutates legacy `Organization.subscriptionStatus` after `nextBillingDate`.
- `backend/src/controllers/billingController.ts`: returns fabricated Pro Tier invoices and creates random `order_*` payment IDs with hard-coded amounts.
- `backend/src/routes/billingRoutes.ts`: exposes `/billing/invoices` and `/billing/create-order` for those mocks.
- `frontend/src/pages/Dashboard.tsx`: owns local `subscribedModules`, toggles access in React state, displays unvalidated prices, and claims subscription success.
- `frontend/src/pages/Billing/BillingPage.tsx`: displays fake Basic/Pro/Enterprise plans, a fabricated next-billing date and invoice history, hard-coded module prices, and a fake payment-gateway redirect flow.
- `frontend/src/pages/Corporate/CorporateDashboard.tsx`: falls back to fabricated organization subscription/module data.

## Current subscription-status dependencies

- `backend/src/middlewares/tenantMiddleware.ts` uses `Organization.subscriptionStatus` as runtime commercial authority.
- `backend/src/cron/subscriptionCron.ts` queries and mutates `Organization.subscriptionStatus` based on legacy `nextBillingDate`.
- `backend/src/models/Organization.ts` defines the legacy status, cycle, and date.
- `frontend/src/pages/Billing/BillingPage.tsx` invents plan status/date independently instead of consuming a backend subscription record.
