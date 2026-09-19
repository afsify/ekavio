# V2-06B Customer / Service / Appointment / Queue Cutover Runbook

This runbook plans the B2 cutover. V2-06B1 must stop after foundation, shadow migration, verification, and read-only preflight. Do not use this document as permission to switch runtime authority.

## 1. Preconditions and rollback boundary

- Start from the accepted B1 commit/tag with a clean tree and successful remote CI.
- Confirm `runtimePersistence.operationalAuthority` is still `mongodb` and `/api/queue` imports the Mongo Queue service.
- Confirm there is no Mongo/PostgreSQL Queue dual-write and no new Queue Socket.IO producer.
- Schedule a write freeze for final Queue migration. Identify the operator, window, reviewed mapping checksum, source/target backups, and restore owners.
- Before the first PostgreSQL-authoritative operational write, runtime rollback may restore the Mongo route after verifying Mongo did not miss a write.
- After any accepted PostgreSQL-authoritative write, do not simply point runtime back to stale Mongo. Restore/reconcile PostgreSQL or execute an explicitly reviewed reverse migration. Never enable fallback or dual-write.

## 2. Back up and prove restore

Follow the existing PostgreSQL/Mongo backup procedures. Capture Mongo Queue and Ledger source plus PostgreSQL before apply. Store encrypted artifacts outside the repository. Record checksums, timestamps, server/database identity, tool versions, and a disposable restore test. Never run `docker compose down -v`.

Stop if either backup or disposable restore proof fails.

## 3. Build the reviewed mapping

Use a local file ending in `.operational-queue-mapping.json`; this pattern is ignored by Git. Do not commit organization IDs or environment mappings.

```json
{
  "version": 1,
  "organizations": [
    {
      "legacyOrganizationId": "24-lowercase-hex-characters",
      "organizationId": "canonical-organization-uuid",
      "branchId": "reviewed-branch-uuid",
      "timezone": "Asia/Kolkata",
      "defaultCallingCode": "+91",
      "defaultServiceDurationMinutes": 30,
      "customerGroups": {
        "queue:24-lowercase-hex-characters": "reviewed-person-a"
      },
      "serviceResolutions": {
        " hair cut ": "Hair Cut"
      },
      "sessionPolicy": {
        "mode": "created-at-local-date",
        "laneKey": "default",
        "status": "closed"
      },
      "queueSessionOverrides": {
        "24-lowercase-hex-characters": {
          "localBusinessDate": "2026-09-17",
          "laneKey": "legacy-overflow",
          "status": "closed"
        }
      }
    }
  ]
}
```

Review every organization/branch/timezone and calling code against authoritative records. Review every collision as a human decision. An override is required when the created-at policy cannot distinguish duplicate historical numbers; do not renumber history to make the constraint pass.

## 4. Dry-run

Build the backend, then run from `backend`:

```powershell
npm.cmd run build
npm.cmd run operations:queue:shadow -- --mapping C:\secure\tenant.operational-queue-mapping.json
```

Dry-run is the default. It makes no operational-table writes. Archive the report with its mapping checksum. Stop for any issue, rejected/quarantined Queue row, unmapped organization, invalid phone/timezone/status/token label, customer ambiguity, service collision, or duplicate number in a reviewed session.

## 5. Apply during the freeze

After a second-person mapping/report review:

```powershell
npm.cmd run operations:queue:shadow -- --mapping C:\secure\tenant.operational-queue-mapping.json --apply
```

Apply is one PostgreSQL transaction, explicit, idempotent for unchanged sources, and fingerprint-protected against source drift. A failure rolls back the transaction. Do not edit accepted SQL migrations or repair rows manually to bypass a blocker.

## 6. Verify and preflight

While Queue writes remain frozen:

```powershell
npm.cmd run operations:queue:verify -- --mapping C:\secure\tenant.operational-queue-mapping.json
npm.cmd run operations:queue:preflight -- --mapping C:\secure\tenant.operational-queue-mapping.json
```

Both commands must exit zero. Review source/target counts, customer/service links, organization/branch/session assignment, token number/status/timestamps, legacy IDs, fingerprints, uniqueness, active branch timezones, migration status, concurrency constraints, and confirmation that Mongo is still runtime authority. Any unexplained difference blocks cutover.

## 7. B2 runtime switch

The B2 implementation must switch the complete vertical in one accepted change:

1. Register branch-authorized PostgreSQL Customer, Service, Appointment, and Queue services/routes.
2. Preserve entitlement and `queue.read` / `queue.manage` permission gates.
3. Replace ObjectId/free-form contracts with UUID customer/service/session/token contracts and real pagination metadata.
4. Make Dashboard active counts branch-correct.
5. Update the Queue/Appointment frontend, remove the dormant PUT hook and first-page total assumptions, and test loading/empty/error/retry behavior.
6. Emit only `queue.token.created` and `queue.token.status_changed`, after commit, to authorized branch rooms with PII-minimized DTOs.
7. Remove executable Mongo Queue runtime imports. Do not retain a fallback, read-through, or dual-write path.
8. Repeat migrations, migration verification, preflight, backend/frontend/integration/concurrency/security, Docker health, and repository authority-search gates.

## 8. Production validation

- Exercise create/list/status and appointment check-in using disposable or approved test identities in two branches and two organizations.
- Confirm unique monotonic session numbers under concurrent calls and exactly-once idempotent check-in.
- Confirm forbidden tenant/branch/customer/service/provider combinations fail closed.
- Confirm pagination totals, Dashboard counts, reconnect/refetch, and post-commit realtime behavior.
- Inspect backend/frontend/PostgreSQL logs for exceptions, constraint errors, PII, or Mongo Queue access.
- Re-run verification after the observation window. Keep the source backup immutable through the accepted rollback window.

## 9. Abort or rollback

Before authority activation, abort by leaving Mongo runtime unchanged; PostgreSQL shadow rows may remain for diagnosis or be restored through the approved database restore process. After activation but before any accepted write, revert the source-controlled authority change only after proving Mongo is current. After an accepted write, freeze the vertical and restore/reconcile PostgreSQL. Never solve an incident by enabling both writers or silently falling back to Mongo.
