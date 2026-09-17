# V2-05D Commercial Runtime Coupling Audit

Date: 2026-09-15

Starting commit: `6bc2c1468989b2c3247a6ee0108758aed4d365b6`

This audit was completed before changing commercial runtime composition. Its scope is every backend occurrence of `ModuleDefinition`, `Plan`, `AddOn`, `Subscription`, `Entitlement`, `activeModules`, `subscriptionStatus`, `billingCycle`, `nextBillingDate`, `entitlementService`, `commercialAdministrationService`, `commercialIdentity`, `legacyMongoOrganizationId`, and direct Mongoose operations on commercial collections.

## Classification key

- **A — cut over now:** commercial runtime authority that must use PostgreSQL in V2-05D.
- **B — migration compatibility:** one-way Mongo-to-PostgreSQL backfill, shadow, parity, preflight, verification, recovery, or accepted schema support.
- **C — operational Mongo compatibility:** non-commercial records that still require validated PostgreSQL-to-Mongo identity mapping.
- **D — tests:** fixtures, regression coverage, or static authority assertions.
- **E — deprecated schema:** historical fields retained only as migration input.
- **F — blocker:** unsafe or unclassified coupling. No category F occurrence is accepted.

## A — commercial runtime authority to move to PostgreSQL

| Path | Baseline coupling | V2-05D disposition |
| --- | --- | --- |
| `backend/src/services/entitlementService.ts` | The evaluator is storage-neutral, but its exported runtime singleton and repository query all five Mongo commercial models. | Preserve the pure evaluator; bind runtime reads to an explicit PostgreSQL commercial repository. Keep the Mongo repository only for migration parity. |
| `backend/src/services/commercialCatalogueService.ts` | Catalogue reads and deterministic seed upserts use Mongo `ModuleDefinition`, `Plan`, and `AddOn`. | Move runtime reads and bootstrap reconciliation to PostgreSQL-only transactions. |
| `backend/src/services/commercialAdministrationService.ts` | Subscription and override validation/writes use Mongo models and legacy ObjectIds. | Move operator mutations to a PostgreSQL transaction boundary using canonical organization and actor UUIDs. |
| `backend/src/persistence/commercialIdentity.ts` | Maps canonical organization UUIDs to Mongo IDs before effective-entitlement reads. | Remove this bridge from commercial runtime composition. Retain identity mapping only for operational and audit compatibility. |
| `backend/src/persistence/runtimePersistence.ts` | Declares PostgreSQL shared-core authority but composes commercial reads through the Mongo bridge. | Declare separate identity, session, authorization, commercial, and operational authorities; compose PostgreSQL commercial services directly. |
| `backend/src/controllers/billingController.ts` | Subscription read is bridged; catalogue is Mongo-backed; operator writes translate organization and actor IDs to Mongo. | Use canonical UUIDs and the PostgreSQL commercial service for every billing read and mutation. Audit translation remains separate. |
| `backend/src/controllers/corporateController.ts` (`getConsolidatedBilling`) | Resolves child commercial state directly from the Mongo entitlement singleton. | Map operational child organization IDs to canonical UUIDs, then read PostgreSQL commercial state. |
| `backend/src/middlewares/tenantMiddleware.ts`, `backend/src/controllers/analyticsController.ts`, module routes | Runtime gates consume the composed commercial reader. | Preserve contracts and `ENTITLEMENT_REQUIRED`; the composition now supplies PostgreSQL state. |
| `backend/src/postgres/identityRepository.ts`, `backend/src/services/authService.ts` | Login, refresh, bootstrap, and tenant switching hydrate entitlements through the injected reader. | Inject the PostgreSQL commercial reader so each selected organization is recomputed without a Mongo lookup. |

## B — migration, parity, verification, and recovery compatibility

| Path | Justification after cutover |
| --- | --- |
| `backend/src/models/ModuleDefinition.ts`, `Plan.ts`, `AddOn.ts`, `Subscription.ts`, `Entitlement.ts` | Legacy Mongo commercial collection schemas needed by pre-cutover source loading, parity, and explicit recovery tooling; never imported by executable runtime authority paths. |
| `backend/src/postgres/mongoShadowSource.ts`, `sharedCoreTypes.ts`, `shadowValidation.ts`, `sharedCoreRepository.ts`, `verification.ts` | One-way snapshot validation, migration, and reconciliation. Normal apply must be locked after commercial activation. |
| `backend/src/postgres/cutoverPreflight.ts` | V2-05C identity preflight and legacy source mapping verification. Its historical comment must no longer describe current authority. |
| `backend/src/services/entitlementBackfillService.ts`, `backend/src/scripts/backfillEntitlements.ts` | Deprecated organization-field-to-Mongo-commercial pre-cutover backfill only. It is not a post-cutover runtime writer. |
| `backend/src/scripts/postgresShadow.ts`, `postgresVerify.ts`, `postgresCutoverPreflight.ts` | Operator migration commands. Dry-run/verification remain useful; ordinary shadow apply must fail after the durable commercial cutover marker is active. |
| `backend/src/services/entitlementService.ts` Mongo adapter | Kept as an explicitly named legacy/parity adapter, not exported as runtime authority. |
| `backend/postgres/migrations/001_shared_core.sql` | Accepted immutable schema establishing all normalized commercial tables and constraints. |

## C — operational Mongo compatibility

| Path | Justification after cutover |
| --- | --- |
| `backend/src/persistence/operationalIdentity.ts` and `identifiers.ts` | Validated mapping from canonical PostgreSQL identity context to Mongo operational record keys. |
| `backend/src/services/queueService.ts`, `inventoryService.ts`, `attendanceService.ts`; `backend/src/controllers/ledgerController.ts`, `analyticsController.ts`; `backend/src/persistence/mongoAttendance.ts` | Queue, inventory, attendance records, ledger records, and operational analytics remain Mongo-backed and tenant-scoped through the operational bridge. |
| `backend/src/controllers/corporateController.ts` | `ParentOrganization` and child relationship persistence remain operational Mongo data. Only commercial evaluation moves to PostgreSQL. |
| `backend/src/services/securityAuditService.ts` | `ActivityLog` remains Mongo-backed; canonical actor/organization IDs are translated solely for audit persistence, not commercial authority. |

## D — tests

All matching occurrences under `backend/tests/` and the frontend contract assertions are fixtures, integration coverage, migration parity checks, or source-search acceptance checks. V2-05C tests that instantiate `PostgresMongoCommercialIdentityBridge` describe the old composition and must be updated or retained only where explicitly testing legacy migration behavior. Mongo commercial models may be used in disposable source/parity fixtures, but new cutover tests must assert that executable runtime paths do not import or mutate them.

## E — deprecated historical schema

`backend/src/models/Organization.ts` retains `activeModules`, `subscriptionStatus`, `billingCycle`, and `nextBillingDate` only as V2-04 backfill input. `backend/src/services/entitlementBackfillService.ts` is the only executable code permitted to read those fields. PostgreSQL subscription changes must not update them. The `legacy-import` plan description and alias handling for `khata`/`digital-khata` are migration compatibility only.

The `subscriptionStatus` property returned by `corporateController.ts` is a response projection computed from PostgreSQL effective state; it is not a read of the deprecated Mongo Organization field.

## PostgreSQL schema assessment

Accepted migration `001_shared_core.sql` already represents the complete V2-04 commercial model:

- canonical module keys, availability/status metadata, and versioned catalogue rows;
- plan and add-on status/availability, normalized module grants, base limits, and add-on limit adjustments;
- one subscription per canonical organization with status, source, billing cycle, period dates, actor references, and time-windowed add-ons;
- one explicit override per organization/module with grant/revoke effect, status, source, reason, actor, and validity window;
- foreign keys, uniqueness, non-negative limits, enum checks, and date-order constraints.

No change to migration `001` is required. A new ordered migration may add only a durable cutover-authority marker used to prevent unsafe post-cutover shadow apply; it must not weaken any accepted constraint.

## Audit conclusion

Every occurrence is classified A–E. There are no category F blockers before implementation. The cutover must remove all category A Mongoose imports and legacy-ID translations while preserving categories B, C, D, and E within their stated boundaries.
