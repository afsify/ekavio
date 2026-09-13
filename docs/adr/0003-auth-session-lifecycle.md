# ADR 0003: Authentication Session Lifecycle

- Status: Accepted
- Date: 2026-09-13

## Context

EkaVio previously persisted access and refresh JWTs in browser local storage. Refresh JWT rotation issued another self-contained credential without invalidating the previous value, so the backend could not revoke an individual login session. Logout only removed browser state, password changes left refresh credentials valid, and a phone-only lookup could silently select one of several tenant-scoped users with the same phone number.

V2-02 must correct the authentication and session lifecycle while retaining MongoDB and the existing tenant-assignment behavior. Full membership, authorization, and entitlement redesigns are separate milestones.

## Decision

### Access token

- Protected HTTP requests and Socket.IO continue to use a signed JWT bearer token.
- The access JWT expires after 15 minutes and carries the existing user, primary tenant, and role claims plus the server session identifier.
- The frontend keeps the access JWT in Zustand process memory only. It is never written to `localStorage` or `sessionStorage`.
- Revoking a refresh session prevents future renewal. An already issued access JWT remains valid until its short expiry; protected requests do not add a MongoDB lookup solely to check the session.

### Refresh session and credential

- MongoDB stores a `Session` record containing a random session identifier, user identifier, refresh-credential hash, expiry, last-use time, revocation time, timestamps, and bounded optional user-agent/IP metadata.
- The opaque credential combines a cryptographically random 128-bit session identifier with a cryptographically random 256-bit secret.
- The database stores only an HMAC-SHA-256 hash of the complete credential, keyed by the required `REFRESH_TOKEN_SECRET`. The raw credential is never stored or logged.
- A TTL index on `expiresAt` removes expired records asynchronously. Expiry is also checked directly during refresh so correctness does not depend on TTL cleanup timing.

### Cookie

- The raw refresh credential is sent only in the `ekavio_refresh` cookie and never in a JSON response.
- The cookie is `HttpOnly`, `SameSite=Lax`, limited to `/api/auth`, and has a seven-day maximum age.
- `Secure` is enabled in production. It is disabled only for local development/test HTTP so the documented localhost workflow remains usable.
- Credentialed CORS is enabled while retaining the explicit origin allowlist.

### Lifecycle

- Login detects zero, one, or multiple exact matches for the trimmed phone value. Zero matches or a bad password returns the same invalid-credentials response. Multiple matches return a deterministic conflict explaining that account migration is required; no arbitrary user is selected and no global unique index is added.
- Successful login verifies the password, creates a server session, sets the refresh cookie, and returns a 15-minute access token plus safe identity, assignment, theme, and temporary `activeModules` compatibility context.
- Refresh reads the HttpOnly cookie, rejects malformed, expired, revoked, or mismatched credentials, and atomically replaces the stored hash using the previous hash as a compare-and-swap condition. Only the winning request receives the rotated cookie and a new access JWT; the prior credential cannot be reused.
- `POST /api/auth/logout` revokes the matching session when present and always clears the cookie. Repeated logout requests are safe.
- A successful password change saves the new password hash, revokes every refresh session for the user, clears the current refresh cookie, clears frontend authentication memory, and requires sign-in again.
- Application startup calls refresh once through the HttpOnly cookie. A valid session hydrates safe context and a new access token into memory; an absent or invalid session leaves the application logged out. Concurrent API 401 responses share one refresh operation and each request is retried at most once.

## Compatibility boundaries

- MongoDB remains the persistence layer for V2-02.
- Existing backend-authoritative `x-tenant-id` assignment checks are preserved. Frontend assignment and module data are display/navigation context, not authorization.
- `activeModules` remains a temporary compatibility field and is not converted into a new entitlement system here.
- Phone normalization is deliberately limited to trimming so existing stored formats are not reinterpreted destructively.

## Consequences

- Browser script cannot read either refresh credentials or persisted access credentials.
- Refresh sessions can be individually revoked, rotated, expired, or revoked in bulk after a password change.
- Horizontal application instances can share session state through MongoDB without new infrastructure.
- Login sessions are intentionally lost if a refresh succeeds server-side but its replacement cookie cannot reach the browser; this fails closed and requires sign-in again.
- Full membership/RBAC, tenant-isolation redesign, branch modeling, entitlements, and immediate access-token denylisting remain deferred to V2-03 or later milestones.
