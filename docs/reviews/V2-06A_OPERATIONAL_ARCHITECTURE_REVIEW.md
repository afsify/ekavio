# V2-06A Operational Domain Architecture Review

- Status: Complete
- Date: 2026-09-17
- Starting commit: 4a878eb39348e0c50265b85cbcd27963af66293a
- Scope: architecture and target design only; no runtime, schema, API, or migration change

## 1. Executive conclusion

EkaVio should not copy the remaining operational Mongo documents one-for-one into PostgreSQL. The current documents are useful prototypes, but Queue, Inventory, Ledger, and Attendance omit branch keys, durable history, concurrency controls, and relational identities needed for production. PostgreSQL should receive redesigned bounded contexts, migrated with explicit transforms and reconciliation.

The next implementation milestone should be **V2-06B Customer, Service, Appointment & Queue PostgreSQL Vertical**. Customer and Service are required before Queue can stop duplicating names, phone numbers, and free-form service labels. Appointments and Queue remain separate concepts but should be delivered in one authority cutover so EkaVio does not create another temporary cross-database operational identity layer.

After that vertical, Attendance, Customer Dues, Inventory, and finally corporate/audit cleanup should move in independent milestones. Message and Notification are unused prototype models and should be retired, not migrated. MongoDB can leave the production stack only after the final corporate/audit cutover and an accepted retention/rollback window.

## 2. Review basis and current runtime map

The repository at the starting commit is the source of truth. The review covered all Mongoose models; operational controllers, services, schemas, routes, and persistence adapters; the active frontend pages and dormant hooks; Socket.IO; analytics; and relevant unit/integration tests.

| Concern | Runtime authority | Important paths | Finding |
|---|---|---|---|
| Identity, organizations, branches, memberships, sessions, authorization | PostgreSQL | backend/src/postgres; backend/src/services/requestContextService.ts | Canonical UUID context is established. |
| Commercial catalogue, subscriptions, overrides, entitlements, limits | PostgreSQL | backend/src/postgres/commercialRepository.ts; backend/src/services/entitlementService.ts | Commercial gates run before operational handlers. |
| Queue | MongoDB | backend/src/models/Queue.ts; backend/src/services/queueService.ts; backend/src/controllers/queueController.ts | Organization-scoped prototype; no branch, customer, service, session, concurrency, or history. |
| Inventory | MongoDB | backend/src/models/Inventory.ts; backend/src/services/inventoryService.ts | Mutable balance and floating-point price; no location or movement history. |
| Ledger | MongoDB | backend/src/models/Ledger.ts; backend/src/controllers/ledgerController.ts | Actually a customer-dues journal, but duplicates customer identity and uses floating-point money. |
| Attendance records | MongoDB | backend/src/models/Attendance.ts; backend/src/persistence/mongoAttendance.ts; backend/src/services/attendanceService.ts | Identity validation is PostgreSQL-backed; storage remains organization-only Mongo data. |
| Corporate parent linkage | MongoDB at runtime | backend/src/models/ParentOrganization.ts; backend/src/models/Organization.ts; backend/src/controllers/corporateController.ts | Equivalent PostgreSQL parent/link columns already exist but are not runtime authority. |
| Security audit | MongoDB | backend/src/models/ActivityLog.ts; backend/src/services/securityAuditService.ts | Safe recorder is allowlisted; existing PostgreSQL audit_events is schema-only. |
| Dashboard operational counts | MongoDB | backend/src/controllers/analyticsController.ts | Organization-wide Queue, Inventory, and Attendance queries; no branch filter. |
| Realtime authorization | PostgreSQL context, no domain producer | backend/src/config/socket.ts | Canonical organization/branch rooms exist; Queue emits no events. |

There is no automatic fallback or operational dual-write. Operational access translates canonical PostgreSQL organization/user identity to legacy Mongo IDs through the validated bridge. That bridge is a migration compatibility boundary, not a target architecture.

### 2.1 Evidence paths inspected

| Domain | Backend | Frontend / tests |
|---|---|---|
| Queue | backend/src/models/Queue.ts; backend/src/services/queueService.ts; backend/src/controllers/queueController.ts; backend/src/routes/queueRoutes.ts; backend/src/schemas/queueSchemas.ts | frontend/src/pages/Queue/QueuePage.tsx; frontend/src/hooks/useQueue.ts; backend/tests/authorizationTenancy.test.ts; backend/tests/identityCutover.integration.ts |
| Inventory | backend/src/models/Inventory.ts; backend/src/services/inventoryService.ts; backend/src/controllers/inventoryController.ts; backend/src/routes/inventoryRoutes.ts; backend/src/schemas/inventorySchemas.ts | frontend/src/pages/Inventory/InventoryPage.tsx; frontend/src/hooks/useInventory.ts; backend/tests/authorizationTenancy.test.ts; backend/tests/identityCutover.integration.ts |
| Ledger / Dues | backend/src/models/Ledger.ts; backend/src/controllers/ledgerController.ts; backend/src/routes/ledgerRoutes.ts; backend/src/schemas/ledgerSchemas.ts | frontend/src/pages/Ledger/LedgerPage.tsx; backend/tests/authorizationTenancy.test.ts; backend/tests/identityCutover.integration.ts |
| Attendance | backend/src/models/Attendance.ts; backend/src/persistence/mongoAttendance.ts; backend/src/postgres/attendanceIdentityResolver.ts; backend/src/services/attendanceService.ts; backend/src/controllers/attendanceController.ts; backend/src/routes/attendanceRoutes.ts | frontend/src/pages/Attendance/AttendancePage.tsx; backend/tests/authorizationTenancy.test.ts; backend/tests/persistenceParity.integration.ts; backend/tests/postgres.integration.ts; backend/tests/identityCutover.integration.ts |
| Corporate / audit | backend/src/models/ParentOrganization.ts; backend/src/models/Organization.ts; backend/src/controllers/corporateController.ts; backend/src/services/corporateAuthorizationService.ts; backend/src/models/ActivityLog.ts; backend/src/services/securityAuditService.ts | frontend/src/pages/Corporate/CorporateDashboard.tsx; backend/tests/authorizationTenancy.test.ts; backend/tests/identityCutover.integration.ts |
| Analytics / realtime | backend/src/controllers/analyticsController.ts; backend/src/routes/analyticsRoutes.ts; backend/src/config/socket.ts | frontend/src/pages/Dashboard.tsx; frontend/src/store/useSocketStore.ts |
| Unsupported prototypes | backend/src/models/Message.ts; backend/src/models/Notification.ts; backend/src/routes/index.ts | frontend/src/pages/Chat/ChatPage.tsx; frontend/src/components/layout/NotificationBell.tsx; frontend/src/App.tsx; frontend/src/components/layout/AdminSidebar.tsx |

## 3. Complete Mongoose inventory

Classification: **A** preserve and migrate; **B** redesign before migration; **C** replace with a better domain; **D** defer/compatibility only; **E** retire.

### 3.1 Active operational models

| Model | Actual shape and indexes | Scope, lifecycle, numbers | Runtime dependencies | Classification |
|---|---|---|---|---|
| Queue | tenantId indexed; tokenNumber; customerName; phone; serviceType; status waiting/serving/completed/cancelled; timestamps. No unique compound index. | Organization only; fully mutable status; token is a string; no money/quantity. | POST/GET /queue and PATCH /queue/:tokenId/status; queue entitlement; queue.read/manage; Dashboard counts; active Queue page; identity-cutover and tenant tests. No producer uses Socket.IO. | **B** redesign into customers, services, queue_sessions, queue_tokens, and queue_status_events. |
| Inventory | tenantId indexed; itemName; currentStock Number default 0; lowStockThreshold Number default 5; price Number; timestamps. No uniqueness. | Organization only; stock and price are mutable floating-point Numbers; no unit or precision rule. | POST/GET /inventory and GET /inventory/low-stock; inventory entitlement; inventory.read/manage; Dashboard low-stock count; active Inventory page; scope integration coverage only. | **C** replace with item catalogue, branch locations, movements, and consistent balances. |
| Ledger | tenantId indexed; customerName; phone; amount Number; type credit/payment; optional description; timestamps. | Organization only; entries can be mutable documents; floating-point money; no customer or creator reference. | POST/GET /ledger; ledger entitlement; ledger.read/manage; backend not consumed by active UI; scope integration coverage only. | **C** replace with Customer Dues entries and reversal-oriented corrections. |
| Attendance | tenantId indexed; userId indexed; date; status present/absent/half-day; timestamps; tenant/date index; unique tenant/user/date. | Organization only; one mutable status per user/day; no branch, time, source, actor, or reason. | POST/GET /attendance; attendance entitlement; attendance.read/manage; PostgreSQL identity resolver; Dashboard present count; active UI is mock; unit/parity/cutover identity tests. | **B** redesign around canonical membership, branch, date/time fields, and correction history. |
| ParentOrganization | name; ownerId indexed; consolidatedBilling default true; timestamps. | Global parent object with owner; mutable. | POST /corporate/parent, POST /corporate/link, GET /corporate/billing/:parentId; corporate.manage/billing.read. | **A** preserve concept and cut runtime to the already-created PostgreSQL parent_organizations table after reconciliation. |
| Organization | name; parentId indexed; type; deprecated billingCycle/subscriptionStatus/nextBillingDate/activeModules; theme; timestamps. | Legacy organization record. Identity/commercial fields are no longer authority; parent link is still used by corporate runtime. | Corporate link/lookup and migration/recovery adapters. New PostgreSQL-created organizations need not have a Mongo mirror. | **A** migrate the remaining parent relationship; **D** retain the rest only for migration/recovery until retirement. |
| ActivityLog | tenantId, userId, action each indexed; Mixed details; optional ipAddress; timestamps. | Organization-scoped append-like records but the schema permits mutation and arbitrary payloads. | securityAuditService writes allowlisted events and scalar metadata; identity cutover test. activityLogger middleware is not mounted. | **B** transform reviewed events into existing PostgreSQL audit_events; quarantine unsafe legacy shapes. |

### 3.2 Unused operational prototypes

| Model | Actual shape and indexes | Runtime evidence | Classification |
|---|---|---|---|
| Message | tenantId indexed; senderId indexed; content; timestamps. No recipient, conversation, branch, read state, or retention rule. | No backend import, mounted route, or Socket.IO handler. ChatPage references missing routes/events but App.tsx exposes an unavailable-feature page instead and the sidebar has no Chat link. | **E** retire the model/source. A future chat feature is **D**, requiring a new design and demand evidence. |
| Notification | tenantId indexed; title; message; isRead; type alert/info; timestamps. No recipient index or recipient identity. | No backend import or mounted route. NotificationBell is mounted and silently converts missing GET/PATCH routes into an empty state; backend never emits new_notification. Its DTO expects id/timestamp, unlike Mongoose _id/createdAt. | **E** retire the model/source. A future notification inbox is **D** and must be rebuilt with recipient and delivery semantics. |

### 3.3 Mongoose models that are no longer runtime authority

Branch, User, Membership, Session, ModuleDefinition, Plan, AddOn, Subscription, and Entitlement remain in source for legacy loading, migration/parity tests, or explicit recovery. Their authoritative runtime equivalents are PostgreSQL. They are **D: compatibility only** and must not receive new ordinary runtime writes. Their removal belongs to the final Mongo-retirement milestone after rollback evidence and retained migration tooling are no longer required.

## 4. Queue domain findings and target

### 4.1 Current behavior

- createTokenService resolves the legacy organization and uses countDocuments(organization) + 1 to build a token such as #10.
- Two concurrent creates can observe the same count and create duplicate token numbers because there is no unique constraint or atomic counter.
- Counting all historical rows means numbering never intentionally resets. Deleting historical rows can reuse a number, while cancelled/completed history creates gaps. The behavior is neither a durable global sequence nor a business-day queue sequence.
- A caller-supplied tokenNumber exists in service types and OpenAPI, but createTokenSchema does not accept it; the active page does not send it. The contract is internally stale.
- GET /queue returns only waiting/serving records, ordered by creation time, with page/limit. The active page drops pagination metadata and therefore treats only the first ten rows as the entire active queue.
- Any declared status can be changed directly to any other status. There is no transition rule, optimistic version, actor, reason, or status history.
- Records have organization scope only. The authenticated branch selection is not used, so a branch-assigned user can read/update organization-wide queue data if their role permits it.
- serviceType, customerName, and phone are duplicated free-form strings. There is no provider, counter, appointment, or customer relation.
- The frontend listens for queue_updated, but no backend path emits it. There is no public token/status lookup.

### 4.2 Target model

queue_sessions define the numbering boundary. Each session belongs to one organization and branch, has a local business date, status open/closed, optional service relation, a non-null lane_key that defaults to default, and next_token_number. The initial constraint is one session for the same branch, business date, and lane key. The explicit default key supports a single branch queue without nullable-unique ambiguity or invented counter entities.

queue_tokens belong to a session and store customer_id, optional service_id, optional appointment_id, optional assigned_provider_membership_id, token_number as an integer, current_status, version, and timestamps. Uniqueness is (queue_session_id, token_number); branch_id need not be repeated in that unique key because the session owns the branch. Composite organization/branch foreign-key checks prevent cross-tenant references.

queue_status_events are immutable and record token_id, from_status, to_status, actor_membership_id, optional reason, and occurred_at. queue_tokens.current_status is the transactionally maintained projection used for fast active-queue reads.

Creation locks/updates the session counter in PostgreSQL and returns the number in the same transaction. The appointment-to-queue relation is explicit: an appointment is checked in, then exactly zero or one queue token references it. Appointment and Queue are not merged. Allowed initial transitions are waiting -> serving/cancelled and serving -> completed/cancelled; correction requires an explicit privileged transition and reason.

A public lookup is not required for the first cutover. If added later, it must use an unguessable public lookup key and a PII-minimized DTO rather than enumerable database IDs or phone search.

## 5. Customer domain

Queue and Ledger duplicate customerName and phone in every record. There is no customer identity, so spelling changes, phone normalization, history, and cross-domain linkage cannot be made reliable.

The minimum customers table is organization-scoped with optional home_branch_id, name, normalized_phone, notes, status active/inactive/merged, optional merged_into_customer_id, timestamps, and migration provenance outside the permanent customer identity. Phone is indexed but **not unique initially**. Households can share a number, numbers can be recycled, and legacy formatting/duplicates are not understood well enough to enforce uniqueness.

The system must never auto-merge solely on normalized phone. Migration may propose candidates, but ambiguous rows remain separate. A merge is an explicit authorized transaction that rewrites references, records an audit event, marks the losing record merged, and prevents new business references to it. Deletes are restricted when history exists.

Customer is organization-wide so Queue, Appointments, Dues, and future Sales share one identity. home_branch_id is a convenience/default, not an ownership boundary; access to customer-related transactions remains branch-scoped.

## 6. Services and providers

Free-form Queue serviceType cannot support duration, appointment slots, reliable reporting, or per-branch availability. A small organization-owned services catalogue is justified now: name, optional description, duration_minutes, optional price_minor/currency, status, and timestamps. service_branch_availability relates active services to branches and can override availability; the first milestone does not need complex schedules or pricing tiers.

Providers are existing PostgreSQL memberships, not another staff/user table. provider_service_assignments relates an active membership to a service and branch. Composite organization keys must prove that membership, service, and branch belong to the same organization. Provider assignment is optional for a walk-in queue token but required when an appointment is booked with a named provider.

## 7. Appointment design

appointments are a new PostgreSQL domain and start clean; there is no Mongo appointment data to migrate. The minimum record has organization_id, branch_id, customer_id, service_id, optional provider_membership_id, starts_at, ends_at, status, notes, created_by_membership_id, version, and timestamps. appointment_status_events record append-only transitions and actor/reason.

Appointments store instants as TIMESTAMPTZ. Each branch must have an explicit IANA timezone, initially backfilled only through reviewed configuration. Local date/time input is parsed in the branch timezone, ambiguous/nonexistent daylight-saving times are rejected or explicitly disambiguated, and API responses include UTC instants plus the branch timezone. No server-local timezone is authoritative.

Active appointments for a provider must not overlap. PostgreSQL should enforce this with a reviewed exclusion constraint over provider and tstzrange where the provider is present and status is active; otherwise the transaction must lock the provider scheduling boundary and perform an overlap check. A mere unique(provider_id, starts_at) is insufficient.

Check-in is a transaction that validates appointment organization/branch/status, changes appointment status to checked_in, and creates a queue token referencing the appointment. queue_tokens.appointment_id is nullable and unique when present, so walk-ins are supported and an appointment cannot create multiple live tokens accidentally. Provider availability calendars, recurring schedules, reminders, and resource rooms are deferred until proved necessary.

## 8. Attendance findings and target

The backend already validates a canonical PostgreSQL user against active organization membership and selected-branch assignment before writing. Mongo then upserts by legacy organization/user/UTC-normalized date. However, the storage record has no branch. Daily reads fetch all organization rows and map only identities visible in the selected branch; a record from another branch can survive in the result with userId null instead of being filtered. Analytics also counts organization-wide attendance and builds its date using server-local time while the service normalizes UTC.

The active Attendance page is entirely local mockStaffData and never calls the real API. The backend contract therefore has no production UI exercise.

Target attendance_records are keyed by canonical membership, not a duplicated staff identity. They contain organization_id, branch_id, membership_id, attendance_date, nullable check_in_at/check_out_at, status present/absent/half_day, source manual/kiosk/import, manual_override_by_membership_id, manual_override_reason, version, and timestamps. Initial uniqueness is (organization_id, membership_id, attendance_date): one daily record, with branch recording where it was marked. Split-shift/timecard behavior is not claimed.

attendance_record_changes are immutable records for manual corrections, including before/after status and times, actor, reason, and occurred_at. The record remains the current projection. Scheduled context is intentionally absent from the initial manual daily-attendance model; shifts, leave, payroll, performance tracking, and schedule generation are deferred. If scheduling is later introduced, attendance may reference a shift and preserve expected start/end context; no placeholder shift table is required now.

## 9. Inventory findings and target

The existing API only creates/lists items and lists low-stock rows. There is no stock adjustment endpoint, location, update flow, sale/purchase source, SKU, barcode, unit, cost, tax, actor, or idempotency. currentStock and price are JavaScript/Mongo Numbers. Concurrent stock changes cannot be represented or audited. The active page is backend-connected but loads/exports only the first default page and treats it as the complete inventory.

Target inventory consists of:

- inventory_items: organization catalogue, name, optional SKU/barcode, unit code, selling_price_minor, currency, status, timestamps. SKU and barcode use partial organization-scoped unique constraints only after migration preflight proves values safe. A mutable item-level cost is not authoritative; future receipt/lot movements may carry exact unit cost. A tax profile reference is added only with an accepted tax domain.
- stock_locations: organization + branch, code/name, status, one reviewed default location per branch.
- stock_movements: immutable item/location quantity delta, movement type, optional typed source reference, actor membership, idempotency key, occurred_at, created_at, and optional reversal relation. Initial types are opening, receipt, sale, return, adjustment, transfer_in, transfer_out, and reversal; only implemented workflows may use their corresponding type.
- stock_balances: transactionally maintained current quantity and configurable non-negative reorder_threshold per item/location for fast reads and correct location-level low-stock decisions.

The invariant is: stock_balances.quantity equals the sum of non-reversed stock_movements.quantity_delta for the same item/location. Each stock-changing transaction locks the balance row, validates policy, inserts exactly one idempotent movement (or linked transfer pair), and updates the balance. Reconciliation recomputes sums and must report zero differences. History is never repaired by overwriting balance alone.

Quantity is NUMERIC(18,3), serialized as a decimal string. That supports fractional goods without binary rounding. The initial policy rejects a movement that would make stock negative; a future organization setting may allow it only with an explicit privileged reason. Suppliers, purchases, transfers, lots/expiry, and tax engines are deferred. Source type/id and reversal slots keep future Sales/Purchases integration possible.

## 10. Ledger as Customer Dues

The existing domain is not general accounting. Its credit and payment entries describe money owed by a customer and payments against that debt. It should be named Customer Dues and must not expand into a chart of accounts, general ledger, or ERP.

customer_due_entries are immutable, organization- and originating-branch-scoped entries linked to customer_id. Entry types are charge, payment, adjustment_increase, adjustment_decrease, and reversal. Amount is a positive integer minor-unit value; the sign is derived from type. Each entry includes currency, optional due_date, description, optional typed source, optional reverses_entry_id, created_by_membership_id, idempotency_key, occurred_at, and created_at. Reversal must use the same customer/currency, cannot target another reversal, and a partial unique constraint permits only one reversal of an entry.

Balance is authoritative as the derived signed sum: charge and adjustment_increase add; payment and adjustment_decrease subtract; reversal contributes the exact inverse sign/value of its target. No historical entry is silently edited or deleted. The initial implementation can query the indexed journal; a customer_due_balances projection may be added only if measured load requires it and must reconcile to the journal.

Payment allocation to individual charges is not required for the current digital-ledger behavior. A future customer_due_allocations table is justified when invoice settlement, partial payment attribution, or aging by charge is implemented. Legacy credit/payment meaning and customer matching must be preflighted; ambiguity blocks automatic transformation.

## 11. Merchant Sales boundary

EkaVio SaaS subscriptions are commercial access sold by EkaVio to an organization. Merchant Sales are goods/services sold by that organization to its customers. They remain separate bounded contexts and tables.

Future Sales may contain sales, sale_lines, payments, payment_allocations, and explicit void/refund events. A committed sale can create stock movements and, when unpaid, Customer Dues entries in the same PostgreSQL transaction. Existing Inventory and Dues tables need only typed source_type/source_id, idempotency, and actor fields now. They must not claim a foreign key to a table that does not yet exist. Suppliers, purchases, tax filing, gateway settlement, and full POS are deferred.

## 12. Branch scoping and visibility

| Entity | Scope decision | Visibility rule |
|---|---|---|
| customers | organization; optional home branch | Searchable within the organization only when permission permits; related transactions remain branch-filtered. |
| services | organization catalogue plus branch availability relation | A selected branch sees only active services available there. |
| appointments | organization + required branch | Ordinary reads/writes require selected branch and assignment. |
| queue sessions/tokens/events | organization + required branch through session | Ordinary reads/writes require selected branch; explicit cross-branch reporting permission is separate. |
| attendance | organization + required branch | Staff/managers see authorized branch data; org-wide HR/reporting requires explicit permission and endpoint semantics. |
| inventory items | organization catalogue | Item definitions may be shared across branches. |
| stock locations/movements/balances | organization + required branch through location | Branch operations cannot read another branch merely by ID. |
| customer dues | organization account, each entry has required originating branch | Customer balance can aggregate organization-wide only on an explicit aggregate endpoint; ordinary lists filter selected branch. |
| future sales | organization + required branch | Branch transactional data; explicit authorized aggregation only. |

Every branch-scoped table must preserve organization_id and use composite foreign keys/unique parent keys where practical so a branch, membership, service, or customer from another tenant cannot be linked. Missing branch context must not silently mean all branches on ordinary operational routes.

## 13. Identifier and legacy compatibility strategy

- All new primary keys are UUIDs generated in PostgreSQL.
- organization_id, branch_id, membership_id, and user identity references use canonical PostgreSQL UUIDs.
- ObjectId values are accepted only by migration/recovery tools, never as permanent API identifiers.
- Migrated document rows retain nullable legacy_mongo_id with a format check and a unique constraint on the appropriate source table: queue_tokens, inventory_items, customer_due_entries, attendance_records, parent_organizations, and transformed audit events where retained.
- Customers and services have no source ObjectId because they are derived from embedded strings. They receive new UUIDs; a deterministic migration artifact maps each contributing source model/document ID to the generated customer/service and records any reviewed merge decision.
- Generated relational children such as status events and opening-stock movements receive UUIDs and explicit migration provenance rather than pretending they had Mongo identities.
- Compatibility IDs may be removed only after the PostgreSQL cutover is stable, dry-run/apply/verify reports reconcile, backups are restore-tested, rollback retention has expired, no runtime or supported recovery tool needs them, and an explicit removal milestone is accepted.

## 14. Money and quantity invariants

Authoritative money uses BIGINT integer minor units plus ISO 4217 currency. INR therefore stores paise. APIs serialize minor-unit integers as decimal strings to avoid JavaScript safe-integer and floating-point loss; UI input is a decimal currency string parsed with currency scale and returned with explicit currency. Conversion uses one documented half-up rounding step at the boundary; stored values are never repeatedly converted from binary floating point. Cross-currency sums are forbidden without an explicit conversion domain.

Inventory quantities use NUMERIC(18,3) and decimal-string APIs. Computation uses decimal-safe code; no JavaScript Number becomes authoritative. Negative stock is denied by default. Unit codes are explicit, and changing an item's unit is prohibited after movements exist unless a reviewed conversion migration is performed.

## 15. History, immutability, concurrency, and idempotency

| Write | Authoritative history / constraint | Transaction strategy | Idempotency |
|---|---|---|---|
| Queue token create | session counter + unique(session, token_number) | lock/update one session counter and insert token/event atomically | Required for retried create/check-in requests. |
| Queue status | queue_status_events; current status/version projection | conditional update on allowed from-state/version plus event insert | Required for externally retried status commands. |
| Appointment booking | appointment row + status events; no active provider overlap | exclusion constraint or locked provider scheduling boundary | Required for client retries. |
| Attendance mark/correct | unique(org, membership, date); correction event | upsert/current version plus audit change in one transaction | Required for kiosk/import; optional request key for manual UI. |
| Stock change | immutable movement; balance=sum(movements) | lock balance row, validate non-negative, insert movement, update balance | Required and unique per organization/source request. |
| Dues/payment | immutable entry; one reversal; derived balance | insert/reversal validation in transaction | Required for payments/imports; source uniqueness where present. |
| Future sale/payment | immutable sale/payment events and explicit void/refund | one PostgreSQL transaction creates dependent movements/dues | Required. |

This is relational transaction history, not generic event sourcing. PostgreSQL constraints, row locks, indexes, and transactions are sufficient; Redis or a message broker is not justified.

## 16. API contract review and priority

### P0 contract/security defects

| Finding | Evidence | Required direction |
|---|---|---|
| Operational Queue, Inventory, Ledger, and Dashboard ignore selected branch. | Their Mongo filters use only mapped organization ID. | PostgreSQL cutovers must require branch scope and composite tenant constraints before production acceptance. |
| Attendance storage cannot filter by branch and may return another branch's record with userId null. | mongoAttendance lists by organization/date; identity resolver maps only selected-branch identities. | Filter at storage authority using canonical branch; never return an unauthorized placeholder row. |
| Queue token generation is race-prone and ambiguous over history. | countDocuments + 1 and no uniqueness. | Atomic session counter and database unique constraint. |
| Inventory and Ledger persist authoritative values as floating-point Numbers; Inventory has no stock journal. | Inventory.ts, Ledger.ts, create/list-only APIs. | Minor-unit money and movement/journal invariants before production financial/stock use. |

### P1 mismatches and incomplete contracts

| Finding | Evidence | Stable future shape |
|---|---|---|
| Dormant useQueue calls PUT while backend accepts PATCH. | frontend/src/hooks/useQueue.ts vs queueRoutes.ts. | Preserve PATCH /queue/:id/status; remove/update duplicate hook. |
| Queue OpenAPI/service mentions custom tokenNumber, validation omits it. | queueRoutes.ts, queueSchemas.ts, queueService.ts. | Server-generated integer token only; do not accept custom token in ordinary create. |
| Queue page discards pagination and counts only first ten active rows. | QueuePage.tsx. | Return data plus page/limit/total and explicit aggregate counts. |
| Dormant low-stock hook calls /inventory/alerts/low-stock, server exposes /inventory/low-stock. | useInventory.ts vs inventoryRoutes.ts. | Preserve /inventory/low-stock and retire stale hook/path. |
| Inventory page discards pagination and exports only loaded rows. | InventoryPage.tsx. | Page-aware UI; explicit export endpoint/job if full export is needed. |
| Ledger UI uses debit and omits required phone while backend uses payment and requires phone. | LedgerPage.tsx vs ledgerSchemas.ts. | Keep /ledger as a temporary compatibility path over Customer Dues; publish charge/payment DTOs with customer UUID and money strings. |
| Ledger UI expects id/date; Mongo produces _id/createdAt. | LedgerPage.tsx and Ledger.ts. | Canonical UUID id and occurredAt in new DTO. |
| Attendance page has no backend contract at all. | AttendancePage.tsx. | Preserve GET/POST /attendance initially, using membership UUID, branch context, date, status/times/source/version. |
| Corporate page requests literal defaultParent. | CorporateDashboard.tsx. | Resolve/list the caller's authorized parent ID; no sentinel route parameter. |
| NotificationBell calls unmounted routes and expects incompatible DTO fields. | NotificationBell.tsx, routes/index.ts, Notification.ts. | Remove dormant calls during retirement or build a later recipient-scoped API. |

### P2 cleanup

- ChatPage and Message source are dormant behind UnavailableFeature and should be removed in the retirement milestone.
- activityLogger.ts is unmounted, writes canonical UUIDs into ObjectId fields, and captures method/URL-shaped metadata. It must not be enabled; retire it in favor of securityAuditService.
- Analytics date semantics are server-local for attendance while the attendance service uses UTC normalization. The relational cutover must use branch local business dates.
- Operational API tests mainly cover tenant mapping and identity isolation; they do not cover full HTTP DTOs, pagination, transition rules, concurrent token creation, stock/dues arithmetic, or branch-filtered result sets.

### Recommended stable contract boundaries

- List endpoints return data plus explicit page, limit, and total fields. Aggregate cards use explicit count/summary fields rather than counting the loaded page.
- Queue preserves POST/GET /queue and PATCH /queue/:id/status during compatibility. Create accepts customerId, serviceId, optional appointmentId/providerMembershipId, and idempotencyKey; the server owns tokenNumber. Session management can use /queue/sessions. Responses use canonical UUIDs, integer token number, status, version, and timestamps.
- Inventory preserves GET/POST /inventory for item catalogue compatibility and GET /inventory/low-stock. Stock-changing commands use a distinct /inventory/movements boundary with itemId, locationId, decimal-string quantity, type, source, reason, and idempotencyKey. Item prices are minor-unit strings plus currency.
- Ledger preserves /ledger as a time-bounded compatibility adapter while canonical contracts use /customer-dues/entries. Writes identify customerId and branch context, serialize amountMinor as a string with currency, and use idempotencyKey. Corrections create reversals rather than PUT/PATCH history.
- Attendance preserves GET/POST /attendance initially. Requests use membershipId (with a temporary canonical userId adapter if needed), attendanceDate, optional time fields, status/source/version, and idempotency where retryable. Responses never contain null placeholders for unauthorized identities.
- Error codes for authorization, entitlement, validation, conflict, stale version, and idempotency conflict remain stable and machine-readable. Frontend route hiding remains non-authoritative.

## 17. Frontend reality

| Screen | Reality at starting commit | Required future change |
|---|---|---|
| Queue | Real GET/POST/PATCH backend calls. First-page-only metrics. Listens to an event never emitted. | Adopt canonical customer/service/queue DTOs, pagination/counts, branch scope, and new realtime events. |
| Inventory | Real GET/POST backend calls. No actual stock operations; first-page-only export. | Separate item creation from stock movements and show exact decimal quantities/minor-unit prices. |
| Ledger | Two hard-coded rows and local mutations; appears functional but makes no API call. | Replace with real Customer Dues list/create/reversal UI. |
| Attendance | Static staff rows and local status mutations; appears functional but makes no API call. | Use membership roster and real attendance APIs. |
| Dashboard | KPI cards call /analytics/dashboard every 30 seconds. Revenue and daily queue chart series are hard-coded and undisclosed. | Remove/label mock series or connect only after real aggregate contracts exist. |
| Corporate | No longer fabricates fallback data, but literal defaultParent makes the request nonfunctional without that actual ID. | Use an authorized parent selection/list contract. |
| Notifications | Bell is mounted; missing routes are swallowed and shown as empty. | Retire the false integration until a real notification domain exists. |
| Chat | App route is an explicit unavailable feature; source contains mock/fallback behavior but is not active. | Retire dormant prototype; reconsider only as a later product milestone. |

## 18. Realtime boundary

Queue benefits from realtime for multiple desks/screens in one branch. Emit only after the PostgreSQL transaction commits:

- queue.token.created
- queue.token.status_changed

Events go to the canonical organization + branch room. Payloads contain token UUID, session UUID, integer token number, status, version, service UUID when needed, and occurredAt. They exclude phone, notes, and other customer PII. Clients use the event as an invalidation/update hint and recover through HTTP; the socket is not authority. Inventory, Dues, Attendance, and Appointments do not need realtime in the first cutovers.

## 19. Migration classifications and execution contract

| Domain | Classification | Treatment |
|---|---|---|
| Queue | **B transform** | Build customers/services/sessions/tokens/status events. Detect duplicate token labels; do not infer a session boundary silently. Reviewed mapping establishes branch/business date. |
| Customer identities from Queue/Ledger | **B transform** | Normalize phones, create candidates, never auto-merge ambiguous matches, retain provenance. |
| Services from serviceType | **B transform** | Normalize distinct labels per organization with explicit review of collisions and branch availability. |
| Appointments | **C start clean** | No legacy source exists. |
| Attendance | **B transform** | Map user to canonical active/historical membership and branch; preserve date/status without fabricating times. Ambiguous branch blocks apply. |
| Inventory | **B transform into replacement** | Item row plus one reviewed branch/location and immutable opening-stock movement; convert price to minor units exactly. Ambiguous branch/unit/precision blocks apply. |
| Ledger/Customer Dues | **B transform into replacement** | Map customer, convert credit/payment to charge/payment after semantic validation, exact money conversion, preserve description/date. |
| ParentOrganization/parent links | **A direct mapping** | Reconcile existing PostgreSQL shadow rows and cut runtime to them. |
| ActivityLog | **B selective transform** | Copy only allowlisted, scalar-safe events to existing audit_events; archive/quarantine unsafe Mixed payloads with counts and hashes. |
| Message | **C archive then retire** | No production contract; export only if real records exist and retention requires it. |
| Notification | **C archive then retire** | No recipient semantics; do not copy into a misleading new schema. |
| Old identity/commercial Mongoose models | **D defer compatibility removal** | Retain for accepted migration/recovery period, then remove with Mongo. |

Every migration command follows the established safety model: verified backup first; dry-run default; explicit --apply; no writes when blockers exist; deterministic/idempotent legacy mappings; canonical tenant and branch resolution; per-domain counts and value totals; source-to-target checksums where useful; post-apply verification; no silent skip; and a documented rollback limit once PostgreSQL-only writes begin. A target cutover never dual-writes or automatically falls back to Mongo.

## 20. Recommended implementation order

1. **V2-06B Customer, Service, Appointment & Queue PostgreSQL Vertical.** Fixes the branch/security and token-concurrency blockers while delivering the clinic/salon workflow. These domains must share one transaction boundary and identity vocabulary.
2. **V2-06C Attendance PostgreSQL Cutover.** Reuses canonical branch/membership/timezone rules, removes the cross-branch Mongo storage gap, and connects the real UI without inventing shifts/payroll.
3. **V2-06D Customer Dues PostgreSQL Cutover.** Reuses customers, introduces exact immutable money history, preserves the familiar /ledger compatibility surface, and replaces the mock UI.
4. **V2-06E Inventory PostgreSQL Cutover.** Introduces decimal quantities, locations, movements, and balances after the money/source conventions are proven; replaces mutable stock safely.
5. **V2-06F Corporate, Audit & Mongo Retirement.** Moves the remaining parent relationship and safe audits to existing PostgreSQL tables, archives/retires Message/Notification and dormant legacy models, removes Mongo runtime composition only after verification.
6. **Future V2-07 Merchant Sales Lite**, only after the operational base is accepted. Integrates Sales with stock and dues without mixing it with EkaVio subscription billing.

Inventory follows Dues because its movement/location migration is the most complex existing prototype and no current sales source drives stock. Attendance precedes it because the branch/security defect is narrower and the UI is currently misleading. Sales is not required to correct the current domains.

## 21. Mongo retirement plan

| Dependency after V2-05D | Disposition | Expected removal |
|---|---|---|
| Queue | Must migrate | V2-06B |
| Attendance | Must migrate | V2-06C |
| Ledger | Must migrate as Customer Dues | V2-06D |
| Inventory | Must migrate as movement-based inventory | V2-06E |
| ParentOrganization / Organization parent relation | Must cut to existing PostgreSQL | V2-06F |
| ActivityLog | Safe events migrate; unsafe legacy payloads archive | V2-06F |
| Message / Notification | May retire after export/retention decision | V2-06F |
| Legacy identity/commercial/source models and mapping bridge | May remain temporarily for verification/recovery | Remove in V2-06F only after rollback window. |

MongoDB can realistically leave the production Compose/runtime in **V2-06F**, not before. Exit requires zero runtime Mongoose imports outside explicitly retained offline archive tooling, restored backup evidence, successful per-domain reconciliation, expired rollback windows, updated readiness/operations docs, and a repository-wide runtime-authority search.

## 22. Low-cost architecture review

The target remains a Node.js/TypeScript modular monolith with React PWA and one PostgreSQL service. PostgreSQL transactions, constraints, partial/exclusion indexes, row locks, CTEs, and JSONB only for reviewed audit metadata cover the identified needs. No requirement justifies Redis, Kafka, RabbitMQ, Elasticsearch, microservices, Kubernetes, paid AI, SMS, WhatsApp Business API, or a payment gateway. Background work can start as in-process/CLI jobs with database leases only when a real asynchronous requirement appears.

## 23. Historical blocker reassessment

### V2-00 P0 register

| ID | Status after V2-05D / this review | Evidence summary |
|---|---|---|
| P0-01 backend start script | RESOLVED | V2-01 added the production lifecycle. |
| P0-02 backend build script | RESOLVED | V2-01 added deterministic build. |
| P0-03 failing test script | RESOLVED | Backend unit/integration suites are active in CI. |
| P0-04 fallback secrets | RESOLVED | Validated environment and secure session foundation. |
| P0-05 HTTP wildcard CORS | RESOLVED | Explicit allowlist. |
| P0-06 Socket wildcard origin | RESOLVED | Explicit allowlist and authorized rooms. |
| P0-07 browser token persistence | RESOLVED | Memory access token + HttpOnly refresh cookie. |
| P0-08 no server logout/revocation | RESOLVED | PostgreSQL revocable/rotating sessions. |
| P0-09 sidebar sign-out | RESOLVED | Active logout path revokes/clears session. |
| P0-10 ambiguous global phone login | RESOLVED | Ambiguity is rejected; PostgreSQL identity is authoritative. |
| P0-11 incomplete auth hydration | RESOLVED | Canonical membership/branch/entitlement bootstrap. |
| P0-12 hard-coded API URL | RESOLVED | Environment-derived frontend endpoint. |
| P0-13 arbitrary attendance user | RESOLVED | Canonical membership and selected-branch assignment are validated before a write; the separate branchless-read defect is V206-P0-02. |
| P0-14 unsafe corporate linking | RESOLVED | Corporate authorization verifies parent and child authority. |
| P0-15 tenant-admin billing override | RESOLVED | Platform-operator boundary and PostgreSQL commercial authority. |
| P0-16 unsafe ephemeral Mongo Compose | PARTIALLY RESOLVED | Mongo is pinned, authenticated, persistent, and documented for backup/restore; production automation and a full restore drill remain operational acceptance work. |
| P0-17 mock operational/commercial screens | PARTIALLY RESOLVED | Billing and corporate fallbacks were corrected and Chat is unavailable; Attendance/Ledger remain mock and Dashboard charts remain undisclosed static data. |

### V2-00 P1 register

| ID | Status | Evidence summary |
|---|---|---|
| P1-01 Queue PUT/PATCH | STILL OPEN | Dormant useQueue still uses PUT; active page uses PATCH. |
| P1-02 low-stock path | STILL OPEN | Dormant hook path remains wrong. |
| P1-03 ledger naming | RESOLVED | ledger is canonical commercial key; old names are migration aliases. |
| P1-04 debit/payment mismatch | STILL OPEN | Mock page uses debit; backend uses payment. |
| P1-05 attendance mock | STILL OPEN | Active page is local state. |
| P1-06 ledger mock | STILL OPEN | Active page is local state. |
| P1-07 corporate fallback/contract | PARTIALLY RESOLVED | Fake fallback is gone; literal defaultParent remains nonfunctional. |
| P1-08 missing notification routes | STILL OPEN | Mounted bell silently swallows missing endpoints. Retirement is recommended. |
| P1-09 missing chat routes/events | SUPERSEDED | Chat is explicitly unavailable and absent from navigation; dormant source/model should retire. |
| P1-10 missing socket emissions | PARTIALLY RESOLVED | Authorized rooms exist, but Queue/Notification producers do not. Notification is deferred. |
| P1-11 no branch entity | RESOLVED | PostgreSQL Branch is canonical for authorization; branchless operational persistence is separately tracked as V206-P0-01/V206-P0-02. |
| P1-12 no API contract tests | PARTIALLY RESOLVED | HTTP middleware/commercial tests exist; operational DTO and workflow contract tests are still missing. |
| P1-13 no tenant-isolation tests | RESOLVED | Unit/integration cross-tenant coverage exists. |
| P1-14 incomplete CI | RESOLVED | Lint/typecheck/tests/build and Compose validation are established. |
| P1-15 no health/readiness | RESOLVED | Live/readiness endpoints and container health checks exist. |

The V2-00 baseline did not contain a separately numbered P2 register. The P2 items below are newly classified cleanup findings from the current implementation.

### New blocker register

| Priority | ID | Blocker | Exit condition |
|---|---|---|---|
| P0 | V206-P0-01 | Branch-selected users can reach organization-wide Queue, Inventory, Ledger, and analytics data. | Branch-required PostgreSQL authority and cross-branch denial tests for every cutover domain. |
| P0 | V206-P0-02 | Attendance organization-only storage can return a foreign-branch row with null identity. | Branch-keyed storage query; never return unauthorized rows. |
| P0 | V206-P0-03 | Queue count+1 creates duplicate tokens under concurrency and has undefined reset semantics. | Session counter transaction, uniqueness, and concurrency test. |
| P0 | V206-P0-04 | Inventory has no movement history or concurrency invariant. | Movement + balance transaction, non-negative policy, reconciliation tests. |
| P0 | V206-P0-05 | Inventory/Ledger authoritative money uses binary floating point. | Exact minor-unit cutover with value reconciliation. |
| P1 | V206-P1-01 | No customer master; Queue/Ledger duplicate ambiguous identity. | Customer foundation and reviewed duplicate/merge behavior. |
| P1 | V206-P1-02 | Queue has no lifecycle history, service identity, or branch/session boundary. | Relational Queue vertical. |
| P1 | V206-P1-03 | Attendance and Ledger screens appear functional but are mock-only. | Real API integration and truthful empty/error states. |
| P1 | V206-P1-04 | Dashboard revenue/queue charts present static series as live-looking data. | Remove/label or connect to real aggregates. |
| P1 | V206-P1-05 | Operational HTTP/workflow/concurrency tests are incomplete. | Contract, branch isolation, invariant, retry, and concurrency suites per milestone. |
| P1 | V206-P1-06 | Dependency advisories documented in PROJECT_CONTEXT remain unremediated. | Tested dependency/container maintenance milestone; no broad auto-fix. |
| P1 | V206-P1-07 | Backup/restore is documented but production scheduling and restore evidence remain environment work. | Automated encrypted backups, retention, monitoring, and timed restore drill. |
| P2 | V206-P2-01 | Dormant duplicate hooks and stale OpenAPI fields drift from active contracts. | Remove or align during owning domain cutover. |
| P2 | V206-P2-02 | Notification bell, Message/Notification models, and dormant Chat source imply nonexistent capabilities. | Retire cleanly or rebuild in a later explicit milestone. |
| P2 | V206-P2-03 | Corporate UI has no authorized parent-selection contract. | PostgreSQL corporate cutover and real parent lookup. |
| P2 | V206-P2-04 | Operational analytics are organization-wide and mix local/UTC date semantics. | Branch-scoped relational aggregates using branch timezone. |

## 24. Proposed relational schema

The following is a design, not a SQL migration.

### MUST BUILD NEXT — V2-06B vertical

| Table/change | Purpose and scope | Keys, constraints, indexes | Mutability |
|---|---|---|---|
| branches.timezone | Explicit business timezone | IANA zone validated by application/migration; reviewed non-null backfill | Mutable only through privileged settings/audit. |
| customers | Organization customer identity; optional home branch | UUID PK; org FK; optional composite home-branch FK; normalized_phone index; status check; optional self merged_into with no-self-merge check; no legacy ObjectId because source identity is embedded | Mutable profile; merges audited; referenced rows restricted from delete. |
| services | Organization service catalogue | UUID PK; org FK; duration > 0; optional price_minor >= 0 + currency; unique active normalized name per org where accepted; status index | Mutable catalogue; historical references retained. |
| service_branch_availability | Service availability by branch | PK(service, branch); composite org FKs; active flag/index | Mutable configuration. |
| provider_service_assignments | Existing membership can provide a service at a branch | PK(membership, service, branch); composite org FKs; active flag | Mutable configuration; no new staff identity. |
| appointments | Branch booking | UUID PK; composite org/branch/customer/service/provider FKs; end > start; status/version checks; branch/time and provider/time indexes; active-overlap exclusion | Mutable current projection with optimistic version. |
| appointment_status_events | Booking history | UUID PK; appointment FK; actor membership FK; status checks; index appointment/occurred | Append-only. |
| queue_sessions | Explicit number/reset scope | UUID PK; org+branch FKs; local_business_date; non-null lane_key defaulting to default; next number > 0; status check; unique(branch,date,lane_key) | Counter/status mutable under lock. |
| queue_tokens | Branch/session queue item | UUID PK; session/customer/service/provider/appointment FKs; token > 0; status/version checks; unique(session,token); unique appointment when non-null; active queue index; legacy ID unique | Mutable projection only. |
| queue_status_events | Queue lifecycle history | UUID PK; token FK; actor FK; from/to/reason; index token/occurred | Append-only. |

### MUST BUILD IN SUBSEQUENT V2-06 milestones

| Table/change | Purpose and scope | Keys, constraints, indexes | Mutability |
|---|---|---|---|
| attendance_records | Daily branch attendance for canonical membership | UUID PK; composite org/branch/membership FKs; unique(org,membership,date); check out >= check in; status/source/version checks; branch/date index; legacy ID unique | Current projection. |
| attendance_record_changes | Manual correction history | UUID PK; attendance FK; actor/reason; before/after values; occurred index | Append-only. |
| customer_due_entries | Exact Customer Dues journal | UUID PK; org/branch/customer/actor FKs; amount_minor > 0; currency/type checks; charge/payment/adjustment_increase/adjustment_decrease/reversal types; partial unique reverses_entry; unique org/idempotency; customer/occurred index; legacy ID unique | Append-only; correction by reversal. |
| inventory_items | Organization item catalogue | UUID PK; org FK; unit/status; price_minor >= 0 + currency; partial unique SKU/barcode after preflight; legacy ID unique | Mutable catalogue; unit locked after history. |
| stock_locations | Branch stock boundary | UUID PK; composite org/branch FK; unique(branch,code); status/default constraint | Mutable configuration. |
| stock_movements | Authoritative stock journal | UUID PK; item/location/actor FKs; nonzero NUMERIC(18,3) delta; type/source/reversal checks; unique org/idempotency; location/item/occurred index | Append-only. |
| stock_balances | Fast balance/low-stock projection | PK(item,location); quantity NUMERIC(18,3); reorder_threshold NUMERIC(18,3) >= 0; updated_at; composite FKs | Transactionally mutable; quantity must reconcile to movements. |
| audit_events (existing) | Safe organization security history | Use existing UUID/org/actor/action/details/occurred schema; add nullable unique legacy_mongo_id for idempotent accepted-event migration and branch/correlation indexes only if review proves necessary | Append-only. |
| parent_organizations and organizations.parent_organization_id (existing) | Corporate runtime authority | Existing UUID/legacy/owner and parent FK constraints; reconcile before cutover | Mutable through authorized corporate service. |

### FUTURE / DEFERRED

| Concept | Trigger for adding it |
|---|---|
| customer_due_allocations | Invoice/charge-level settlement and aging are product requirements. |
| sales, sale_lines, payments, payment_allocations, sale events | Merchant Sales Lite milestone after Dues and Inventory invariants are accepted. |
| provider availability/recurring schedules | Real scheduling requirements exceed direct appointment conflict checks. |
| shifts and leave | Attendance requires schedules/leave, not payroll speculation. |
| suppliers, purchases, transfer documents, lots/expiry | Inventory workflows require them; source slots already permit integration. |
| notification inbox/outbox | A concrete recipient/delivery requirement exists. |
| chat conversations/messages | Product evidence justifies support and retention complexity. |

## 25. Review completion boundary

V2-06A changes documentation only. It does not create these tables, change an API, alter runtime authority, repair a defect, migrate a document, or start V2-06B.
