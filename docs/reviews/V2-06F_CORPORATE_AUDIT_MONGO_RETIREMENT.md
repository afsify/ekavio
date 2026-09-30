# V2-06F Corporate, Audit, and Mongo Runtime Retirement Review

- Date: 2026-09-30
- Starting commit: `e486c3ab2bbf90f814e8be44f845f35b5afbecb7`
- Starting exact CI: GitHub Actions run `36690260494` (success)
- Checkpoint: `pre-v2-06f-mongo-runtime-retirement`
- Normal runtime authority: PostgreSQL
- Scope: corporate relationships, security audit, selective legacy transformation, dormant prototype retirement, and removal of MongoDB from the normal web runtime

## Baseline and recovered work

V2-06F resumed on clean accepted `main` at the V2-06E commit, with local work preserved after the interrupted session. The checkpoint was already present and was not recreated. The recovered diff was confined to migration 012, corporate/audit runtime and migration tooling, web-server/config/readiness/Compose retirement, focused frontend cleanup, regression maintenance, CI, and these closeout documents.

## Migration 012 and authority model

Forward-only migration `012_corporate_audit_runtime_authority.sql` applies after migrations 001 through 011 and in a clean 001-through-012 database. It retains the shared-core parent/child relational model, strengthens `audit_events` with legacy provenance, bounded IP, action and scalar-detail constraints, and indexes, and makes both audit events and unsafe-row dispositions append-only. Unsafe disposition rows contain only hashes, fingerprints, and bounded reason codes.

The migration adds durable `corporate` and `security_audit` PostgreSQL latches. Source code independently fixes both authorities to PostgreSQL and classifies Mongo as offline-only. Activation is explicit after clean reconciliation and preflight; ordinary legacy apply refuses afterward without a reviewed recovery flag.

## Corporate PostgreSQL result

Parent creation, authorized parent listing, owner-scoped fetch, child linking, and child listing use PostgreSQL and canonical UUIDs. Linking locks the parent and child, requires that the actor own the parent, and requires an active child membership with organization-management permission before updating the relationship. Foreign ownership and forged identifiers fail closed.

Corporate summary reads authorized linked organizations and their PostgreSQL commercial state. The frontend removes `defaultParent`, fetches the authorized parent list, selects canonical UUIDs, and shows explicit loading, unavailable, no-parent, no-child, and error states. It does not label the result as an invoice or fabricate fallback subscriptions.

## PostgreSQL security audit result

All current security audit writes use the PostgreSQL repository. The application and migration share a closed action vocabulary. Details allow at most 32 bounded scalar fields and reject sensitive key names, nested content, non-finite numbers, and oversized values/payloads. The database repeats the core constraints and append-only protection. Persistence failure produces one payload-free signal while preserving the established best-effort business-mutation behavior.

## Legacy corporate and ActivityLog result

Corporate transformation resolves every owner and child through accepted PostgreSQL provenance; ambiguity and conflicts block apply. ActivityLog transformation imports only allowed actions with canonical organization/actor mappings, valid timestamps/IP, and scalar-safe details. Unsafe rows are accounted for by hash-only dispositions; raw mixed payloads remain in the controlled legacy source pending encrypted archive and retention approval.

The preserved local source contained zero parent organizations and zero corporate child links. Corporate dry-run/apply/verify completed with zero blockers and exact zero-row reconciliation. The local ActivityLog source contained 11 rows: 6 scalar-safe events (two each for `customer.created`, `service.created`, and `appointment.created`) across two organizations, and 5 `unsafe_details` dispositions. Apply and verification completed with zero blockers, zero provenance duplicates, and exact 6/5 source accounting. Both authority latches were then activated locally and post-activation preflight passed. Activation was not repeated during closeout.

## Dormant prototype retirement

The preserved local Mongo source contained zero Message and zero Notification documents before their unused models were removed. The unused activity logger and NotificationBell were removed, and Socket state no longer advertises unimplemented notification/message events. The dormant Chat page and sidebar entry were removed; the existing unavailable-feature route remains an honest response for a direct legacy path. No replacement messaging or notification product was built.

## Normal-runtime Mongo retirement

The normal server no longer imports Mongoose connection lifecycle code, reads `MONGO_URI`, waits for MongoDB, or reports Mongo in readiness. `runtimePersistence` composes only PostgreSQL live repositories. Normal Compose starts exactly PostgreSQL, backend, and frontend; MongoDB and `legacy-tools` require the explicit `legacy-migration` profile.

Remaining Mongoose models and Mongo repositories are limited to explicit migration, reconciliation, recovery, archive-compatible tooling, and compatibility tests. The `express-mongo-sanitize` package name remains as an HTTP key sanitizer only; it opens no Mongo connection. Type-only `MembershipRole` imports are erased by TypeScript and do not create a Mongoose runtime dependency. There is no Mongo corporate/audit fallback, dual-write, automatic repair, or tenant-selected authority.

## Local acceptance evidence

Before closeout, backend/frontend lint and typecheck passed, the source/unit matrix passed 139/139, and the dedicated corporate, corporate-migration, audit, audit-migration, and Mongo-retirement database suites passed. Migration 012 applied to the accepted local 001-through-011 database and clean/upgrade migration coverage passed. The explicit local legacy profile workflow, reconciliation, activation, and post-activation preflight passed as described above.

Normal Compose configuration exposed only PostgreSQL, backend, and frontend. With MongoDB stopped, all three services were healthy and `/health/live`, `/health/ready`, `/`, and `/login` returned HTTP 200. The explicit profile continued to expose retained legacy tooling separately.

The final backend lint, typecheck, 139/139 source/unit tests, and production build pass. All 25 requested database-backed suites pass sequentially: PostgreSQL, parity, preflight, identity cutover, commercial, operational foundation/migration/runtime, commercial intake/manual activation/renewal, Attendance runtime/migration/cutover, Customer Dues runtime/migration/cutover, Inventory runtime/migration/cutover, corporate runtime/migration, audit runtime/migration, and final Mongo-retirement preflight. The Inventory cutover source-contract check was rerun successfully in a one-off container with its expected frontend source mounted read-only after the long-running backend container correctly lacked `/frontend`.

Final frontend lint, typecheck, and production/PWA build pass. A fresh normal Compose rebuild passes; with Mongo stopped, PostgreSQL, backend, and frontend are healthy and the four required endpoints return HTTP 200. Current backend and frontend logs contain only normal startup/access messages. Historical PostgreSQL constraint errors in the retained container log are expected negative assertions from the passing integration suites, not post-rebuild runtime failures.

## Hosted and deletion status

The secure hosted PostgreSQL status initially showed only migration 012 pending. Migration 012 was explicitly applied and a second status confirmed migrations 001 through 012 applied. The isolated legacy-tools corporate dry-run then reached the existing Atlas network-access refusal before loading source facts or writing either database. Repeating the identical unavailable endpoint for the audit command would provide no additional evidence, so hosted corporate/audit reconciliation and both authority latches remain open. The accepted final application commit must be deployed and its public PostgreSQL-only liveness/readiness verified as part of closeout.

Previously open Attendance, Customer Dues, and Inventory hosted source reconciliation/activation remain open. No mapping, source count, or latch state was guessed. Backup/restore proof remains open before any real pilot/customer data.

Atlas was not deleted. Physical deletion requires complete hosted reconciliation, encrypted archive/retention approval for unsafe audit material, backup and restore evidence, and explicit rollback-window acceptance. V2-06F is engineering authority evidence, not pilot or production approval.

Operational steps are in [the V2-06F runbook](../runbooks/V2-06F_MONGO_RUNTIME_RETIREMENT.md); the durable decision is [ADR 0020](../adr/0020-postgresql-corporate-audit-and-mongo-runtime-retirement.md).
