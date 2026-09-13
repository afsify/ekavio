# V2-00 Repository Baseline

- Baseline date: 2026-09-13
- Branch: `chore/v2-00-baseline`
- Commit inspected: `39f2f6bb7a0368b0baea70b25a2828e163600fe4`
- Scope: inspection and documentation only

The repository on disk is the source of truth for this record. No runtime, configuration, dependency, lockfile, Docker, API, schema, or application behavior change is part of V2-00.

## A. Repository tree

Meaningful tracked files are shown below. Generated dependency and build directories are omitted.

```text
.
|-- .github/
|   `-- workflows/ci.yml
|-- backend/
|   |-- .env.sample
|   |-- Dockerfile
|   |-- package.json
|   |-- package-lock.json
|   |-- tsconfig.json
|   |-- scripts/install_security.sh
|   `-- src/
|       |-- server.ts
|       |-- config/{db,socket,swagger}.ts
|       |-- controllers/
|       |   |-- analyticsController.ts
|       |   |-- attendanceController.ts
|       |   |-- authController.ts
|       |   |-- billingController.ts
|       |   |-- corporateController.ts
|       |   |-- inventoryController.ts
|       |   |-- ledgerController.ts
|       |   |-- profileController.ts
|       |   |-- queueController.ts
|       |   `-- staffController.ts
|       |-- cron/subscriptionCron.ts
|       |-- middlewares/{activityLogger,authMiddleware,tenantMiddleware,validateRequest}.ts
|       |-- models/{ActivityLog,Attendance,Inventory,Ledger,Message,Notification,Organization,ParentOrganization,Queue,User}.ts
|       |-- routes/{analyticsRoutes,attendanceRoutes,authRoutes,billingRoutes,corporateRoutes,index,inventoryRoutes,ledgerRoutes,profileRoutes,queueRoutes,staffRoutes}.ts
|       |-- schemas/{attendanceSchemas,authSchemas,inventorySchemas,ledgerSchemas,queueSchemas}.ts
|       |-- services/{authService,inventoryService,queueService}.ts
|       `-- utils/{AppError,s3Uploader}.ts
|-- frontend/
|   |-- Dockerfile
|   |-- index.html
|   |-- package.json
|   |-- package-lock.json
|   |-- eslint.config.js
|   |-- tailwind.config.js
|   |-- tsconfig.json
|   |-- tsconfig.app.json
|   |-- tsconfig.node.json
|   |-- vite.config.ts
|   |-- public/{favicon.svg,icons.svg}
|   `-- src/
|       |-- App.tsx
|       |-- main.tsx
|       |-- api/{axiosClient,client}.ts
|       |-- components/layout/{AdminLayout,AdminSidebar,AppLayout,DetailViewLayout,NotificationBell,PublicLayout,TenantSwitcher}.tsx
|       |-- components/ui/{AdvancedModal,AdvancedSearchSelect,AdvancedTable,Button,Card,Input,Modal,ProfileSettingsModal}.tsx
|       |-- hooks/{useApi,useAuth,useInventory,useQueue}.ts
|       |-- pages/{Attendance,Billing,Chat,Corporate,Inventory,Landing,Ledger,Queue,Settings,Staff}/...
|       |-- pages/{Dashboard,Login}.tsx
|       |-- store/{useAppStore,useAuthStore,useSocketStore}.ts
|       `-- utils/exportUtils.ts
|-- docker-compose.yml
|-- .gitignore
|-- PROJECT_CONTEXT.md                 # V2-00
`-- docs/
    |-- adr/{0001-modular-monolith,0002-low-variable-cost-integrations}.md  # V2-00
    `-- reviews/V2-00_BASELINE.md       # V2-00
```

## B. Current architecture

### Frontend

- React 19, Vite 8, and TypeScript single-page application.
- `vite-plugin-pwa` supplies a PWA manifest with auto-update registration; the UI is responsive/mobile-oriented.
- TanStack Query manages server-state requests.
- Zustand with persistence manages user, token, active-tenant, theme, and socket-related client state.
- Axios provides the HTTP client and token-refresh interceptor.
- Socket.IO Client provides the real-time client connection.
- React Router defines public and protected routes. Module guards and sidebar filtering are client-side presentation controls, not authorization boundaries.

### Backend

- Node.js/TypeScript Express 5 application.
- Mongoose with MongoDB is the current persistence implementation.
- The code is organized into routes, controllers, services, models, schemas, middleware, configuration, utilities, and a cron directory.
- The services layer is currently used by authentication, inventory, and queue; several other controllers access Mongoose models directly.
- JWT bearer authentication, tenant context, and module-entitlement middleware exist. Their current gaps are recorded below.
- Socket.IO authenticates a token and joins a tenant room. A generic emit helper exists, but application operations do not call it.

### Deployment

- Docker Compose defines MongoDB, backend, and frontend services.
- The frontend uses a multi-stage Node/nginx image.
- The backend Docker image installs the source and attempts `npm start`; the required script and production build pipeline are absent.
- PostgreSQL is a target direction only. It is not present in this baseline and no migration is performed in V2-00.

## C. Current implemented-state matrix

`IMPLEMENTED` means the current repository contains a connected basic workflow. `PARTIAL` means important layers or contracts exist but the end-to-end capability is incomplete. `MOCK` means the visible workflow materially relies on in-memory/static fallback data or fake commercial behavior. `ABSENT` means no operational implementation was found.

| Capability | State | Repository evidence and limits |
|---|---|---|
| Authentication | PARTIAL | Register, login, refresh, JWT middleware, and client persistence exist (`backend/src/routes/authRoutes.ts`, `backend/src/services/authService.ts`, `backend/src/middlewares/authMiddleware.ts`, `frontend/src/store/useAppStore.ts`). Secret fallbacks, localStorage tokens, and no revocation/logout endpoint prevent a complete secure implementation. |
| Tenant switching | PARTIAL | Assignment-aware middleware and an `x-tenant-id` client header exist (`backend/src/middlewares/authMiddleware.ts`, `frontend/src/components/layout/TenantSwitcher.tsx`, `frontend/src/api/client.ts`), but login does not return assignments, so a normal login cannot hydrate the switcher. |
| Queue | PARTIAL | Tenant-scoped Mongoose CRUD and a connected page exist (`backend/src/routes/queueRoutes.ts`, `backend/src/services/queueService.ts`, `frontend/src/pages/Queue/QueuePage.tsx`). A duplicate hook uses the wrong HTTP verb and no backend queue socket event is emitted. |
| Inventory | PARTIAL | Tenant-scoped create/list/low-stock backend and connected inventory page exist (`backend/src/routes/inventoryRoutes.ts`, `backend/src/services/inventoryService.ts`, `frontend/src/pages/Inventory/InventoryPage.tsx`). The dedicated low-stock hook calls a nonexistent path and stock movements/adjustments are not modeled. |
| Ledger | PARTIAL | Tenant-scoped ledger endpoints and model exist (`backend/src/routes/ledgerRoutes.ts`, `backend/src/models/Ledger.ts`), but the frontend page is in-memory mock state and its identifiers/types disagree with the backend. |
| Attendance | PARTIAL | Tenant-scoped backend endpoints/model exist (`backend/src/routes/attendanceRoutes.ts`, `backend/src/controllers/attendanceController.ts`), but the frontend page uses static local data and the write endpoint does not prove user membership in the tenant. |
| Staff | IMPLEMENTED | A basic tenant-scoped list/add/delete workflow is connected, with admin checks for mutations (`backend/src/routes/staffRoutes.ts`, `backend/src/controllers/staffController.ts`, `frontend/src/pages/Staff/StaffManagementPage.tsx`). This does not imply complete RBAC. |
| Subscription billing | MOCK | Organization subscription fields and a cron module exist, but the cron is not initialized; invoice and payment-order responses are explicitly fake (`backend/src/models/Organization.ts`, `backend/src/cron/subscriptionCron.ts`, `backend/src/controllers/billingController.ts`, `frontend/src/pages/Billing/BillingPage.tsx`). |
| Customer invoice/POS billing | ABSENT | No customer invoice, sale, POS, line-item, tax, or receipt model/route/page was found. The existing `/billing` area is SaaS subscription billing (`backend/src/routes/billingRoutes.ts`). |
| Corporate/multi-branch | PARTIAL | Parent organization creation/linking/consolidated module-cost calculation exists, but authorization and frontend contract gaps remain and the UI falls back to fake branches (`backend/src/controllers/corporateController.ts`, `frontend/src/pages/Corporate/CorporateDashboard.tsx`). |
| Notifications | MOCK | A Mongoose model and client UI/socket listener exist, but no notification routes are mounted and no producer emits the event (`backend/src/models/Notification.ts`, `backend/src/routes/index.ts`, `frontend/src/components/layout/NotificationBell.tsx`). |
| Chat | MOCK | A message model and a mock/fallback chat UI exist, but no chat routes or server socket message handlers exist (`backend/src/models/Message.ts`, `backend/src/routes/index.ts`, `backend/src/config/socket.ts`, `frontend/src/pages/Chat/ChatPage.tsx`). |
| Appointments | ABSENT | No appointment model, route, controller, service, hook, or page was found. |
| Customer master | ABSENT | Customer details are duplicated inside queue and ledger records; no customer entity or master workflow exists (`backend/src/models/Queue.ts`, `backend/src/models/Ledger.ts`). |
| Branches | ABSENT | Parent/child organizations exist, but there is no branch entity or operational branch master; visible branch data is mock (`backend/src/models/Organization.ts`, `backend/src/models/ParentOrganization.ts`, `frontend/src/pages/Corporate/CorporateDashboard.tsx`). |
| Purchase/supplier | ABSENT | No purchase or supplier model, route, controller, service, hook, or page was found. Marketing copy is not an implementation (`frontend/src/pages/Landing/FeaturesSection.tsx`). |
| Backups | ABSENT | No database backup/restore workflow, volume, or backup job exists (`docker-compose.yml`). |
| Tests | ABSENT | No repository test/spec files were found; backend `npm test` deliberately exits 1 and the frontend has no test script (`backend/package.json`, `frontend/package.json`). |
| CI | PARTIAL | A tracked GitHub Actions workflow typechecks backend and frontend (`.github/workflows/ci.yml`), but it uses `npm install` and runs no lint, tests, production build, or Docker validation. |
| Health/readiness | ABSENT | The backend has only a plain root response; no dependency-aware health/readiness endpoints or Compose healthchecks exist (`backend/src/server.ts`, `docker-compose.yml`). |

## D-E. Known blocker register with exact source references

### P0 blockers (17)

| # | Blocker | Exact source-file references | Evidence |
|---:|---|---|---|
| P0-01 | Backend Dockerfile runs `npm start`, but the backend has no `start` script. | `backend/Dockerfile`; `backend/package.json` | Image command and declared scripts disagree. |
| P0-02 | Backend has no production build script. | `backend/package.json`; `backend/tsconfig.json` | Only `test` and `dev` scripts are declared. |
| P0-03 | Backend `npm test` intentionally exits 1. | `backend/package.json` | Script prints `Error: no test specified` and exits 1. |
| P0-04 | JWT and refresh-token fallback secrets are embedded in runtime code. | `backend/src/services/authService.ts`; `backend/src/middlewares/authMiddleware.ts`; `backend/src/config/socket.ts` | Signing and verification continue with predictable defaults when environment variables are absent. The fallback strings are also inconsistent across components. |
| P0-05 | HTTP CORS is unrestricted. | `backend/src/server.ts` | `app.use(cors())` supplies no origin allowlist. |
| P0-06 | Socket.IO origin is `*`. | `backend/src/config/socket.ts` | Socket server explicitly accepts wildcard origin. |
| P0-07 | Access and refresh tokens are stored in `localStorage`. | `frontend/src/store/useAppStore.ts`; `frontend/src/api/client.ts` | Login, refresh, rehydration, and request handling read/write browser storage. |
| P0-08 | There is no server-side logout or session revocation. | `backend/src/routes/authRoutes.ts`; `backend/src/services/authService.ts`; `frontend/src/store/useAppStore.ts` | Auth routes expose register/login/theme/refresh only; client logout only deletes local state. |
| P0-09 | The active AdminSidebar sign-out link does not clear the session. | `frontend/src/components/layout/AdminSidebar.tsx`; `frontend/src/store/useAppStore.ts` | The link navigates to `/login` without calling the available `logout()` action. |
| P0-10 | Login searches for a user by phone globally while database uniqueness is `tenantId + phone`. | `backend/src/services/authService.ts`; `backend/src/models/User.ts` | `findOne({ phone })` is ambiguous when the same phone is valid in multiple tenants. |
| P0-11 | Login does not hydrate assignments or `activeModules` expected by the frontend. | `backend/src/services/authService.ts`; `frontend/src/hooks/useAuth.ts`; `frontend/src/store/useAppStore.ts`; `frontend/src/components/layout/TenantSwitcher.tsx`; `frontend/src/App.tsx` | The returned user omits both fields, producing an empty module list and no tenant-switch choices. |
| P0-12 | Frontend HTTP API base URL is hard-coded. | `frontend/src/api/client.ts` | Axios always targets `http://localhost:5000/api`; unlike the socket URL, it does not use an environment variable. |
| P0-13 | Attendance accepts arbitrary `userId` without proving tenant membership. | `backend/src/controllers/attendanceController.ts`; `backend/src/models/Attendance.ts`; `backend/src/models/User.ts` | The upsert is scoped by attendance `tenantId` but never verifies that the referenced user belongs to that tenant. |
| P0-14 | Corporate child linking does not prove that the caller controls the child organization. | `backend/src/controllers/corporateController.ts`; `backend/src/models/Organization.ts`; `backend/src/models/ParentOrganization.ts` | Parent ownership is checked; `childOrgId` is then updated without a child-ownership or assignment check. |
| P0-15 | A tenant `admin` role is usable as a cross-organization consolidated-billing override. | `backend/src/controllers/corporateController.ts`; `backend/src/middlewares/authMiddleware.ts`; `backend/src/models/User.ts` | Any authenticated request whose current tenant role is `admin` bypasses parent ownership for `/billing/:parentId`. |
| P0-16 | Mongo Compose uses `latest`, exposes the database publicly, and has no volume, authentication, or backup. | `docker-compose.yml` | The Mongo service is unpinned, publishes `27017`, and declares no credentials, persistent volume, or backup service. |
| P0-17 | Mock operational and commercial screens are present. | `frontend/src/pages/Attendance/AttendancePage.tsx`; `frontend/src/pages/Ledger/LedgerPage.tsx`; `frontend/src/pages/Corporate/CorporateDashboard.tsx`; `frontend/src/pages/Chat/ChatPage.tsx`; `frontend/src/pages/Billing/BillingPage.tsx`; `backend/src/controllers/billingController.ts` | Attendance/ledger use local mock data; corporate/chat use fallbacks; subscription invoices/orders are fake. |

### P1 blockers (15)

| # | Blocker | Exact source-file references | Evidence |
|---:|---|---|---|
| P1-01 | Queue frontend hook uses PUT while backend uses PATCH. | `frontend/src/hooks/useQueue.ts`; `backend/src/routes/queueRoutes.ts` | The separate hook calls `PUT /queue/:id/status`; the route accepts PATCH. The active Queue page itself uses PATCH. |
| P1-02 | Inventory low-stock hook path does not match the backend. | `frontend/src/hooks/useInventory.ts`; `backend/src/routes/inventoryRoutes.ts` | Client calls `/inventory/alerts/low-stock`; server exposes `/inventory/low-stock`. |
| P1-03 | Ledger identifiers `khata`, `ledger`, and `digital-khata` disagree. | `backend/src/routes/ledgerRoutes.ts`; `frontend/src/App.tsx`; `frontend/src/components/layout/AdminSidebar.tsx`; `frontend/src/pages/Ledger/LedgerPage.tsx` | Backend entitlement is `khata`, frontend guard/menu use `ledger`, and the UI labels the feature Digital Khata. |
| P1-04 | Ledger frontend `debit` disagrees with backend `payment`. | `frontend/src/pages/Ledger/LedgerPage.tsx`; `backend/src/models/Ledger.ts`; `backend/src/schemas/ledgerSchemas.ts`; `backend/src/routes/ledgerRoutes.ts` | The contracts accept different transaction enums. |
| P1-05 | Attendance frontend uses mock state instead of the backend. | `frontend/src/pages/Attendance/AttendancePage.tsx`; `backend/src/routes/attendanceRoutes.ts` | The page imports no API client and only mutates `mockStaffData`. |
| P1-06 | Ledger frontend uses mock state instead of the backend. | `frontend/src/pages/Ledger/LedgerPage.tsx`; `backend/src/routes/ledgerRoutes.ts` | The page imports no API client and creates entries only in component state. |
| P1-07 | Corporate frontend API/response contract disagrees with backend and falls back to mocks. | `frontend/src/pages/Corporate/CorporateDashboard.tsx`; `backend/src/routes/corporateRoutes.ts`; `backend/src/controllers/corporateController.ts` | The UI requests a literal `defaultParent` and expects revenue/staff/branch fields absent from the backend response. |
| P1-08 | Notifications frontend references missing backend routes. | `frontend/src/components/layout/NotificationBell.tsx`; `backend/src/routes/index.ts`; `backend/src/models/Notification.ts` | GET and PATCH notification calls have no mounted router. |
| P1-09 | Chat frontend references missing backend routes and events. | `frontend/src/pages/Chat/ChatPage.tsx`; `backend/src/routes/index.ts`; `backend/src/config/socket.ts`; `backend/src/models/Message.ts` | `/chat` routes and `send_message`/`receive_message` server handlers are absent. |
| P1-10 | Queue and notification socket events are not emitted by backend operations. | `backend/src/config/socket.ts`; `backend/src/controllers/queueController.ts`; `backend/src/services/queueService.ts`; `frontend/src/pages/Queue/QueuePage.tsx`; `frontend/src/store/useSocketStore.ts` | An exported generic helper exists, but no backend caller emits `queue_updated` or `new_notification`. |
| P1-11 | There is no branch entity. | `backend/src/models/Organization.ts`; `backend/src/models/ParentOrganization.ts`; `frontend/src/pages/Corporate/CorporateDashboard.tsx` | Parent linkage is not an operational branch model; UI branch records are fallback data. |
| P1-12 | There are no API contract tests. | `backend/package.json`; `frontend/package.json`; `.github/workflows/ci.yml` | No test files/framework script or CI test step exists. |
| P1-13 | There are no tenant-isolation tests. | `backend/package.json`; `backend/src/middlewares/authMiddleware.ts`; `backend/src/middlewares/tenantMiddleware.ts`; `.github/workflows/ci.yml` | Tenant behavior exists without automated isolation coverage. |
| P1-14 | CI is incomplete. | `.github/workflows/ci.yml`; `backend/package.json`; `frontend/package.json` | The brief's requested “no CI” finding conflicts with disk: a workflow exists. The actual blocker is that it uses `npm install`, only typechecks, and omits lint, tests, production builds, and Docker validation. |
| P1-15 | There are no real health/readiness endpoints. | `backend/src/server.ts`; `docker-compose.yml` | `/` returns a static string and Compose has no healthchecks; neither verifies MongoDB or application readiness. |

## Prompt-to-repository discrepancies

The V2-00 request listed “no CI” as a required P1 finding. At the inspected commit, `.github/workflows/ci.yml` is tracked. This baseline therefore records CI as `PARTIAL` and P1-14 as incomplete CI rather than incorrectly claiming total absence. The workflow's presence does not resolve the risk: it does not run tests, lint, production builds, or Docker validation.

## F. Baseline validation

Commands were run on Windows PowerShell from the indicated directory. PowerShell policy blocks the `npm.ps1` shim. The literal `npm --version` attempt is recorded, and subsequent npm/npx validations used the equivalent `npm.cmd`/`npx.cmd` executables without changing machine or repository policy.

### Initial environment and repository

| Command | Exit | Result | Relevant output |
|---|---:|---|---|
| `git status --short` | 0 | PASS | No output; worktree was clean before V2-00 documentation. |
| `git rev-parse --show-toplevel` | 0 | PASS | `C:/Projects/Ekavio` |
| `git rev-parse HEAD` | 0 | PASS | `39f2f6bb7a0368b0baea70b25a2828e163600fe4` |
| `node --version` | 0 | PASS | `v24.16.0` |
| `npm --version` | 1 | FAIL | PowerShell refused to load `C:\Program Files\nodejs\npm.ps1` because script execution is disabled. npm itself did not start. |
| `npm.cmd --version` | 0 | PASS | Windows executable fallback: `11.13.0`. |

### Backend (`backend/`)

| Command | Exit | Result | Relevant output |
|---|---:|---|---|
| `npm ci` (executed as `npm.cmd ci`) | 0 | PASS | Added 224 packages; emitted a deprecated `glob@11.1.0` warning. No tracked lockfile change. |
| `npm test` (executed as `npm.cmd test`) | 1 | FAIL | `Error: no test specified`; the package script deliberately exits 1. |
| `npx tsc --noEmit` (executed as `npx.cmd tsc --noEmit`) | 0 | PASS | No diagnostics. |
| Backend lint | - | NOT RUN | No backend lint script exists; none was invented. |
| Backend production build | - | NOT RUN | No backend build script exists; none was invented. |

### Frontend (`frontend/`)

| Command | Exit | Result | Relevant output |
|---|---:|---|---|
| `npm ci` (executed as `npm.cmd ci`) | 0 | PASS | Added 504 packages; emitted a deprecated `glob@11.1.0` warning. No tracked lockfile change. |
| `npm run lint` (executed as `npm.cmd run lint`) | 1 | FAIL | ESLint reported 48 errors and 0 warnings. Main groups: explicit `any`, unused values, component-only-export rules, effect state update, and render-purity violations. |
| `npm run build` (executed as `npm.cmd run build`) | 1 | FAIL | TypeScript failed before Vite bundling: unused imports/variables, unsupported Zod `invalid_type_error` options, and missing `BookOpenCheck` in `LedgerPage.tsx`. |

### Repository

| Command | Exit | Result | Relevant output |
|---|---:|---|---|
| `docker compose config` | 0 | PASS | Compose rendered MongoDB, backend, and frontend services. Docker warned that `C:\Users\DELL\.docker\config.json` was inaccessible; configuration rendering still completed. |

### Final documentation-only checks

| Command | Exit | Result | Relevant output |
|---|---:|---|---|
| `git status --short` | 0 | PASS | Shows only the four V2-00 Markdown files as new documentation. |
| `git diff --check` | 0 | PASS | No whitespace errors; Git emitted LF-to-CRLF working-copy warnings for existing and new paths. |
| `git diff --stat` | 0 | PASS | Four documentation files, 307 insertions at the time of the check; no other file appeared. |
| `git diff` | 0 | PASS | Documentation-only patch; no runtime, configuration, dependency, lockfile, Docker, or application source changes. Git emitted the same line-ending warnings. |

## Remaining baseline risks

- Authentication/session handling and cross-tenant authorization contain P0 security risks.
- Module-entitlement naming and login hydration can make valid modules inaccessible or tempt reliance on frontend visibility.
- Operational screens that silently use mock data can misrepresent persisted state.
- Money, stock, tenant isolation, and API contracts have no automated regression protection.
- The current backend image cannot start through its declared Docker command, and the frontend production build fails.
- MongoDB deployment has data-durability, exposure, authentication, versioning, and backup risks.
- Existing CI is insufficient to enforce a releasable baseline.

No failures were fixed in V2-00.
