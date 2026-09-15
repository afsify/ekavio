# V2-05B Runtime Persistence Coupling

- Audit baseline: `781e29e92e7aa4aff1e22d3177bae1926230737d`
- Audit scope: backend runtime, migration tooling, tests, and MongoDB compatibility paths
- Runtime authority throughout V2-05B: MongoDB
- PostgreSQL runtime adapters added by V2-05B are inactive readiness components only

## Classification

- **A — shared-core runtime:** identity, authentication sessions, authorization, organizations, branches, memberships, profiles, corporate hierarchy, commercial state, and security-audit metadata.
- **B — operational storage:** Queue, Inventory, Ledger, Attendance, analytics over those collections, and realtime organization/branch routing.
- **C — migration tooling:** authorization/commercial backfills and PostgreSQL shadow/verification commands.
- **D — tests:** in-memory contract doubles and disposable-database integration coverage.
- **E — compatibility:** legacy Mongo identifiers and legacy `User`/`Organization` fields retained only to bridge old records and operational Mongo storage.

## Shared-core runtime coupling (A)

| Area | Direct persistence coupling at the baseline | Required V2-05B boundary |
| --- | --- | --- |
| Login and refresh (`services/authService.ts`) | `User.find/findById`, then `Membership.find`, `Organization.find`, and `Branch.find`; the context builder also calls the Mongo-backed entitlement evaluator. | Keep the existing `IdentityRepository` contract, provide an inactive PostgreSQL implementation, and keep Mongo selected in one composition root. Preserve duplicate-phone conflict behavior and output shape. |
| Initial registration and theme (`services/authService.ts`) | Sequential `Organization.create`, `Branch.create`, `User.create`, `Membership.create`; `Organization.findOne/save` for theme. A partial failure can leave incomplete Mongo state. | Introduce domain write contracts. Add an inactive transactional PostgreSQL implementation for registration and theme. Keep the Mongo adapter active with existing API behavior. |
| Refresh sessions (`services/sessionService.ts`) | `Session.create/findOne/findOneAndUpdate/updateOne/updateMany`. Conditional hash rotation is already abstracted by `SessionRepository`. | Keep the existing `RefreshSessionManager` contract unchanged. Add an inactive PostgreSQL repository with compare-and-swap rotation and scoped revoke operations. Never copy Mongo refresh hashes. |
| HTTP authorization (`services/requestContextService.ts`) | `Session.exists`, `Membership.findOne`, `Organization.exists`, `Branch.findById`, and `User.findById(+platformRole)`. ObjectId validation is embedded in the Mongo adapter. | Preserve `Session -> User -> Membership -> Organization -> Branch -> Permissions`; add an inactive PostgreSQL adapter and keep ID validation inside each persistence implementation. |
| Socket.IO (`config/socket.ts`) | No direct model import; it delegates to the same Mongo-selected authorization-context resolver used by HTTP and derives organization/branch rooms from the result. | Route through the composition-selected resolver so a later cutover changes one reviewed binding and preserves identical room isolation. |
| Staff (`controllers/staffController.ts`) | `Membership.find`, `User.find`, global `User.exists({phone})`, `User.create`, `Membership.create`, `Membership.findOneAndUpdate`, and Mongo session revocation. | Move controller persistence behind a domain-specific staff repository. Mongo remains active; add an inactive transactional PostgreSQL adapter with matching list/create/revoke semantics. Platform role must never be writable here. |
| Profile/password (`controllers/profileController.ts`, `services/profileService.ts`) | `User.findByIdAndUpdate`, `User.findById`, document `save`, then session revocation. | Add profile and credential write contracts. The inactive PostgreSQL adapter updates identity/password state transactionally where multiple tables or session revocation are involved. |
| Corporate (`controllers/corporateController.ts`) | `ParentOrganization.create/findOne`, `Membership.findOne`, `Organization.findOneAndUpdate/find`, plus per-child entitlement evaluation. | Record as a later shared-core cutover consumer. Do not switch in V2-05B; its ownership and tenant checks must be retained by a future repository boundary. |
| Catalogue (`services/commercialCatalogueService.ts`) | `ModuleDefinition`, `Plan`, and `AddOn` update/read operations. | Commercial runtime cutover is deferred to V2-05D or later. The existing service is an explicit coupling seam; no PostgreSQL runtime binding is selected here. |
| Commercial administration (`services/commercialAdministrationService.ts`) | Organization existence checks plus Plan/AddOn/Subscription/ModuleDefinition/Entitlement queries and upserts. | Deferred to V2-05D or later. Future adapter must retain platform-operator enforcement, organization scoping, canonical module validation, and audit behavior. |
| Entitlement evaluation (`services/entitlementService.ts`) | Reads ModuleDefinition, Subscription, Entitlement, then referenced Plan and AddOn rows from MongoDB. | Deferred to V2-05D or later. Its repository/evaluator contract is the required cutover seam; permissions remain independent. |
| Security audit (`services/securityAuditService.ts`) | `ActivityLog.create` writes allowlisted security metadata to MongoDB. The legacy broad-body activity middleware remains separate and unmounted. | Keep Mongo active. PostgreSQL `audit_events` cutover requires a dedicated safe-data review and is not part of V2-05B. |

## Operational storage coupling (B)

| Domain | Current MongoDB identifiers and operations | V2-05B bridge decision |
| --- | --- | --- |
| Queue (`services/queueService.ts`) | `Queue` count/create/find/findOneAndUpdate`, with `tenantId` taken from the validated authorization context. | Queue stays in MongoDB. Its adapter accepts a validated operational identity containing both canonical and legacy organization IDs; Mongo filters use only the mapped legacy ID. |
| Inventory (`services/inventoryService.ts`) | `Inventory` create/count/find with Mongo `tenantId`. | Inventory stays in MongoDB under the same explicit dual-identity boundary. |
| Ledger (`controllers/ledgerController.ts`) | Direct `Ledger.create/count/find` with Mongo `tenantId`. | Ledger stays in MongoDB. Establish only the ID bridge; do not change API, amount, or storage behavior. |
| Attendance (`services/attendanceService.ts`) | Attendance remains MongoDB; membership/user reads prove and hydrate identity. | Split target identity resolution from Attendance storage. Mongo identity resolution remains active; the inactive PostgreSQL resolver returns the same allow/deny and display identity result. Foreign-tenant targets remain indistinguishable from missing targets. |
| Analytics (`controllers/analyticsController.ts`) | Direct Queue/Inventory/Attendance counts scoped by authorization context. | Remains MongoDB and consumes validated legacy tenant identity through the operational bridge when the canonical runtime context is introduced later. |
| Realtime rooms (`config/socket.ts`) | Uses runtime context identifiers as organization/branch room suffixes. | No storage change in V2-05B. A future cutover must deliberately choose canonical room IDs and reconnect clients; V2-05B preserves current Mongo IDs. |

Operational Mongo models (`Queue`, `Inventory`, `Ledger`, and `Attendance`) continue to store legacy ObjectId references. V2-05B does not add speculative PostgreSQL tables, dual writes, or alternate operational records.

## Migration-tool coupling (C)

| Tool | Coupling and role |
| --- | --- |
| `services/authorizationBackfillService.ts` | Reads legacy User assignments/tenant fields and Organization, then creates default Branch and Membership documents. This remains Mongo-only compatibility tooling. |
| `services/entitlementBackfillService.ts` and `services/commercialCatalogueService.ts` | Read/write Mongo commercial catalogue and legacy Organization commercial inputs. These remain explicit migration/bootstrap commands. |
| `postgres/mongoShadowSource.ts` | The only bulk shared-core Mongo reader: User, ParentOrganization, Organization, Branch, Membership, ModuleDefinition, Plan, AddOn, Subscription, and Entitlement. |
| `postgres/shadowMigration.ts` and `postgres/verification.ts` | Explicit PostgreSQL shadow apply/reconciliation paths. They are not imported by runtime request handling. |
| `scripts/postgres*.ts` | Operator commands connect both databases only for reviewed migration, verification, and status work. |

## Tests (D)

Existing authentication, authorization, attendance, commercial, and profile tests primarily inject repository doubles into service contracts. PostgreSQL integration coverage uses a disposable database and does not select PostgreSQL for application runtime. V2-05B extends this pattern with mapping, inactive-adapter, parity, concurrency, tenant-isolation, transaction-rollback, and preflight tests.

## Compatibility surfaces (E)

- All baseline Mongo primary/reference identifiers are 24-character lowercase hexadecimal ObjectIds.
- PostgreSQL shared-core primary keys are UUIDs; `legacy_mongo_id` is the stable bridge and must never be treated as a UUID.
- `User.tenantId`, `User.role`, and `User.assignments` are compatibility/backfill inputs, not authorization authority.
- `Organization.activeModules`, subscription status/cycle/date fields are migration inputs, not commercial authority.
- New compatibility IDs needed while Mongo remains active must be generated with cryptographic randomness independently of Mongoose. They identify real records written through the active Mongo adapter; they must never be used to create placeholder/fake Mongo documents.
- Compatibility IDs may be removed only after every operational Mongo reference has migrated, reconciliation is clean, rollback no longer depends on Mongo identifiers, backups/restores are rehearsed, and a separately accepted removal milestone deletes the bridge.

## Query and identifier findings

- Runtime and tooling use `find`, `findOne`, `findById`, `exists`, `create`, `findOneAndUpdate`, `updateOne`, `updateMany`, and `countDocuments` across the call sites above.
- No backend source uses Mongoose `populate()` or `aggregate()` at this baseline. Relationships are resolved by explicit queries and ID maps.
- Raw Mongoose/ObjectId awareness is concentrated in model schemas, database lifecycle, request-context ObjectId validation, migration/backfill readers, and Mongo-specific repositories.
- The accepted `001_shared_core.sql` migration must remain byte-for-byte unchanged. Session compatibility changes belong in `002`.

## Composition and cutover implications

The runtime composition now centralizes these bindings in a small explicit persistence module without an environment switch, service locator, or production dual-write mode. The active selection remains MongoDB. PostgreSQL repositories are constructed only by integration tests, cutover preflight, and explicit future composition changes.

Commercial catalogue, subscriptions, entitlement overrides/evaluation, corporate hierarchy, and audit-event runtime cutover are explicitly deferred to V2-05D or later. V2-05C may switch only the identity/authentication/authorization surfaces described by its accepted runbook and must preserve the operational legacy-ID bridge.
