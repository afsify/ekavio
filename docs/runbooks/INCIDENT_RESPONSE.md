# Incident Response for a Controlled Pilot

**Current status (2026-10-08): V2-10 NO-GO FOR REAL CUSTOMER DATA.** The pilot
incident primary, backup, support window and contact route are not privately
evidenced. Record them privately and test acknowledged alert delivery before GO.
Use the [current release procedure](V2-10_RELEASE_ACCEPTANCE.md) and
[mandatory blockers](../reviews/V2-10_GO_NO_GO.md). This is an engineering aid,
not a promise of 24/7 coverage.

Five consecutive scheduled encrypted backups (Oct4–8) and watchdog now pass,
superseding the older schedule observation below. This run's genuine Oct8
archive authenticated and restored into isolated PG18.6, but contains 001–019,
not 020. Its plaintext/owned target were removed. Current recovery requires a
qualifying archive with 001–020 checksums and versioned domain invariants; no
migration of an old restore may be presented as current recovery proof. Provider
recovery, human alert receipt and independent monitoring remain unproved.

Hosted manual backup `37124573922` and its isolated local PG18 recovery remain accepted dated evidence. The 2026-10-04 metadata review still found latest scheduled run `37108471538` failed and zero consecutive scheduled successes. New watchdog tooling detects scheduled failures/age/artifact metadata, not delivered notifications or independent GitHub outage detection. Use the [monitoring operator checklist](V2-07C_OPERATOR_ACTIONS.md#monitoring-and-backup-alert-operator-actions-2026-10-04); recurring backups, both recipients and tested delivery remain open.

## First actions for any incident

The alert recipient acknowledges, timestamps the event, identifies affected environments and tenants without posting PII, and contacts the primary/backup. Preserve deployment ID, sanitized logs, health responses, and database/backup status. Avoid broad access changes or destructive cleanup. For suspected data corruption or exposure, pause affected writes and onboarding while preserving evidence. Communicate a factual impact and next update time through the approved support channel; do not speculate about data loss.

| Trigger | Immediate checks and containment | Recovery decision |
| --- | --- | --- |
| Service outage or failed deployment | Check external `/health/live`, `/health/ready`, frontend route, provider events, backend errors, and last known-good artifact. Stop rollout and new onboarding. | If schema unchanged and compatible, redeploy known-good artifact; otherwise forward-fix or use isolated recovery path. |
| PostgreSQL unavailable | Check provider status, connection/storage limits, and readiness. Prevent repeated write attempts and preserve application logs. | Escalate to database operator/provider. Do not switch to Atlas or a stale backup automatically. Resume after readiness and integrity checks. |
| Suspected credential compromise | Limit affected account/service access, revoke sessions or rotate the specific secret through the provider, and preserve audit evidence. | Rotate dependent secrets deliberately, redeploy, verify login/refresh and tenant isolation, and notify affected parties through the approved policy. Never paste secrets into tickets. |
| Suspected cross-tenant exposure | Stop the affected route or service, freeze relevant writes, preserve safe request IDs and audit trail, and involve privacy/access owner. | Scope affected tenants and time window with restricted access; deploy reviewed fix and negative tests before reopening. Escalate notification decisions to the designated owner. |
| Corrupted or missing data | Freeze writes; capture an incident backup and safe counts, identify first bad write/deploy, and protect available provider history. | Restore only into a new isolated target, compare counts and affected facts under restricted access, then plan an approved forward repair or cutover. Never overwrite the live database as a first drill. |
| Failed or overdue backup | Check scheduled `Encrypted PostgreSQL Backup` and `PostgreSQL Backup Watchdog` runs. Review daily at 24 hours; watchdog hard failure is >30 hours, latest scheduled failure or missing/expired/empty artifact. Check encrypted manifest/checksum and approved recovery availability privately. Notify primary/backup; green health or a fresh manual run does not clear missing schedule proof. | Repair only diagnosed job/transfer configuration without exposing values; an approved manual encrypted copy can restore coverage but cannot prove scheduling. Suspend new customer onboarding until recovery is verified. Never substitute local Compose proof. |

## Monitoring signal triage

Proposed staffed-window targets (owners not yet assigned): acknowledge within 30 minutes, escalate to backup after 15 minutes of no primary acknowledgement, begin triage within 60 minutes. Outside the agreed window, respond at the next opening; no 24/7 coverage or guaranteed recovery time. Keep only UTC time/status and safe run/deploy/monitor links in alerts, never private bodies or credentials.

| Signal | First action |
| --- | --- |
| Frontend unavailable | Confirm URL/status, static-site deploy/events and last known-good artifact; stop rollout/onboarding and investigate exact asset/route defect. |
| Live unhealthy | Check process/deploy logs and provider events; compare ready without assuming a database cause. Free staging wake observations are informational, not always-on evidence. |
| Ready unhealthy | Compare live, inspect approved database connectivity/capacity and Neon incident status; preserve logs without connection strings, stop affected writes. |
| Backup workflow failed | Inspect the failed safe step/status; protect working keys and existing archives. Do not rotate secrets or rerun recovery blindly. |
| Watchdog overdue/missing artifact/API unavailable | Inspect latest scheduled run/attempt and retained artifact metadata; diagnose GitHub delay/outage separately. Daily independent age review remains necessary if the watchdog itself never runs. |
| Render failed deploy/unhealthy notification | Confirm Events and exact artifact, stop rollout, use existing schema-compatible rollback/forward-fix procedure. |
| PostgreSQL/provider incident | Check project capacity/connections and provider status, involve database operator, preserve evidence; no Atlas fallback or automatic restore. |

Use watchdog manual `notification_test=true` only for a controlled monitoring delivery test; it intentionally fails the watchdog without touching the real backup. An actual failed backup must not be manufactured. Require both responders to confirm receipt and record sanitized test scope/time/result before closing delivery gates.

## Restore invocation and closeout

Use the [backup/restore procedure](V2-07A_BACKUP_RESTORE.md) and [current release procedure](V2-10_RELEASE_ACCEPTANCE.md). The database operator confirms source and newly isolated target identifiers out of band, injects credentials through the secret store, validates the archive, restores without `--clean`, verifies current migrations 001–020 and versioned count-only/domain integrity, and measures elapsed time. The incident primary approves any later production traffic switch only after reconciling writes that occurred after the backup and validating authentication, tenancy, commercial entitlements, and core domains. Preserve the pre-incident target for a defined review window; remove only specifically approved temporary resources.

Close an incident with a timeline, impact, sanitized evidence, root cause, recovery source/time, affected customer communication, and follow-up owner. Review alert delivery and backup/recovery gaps. Never claim a recovery objective from the V2-07A local 12.379-second drill or public provider documentation alone.
