# V2-06B4 Hosted Staging Partial Validation

Date: 2026-09-25

Deployed commit: `b0706ed98311ebaa03d33d7423fc4bcc3495be17` (`chore: prepare staging deployment`)

## Outcome

EkaVio hosted staging exists and is usable for continued development and disposable test data. This review deliberately records a **partial** validation: the public infrastructure and authenticated smoke groups listed below have evidence, while the remaining operational checks are explicitly deferred.

This is not production approval or full pilot-readiness acceptance. No real paying customer or pilot data may be onboarded until the remaining authenticated flows, hosted-log review, and backup/restore proof are completed.

The existing checkpoint `pre-v2-06b4-hosted-staging-validation` remains the recovery marker. The full-completion tag `v2-06b4-hosted-staging-validated` was intentionally not created.

## Hosted topology and public validation

| Area | Sanitized result |
| --- | --- |
| Frontend | `https://ekavio.afsify.com` returned HTTP 200 for `/` and `/login`; direct SPA refresh worked; the manifest and service worker loaded. |
| Backend | `https://api.ekavio.afsify.com` returned the expected API response; API paths did not fall through to the frontend SPA. |
| Hosting | Static hosted frontend plus one Render staging backend service in Singapore. |
| PostgreSQL | Managed Neon staging PostgreSQL reported ready using TLS. Migrations `001` through `005` were applied with accepted checksums. |
| MongoDB | Managed MongoDB Atlas staging reported ready using SRV/TLS. |
| Health | `/health/live` and `/health/ready` returned HTTP 200. Readiness reported only PostgreSQL/MongoDB status labels and exposed no connection metadata. |
| DNS/TLS | Both custom domains resolved, HTTP redirected to HTTPS, and both endpoints negotiated TLS 1.3 with valid hostname certificates. |
| CORS | The exact frontend origin received credentialed CORS approval. An unrelated HTTPS origin was rejected with HTTP 403 and no allow-origin response. |
| Socket transport | Engine.IO polling opened from the approved origin. An unrelated origin was rejected with HTTP 403. This proves public transport/origin handling, not authenticated room delivery. |

## Authenticated manual evidence

The existing staging platform operator password was recovered outside Git by changing only that operator's password hash and revoking existing sessions. No user, organization, membership, branch, subscription, entitlement, or repository file was created or changed by the recovery. No credential value was supplied to this review or stored in the repository.

The user explicitly reported the following manual groups as passed:

### Group A: session, cookie, and browser storage

- Login succeeded with the existing staging operator.
- `ekavio_refresh` existed with `Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/api/auth`.
- Reload restored the authenticated session.
- Local Storage contained no access or refresh token.
- Session Storage and Cache Storage contained no credentials or authenticated API responses.

### Group B: organization and branch authorization

- The active organization matched an active server-returned membership.
- The active branch was `Main` and belonged to that organization/membership context.
- A foreign tenant UUID on a protected GET failed closed with HTTP 403.
- A foreign branch UUID on a protected GET failed closed with HTTP 403.

### Group C: Customer

- `STAGING SMOKE CUSTOMER 01` was created or reused as the single exact disposable match.
- Search/list and direct fetch succeeded.
- A safe notes update succeeded.
- The Customer and update survived browser reload.

### Group D: Service

- `STAGING SMOKE SERVICE 01` was created or reused as the single exact disposable match.
- The Service was available in the active Main branch.
- It appeared in the hosted Queue/Appointment branch-available selector.
- The Service survived browser reload.

### Group E: Appointment

- One Appointment was created for the smoke Customer and Service on `2026-09-26` at `10:30` Main-branch local time.
- The Main branch timezone was `Asia/Kolkata`; the stored interval correctly represented `05:00Z` through `05:30Z`.
- Branch/date filtering and direct fetch succeeded.
- The Appointment and displayed local time survived reload.

## Intentionally deferred validation

The following items were not completed and must not be described as passed:

- Appointment check-in and Queue token creation.
- Queue idempotency, canonical token uniqueness, status transitions, and optimistic-version conflict behavior.
- Authenticated Socket.IO connection, branch-room isolation, PII-minimized Queue events, reconnect, and authoritative HTTP refetch.
- Hosted Billing/Pilot Core subscription and server-computed entitlement display.
- Logout, cookie clearing, session revocation, failed post-logout refresh, and protected-route redirect.
- Provider-private Render log review for credentials, headers, database URLs, request bodies, and customer PII.
- Hosted PostgreSQL and MongoDB backup creation plus restore into disposable targets.

These deferrals are an accepted staging-development tradeoff. They remain required before pilot/customer onboarding.

## Security and operational observations

- The frontend returned `X-Content-Type-Options: nosniff`, but frontend HSTS and CSP headers were still absent on 2026-09-25. Add and browser-test them as staging hardening without broadening this partial closeout into an unrelated edge-configuration refactor.
- The backend's reviewed runtime authority remains PostgreSQL for identity, commercial state, Customer, Service, Appointment, and Queue. MongoDB remains required for accepted deferred domains and ActivityLog/security audit.
- Queue has no runtime Mongo fallback or dual-write path.
- Free-tier/provider backup coverage is not assumed. **Open staging operational item:** complete hosted backup and restore proof before using real pilot/customer data.

## Closeout decision

Hosted staging is deployed and partially validated. It is available for continued engineering and disposable testing. Full V2-06B4 validation was intentionally not claimed, and no B4 completion tag is warranted.
