# V2-07A Pilot Readiness: Recovery, Security, and Production Hardening

- Review period: 2026-09-30 through 2026-10-01
- Starting commit: `846a2af87d9fa06f55a87938be0cbeb2fda8f95c`
- Starting exact CI: GitHub Actions run `36719671667` (success)
- Checkpoint: `pre-v2-07a-pilot-readiness-hardening`
- Scope: PostgreSQL recovery, dependency/security remediation, immutable container inputs, production environment contracts, legacy-source blocker assessment, and operational documentation
- Decision boundary: V2-07A does **not** declare pilot readiness

## Executive result

V2-07A replaces archive-readability-only backup evidence with a fail-closed PostgreSQL logical-backup command and a real disposable restore rehearsal. The local proof restored a full PostgreSQL 17.11 custom archive into a new database, verified migration checksums/status for 001 through 012, counted required identity/commercial/operational/audit structures without row data, found zero core orphans, and removed the disposable target and unencrypted temporary archive after success.

Current npm advisories were remediated through compatible patch/minor updates rather than forced major upgrades. Runtime-sensitive Node, Nginx, PostgreSQL, and retained offline Mongo image inputs are now immutable tag-plus-manifest-digest references, and CI uses the same database images plus the tested Node patch. Production environment validation now rejects committed development secret values, identical JWT/refresh secrets, and lingering staging bootstrap credentials.

This is not hosted recovery proof. The repository cannot authenticate the current Neon plan or restore settings, and no separately authorized hosted disposable target was available. Atlas SRV records were visible through the operating-system resolver, but the existing Node/Mongo driver dry-run was still refused at SRV resolution before source facts loaded. Hosted legacy reconciliations therefore remain open and Atlas was not deleted.

## Recovery implementation

The new root tools are intentionally provider-neutral at the archive boundary:

- `scripts/postgres-backup.mjs` requires an absolute operator destination outside the repository, consumes hosted credentials only through a named environment variable, supports local Compose without exposing its connection URL, writes a timestamped custom archive with exclusive creation, and validates it before reporting success.
- `scripts/postgres-tooling.mjs` pins the PostgreSQL client image, redacts URL/user-info and password diagnostics, validates non-empty archives with `pg_restore --list`, and centralizes safe child-process streaming.
- `scripts/postgres-restore-proof.mjs` accepts only a new `ekavio_v207a_restore_*` database name, refuses an existing target, restores without `--clean`, runs accepted migration status and the count/integrity verifier, and drops only the exact disposable database after an explicit successful-proof flag.
- `npm run recovery:verify` uses the normal PostgreSQL driver and accepted migration checksums. It returns table counts and four orphan counts only; it never selects business rows.

Generated dumps remain outside Git and images. The tools do not encrypt a dump, schedule backups, upload to storage, or create/delete provider resources. Those controls remain explicit operator/infrastructure responsibilities.

## Local backup and restore proof

| Evidence | Result |
| --- | --- |
| Source | Local Compose PostgreSQL; current development database was not modified by restore |
| Archive format/tool | PostgreSQL 17.11 custom format from the immutable pinned client image |
| Archive validation | PASS; 273,046 bytes; 463 TOC entries |
| Archive SHA-256 | `6d5e991b147c2b9501e97a842c13249f2f2c501564f33bb1be4a4cc5b826863b` |
| Backup plus validation duration | 5.053 seconds |
| Restore target | New disposable local database with the required V2-07A prefix |
| Restore mode | `pg_restore --exit-on-error --no-owner --no-acl`; no clean/drop of an existing database |
| Migration result | PASS; exactly migrations 001 through 012 applied with accepted checksums |
| Restore plus verification duration | 12.379 seconds |
| Cleanup | PASS; exact disposable database dropped and unencrypted temporary archive/directory removed |

PII-free restored counts were:

| Boundary | Restored table counts |
| --- | --- |
| Identity/corporate | users 3; parent organizations 0; organizations 4; branches 4; memberships 3; branch assignments 3 |
| Catalogue/subscription | module definitions 4; plans 2; add-ons 4; subscriptions 2; subscription add-ons 0; entitlement overrides 1 |
| Manual commercial | agreements 0; initial payments 0; renewals 0; renewal payments 0 |
| Customer/Queue | customers 4; services 3; appointments 2; queue sessions 3; queue tokens 5 |
| Attendance/Dues/Inventory | attendance records 0; due entries 0; inventory items 0; stock locations 4; balances 0; movements 0 |
| Security audit | audit events 6 |

Membership, branch, subscription, and audit-event orphan counts were all zero. Zero-row domain tables were still required to exist and be countable; this proof therefore covers schema presence but does not substitute for the already accepted non-empty domain integration suites.

## Provider-managed versus logical recovery

The repository and connection credentials identify Neon as the staging PostgreSQL provider but do not expose the authenticated plan, configured history window, or snapshot state. On the review date, [official Neon plan documentation](https://neon.com/docs/introduction/plans) described Free as including six hours of instant-restore history and one manual snapshot. Historical EkaVio records classify staging as free/sleeping, but no sanitized control-plane evidence proves this specific project currently has those settings available. V2-07A therefore records provider restore as unverified and assigns it no claimed RPO/RTO.

The pilot proposal is daily monitored encrypted logical exports with 14 daily/four weekly retention, monthly restore drills, and separately verified provider history of at least 24 hours. These are open operating controls, not features installed by this commit. The planning objectives are at most 24 hours logical-backup RPO and four hours end-to-end recovery time for a small pilot; neither is claimed until hosted-size drills, monitoring, and ownership exist.

## Dependency audit and remediation

### Before

- Backend `npm audit --omit=dev`: one high-severity `engine.io` protocol-mismatch denial-of-service advisory through Socket.IO.
- Frontend `npm audit`: 8 affected packages (1 moderate, 7 high): `baseline-browser-mapping`, `brace-expansion`, `browserslist`, `fast-uri`, `nanoid`, `postcss`, `react-router`, and `react-router-dom`.
- Frontend `npm audit --omit=dev`: 4 high affected packages in the production-classified tree: `nanoid`, `postcss`, `react-router`, and `react-router-dom`.

### Changes

- Backend: `socket.io` 4.8.3 -> 4.8.4; transitive `engine.io` 6.6.9 -> 6.6.11.
- Frontend runtime: `react-router-dom`/`react-router` 7.18.1 -> 7.18.4; `socket.io-client` 4.8.3 -> 4.8.4.
- Frontend HTTP client: closeout on 2026-10-01 detected newly published Axios advisories affecting the installed 1.18.1 release; the compatible 1.x dependency was updated to the first fixed release, Axios 1.20.0.
- Frontend build: `postcss` 8.5.16 -> 8.5.28; `autoprefixer` 10.5.2 -> 10.6.1; compatible transitive updates include `baseline-browser-mapping` 2.11.26, `browserslist` 4.29.3, `brace-expansion` 5.0.12 and 2.1.7, `fast-uri` 3.1.8, and `nanoid` 3.3.19.

No force fix or major-version architecture change was used. The final backend production, frontend full, and frontend production audit results are zero known vulnerabilities. SPA routing, login route output, and PWA generation are included in the final frontend build/runtime checks.

## Immutable container inputs

| Use | Pinned input | Compatibility evidence |
| --- | --- | --- |
| Backend/frontend build and backend runtime | Node `20.20.2-alpine3.23` plus manifest digest `fb4cd12c...372293` | Existing healthy stack reported Node 20.20.2/Alpine 3.23.4; pinned backend build passed |
| Frontend runtime | Nginx `1.31.6-alpine3.24` plus manifest digest `df221db8...eac2` | Existing healthy frontend reported Nginx 1.31.6/Alpine 3.24.2 |
| Compose/CI PostgreSQL and backup client | PostgreSQL `17.11-alpine3.23` plus manifest digest `9ae4e8f8...0eedd6` | Existing healthy database reported PostgreSQL 17.11/Alpine 3.23.5; same local-proven manifest was registry-resolvable |
| Offline legacy profile and CI source-contract service | Mongo `8.0.30-noble` plus manifest digest `f40b97b9...c9353d` | Existing retained patch image; remains outside normal runtime |

CI also pins setup-node to 20.20.2. Update procedure: review upstream Node/Nginx/PostgreSQL/Mongo security/release notes, select an exact compatible tag, resolve its multi-platform manifest digest, update source and the deterministic contract test together, rebuild with pull, rerun all gates/restore proof, inspect runtime-reported versions, and merge as a dedicated maintenance change. Digests must be refreshed deliberately rather than bypassed.

## Production-container review

- Backend production remains multi-stage, installs runtime dependencies with `npm ci --omit=dev`, copies compiled `dist` and reviewed migrations only, runs as `node`, starts `node dist/server.js` directly, exposes only application port 5000, and health-checks `/health/ready`.
- Frontend runtime copies only built static `dist` plus Nginx configuration, contains no frontend `node_modules`, runs as `nginx` on port 8080, and has no Node development server.
- `.dockerignore` excludes environment files, dependencies, builds, logs, dumps/archives, private keys, and credential files. Runtime secrets are environment-injected; no credential build argument exists. Frontend `VITE_*` values remain intentionally public URL configuration only.
- Server startup checks PostgreSQL before listening. SIGINT/SIGTERM closes Socket.IO/HTTP ownership and the PostgreSQL pool. Readiness is PostgreSQL-only and liveness remains process-only.
- Deterministic tests now hold the immutable image, least-privilege user, compiled/static artifact, ignore-file, and recovery-tool boundaries.

## Environment and secret review

Production startup already required PostgreSQL, independent access/refresh secrets of at least 32 characters, HTTPS HTTP/Socket origins, PostgreSQL TLS, and an explicit 0-3 proxy-hop count. Normal runtime neither reads nor requires `MONGO_URI`.

V2-07A additionally rejects:

- the exact committed sample/Compose JWT and refresh development values in production;
- an identical JWT and refresh secret;
- `STAGING_BOOTSTRAP_CONFIRM`, `STAGING_BOOTSTRAP_PHONE`, or `STAGING_BOOTSTRAP_PASSWORD` in the long-running production service.

Validation reports field names and rules, never values. Secrets were not rotated automatically. The one-off bootstrap remains a separate non-production job, and production has no default database/JWT credential fallback.

## Hosted legacy-source assessment

One credential-safe OS DNS diagnostic resolved three Atlas SRV records without printing an endpoint. The approved non-mutating `runtime:corporate:shadow` command was then run once with ignored staging settings injected into the process. The Node/Mongo resolver failed with `querySrv ECONNREFUSED` before loading any source facts or writing either database. No runtime DNS behavior, Windows service, TLS policy, Atlas allowlist, or application code was changed; no `0.0.0.0/0` access was requested and no mapping was guessed.

Consequently, hosted Attendance, Customer Dues, Inventory, corporate, and ActivityLog/security-audit reconciliation/activation remain open for an Atlas-authorized execution environment. Unsafe audit material still requires an encrypted archive and retention decision. Atlas remains retained for explicit legacy migration/reconciliation/archive/recovery and was **NOT DELETED**.

## CI and acceptance gates

CI already contains backend lint, typecheck, source/unit tests, build, migrations from zero/status, all accepted database/domain integration suites, Mongo offline-boundary checks, frontend lint/typecheck/build, and Compose validation. The new production/recovery contracts run inside the existing deterministic source/unit suite and require no hosted credential or real database restore in GitHub Actions.

Final local results:

- backend lint, typecheck, 143/143 source/unit tests, and production build passed;
- all 25 accepted database-backed suites passed sequentially against disposable PostgreSQL/Mongo databases; the final Mongo source-contract command was also rerun from the repository checkout and passed 4/4 after the one-off backend-only image correctly could not see the root Compose file;
- frontend lint, typecheck, and Vite/PWA production build passed; the build generated the service worker, manifest, and 34-entry static precache with no API/Socket runtime cache;
- backend production, frontend full, and frontend production-only npm audits each reported zero vulnerabilities;
- `docker compose config --quiet` and a fresh normal `docker compose up --build -d` passed with exactly PostgreSQL, backend, and frontend healthy and Mongo stopped;
- `/health/live`, `/health/ready`, `/`, and `/login` each returned HTTP 200; fresh backend/frontend/PostgreSQL logs contained normal startup, health, and access messages only;
- the production backend image built successfully, reported `USER=node`, direct compiled start, port 5000/readiness health metadata, UID 1000, migrations/dist present, and source, `.env`, TypeScript, and `tsx` absent;
- the frontend runtime reported `USER=nginx`, UID 101, port 8080 health, static `index.html` present, and `.env`/`node_modules` absent. The upstream Nginx image retains inherited `80/tcp` metadata, but EkaVio listens on 8080 and Compose publishes only host 80 to container 8080.

Exact post-push GitHub Actions evidence will be recorded in the final closeout report only after the accepted commit is pushed and that exact SHA succeeds.

## Remaining pre-pilot blockers

- authenticated evidence for the actual Neon project plan, restore history, snapshots, quotas, and retention;
- scheduled, monitored, encrypted off-host logical backups and an approved retention/destruction owner;
- a provider-isolated hosted restore drill with realistic data size and measured end-to-end recovery time;
- hosted Attendance, Customer Dues, Inventory, corporate, and audit legacy-source reconciliation/activation from an Atlas-authorized environment;
- encrypted raw unsafe-audit archive/retention approval and accepted Atlas rollback/removal window;
- completion/decision for remaining partial hosted browser flows, domain-specific CSP, always-on pilot compute, monitoring/log retention/alerts, incident responder, privacy/PII retention, and support expectations;
- the explicit V2-07B pilot-readiness decision.

No new business domain, Sales/POS work, V2-07B implementation, cloud backup service, payment integration, or Atlas deletion was started.

See the operational procedure in [V2-07A_BACKUP_RESTORE.md](../runbooks/V2-07A_BACKUP_RESTORE.md).
