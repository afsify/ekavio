# V2-07C Pilot Blocker Resolution

**2026-10-01 decision: NO-GO FOR REAL CUSTOMER DATA.** This milestone supplies repository-controlled backup and acceptance tooling, plus precise operator actions. It does not override the [V2-07B decision](V2-07B_FINAL_PILOT_ACCEPTANCE.md), prove provider settings, authorize a paid plan, or approve a pilot. Starting main was `195f4bcac195cbd6c0539ecd03cf84bdeb8f3bd6`; the annotated `pre-v2-07c-pilot-blocker-resolution` checkpoint was pushed before changes.

## Blocker matrix

| V2-07B MUST-FIX | New V2-07C evidence | State / next evidence |
| --- | --- | --- |
| Scheduled encrypted off-provider backup | Hosted manual run `37124573922` on `22a6d28eed221e1165b7e2f09a90f70444385558` passed dump/validation, encryption and artifact upload; 35-day artifact retention is observed. | **PARTIALLY RESOLVED:** hosted creation/encryption/initial artifact retention PASS. Retrieval, offline decrypt, isolated restore, consecutive successful scheduled runs and failure/age delivery remain OPEN. See the separate gate record below. |
| Backup failure/age monitoring | Workflow failure is visible in GitHub Actions; a missing archive fails upload. Runbook defines daily age and response check. | **EXTERNAL ACTION REQUIRED:** name primary/backup recipients, enable/test workflow failure notifications and overdue-age signal. No automatic alert delivery claimed. |
| Neon recovery and hosted isolated restore | Local disposable restore verified migration 001–012 and zero core orphans; no hosted target was touched. | **EXTERNAL ACTION REQUIRED:** capture authenticated project plan/history/retention/quota/restore controls; create a new isolated Neon branch/project, retrieve/decrypt an actual hosted archive and prove restore/migrations/integrity, record timing, then destroy only that approved target. No hosted RPO/RTO claimed. |
| Always-on backend | Public HTTPS works, but previous 23-second cold wake and historically free/sleeping Render service remain the only class evidence. | **EXTERNAL ACTION REQUIRED:** choose and purchase a non-sleeping Render-compatible backend tier, record exact class/cost and deployed commit, verify WebSocket/capacity/connection/log limits and sustained wake. No upgrade made. |
| Hosted legacy authority | A controlled Docker legacy-tools attempt reached Atlas but was rejected by Network Access before source facts loaded. No Atlas or PostgreSQL writes. | **EXTERNAL ACTION REQUIRED:** narrow temporary current-egress `/32` Atlas allowlist; run accepted dry-run, source counts, reconciliation, verify, preflight, then activate only clean Attendance, Customer Dues, Inventory, corporate and audit latches separately. Review unsafe audit archive and retention. Never use `0.0.0.0/0`; Atlas is retained. |
| Security headers | HTTPS frontend currently returns `X-Content-Type-Options: nosniff`; `HEAD /login` lacks HSTS, CSP, frame, referrer and permissions headers. Repository `frontend/vercel.json` now specifies exact values for a Vercel deployment; this does **not** configure the current Render static site. `scripts/check-hosted-headers.mjs` is a read-only retest. | **EXTERNAL ACTION REQUIRED:** configure the same headers on the actual Render static service for `/*`, deploy, retest `/` and `/login`, and verify PWA/Socket/API behavior. |
| Availability/error/database alerts | Existing live/ready routes and provider logs exist; no installed external monitoring/recipient evidence. | **EXTERNAL ACTION REQUIRED:** monitor frontend, live and ready at five-minute intervals, route two consecutive failures plus Render backend errors/Neon availability and backup failure/age to named primary/backup; test delivery. |
| Authenticated hosted E2E and tenancy | New `scripts/check-hosted-acceptance.mjs` uses two separate disposable staging account credentials from environment only. It checks login/refresh/logout, context, read-only core domains, foreign organization/branch and foreign Customer/Dues/Inventory access. It does not print bodies, IDs or credentials. No credentials were available to run it. | **EXTERNAL ACTION REQUIRED:** provision `STAGING V207C` fixtures in distinct tenants, run the script from a trusted environment, separately test safe write flows and Socket.IO, and save sanitized pass/fail evidence. A missing fixture is a failure, not a pass. |
| Hosted logs and configuration | Public status, CORS and registration boundary from V2-07B remain historical evidence only. No authenticated Render/Neon control-plane or current log access. | **EXTERNAL ACTION REQUIRED:** review logs around E2E for secrets/PII; record sanitized exact deployed commit, `NODE_ENV`, distinct strong JWT/refresh secrets, TLS PostgreSQL URL, exact HTTP/Socket origins, `TRUST_PROXY_HOPS`, no bootstrap credentials or runtime `MONGO_URI`, and provider quotas. Do not record secret values. |
| Operating owners/support | Responsibilities and alert/incident triggers are explicit in the pilot and incident runbooks. | **EXTERNAL ACTION REQUIRED:** privately assign named people (one person may hold multiple roles), backup responder, support contact/hours, retention owner, and test the escalation path. |

## Local validation boundary

The three normal Compose services are PostgreSQL, backend and frontend; all reported healthy on 2026-10-01. Read-only hosted `HEAD` probes returned HTTP 200 for `/health/live`, `/health/ready`, `/`, and `/login`. These momentary probes do not prove always-on service or alert delivery. The local encrypted-backup acceptance generated an ephemeral key pair, validated a 273,046-byte custom archive, decrypted it, restored to a uniquely named disposable database, verified migration 001–012 and zero checked orphans, then removed only its exact temporary outputs. This proves tooling, not a hosted export, provider recovery, alert delivery, or a real-data recovery objective. No Atlas deletion or product-domain changes occurred.

Backend lint, typecheck and build passed; 143/143 unit tests passed. Frontend lint, typecheck and build passed with CI-equivalent local API/Socket build URLs. The envelope's three tamper/roundtrip/no-overwrite tests passed. The hosted acceptance script refused to run without disposable credentials, as designed. The hosted header probe failed for both `/` and `/login` because the required Render headers are not configured; no PASS was inferred from the Vercel config.

## Required execution order before another GO review

1. In private provider settings, appoint owners and support window; verify Neon plan/recovery and select always-on Render class. Configure exact Render headers and external availability/error/database alerts.
2. Generate a 3072-bit-or-stronger RSA key pair offline. Keep the private key outside GitHub/repository and restrict it to named restore operators. Add only the public PEM and hosted database URL as GitHub Actions secrets. Run the encrypted-backup workflow manually, retrieve its encrypted artifact, verify checksum, decrypt offline, and perform an isolated hosted restore. Confirm scheduled runs, retention and alert delivery.
3. Authorize a narrow Atlas network egress and run each legacy-domain reconciliation using accepted runbooks. Never infer a zero source from zero target rows or activate a pending latch without clean preflight. Keep Atlas physically retained.
4. Provision two disposable, separate-tenant `STAGING V207C` accounts/fixtures; run the automated acceptance, safe write and Socket tests, cross-tenant negatives, and scoped hosted log review. Any cross-tenant access is an immediate blocking defect.
5. Collect sanitized exact-commit/config/owner/monitor/provider evidence. Only then perform a separate explicit GO confirmation. Until every hard gate has evidence, the decision remains **NO-GO**.

No new GO review is justified yet. External provider/account actions were not fabricated or silently waived.

## Hosted encrypted backup evidence (2026-10-03)

Resume started from clean main at `22a6d28eed221e1165b7e2f09a90f70444385558`, equal to both local origin/main and the remote main ref. [Backup run 37124573922](https://github.com/afsify/ekavio/actions/runs/37124573922) was independently verified through GitHub's public Actions API: workflow `Encrypted PostgreSQL Backup`, event `workflow_dispatch`, completed/success, exact same commit. It started at 2026-10-03 12:57:44 UTC (18:27:44 IST); both `Create and validate encrypted PostgreSQL archive` and `Retain encrypted artifact and safe checksum manifest only` succeeded. This proves the hosted Neon -> pinned PostgreSQL 18.6 custom dump -> AES/RSA envelope -> GitHub artifact path.

Artifact `ekavio-postgresql-37124573922-1` (ID `11274179660`) is present, not expired, 270,002 bytes; created 2026-10-03 12:58:33 UTC, expires 2026-11-07 12:58:32 UTC. GitHub's artifact ZIP digest is `sha256:11c175a9e52357c4dc939860d28ee8465b789320e5a6a3d06b591016d5c32aae`. This is the uploaded ZIP digest, **not** the `.evb` checksum in its manifest. The accepted workflow uploads only `*.evb` and `*.evb.json`; plaintext `.dump` is excluded and the encryption wrapper removes its temporary plaintext. The operator reports encrypted artifact creation; artifact members have not been independently downloaded/inspected by the agent.

| Recovery fact | Current evidence / status |
| --- | --- |
| Hosted backup creation | **PASS:** exact successful run and dump/validation step |
| Envelope encryption | **PASS:** successful encryption command on accepted AES-256-GCM/RSA-OAEP-SHA256 code |
| Initial artifact retention | **PASS:** artifact exists with observed 35-day expiry; this does not prove a rolling history of usable restore points |
| No plaintext uploaded by workflow | **PASS (upload-scope evidence):** only encrypted envelope and manifest glob patterns are retained; downloaded ZIP inspection remains OPEN |
| Artifact retrieved and `.evb` present locally | **OPEN:** specific operator retrieval/member evidence not supplied |
| Offline decryption and private-key custody | **OPEN:** successful offline decrypt and key remaining outside repository/GitHub not specifically evidenced |
| Isolated PostgreSQL 18-or-newer restore | **OPEN:** no target version/isolation and successful restore evidence supplied |
| Restored migrations 001–012 and integrity | **OPEN:** no restored-target migration/checksum and four orphan-check report supplied; source migration evidence cannot substitute |
| Restore duration | **Not recorded:** no measured hosted recovery duration supplied |
| Disposable restore target and plaintext cleanup | **OPEN:** neither cleanup fact specifically evidenced |
| Consecutive scheduled successes | **OPEN:** this success is manual. Latest listed schedule run `37108471538` failed on the prior `855f1cb` commit; no successful schedule runs observed |
| Failure/overdue alert delivery | **OPEN:** no named recipients or tested delivery evidence |

The broad statement that manual recovery steps were completed does not establish each fact above. A sanitized item-by-item operator report was requested; no private key, connection string, customer data or raw archive is required. Do not repeat completed recovery work if its original factual evidence can be supplied.

## Current remaining blocker recheck

On 2026-10-03 the existing header checker failed for both `/` and `/login`: nosniff is present, but HSTS, CSP, frame protection, Referrer-Policy and Permissions-Policy remain missing. Hosted live/ready returned 200; liveness took 23,252 ms and readiness 233 ms. That latency does not prove the current account's class; the earlier free/sleeping record remains historical, and the actual class requires authenticated Render settings. No Render/Neon API credentials or the four disposable acceptance credential variables were available in this process; provider recovery, deployment/configuration, logs and authenticated E2E remain external evidence requirements.

No new Atlas source connection or apply was attempted without an allowlist update. The prior network refusal and pending Attendance, Customer Dues, Inventory, corporate and audit latches remain the latest evidence. Docker egress IPv4 was checked for a temporary narrow allowlist instruction; recheck it at execution time and keep the actual address outside Git. Atlas remains physically retained. No alert delivery, named owners, support window or retention approval has been supplied.

Follow the nine-step [remaining operator action checklist](../runbooks/V2-07C_OPERATOR_ACTIONS.md). All hard blockers still need evidence before a separate V2-07D review is justified; the decision remains **NO-GO FOR REAL CUSTOMER DATA**.

## Narrow backup client correction (2026-10-03)

The operator reported the hosted backup reached Neon but failed with server PostgreSQL 18.6 versus pg_dump 17.11. Public backup run `37108471538` confirms failure in the dump/validation step; its detailed logs require authenticated access, so the exact version pair is operator-supplied evidence. External backup/archive clients now use the verified official `postgres:18.6-alpine3.23@sha256:885cf05d376c7cf27afef02073e6bdac3841252537f16e244fd1c1e6a7c99fb1` manifest. Compose/CI PostgreSQL stays at 17.11. Regression coverage requires a pinned client major of at least 18; local restore rejects a newer-client dump before creating a target. Local pg_dump 17 backup/restore evidence does not prove a hosted pg_dump 18 archive can restore into PostgreSQL 17. The subsequent hosted encrypted workflow succeeded as recorded above; retrieval and isolated PostgreSQL 18-or-newer restore still need itemized evidence before the recovery gate can pass. No URL, TLS setting, key, product behavior or milestone tag changed.

The exact pinned image reported `pg_dump (PostgreSQL) 18.6` locally. All five envelope/client/restore-compatibility tests passed. The local encrypted Compose acceptance passed with a 273,046-byte pg_dump 17 archive, migrations 001–012, zero checked orphans and removal of the disposable target; archive validation used pg_restore 18.6. This narrow fix has not exported or restored hosted data.
