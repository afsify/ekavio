# V2-05C Identity/Auth Runtime Cutover Plan

This is a plan for a future explicitly approved milestone. Do not execute it as part of V2-05B. MongoDB remains runtime authority after V2-05B.

## Preconditions

- Approve a maintenance window and identify the operator, rollback decision owner, maximum rollback interval, and communication channel.
- Confirm exact environment targets, strong secrets, current application version, tested backups, database capacity, monitoring, and a clean V2-05B preflight.
- Freeze shared-core identity writes for the cutover window. Operational Mongo writes may continue only if their validated legacy-ID relationships cannot change.
- Define how any PostgreSQL identity write after the switch will be reconciled back to Mongo if rollback is invoked. A blind rollback is prohibited.

## Planned sequence

1. Enter the maintenance window and control registration, staff, profile, membership, branch, and session-changing writes.
2. Back up MongoDB, verify the archive is non-empty, and record its protected location/checksum.
3. Back up PostgreSQL, verify the archive, and record the same recovery metadata.
4. Run and review authorization and entitlement compatibility backfills where applicable; do not apply ambiguous results.
5. Run the PostgreSQL shadow command in dry-run mode and resolve every issue.
6. Apply the PostgreSQL shadow migration explicitly in one reviewed transaction.
7. Run PostgreSQL shadow verification and stop on any mismatch.
8. Run `postgres:cutover:preflight` and require a zero-blocker report.
9. Invalidate all Mongo refresh sessions without copying their hashes. Record the invalidation time.
10. Deploy the single reviewed composition change that selects PostgreSQL identity, session, authorization, staff, registration/profile, and attendance-identity adapters. Do not switch commercial or operational storage.
11. Require all users to sign in again; no legacy refresh credential is accepted.
12. Execute authentication, refresh rotation/replay, logout, password change, organization/branch switching, staff list/create/revoke, attendance foreign-user rejection, Socket.IO room, permission, and operational-domain smoke tests for at least two tenants.
13. Observe authentication failure rates, database errors, mapping failures, authorization denials, session rotation conflicts, latency, connection saturation, and operational Mongo bridge errors through the bounded observation period.
14. End maintenance only after smoke tests and observation thresholds pass; otherwise invoke the approved rollback path.

## Rollback conditions

Rollback is considered for systemic login/session failure, tenant or branch isolation failure, missing/incorrect mappings, transactional write failure, unacceptable database latency/availability, or operational bridge failure. A suspected cross-tenant exposure triggers immediate traffic restriction and incident handling before recovery work.

## Rollback plan

1. Re-enter maintenance and stop shared-core writes.
2. Inventory every PostgreSQL identity/session/authorization write made after the cutover time.
3. Reconcile or safely replay durable identity changes into MongoDB according to the pre-approved bounded rollback procedure. PostgreSQL writes must never be silently discarded.
4. Deploy the reviewed composition rollback that selects Mongo shared-core adapters.
5. Invalidate sessions again and require re-login so no credential crosses the authority boundary.
6. Run two-tenant auth, staff, branch, attendance, and operational-domain smoke tests.
7. Preserve PostgreSQL data and logs for reconciliation and incident review; do not reset or delete volumes.
8. Document the failure, data disposition, and prerequisites before another cutover attempt.

The safe rollback window ends once unreconciled PostgreSQL writes exceed the explicitly approved replay/reconciliation procedure. At that point recovery requires a dedicated migration plan, not an automatic database toggle.
