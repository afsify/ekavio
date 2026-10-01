# Pilot Operations Runbook

**Status: proposed procedure; V2-07C remains NO-GO FOR REAL CUSTOMER DATA.** This runbook is actionable only after the [V2-07C blocker record](../reviews/V2-07C_PILOT_BLOCKER_RESOLUTION.md) and prior [acceptance blockers](../reviews/V2-07B_FINAL_PILOT_ACCEPTANCE.md) are closed and a new explicit GO decision is recorded. It does not authorize customer onboarding, service purchase, or provider resource deletion.

## Scope and ownership

The intended pilot is a handful of invited businesses. A platform operator reviews every request, creates the agreement, verifies the manual payment outside the application, records settlement, hands off the one-time invitation, and handles renewal. No gateway, statutory invoice, automated charge, automated message, or Sales/POS is in scope.

Before pilot activation, record named primary and backup people, contact route, and support hours in a private operator register for each role below. Do not put their personal contact details or credentials in Git. All assignments remain **OPEN** at V2-07C closeout. A solo operator may fill several roles, but a reachable backup responder and tested escalation still need explicit assignment.

| Role | Required duty |
| --- | --- |
| Platform commercial operator | Confirm agreement terms and external manual settlement; issue one-time invitation only after exact settlement; handle renewals and customer support handoff |
| Release operator | Check migrations, deploy exact reviewed commit, run health and acceptance probes, preserve known-good release identifier |
| Database/backup operator | Check daily archive/transfer/age and provider status; perform monthly isolated restore and retention/destruction review |
| Incident primary and backup | Receive uptime, readiness, database, backup, deploy, and security alerts; coordinate response during stated support hours |
| Privacy/access owner | Review operator access, data/backup retention, access complaints, and suspected tenant exposure |

## Pre-pilot activation gate

Require the final acceptance review to be updated to GO only after every MUST-FIX item has evidence. Specifically record the paid always-on backend class/cost, current Neon plan and restore window, isolated hosted restore proof, first successful scheduled encrypted off-provider backup and retrieval, monitoring delivery to both responders, hosted legacy-source disposition and authority flags, security headers, hosted E2E/negative tenancy/log checks, and assigned ownership. The candidate architecture is a static HTTPS frontend, one always-on HTTP/WebSocket backend, and managed PostgreSQL. Atlas may remain offline for approved legacy retention; it must not be a runtime dependency.

## Daily checks and alerts

- Poll public `/health/live` and `/health/ready` from outside the host at least every five minutes. Alert the named responder after two consecutive failures; distinguish process failure from PostgreSQL readiness failure.
- Review backend error logs and deployment events at the beginning of the agreed support window and after every alert/deploy. Confirm provider log retention and access; avoid logging PII or credentials.
- Inspect provider PostgreSQL availability, storage and connection usage daily and after capacity alerts. Confirm current plan limits in the account console; the repository cannot prove them.
- Verify the backup job produced a validated archive, copied it to encrypted off-provider storage, and recorded its safe checksum/size/time. Alert on any failed step or if the newest verified copy is older than 24 hours. A backup job exit code alone does not prove an accessible copy.
- Review security/access alerts and customer complaints with the privacy/access owner. Escalate suspected cross-tenant exposure immediately under the [incident runbook](INCIDENT_RESPONSE.md).

The V2-07C repository includes a daily encrypted-backup workflow, but its secrets, first hosted run, recipient notifications, age monitor, and external availability/error/database alerts are **not installed or evidenced**. Configure an external five-minute HTTPS checker for `https://ekavio.afsify.com/`, `https://api.ekavio.afsify.com/health/live`, and `/health/ready`; notify primary and backup after two consecutive failures. Enable Render backend error/deploy alerts, Neon availability/capacity alerts, GitHub Actions failed-run notifications, and a backup-age check that pages on >24 hours without a verified artifact. Send a test failure to both recipients and record the sanitized delivery result privately. Do not treat an untested dashboard setting as alert proof.

## Backup and restore operation

Follow [V2-07A backup/restore](V2-07A_BACKUP_RESTORE.md), including its V2-07C encrypted Actions export and offline-key-custody steps. Use its pinned PostgreSQL client and fail-closed archive validation. The proposed 35-day encrypted Actions artifact retention is off the application/database providers, but repo artifact access/retention and successful runs must be proved. Take an extra validated encrypted export before schema changes; maintain at least 14 daily/four weekly usable points or an approved stronger policy. Restrict access to named recovery operators, monitor transfer and age, and check retention deletion. Never copy a dump or private key to Git or public storage.

The read-only hosted checker is `node scripts/check-hosted-acceptance.mjs`. Supply `EKAVIO_STAGING_PRIMARY_PHONE`, `EKAVIO_STAGING_PRIMARY_PASSWORD`, `EKAVIO_STAGING_FOREIGN_PHONE`, and `EKAVIO_STAGING_FOREIGN_PASSWORD` only through a trusted process environment; use separate tenants and `STAGING V207C` disposable fixtures, including at least one foreign Customer, due entry and Inventory item. Optional `EKAVIO_STAGING_BUSINESS_DATE` is `YYYY-MM-DD`. Run safe write/Socket workflows separately and review hosted logs around execution. A missing fixture or credential is not a pass; never paste script inputs or response bodies into a ticket.

The current static frontend is on Render. `frontend/vercel.json` is an alternative-host config, **not** the active Render header configuration. In the Render static-site dashboard, set headers for path `/*`: `Strict-Transport-Security: max-age=31536000`, `Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://api.ekavio.afsify.com wss://api.ekavio.afsify.com; worker-src 'self'; manifest-src 'self'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Deploy and run `node scripts/check-hosted-headers.mjs`, then check PWA assets, login, API and Socket.IO. [Render's static-site header documentation](https://render.com/docs/static-site-headers) describes dashboard configuration; a repo Vercel file alone does not configure Render.

Once each month, retrieve a stored copy and restore to a newly created isolated target. Require migration 001–012 checksum status, count-only integrity, zero core orphans, app health, and measured total time. Destroy only the reviewed disposable target after evidence capture. Provider history/branch restore settings are a second independent layer; record the actual project controls and rehearse a new-branch restore. Never rehearse over staging or a real database. V2-07A's 12.379-second proof was local only; no hosted RTO or RPO has been established.

## Release and rollback

1. Record the exact reviewed commit, prior known-good commit/tag, operator, deploy window, and current migration status. Require the secure direct/session-capable PostgreSQL connection to report exactly the accepted migrations before rollout; take and verify a pre-change encrypted backup.
2. Review forward-only migration compatibility. Apply only reviewed pending migrations explicitly, with a separate migration record; an app deploy alone is not migration evidence. Preserve logs and migration output without credentials.
3. Deploy the exact accepted frontend/backend artifacts. Check `/health/live`, `/health/ready`, `/`, and `/login` for 200; verify login/refresh, tenant context, one safe read per enabled domain, entitlements, and Socket behavior with disposable credentials. Review logs and backup/alert heartbeat.
4. Stop rollout and freeze writes on a critical auth/tenant defect, data loss/corruption, unavailable PostgreSQL, failed readiness, or an incompatible migration. Preserve evidence and invoke [incident response](INCIDENT_RESPONSE.md).
5. Application-only regression with unchanged compatible schema may roll back to the prior known-good artifact. An applied forward-only migration has no assumed reverse SQL. Prefer a reviewed forward fix; if data restore is needed, restore into an isolated target, reconcile writes made after the archive, and require explicit incident approval before any production cutover.

Do not treat Atlas as a rollback source for PostgreSQL-native writes. Do not use `docker compose down -v`, provider branch reset, `pg_restore --clean`, or unreviewed SQL against an existing hosted database.

## Data handling and support

Customer/contact and operational records, manual payment metadata, audit history, and all backups contain sensitive business or personal data. Use membership-scoped customer access and platform-operator-only commercial mutation. Do not collect card/CVV/UPI PIN or place passwords, token values, refresh cookies, database URLs, request-body PII, or raw dumps in logs/tickets. Retention and deletion periods, lawful notices, operator access review, and support expectations require an approved private policy before a real pilot. The app does not claim a compliance certification or 24/7 support.
