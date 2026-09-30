# ADR 0020: PostgreSQL Corporate and Audit Authority with Mongo Runtime Retirement

- Status: Accepted
- Date: 2026-09-30
- Scope: V2-06F corporate, security audit, and normal-runtime Mongo retirement

## Context

After the accepted identity, commercial, and operational cutovers, normal application startup still connected to MongoDB for two live responsibilities: `ParentOrganization` corporate relationships and `ActivityLog` security audit writes. That connection also kept MongoDB in readiness and normal Compose even though Queue, Attendance, Customer Dues, and Inventory already used Mongo only as legacy migration or recovery sources.

The shared-core PostgreSQL schema already contained canonical `parent_organizations`, `organizations.parent_organization_id`, and `audit_events`, but corporate runtime still crossed UUID/ObjectId compatibility bridges and the Corporate screen selected a hard-coded parent. Audit details used an unconstrained mixed payload. Dormant Message, Notification, NotificationBell, and Chat sources implied capabilities that had no accepted product workflow or trustworthy runtime.

## Decision

### Corporate authority

PostgreSQL is the sole ordinary authority for parent organizations and child links. Parent and organization UUIDs are canonical at the HTTP, service, repository, and frontend boundaries. Parent list, creation, child linking, and commercial summary use reviewed PostgreSQL repositories and the existing authorization context.

A user sees and selects only parent organizations they own. Child linking requires ownership of the parent and an active child-organization membership with organization-management permission. Those checks and the relationship update run against locked PostgreSQL rows in one transaction. UUID possession does not grant authority. Summary data is a server-returned PostgreSQL commercial view, not a consolidated invoice.

### Security audit authority

PostgreSQL `audit_events` is the sole ordinary security-audit write authority. Action names use a closed allowlist shared by the application policy and database constraint. Details must be a bounded object of scalar string, number, boolean, or null values; sensitive key names, nested values, non-finite numbers, excessive keys, and oversized strings or payloads are rejected. IP text is bounded. Events and legacy dispositions are append-only.

Audit persistence remains best effort for the originating business mutation, matching the existing product behavior, but a failure emits one metadata-free operational signal. Logs do not include audit payloads, credentials, headers, cookies, or personal data.

### Legacy transformation and unsafe payload policy

Legacy `ParentOrganization` and child relationships are transformed through canonical user and organization provenance. Missing, ambiguous, conflicting, or invalid mappings block corporate apply. Deterministic UUIDs and retained ObjectId provenance make apply repeat-safe and reconciliation exact.

Legacy `ActivityLog` rows are migrated only when organization, actor, action, timestamp, IP, and scalar-safe details are valid. An unsafe row is not copied to `audit_events`. PostgreSQL records only a deterministic source-reference hash, source fingerprint, and bounded reason code so source accounting remains complete without retaining the unsafe mixed payload. The raw payload stays in the access-controlled legacy source until a separate encrypted archive, retention decision, and restore proof permit deletion. Raw audit archives, exports, or dumps must never enter Git.

### Runtime boundary

The normal web server loads `DATABASE_URL` and does not load `MONGO_URI`, connect Mongoose, wait for MongoDB, or report MongoDB in readiness. `/health/ready` is PostgreSQL-only. Normal Compose contains PostgreSQL, backend, and frontend. MongoDB and a backend-based `legacy-tools` service exist only behind the explicit `legacy-migration` profile.

Mongoose models and compatibility repositories are retained only for explicit migration, reconciliation, archive, recovery, and compatibility-test commands. They are not a fallback, mirror, dual-write destination, or tenant-selectable authority. Durable `corporate` and `security_audit` PostgreSQL latches are written only by a separate activation command after migration, reconciliation, and preflight succeed. After activation, ordinary legacy apply refuses unless a reviewed recovery flag is supplied.

### Dormant prototypes

The unused Message and Notification models, NotificationBell, activity logger, and dormant Chat page are removed. The application may retain an honest unavailable-feature route, but no replacement messaging or notification system is introduced in this milestone.

## Consequences

- A normal application deployment has one transactional database dependency: PostgreSQL.
- Corporate and audit requests no longer translate canonical UUIDs back to Mongo ObjectIds.
- Readiness can remain healthy with MongoDB stopped.
- Unsafe legacy audit content is accounted for without importing it into the canonical audit store or source control.
- Atlas remains available for explicit legacy work and rollback evidence; this decision does not authorize physical deletion.
- Attendance, Customer Dues, Inventory, corporate, and audit hosted-source reconciliation can remain open independently of the source-controlled runtime decision.
- Backup/restore proof, source reconciliation, retention approval, and rollback-window acceptance remain prerequisites to physical Atlas deletion and any real pilot data.

## Alternatives rejected

### Keep MongoDB in readiness as a precaution

Rejected because readiness must describe actual normal-runtime dependencies. A dormant fallback would preserve hidden split authority.

### Dual-write corporate or audit data

Rejected because partial failure and divergent identifiers would create two authorities with no safe transaction boundary.

### Copy every legacy audit payload

Rejected because unconstrained mixed data can contain secrets, credentials, nested request content, or unnecessary personal information.

### Delete Atlas during the cutover

Rejected because hosted source reconciliation, secure archive/retention decisions, backup/restore proof, and rollback-window acceptance are separate operational gates.

### Build replacement messaging or notifications

Rejected because there is no accepted product contract for those dormant prototypes and V2-06F is an authority-retirement milestone.
