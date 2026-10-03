# Incident Response for a Controlled Pilot

**Status: procedure drafted; V2-07C remains NO-GO FOR REAL CUSTOMER DATA.** The pilot incident primary, backup, support window, and contact route are not yet assigned. Record them privately and test alert delivery before any GO decision. This runbook is an engineering response aid, not a promise of 24/7 coverage.

Hosted manual backup `37124573922` passed creation, encryption and artifact upload on 2026-10-03. It does not establish retrieval/decryption/isolated restore, cleanup, recurring schedules or delivered alerts. Use the [remaining operator checklist](V2-07C_OPERATOR_ACTIONS.md) to close these gaps; do not treat a successful manual run as recovery readiness.

## First actions for any incident

The alert recipient acknowledges, timestamps the event, identifies affected environments and tenants without posting PII, and contacts the primary/backup. Preserve deployment ID, sanitized logs, health responses, and database/backup status. Avoid broad access changes or destructive cleanup. For suspected data corruption or exposure, pause affected writes and onboarding while preserving evidence. Communicate a factual impact and next update time through the approved support channel; do not speculate about data loss.

| Trigger | Immediate checks and containment | Recovery decision |
| --- | --- | --- |
| Service outage or failed deployment | Check external `/health/live`, `/health/ready`, frontend route, provider events, backend errors, and last known-good artifact. Stop rollout and new onboarding. | If schema unchanged and compatible, redeploy known-good artifact; otherwise forward-fix or use isolated recovery path. |
| PostgreSQL unavailable | Check provider status, connection/storage limits, and readiness. Prevent repeated write attempts and preserve application logs. | Escalate to database operator/provider. Do not switch to Atlas or a stale backup automatically. Resume after readiness and integrity checks. |
| Suspected credential compromise | Limit affected account/service access, revoke sessions or rotate the specific secret through the provider, and preserve audit evidence. | Rotate dependent secrets deliberately, redeploy, verify login/refresh and tenant isolation, and notify affected parties through the approved policy. Never paste secrets into tickets. |
| Suspected cross-tenant exposure | Stop the affected route or service, freeze relevant writes, preserve safe request IDs and audit trail, and involve privacy/access owner. | Scope affected tenants and time window with restricted access; deploy reviewed fix and negative tests before reopening. Escalate notification decisions to the designated owner. |
| Corrupted or missing data | Freeze writes; capture an incident backup and safe counts, identify first bad write/deploy, and protect available provider history. | Restore only into a new isolated target, compare counts and affected facts under restricted access, then plan an approved forward repair or cutover. Never overwrite the live database as a first drill. |
| Failed or overdue backup | Check the scheduled `Encrypted PostgreSQL Backup` Actions run, age (<24 hours), encrypted artifact/manifest presence, SHA-256, GitHub artifact retention/access, offline private-key availability, and Neon history. Notify primary and backup; a green application health probe does not clear this incident. | Repair secrets/job/transfer without exposing values, run a manual encrypted copy, retrieve it, and perform an isolated restore if integrity is uncertain. Suspend new customer onboarding until recovery is verified. Never replace a missing hosted backup with the local Compose proof. |

## Restore invocation and closeout

Use the [backup/restore procedure](V2-07A_BACKUP_RESTORE.md) and [pilot release procedure](PILOT_OPERATIONS.md). The database operator confirms source and newly isolated target identifiers out of band, injects credentials through the secret store, validates the archive, restores without `--clean`, verifies migrations 001–012 and count-only integrity, and measures elapsed time. The incident primary approves any later production traffic switch only after reconciling writes that occurred after the backup and validating authentication, tenancy, commercial entitlements, and core domains. Preserve the pre-incident target for a defined review window; remove only specifically approved temporary resources.

Close an incident with a timeline, impact, sanitized evidence, root cause, recovery source/time, affected customer communication, and follow-up owner. Review alert delivery and backup/recovery gaps. Never claim a recovery objective from the V2-07A local 12.379-second drill or public provider documentation alone.
