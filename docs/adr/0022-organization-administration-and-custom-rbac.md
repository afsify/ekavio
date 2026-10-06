# ADR 0022: Organization administration and custom tenant RBAC

- Status: Accepted
- Date: 2026-10-06
- Scope: V2-08C; extends ADRs 0004, 0008, 0012, 0020 and 0021

## Decision

PostgreSQL remains the sole runtime authority. Additive migration 014 introduces
one organization profile, normalized organization-local custom roles/permissions,
nullable membership custom-role references, optimistic versions for roles,
memberships and branches, existing-identity invitation targets and append-only
administration events. Composite foreign keys bind custom roles and invitations
to their organization. Existing migrations, identities and built-in roles are not
rewritten. Organization name/type remain canonical on `organizations`; agreement
legal-name/contact/GST fields remain canonical in the existing billing profile.
Business category, description and operating contact/address/website are separate
operational profile fields, not a second commercial agreement.

The server permission catalogue is the sole editor authority and contains only
tenant capabilities. It supplies stable keys, labels, descriptions and categories.
New capabilities are `organization.read`, `branches.read/manage`,
`roles.read/manage`, `audit.read`, `customers.read/manage` and
`services.read/manage`. Built-in owner/admin/manager/hr/staff compatibility is
retained, including the intentionally broad historical staff operational policy.
Owners retain the complete built-in tenant policy and cannot have a custom role.
An active custom role **replaces** the built-in permission set; it is never unioned
with it. An assigned missing/archived role yields no authority, not broad fallback.
Every protected HTTP request and realtime handshake reads live PostgreSQL authority;
Queue emission also rechecks each recipient's live branch authority, read permission
and commercial entitlement rather than treating an old room as a continuing grant.
login/refresh hydrate the same algorithm. JWT role strings and frontend state are
not authorization facts. The UI also refreshes permission context on focus and
periodically while mounted; this is convenience, not a security enforcement delay.

Administration mutations serialize on the organization row, then re-read the
actor's active membership/effective authority. Actors may grant only permissions
they hold. Custom roles cannot create platform operators, provider access, secret
access or commercial entitlement. Updates require optimistic versions; self-role
edits, destructive self/owner authority changes and owner transfers are rejected.
Safe branch-only membership edits remain possible without changing authority.
An assigned role cannot be archived, including historical memberships and live
invitations; reassign/revoke first. Branch codes are organization unique, IANA
timezones are validated, no hard delete is exposed, the last active branch cannot
be deactivated and active members cannot be left without a usable assigned branch.

Customers and Services are now CORE, an explicit amendment to ADR 0012's prior
Queue entitlement policy. Their read/manage permissions and tenant isolation
remain mandatory. Queue and Appointments retain independent Queue entitlement
and permission checks; Attendance, Customer Dues and Inventory remain entitled.
Roles do not grant modules. Organization/admin module summaries display commercial
access and member permissions separately.

Membership suspension, reactivation and revocation preserve the global user and
other organization memberships/sessions. The next protected request to a revoked
organization fails. Organization sockets are disconnected after role/membership/
branch changes so old rooms do not continue receiving privileged events; global
sessions are not revoked. Reconnect/refresh resolves live authority.

An existing phone identity may receive an invitation explicitly bound to its user
UUID. Ambiguous phone matches and conflicting email identity fail closed. Existing
membership rows are handled through lifecycle controls, not overwritten by invites.
Acceptance requires a live authenticated account that exactly matches the target,
an explicit POST, a valid single-use challenge, current issuer grant authority and
active same-organization assigned branches. One transaction creates only the new
membership/assignments and consumes the invitation. It never changes global name,
phone, email, password or platform status. A new identity still follows ADR 0021's
recipient-chosen password and mailbox-control rules. Raw invitation links remain
one-time fragment handoffs in component memory, with no-store responses.

Organization audit readers receive only event ID, authoritative actor display name
(or a clear unavailable label), action and timestamp, with tenant/date/actor/action/
category filters and bounded pagination. Raw historical details, IPs, credentials
and request bodies are never projected. New administration history stores closed
actions and canonical actor/target identifiers only and is database append-only.
Mutations and their new administration event commit together. Existing security
history remains append-only under ADR 0020; no legacy payload is reimported.

Personal Settings remain separate from organization General/Business, Branches,
Staff, Roles, Modules, Billing and Audit. Platform Operations/directory are
identity-level operator-only, read-only oversight with factual commercial state;
tenant owners/admins never gain operator authority or an impersonation bypass.

## Limits

No owner transfer, arbitrary permission strings, role-based entitlement grants,
hard membership/branch deletion, paid communication, secret administration,
automatic hosted browser evidence or product-domain expansion is introduced.
Render Free remains staging-only, Atlas is retained offline, and the decision
remains **NO-GO FOR REAL CUSTOMER DATA**. V2-08D is not started.
