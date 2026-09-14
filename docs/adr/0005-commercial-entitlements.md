# ADR 0005: Commercial Entitlements

- Status: Accepted
- Date: 2026-09-14
- Supersedes: `Organization.activeModules`, `Organization.subscriptionStatus`, `Organization.billingCycle`, and `Organization.nextBillingDate` as runtime commercial authority

## Context

EkaVio previously treated a string array on Organization as both subscription state and module authorization. The backend used `khata` for the ledger gate while the frontend used `ledger` and `digital-khata`. Authentication copied these strings into browser state, the dashboard locally toggled fake subscriptions, and billing endpoints returned fabricated invoices and payment-order IDs. Subscription expiry depended on an unused cron job that mutated an Organization field.

V2-04 needs one organization-scoped commercial policy without mixing it into V2-03 membership roles and permissions. MongoDB remains the persistence layer, pilot activation must work without a payment gateway, and time-based expiry must be correct without a background mutation.

## Decision

### Canonical modules

The only currently sellable/operational module identifiers are:

- `ledger`
- `inventory`
- `attendance`
- `queue`

The backend catalogue is authoritative. The frontend has a typed contract mirror but renders the metadata and effective state returned by the backend. `khata` and `digital-khata` are recognized only by the legacy backfill and always normalize to `ledger`. Chat and notifications are not in the catalogue because they do not have working backend workflows.

`ModuleDefinition` stores the canonical key, display metadata, category, core/purchasable classification, active status, version, and timestamps. Catalogue metadata contains no immutable discovery pricing.

### Commercial records

- `Plan` is a commercial package. It grants canonical modules and base limits.
- `AddOn` is an attachable capability. It grants canonical modules and typed additive or overriding limit adjustments.
- `Subscription` is unique per organization. It references a plan and time-bounded add-on assignments and records status, source, start/current-period dates, cancellation/suspension dates, optional billing cycle, and audit actors.
- `Entitlement` is a unique explicit module override per organization. It records grant/revoke effect, active/inactive status, source, reason, optional validity dates, and the platform-operator actor.

Commercial records are organization-scoped. They remain separate from User, Membership, Role, Permission, feature flags, and module configuration.

### Effective calculation and precedence

Evaluation uses the current time directly; no cron job is required for correctness.

1. A subscription contributes only while its status is `active` or `trialing`, its start date has arrived, and its current period has not ended.
2. An active referenced plan grants its modules and base limits.
3. Active add-on assignments whose own validity windows include the current time grant their modules.
4. Active, currently valid explicit grants add modules even when no subscription is active, supporting manual pilot/trial/support access.
5. Any active, currently valid explicit revocation wins over plan, add-on, and explicit grants for that module.
6. Inactive catalogue module definitions fail closed even if another record names the module.

Limits are deterministic. For each typed limit, the plan contributes the highest configured base value. Active add-on overrides raise the base to the highest override value, and all active additive adjustments are then summed. Database return order cannot change the result. Unconfigured limits are returned as `null`, not guessed or treated as unlimited.

### Enforcement and API boundary

Backend domain routes use typed `requireEntitlement(MODULES.*)` middleware after V2-03 authentication/context resolution. A request may need both a user permission and an organization entitlement. Neither one grants the other. Missing entitlement returns HTTP 403 with stable code `ENTITLEMENT_REQUIRED`.

Tenant members with `billing.read` may read only the effective state selected by their server-validated request context and may read the public pilot catalogue. These responses do not expose raw override records or other organizations' state.

Only an identity-level EkaVio platform operator may update another organization's subscription or explicit entitlement. Organization owner/admin roles are insufficient. Mutations use target-scoped queries and write allowlisted audit events without secrets or request bodies. No broad operator dashboard is introduced.

### Manual/pilot operation and payments

The initial deterministic catalogue contains a `pilot-core` plan, a non-sellable `legacy-import` plan, and one manually attachable definition for each operational module. It contains no production pricing. Catalogue bootstrap grants nothing; a platform operator must activate a new pilot organization through the protected mutation API.

No payment gateway is required. The fake create-order endpoint and fabricated invoices are removed. Automated payment providers remain future optional adapters. The tenant subscription page truthfully reports backend state, manual activation, and the absence of billing documents.

### Legacy migration

The legacy Organization commercial fields remain temporarily as deprecated migration inputs and are never read by runtime authorization or written by new subscription flows. The migration is dry-run by default and apply requires `--apply`.

The backfill:

- maps valid canonical modules and both ledger aliases to catalogue add-ons;
- creates or idempotently updates one `import` subscription per organization using the non-sellable legacy plan;
- retains active/inactive/suspended state and the legacy billing cycle/current-period date;
- never modifies a manual/pilot/support subscription;
- reports unknown module IDs;
- stops before writes when unknown modules or an active-but-already-overdue legacy state make the data ambiguous; and
- never activates suspended or inactive organizations.

Catalogue bootstrap is explicit and must run before the backfill. Production data is never migrated automatically.

## Consequences

- `Organization.activeModules` and the other legacy commercial fields can remain until migration evidence supports destructive removal.
- Login, refresh, bootstrap, and tenant switching carry effective state for only the selected organization; browser storage is not commercial authority.
- Suspended, cancelled, expired, revoked, or unavailable commercial capabilities fail closed on the backend.
- PostgreSQL shared-core migration remains V2-05+.
- Usage metering, finalized pricing, real subscription invoices, payment reconciliation, operator UI, feature-flag infrastructure, and optional external payment connectors remain future work.
