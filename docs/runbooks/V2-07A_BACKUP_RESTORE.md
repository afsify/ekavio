# V2-07A PostgreSQL Backup and Restore Runbook

PostgreSQL is EkaVio's sole normal runtime authority. This runbook defines the minimum recovery procedure for the current low-cost staging topology and a future limited pilot. It does not authorize a production incident restore, a pilot-readiness decision, or deletion of Atlas.

## Recovery model and evidence boundary

EkaVio uses two independent recovery layers:

1. **Provider-managed history/snapshots.** Hosted staging uses Neon, but a connection URL does not reveal the account plan, configured history window, snapshot state, or whether a restore control is currently usable. The repository operating record describes the environment as free/sleeping staging. On 2026-09-30, [Neon's official plan documentation](https://neon.com/docs/introduction/plans) listed a six-hour instant-restore history (capped at 1 GB-month of changes) and one manual snapshot for the Free plan. That is public plan documentation, not authenticated evidence for this specific project and not a hosted restore rehearsal. Before a pilot, an operator must record sanitized console evidence for the actual project, its plan, configured restore window, snapshot/retention state, branch quota, and a restore into a new branch. Until then, provider-managed RPO/RTO is **unverified and must not be relied upon**.
2. **Operator-managed logical backups.** `pg_dump` custom-format archives preserve the accepted schema and data independently of provider history. They are full point-in-time logical snapshots, not continuous or incremental recovery. A validated `pg_dump` file is not proven until it has passed a disposable `pg_restore`, migration-status verification, and the count/integrity checks below.

Use both layers for a pilot. Provider history is for recent operator/application mistakes; encrypted logical exports provide portable, off-provider recovery. Neither layer replaces tested incident ownership.

## Safety rules

- Never restore over staging, production, or the current development database.
- Freeze application writes before an incident export or final cutover backup.
- Never print, paste, or place a database URL in a command argument, transcript, issue, or Git.
- Supply hosted `DATABASE_URL` only through an operator process environment or secret manager; clear the process variable after the command.
- The backup tool rejects relative paths and any destination inside this repository.
- A generated `.dump` is not encrypted by `pg_dump`. Write it only to an encrypted, access-controlled operator path, then move it to approved encrypted storage.
- Restrict backup access to named recovery operators. Record retention, owner, SHA-256, tool version, source environment, and destruction date outside the archive.
- Keep at least one logically independent copy away from the application host/provider. Test retrieval as well as restore.
- Never commit a dump. `.gitignore` and Docker ignore rules are defense in depth, not storage controls.
- Do not use `--clean`, `--drop`, or a provider branch reset against an existing environment as a rehearsal.

## Normal logical backup

External backups and archive validation use `POSTGRES_TOOLING_IMAGE`, pinned to `postgres:18.6-alpine3.23@sha256:885cf05d376c7cf27afef02073e6bdac3841252537f16e244fd1c1e6a7c99fb1`. This supports the reported hosted Neon PostgreSQL 18.6 server: the previous pg_dump 17.11 client refused that newer major. Local Compose/CI database servers remain pinned to PostgreSQL 17.11; `--compose` uses that server's own pg_dump and reports its actual version. The tool writes a timestamped custom-format archive exclusively, validates it with the pinned pg_restore 18.6 client, and reports only safe metadata: path, size, TOC count, SHA-256, actual dump tool identity, validation image, and duration. On failure it removes only the incomplete file it just created. It never prints the connection URL.

The tooling manifest digest was verified against the official Docker Hub image on 2026-10-03. The local non-secret version check is `docker run --rm <the-pinned-image-above> pg_dump --version`. Changing the client pin does not change connection URLs, TLS/sslmode, encryption keys, or the application database server.

For the local Compose database:

```powershell
node scripts/postgres-backup.mjs `
  --output-dir C:\secure\ekavio-backups `
  --compose
```

For hosted PostgreSQL, load the URL from the provider secret store without echoing it:

```powershell
$env:DATABASE_URL = <secure operator injection>
node scripts/postgres-backup.mjs `
  --output-dir E:\encrypted\ekavio-backups
Remove-Item Env:DATABASE_URL
```

Stop if the command is non-zero, the archive is empty, validation fails, the reported source is unexpected, or the storage location is not encrypted/access-controlled. Copy the reported SHA-256 and safe metadata into the private change/recovery record. Do not copy the URL or archive into repository documentation.

### Pilot schedule and retention proposal

The retention/recovery objectives below remain planning gates; a scheduler exists but recurring success and monitoring are not yet proved:

- take one encrypted logical backup at least every 24 hours and before every schema release or material operator mutation;
- retain daily backups for 14 days and four weekly backups, subject to an approved privacy/retention policy;
- monitor completion, non-zero size, validation, transfer to protected storage, and overdue age;
- rehearse a restore at least monthly and after a material migration/tooling change;
- verify provider history/snapshot settings separately and alert when they change.

The first successful hosted manual encrypted-backup run, `37124573922` on commit `22a6d28eed221e1165b7e2f09a90f70444385558`, completed on 2026-10-03 with archive validation, encryption and artifact upload. Artifact `ekavio-postgresql-37124573922-1` is retained until 2026-11-07T12:58:32Z. This proves creation/encryption/initial retention only. Retrieval, offline decryption/private-key custody, isolated PostgreSQL 18-or-newer restore, restored migration/integrity checks and cleanup remain OPEN pending specific evidence. Successful scheduled runs and failure/age delivery also remain OPEN. See the [separate gate record](../reviews/V2-07C_PILOT_BLOCKER_RESOLUTION.md) and [operator checklist](V2-07C_OPERATOR_ACTIONS.md). Do not regenerate working keys or rerun an already completed recovery step merely to document it. No pilot RPO/RTO is claimed.

### V2-07C encrypted GitHub Actions export

The default-branch `.github/workflows/postgres-backup.yml` schedules 02:17 UTC daily and supports manual dispatch. Add `EKAVIO_BACKUP_DATABASE_URL` (the hosted direct/session-capable PostgreSQL URL) and `EKAVIO_BACKUP_PUBLIC_KEY_PEM` as repository Actions secrets; never put them in workflow YAML or logs. Generate a fresh RSA key of at least 3072 bits on a trusted offline machine and retain its private PEM separately under restricted operator custody. The job validates the custom-format archive, encrypts it with a random AES-256-GCM data key wrapped by RSA-OAEP-SHA256, uploads only `.evb` and safe `.evb.json` manifest files, and retains the artifact for 35 days. Its plaintext exists only in runner temporary storage until encryption and is removed after completion. The manifest carries timestamp, encrypted SHA-256, plaintext SHA-256, sizes, format and public-key fingerprint, not row data or credentials. Artifact access follows GitHub repository permissions; review those and the effective retention limit in the authenticated repository settings. GitHub scheduled runs [can be delayed or dropped](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), so an age check is mandatory.

Download a successful workflow artifact from Actions to a restricted, encrypted operator machine. Compare its encrypted SHA-256 to the manifest before decryption. Use `node scripts/postgres-decrypt-backup.mjs --encrypted <absolute-outside-repo.evb> --output <new-absolute-outside-repo.dump> --private-key-file <absolute-offline-private.pem>`; the tool refuses repository paths and existing output. Verify the dump with `pg_restore --list`, then restore into a **new isolated** PostgreSQL target. Destroy the temporary plaintext promptly under the approved retention policy. Never upload or email the private key or plaintext archive. Rotate a compromised key and preserve decryptability of retained older artifacts through approved custody.

Every support day, the named backup primary checks the newest successful **scheduled** run, its timestamp (<24 hours old), checksum/size manifest and artifact downloadability. Confirm GitHub Actions failure notifications reach both primary and backup; test with a controlled failure or approved notification test. A failed/missing/overdue run is an incident under `INCIDENT_RESPONSE.md`. This daily review is a manual control; no automated recipient alert is claimed until configured and tested. The 35-day rolling artifact policy covers 14 daily and four weekly restore points only when runs actually succeed and the repository retention setting permits 35 days. Keep an approved weekly copy if the policy requires it independently. At least monthly, decrypt a retrieved hosted artifact and execute an isolated restore/integrity drill. The local command `node scripts/backup-compose-acceptance.mjs --confirm-local-disposable` proves the encryption/decryption/restore path on disposable Compose data only.

### Real hosted archive recovered into isolated local PostgreSQL 18.6

On 2026-10-03 the outside-Git encrypted file/manifest from hosted backup run `37124573922` passed encrypted SHA-256 validation, authenticated offline decryption and plaintext size/SHA-256 validation. Existing key was used only as an outside-Git file input. Pinned pg_restore 18.6 recognized the archive before a new network-isolated, no-published-port, tmpfs-only PostgreSQL 18.6 target was created. Restore succeeded in 2.055 seconds; restore plus existing checksum-aware migration/integrity verifiers took 5.386 seconds. All migrations 001–012 and 28 required tables passed; four core orphan counts were zero. The exact target and this run's new plaintext dump were removed and absences checked. Encrypted file, manifest and key remain outside Git. See the [full evidence record](../reviews/V2-07C_PILOT_BLOCKER_RESOLUTION.md).

This supersedes the earlier OPEN logical retrieval/decrypt/isolated-restore facts above, not the independent Neon account/PITR, recurring schedule, alerting or restored-application gates. Original ZIP-member inspection remains OPEN because no ZIP was available. An earlier operator plaintext copy remains pending cleanup direction. This is a real hosted-source archive restored **locally**, not a Neon-hosted restore or pilot RTO/RPO guarantee; PostgreSQL 17 compatibility is not claimed.

## Disposable restore proof with local Compose

Build the backend first so the verifier and accepted migrations are compiled:

```powershell
docker compose build backend
```

Choose a new database name with the mandatory safety prefix. The script refuses any other name and refuses an existing database:

```powershell
node scripts/postgres-restore-proof.mjs `
  --archive C:\secure\ekavio-backups\ekavio-postgresql-<timestamp>.dump `
  --database ekavio_v207a_restore_<unique_suffix> `
  --drop-after-verification
```

The script:

1. validates that the absolute archive path is outside Git and that `pg_restore --list` recognizes it;
2. requires the normal Compose PostgreSQL and backend services to be running;
3. refuses a pre-existing target and creates only the prefixed disposable database;
4. restores with `--exit-on-error --no-owner --no-acl` and without `--clean`;
5. runs checksum-aware migration status and requires exactly migrations 001 through 012 applied;
6. counts the required identity, commercial, operational, and audit tables without selecting row data;
7. requires zero membership, branch, subscription, and audit-event orphan checks;
8. drops only the exact prefixed disposable database after successful verification when the explicit flag is present.

Before creating a target, the helper reads the archive's pg_dump major and the Compose server major and rejects a newer-client archive. A hosted dump generated by pg_dump 18 must be rehearsed on PostgreSQL 18 or newer with compatible restore tooling; it is **not proven restorable into PostgreSQL 17**. The existing local proof uses a pg_dump 17 archive and a PostgreSQL 17 target; archive readability by pg_restore 18 alone is not a hosted restore proof. [PostgreSQL's pg_dump documentation](https://www.postgresql.org/docs/18/app-pgdump.html) describes newer-server refusal and the lack of guaranteed restore compatibility with older servers.

On failure after target creation, the target is retained for diagnosis and its exact name is reported. Inspect it before any cleanup; never broaden a drop command.

## Hosted disposable restore

The local helper deliberately does not create or delete Neon projects/branches. A hosted rehearsal requires separate authorization and provider controls:

1. create a **new disposable Neon PostgreSQL 18 or newer project or branch** with no application traffic for the hosted pg_dump 18 archive; verify its actual server version and use the pinned pg_restore 18.6 client;
2. obtain a separate direct/session-capable target URL through the secret manager;
3. confirm source and target project/branch identifiers in the private change record;
4. run `pg_restore --exit-on-error --no-owner --no-acl` against the new target with credentials injected securely;
5. run the built backend against the disposable target:

   ```powershell
   npm.cmd run db:migrate:status
   npm.cmd run recovery:verify
   ```

6. verify a separately deployed test application against the target, then remove only the authorized disposable target.

Do not infer hosted restore proof from local Compose. Do not use the staging application database as the target. V2-07A performed only the local proof because no authenticated provider control-plane/plan evidence or separately authorized hosted target was available.

## Required restored-state checks

`npm run recovery:verify` emits table names and counts only. It must report:

- exactly migrations `001_shared_core.sql` through `012_corporate_audit_runtime_authority.sql`, all applied with source checksums accepted;
- present/countable `users`, `organizations`, `memberships`, `branches`, and membership branch assignments;
- present/countable plan, add-on, subscription, entitlement, agreement, payment, and renewal structures;
- present/countable Customer, Service, Appointment, Queue, Attendance, Customer Dues, and Inventory structures;
- present/countable `audit_events`;
- zero core membership, branch, subscription, and audit-event orphan counts.

Counts are evidence of archive/restore completeness, not business parity by themselves. Never print names, phones, notes, tokens, hashes, or row samples. For a hosted drill, compare the count report to a source-side count report captured at the same write freeze.

## Restored application verification

After migration and integrity checks pass:

1. deploy the exact accepted application artifact with only the disposable target URL;
2. require `/health/live` and `/health/ready` HTTP 200;
3. verify `/` and `/login` HTTP 200 and SPA deep-link routing;
4. use a disposable account to verify login, refresh, logout/revocation, tenant/branch rejection, one read from each enabled module, and one rollback-safe workflow;
5. inspect backend/frontend/provider logs for connection strings, credentials, tokens, cookies, passwords, PII, migration errors, and PostgreSQL/runtime errors;
6. record artifact commit/image, sanitized target identity, start/end time, counts, and result.

Do not put a restored database into service merely because readiness returns 200.

## Disaster-recovery outline

1. Name the incident owner and recorder; stop or restrict traffic to freeze writes.
2. Preserve safe logs and, when possible, create a new forensic logical backup without overwriting earlier restore points.
3. Classify credential compromise separately; rotate exposed credentials before reopening, never as an unreviewed automatic action.
4. Identify the recovery point from provider history/snapshot evidence and logical-backup metadata. Prefer restoration into a new isolated target.
5. Run migration status, `recovery:verify`, count parity, and application verification.
6. Decide roll-forward versus connection cutover with explicit operator approval. Never fall back to Mongo; it is not current runtime authority.
7. Reopen traffic gradually, monitor authorization, sessions, money/stock invariants, errors, latency, and connection saturation.
8. Preserve evidence and complete a post-incident review. Rebuild the lost recovery layer before normal changes resume.

## RPO and RTO assumptions

- **Current proven state:** local logical backup/restore proof plus one hosted manual encrypted archive/artifact success. Successful recurring schedule, itemized hosted retrieval/decrypt/restore evidence and authenticated provider-setting evidence remain OPEN; therefore no pilot RPO/RTO is claimed.
- **Logical-backup planning objective:** at most 24 hours of data loss after the proposed daily schedule is implemented and monitored. A manual pre-change backup can narrow that point for a planned change.
- **Provider-history planning objective:** verify at least a 24-hour project history window before pilot use. Public Free-plan documentation describing six hours is insufficient for that objective.
- **Initial recovery-time planning objective:** four hours for a small pilot, including target creation, restore, verification, deployment, and operator decision. The local measured duration is not a hosted RTO guarantee; repeat the drill with realistic hosted size and network conditions.

## V2-07A local rehearsal record

- Source: preserved local Compose PostgreSQL only; no hosted data was exported.
- Archive: PostgreSQL 17.11 custom format, 273,046 bytes, 463 TOC entries.
- Backup tool duration: 5.053 seconds.
- Restore target: a new prefixed disposable local database, never staging/current development.
- Restore plus migration/count/integrity verification: 12.379 seconds.
- Result: migrations 001 through 012 applied; all required tables countable; four core orphan checks zero.
- Cleanup: the disposable database and unencrypted system-temp archive were removed after success.

This record proves the repository procedure on a small local data set. It does not prove hosted provider restore controls, hosted throughput, the proposed schedule, retention, monitoring, or pilot readiness.
