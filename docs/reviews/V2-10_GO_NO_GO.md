# V2-10 strict GO / NO-GO

2026-10-08: **NO-GO FOR REAL CUSTOMER DATA**. Synthetic staging development/QA
only. No pilot, general availability, regulatory certification or unlimited
capacity authorization. An engineering evidence tag is not GO.

Every mandatory FAIL/BLOCKED is disqualifying. See the full
[45-gate register](V2-10_ACCEPTANCE_MATRIX.json) and
[execution evidence](V2-10_FINAL_ACCEPTANCE.md); no percentage substitutes for a
missing gate. Code quality/local PostgreSQL/browser proof, exact hosted
deployment, operations and human pilot approval remain four separate decisions.

## Prioritized MUST-FIX actions

| Priority / class | Gate and actual gap | Required next action / privilege | Automation and approval boundary |
| --- | --- | --- | --- |
| P0 HOSTING | Deliberately selected Render Free staging does not satisfy always-on policy; actual provider capacity/cost evidence missing | Accountable/budget owner: remain synthetic-only or explicitly approve suitable hosting class, bounded pilot size/support/data and budget; read actual Render/Neon metrics/quota/billing | Read-only verification automatable with provider access; upgrade/purchase requires separate explicit approval |
| P0 BACKUP | Latest real scheduled archive restored, but contains001-019 rather than020 | Recovery owner: authorize encrypted-only transfer for one post020 existing-workflow backup, or retrieve next qualifying schedule; restore into new PG18-compatible isolated target, verify020/all-domain counts/invariants and cleanup | Key now available at explicitly approved private location; fresh transfer was rejected by security reviewer. Do not bypass. Manual success cannot count as scheduling |
| P0 DATABASE | Correct public commercial singleton latch is absent; normal runtime is nevertheless PostgreSQL-only | Migration owner: explain historical hosted activation, review actual source/current facts, zero-blocker read-only V2-05D preflight, then separately approve explicit activation only if clean | Diagnostics automatable; no invented marker/parity, forced latch, source overwrite or Atlas deletion |
| P0 DEPLOYMENT | Frontend and backend exact deployed SHAs independently unverified | Release operator: read successful Render deployment IDs/SHAs and compare both with exact accepted commit; confirm commands/env/origins/proxy/TLS/health | Automatable after read-only provider access; HTTP200/title/Git push/CI do not prove deployment |
| P0 EXTERNAL ACCESS | Hosted two-tenant, role/entitlement/session/resource/report/CSV and realtime proof unavailable | Supply both private disposable accounts through ignored env; verify distinct STAGING V207C/V210 organizations and positive fixtures; run automated acceptance | No manual browser loop. Default business READ-ONLY; fixture mutations need explicit synthetic-only opt-in/validated IDs; no real payments |
| P0 DEPLOYMENT | Hosted manifest MIME is binary/octet-stream | Static-site operator: exact /manifest.webmanifest Content-Type application/manifest+json rule, preserve six /* security rules, verify deployed headers/worker/browser | Dashboard/deploy privilege required; local nginx/Vercel config is not Render proof |
| P0 MONITORING | No real acknowledged alert routes or independent common-mode coverage | Monitoring/incident owner: configure independent frontend/live/ready/backup-age review and safe notification tests; primary/backup acknowledge backup/deploy/unavailable/readiness alerts | Automate after authorized access; acknowledgements are human evidence. Never corrupt backups/take services down or disguise Free sleep with keepalive |
| P0 OPERATIONS | Private primary/backup/recovery/review/support/privacy ownership not evidenced | Accountable owner: private register with accepted roles, support hours, escalation/stop conditions, review cadence and access delegation; report only version/date | Codex cannot invent contacts/owners or acceptance; human assignment/approval required |
| P0 DATABASE | Actual Neon recovery/PITR/window/permissions/quotas/cost limits unknown | Database owner: read authenticated account controls, approve independent recovery strategy, rehearse new isolated recovery branch if authorized | Provider access needed; creating resources/restoring/purchases requires explicit authority; no public-doc or URL-based PITR claim |
| P0 SECURITY / EXTERNAL ACCESS | Real hosted recovery/verification SMTP unavailable; bounded hosted logs unavailable | Identity operator: secure test SMTP/disposable mailboxes and one-time delivery proof. Release operator: bounded sanitized deployment/auth/realtime/readiness/intake log review | Capture email/local logs remain separate; no customer emails or raw logs/artifacts |
| P1 DEPLOYMENT | Last-good deployed backend/frontend artifact and rollback drill unavailable | Release owner: identify actual immutable artifacts and additive-schema compatibility; rehearse safe isolated application rollback/escalation | Documentation exists; provider execution proof does not. No destructive schema downgrade or Mongo fallback |
| Release DEPLOYMENT | Exact final-commit CI/tag are post-commit gates; engineering candidate push succeeded with existing Git authentication | Verify exact final SHA/all CI jobs, then neutral annotated tag and clean main equal to fresh remote | No token in chat/Git/logs. Do not tag failed/superseded/unpushed candidate; final handoff records exact closure |

The old missing-key explanation is superseded: the authorized key exists and
authenticated decryption passed. The current extended restore blocker is the
archive's schema age and authorization for a newer transfer—not a fabricated
failure of encryption or of clean020 local migrations. Five real consecutive
scheduled backups and the watchdog have PASSED, but neither is alert receipt or
monthly extended recovery proof.

## Scope if a later GO review becomes possible

Require every mandatory PASS, successful exact-commit CI/deployed revision
comparison, resolved critical findings and explicit human risk approval. Record
maximum organizations/staff, enabled modules, approved data categories, support
hours, recovery/retention/review policy, monitoring recipients, escalation and
pilot stop conditions. Recommend only a controlled bounded pilot, never GA.
Remaining Free staging selection alone keeps this decision NO-GO.
