# ADR 0023: Organization dynamic fields and form layouts

Status: Accepted for V2-08D product foundation (2026-10-07).

## Context

Organizations need bounded customization of Customer, Service, Appointment,
Inventory item and staff Membership forms. Definitions, presentation and business
values must remain separate. PostgreSQL is the only normal runtime authority.
Global user identity, journal records, stock balances, commercial and security
records must not become an arbitrary dynamic document store.

## Decision

Add migration **015_dynamic_fields.sql** without modifying 001–014 or backfilling
canonical records. Stable entity names are `customer`, `service`, `appointment`,
`inventory_item`, `membership`. Staff values reference the organization membership,
never the shared user. `custom_field_entities` is a constrained registry with exactly
one matching canonical ID and organization-qualified foreign keys for all five types.

Definitions have immutable ASCII machine keys and immutable types, mutable text
labels/help, active/archived state, required/default/searchable/filterable/reportable
metadata and optimistic versions. Reserved system/auth keys and canonical names
are rejected. Key uniqueness is per organization/entity; labels are not identity.
Types remain immutable even before first value: replacement means a new key, not
implicit conversion. Custom value uniqueness is deliberately not offered; safe
cross-typed concurrency-aware uniqueness requires a separately reviewed design.

The closed catalogue is text, textarea, number, currency, date, datetime, email,
phone, checkbox, select, multiselect, radio, url. Values are typed relational rows,
not JSON authority: bounded text, NUMERIC(24,6), BIGINT INR minor units, DATE,
TIMESTAMPTZ, BOOLEAN or option UUID. Only the matching column may be populated.
Exact decimals and currency travel as strings; no JavaScript floating-point money
or number authority. Email normalizes, phone is canonical E.164, calendar dates
are validated, datetimes require an explicit offset, URLs permit only HTTP(S)
without embedded credentials. Arbitrary JSON, HTML, formulas, uploads and code
execution are excluded. Default JSONB is validated configuration, not value storage.

Options have stable UUID/key identities, labels, order and archive state. Single
choices use composite option/definition/organization FKs. Multiselect uses a child
relation constrained to a multiselect parent and options of the same field/tenant.
Used options are archived, never removed/re-keyed by the API. Renames do not rewrite
values. Untouched historical archived selections remain readable/edit-compatible;
explicit new assignment of an archived option is rejected.

Required active fields apply to new records and normal metadata edits. Existing
records remain readable with missing values; there is no invented backfill.
Defaults are validated and apply only to new records. False is a valid checkbox
value. Clearing an optional field removes its value. Archived definitions reject
new writes but preserve stored history. New fields/options/configuration use bounded
strict schemas and organization administration locks.

Canonical metadata and custom values share an explicit `PostgresDatabase.atomic`
transaction. Its per-database AsyncLocalStorage client is reused only inside this
opt-in boundary; ordinary repositories retain their previous behavior. Validation,
authorization or canonical failures roll back all changes. Current organization
permission and branch assignment are reread under the lock. Existing optimistic
Appointment and Membership versions are preserved. Creation retry fingerprints
bind canonical plus custom input; accepted retries do not overwrite later edits or
reapply defaults. Pre-015 Appointment/Inventory retries lacking a fingerprint return
unchanged, reject custom metadata edits and never backfill defaults.

Layout/section/placement relations are presentation only. One organization/entity
layout is shared by create/edit/view, with a version, ordered stable sections and
ordered visible field keys. Required canonical and active custom fields cannot be
hidden or removed. Unknown/duplicate placements are rejected. Empty sections may
be archived after moving fields. Reset is server-computed and changes no definitions
or values. Unplaced newly added fields receive a sensible default section. Detail
views retain hidden/archived values: visibility is not field-level authorization.

`fields.read/manage` are separate configuration permissions. Built-in owner/admin
receive them; custom roles use the existing replacement/subset policy. Entity readers
can obtain their form schema without configuration-admin authority. Configuration
permissions do not grant business-data access. Entity permissions still govern values.
Customers/Services remain CORE. Appointment/Inventory business access retains Queue/
Inventory entitlement and canonical branch checks. Configuration metadata may be
managed before subscribing, but does not unlock the module. No new sellable module.

`GET /api/forms/:entity/schema` is one bounded client request: definitions/options
are projected in one data query, layout and sections in at most two more. A repeatable
read transaction avoids mixed schema snapshots. Values use one typed projection,
and multiselect writes batch option rows per field. React Query scopes caches by
organization/entity and value caches additionally by branch/entity ID; mutation
invalidations refresh schemas/values. There is no list-row N+1 custom-value loading.

Customer search supports flagged bounded text/textarea/email/phone values. Customer
filter supports one active filterable field, parameterized equality, and numeric/date
gte/lte comparisons. Operators/columns/casts come from closed server mappings, not
client SQL. Metadata validation loads only the selected definition. Generic scope,
numeric, date and option indexes support these queries. Other entity search/filter
expansion, multiselect filtering, full report builder and custom-field CSV integration
are deferred to V2-08E. Reportable is honest stored metadata, not a fabricated report.

Limits: 50 total/40 active definitions per entity, 100 options per field, 20 sections,
100 placements per section, 40 patched keys, 50 multiselect choices; keys 64, labels
100, help 500, text 1,000, textarea 10,000 characters. Number has at most 18 integer
and 6 fractional digits; currency at most 18 integer minor-unit digits. Customer
pagination/search retain canonical limits. Admin writes serialize per organization:
this is a deliberate bounded low-cost tradeoff, not a claim of unlimited throughput.

Field/configuration, grouped option changes, layout/section changes, reset and value
change categories append to `field_admin_events`. Events contain actor, tenant, target,
action and time only; no complete values, credentials or arbitrary details. They join
the existing safe organization audit projection. UI text is React-escaped, URLs are
displayed as text, and there is no custom HTML/script execution.

## Consequences and acceptance

The small owned shared renderer and keyboard-accessible button/selector builder use
existing dependencies. Actual canonical forms use server ordering and visibility;
preview uses the same renderer without writing entities. Required errors, labels,
help associations, native controls and PhoneInput remain accessible/mobile-friendly.
History remains interpretable, configuration races reject stale versions, and no
tenant schema creates arbitrary SQL tables/columns. Zero-definition tenants continue
with canonical forms. Invitation provisioning does not invent required staff values;
the first normal administrative membership edit validates its current required fields.

See [V2-08D acceptance](../reviews/V2-08D_DYNAMIC_FIELDS_FORM_LAYOUTS.md) for local
unit, PostgreSQL, Chromium, Docker, hosted schema/health and release evidence.
This ADR does not close V2-07 operational gates: **NO-GO FOR REAL CUSTOMER DATA**,
intentionally Free Render staging and retained Atlas remain unchanged. V2-08E does
not start automatically.
