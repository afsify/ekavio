# ADR 0024: Dashboards, reports and notifications

Status: Accepted for V2-08E product foundation (2026-10-07).

## Decision and authority

Add migration `016_analytics_notifications.sql`; retain 001–015 unchanged. PostgreSQL
canonical records remain business authority. Aggregates are derived read models;
dashboard preferences are presentation only; notifications are attention only;
export events are append-only audit. There is no Mongo runtime dependency, arbitrary
SQL/report builder, dashboard billing module, paid messaging dependency or pilot GO.

Authentication resolves a live session, organization membership, assigned active
branch and replacement custom-role permissions. Workspace Dashboard is CORE and
does not require `reports.read`. Its server executes and returns only individually
authorized domain widgets. Paid-domain widgets/reports additionally require their
existing `queue`, `attendance`, `ledger` or `inventory` entitlement. Customer and
Service remain CORE. Every report/export requires `reports.read` AND its domain
read permission AND any domain entitlement. No frontend visibility bypass.

## Widget catalogue and factual definitions

| Widget | Permission / entitlement | Definition and scope |
| --- | --- | --- |
| Active customers | customers.read / CORE | Organization active, non-merged Customers |
| Available services | services.read / CORE | Active Services with active selected-branch availability |
| Active Queue | queue.read / queue | Selected-branch waiting/serving tokens, including earlier dates |
| Appointments today | queue.read / queue | Selected-branch non-cancelled starts on today's branch business date; includes completed/no-show |
| Staff present today | attendance.read / attendance | Explicit selected-branch present marks for branch date; unmarked is not absent |
| Outstanding Customer Dues | ledger.read / ledger | Sum of positive per-customer all-time selected-branch signed balances; credits do not offset another customer's debt |
| Low-stock items | inventory.read / inventory | Active items whose canonical default-location selected-branch quantity is at or below reorder threshold |
| Active staff | staff.read / CORE | Organization active Memberships |
| Active branches | branches.read / CORE | Organization active Branches |
| Custom roles | roles.read / CORE | Organization active custom roles, excluding built-ins |
| Pending invitations | staff.manage / CORE | Organization unconsumed, unrevoked, unexpired staff invitations |

Money is signed integer minor units and exact decimal strings/BigInt presentation.
Dues are not revenue/profit; stock movements are not sales. No valuation or payroll
metric is invented. Missing authority means omitted widgets, never fake zero.
Actual permitted zero counts have truthful descriptions and domain links.

Personal order/hidden lists are per organization/user with optimistic version and
closed widget keys. New widgets append naturally. Stored unauthorized widgets are
ignored on reads; preferences cannot grant access. Hide/reorder/reset persist in
PostgreSQL, not browser storage. Fast UI feedback is scoped and revalidated on save.

Organization overview omits independently unauthorized staff/branch/role/invitation
counts and commercial legal name, shows operating-profile completion, and links
only permitted administration/audit actions. Platform overview is operator-only:
canonical organization count, currently active/trialing in-period subscriptions,
pending commercial requests, active/trialing periods ending within 30 days (including
expired ones needing review), and published available catalogue offers. It exposes
no operational tenant rows, identity credentials or raw payment data.

## Closed report catalogue

| Key | Domain permission / entitlement | Scope / date semantics |
| --- | --- | --- |
| customers | customers.read / CORE | Organization non-merged directory; created time |
| services | services.read / CORE | Selected-branch availability; created time |
| appointments | queue.read / queue | Selected branch; start time |
| queue | queue.read / queue | Selected branch; created time |
| attendance | attendance.read / attendance | Explicit selected-branch records; attendance DATE |
| dues-balances | ledger.read / ledger | Selected-branch all-time current per-customer signed balance; no date filter |
| dues-journal | ledger.read / ledger | Selected branch; occurrence time, magnitude and signed balance effect |
| inventory | inventory.read / inventory | Selected-branch default-location stock projection; current state, no date filter |
| stock-movements | inventory.read / inventory | Selected branch; occurrence time and signed exact decimal quantity |
| staff | staff.read / CORE | Organization Membership directory; joined time; no login email/phone or credentials |

All rows and summaries share a repeatable snapshot and identical filters. Summaries
are matching records and available canonical status counts; Inventory also counts
active low/out-of-stock items. Dues balances sum only positive balances and count
customers owing; journal sums signed period effects, not period revenue or all-time
outstanding debt. Reversals reuse the accepted signed-effect projection.

Default date range is the last 30 branch business dates, inclusive; maximum 366.
IANA branch timezone and accepted DST-safe conversion produce inclusive local
midnight / exclusive next midnight UTC bounds. Attendance uses DATE. Timestamps,
including custom datetime values, display/export in the branch timezone. Invalid
dates, unsupported status/filters/columns/operators and foreign resource IDs fail.

Organization-owned Customer/Staff directories stay organization-wide but use selected
branch timezone. Operational reports never aggregate across branches. Caller
`branchId` must equal selected authorized context. No organization-wide paid summary,
multi-branch selection or privileged preset can bypass branch assignment.

Parameter values are bound; catalogue SQL, columns and predicates are closed server
code. Search is bounded to 200 characters. Date/status/entry type/stock filters and
Customer/Service/Staff relationship filters apply only to supported reports. Pickers
show at most 100 distinct human-labeled resources from authorized branch records;
server ownership and staff assignment checks remain independent of picker visibility.
Customer reuses one accepted typed custom-field filter; other custom/multiselect
filter UIs and custom uniqueness remain deferred. Saved report presets are deferred.

Active reportable definitions for Customer, Service, Appointment, Inventory item and
Membership supply optional columns. Non-reportable/archived definitions are
not selectable; flag changes apply on the next server query. Human option labels
remain readable after option archival. Exact number/currency, date/datetime, Yes/No,
text and multiselect labels are batched for selected rows/fields, without per-row
HTTP/SQL calls. Values never require configuration authority, but do require report
and entity authority. No claim of field-level RBAC: presentation hiding is not one.

## Export and bounded cost

CSV is generated by a fresh server-authorized query, never the current browser rows.
UTF-8 BOM, human headers, branch timezone/generation and applied filter metadata,
exact INR strings, quoted cells, escaped quotes/newlines, and safe attachment naming
are used. Cells starting with formula characters `=`, `+`, `-`, `@`, including after
whitespace/control characters, get an apostrophe prefix; leading tab/CR/LF do too.
This deliberately also protects legitimate negative numeric display strings.
Responses are `no-store`; downloads revoke their temporary object URL.

Hard maximum 2,000 export rows and 5 MiB, not an entitlement. A conservative adaptive
row budget reserves 128 KiB overhead, uses at least 8,000 bytes per canonical row,
measures the maximum canonical row in SQL (covering legacy text/branch arrays), and
adds worst-case selected custom text/option widths. The ordinary conservative row
cap is therefore 638; wide columns reduce it further. Over-budget requests fail
clearly before row loading, without partial/truncated CSV or a successful-export
audit event. Interactive pages default to 25/max 100, maximum page 200, and use the
same memory budget; select fewer columns/reduce page size for very wide reports.
Final serialized JSON/CSV size is checked. Each statement has a 10-second timeout.

Counts scan the filtered canonical set; SQL size measurement adds CPU work. Existing
organization/branch/date/journal indexes and canonical projections are reused.
Definitions/options and values are batched; relationship choices add at most three
bounded queries. Small disposable fixtures and EXPLAIN are not production load
benchmarks. No giant export, per-field index creation, chart framework or scheduler.
React Query keys include user/org/branch/permissions/entitlements/filters/columns;
previous data is retained only when that authorization/report scope is unchanged.

Successful export writes only organization, actor, report key, row count and time
to `report_export_events` in the same transaction, integrated into authorized tenant
audit. No exported values, names, search terms, custom values or raw CSV enter audit.
Dashboard and notification preferences do not create fake security events.

## Notification model

`user_notifications` owns user + organization + Membership and nullable branch,
closed category/event/action, bounded plain title/message, dedupe key and created/read
timestamps. Organization-qualified Membership/Branch FKs plus an owner trigger deny
cross-user/tenant writes. Recipient/time and partial unread indexes serve the center.
`notification_preferences` is organization/user scoped, with only the optional
`organizationChanges` toggle. No API accepts a caller-selected recipient.

Only `organization` category is implemented. Events: successful active Membership
administrative update, and active custom-role update affecting assigned Memberships.
Generic attention messages contain no name, role name, UUID, customer PII, notes,
tokens, credentials or user-supplied HTML. Server SELECT resolves only same-org active
Memberships with at least one assigned active branch and enabled optional preference.
Role updates target only members of that role; membership updates target that member.
These access messages have no domain-sensitive payload and need no paid entitlement.
Recipients must reauthorize normally on every later request. Inactive/revoked users
receive no new message. Creation/revocation/archival and Queue/stock changes are not
silently represented as implemented notification events.

Events are written in the same canonical transaction; unique org/user/event-target-
version deduplication suppresses retries. No low-stock spam, mutable template input,
security-email replacement, new Socket.IO room or unauthenticated subscription.
Closed action `settings` maps to `/settings`, never an arbitrary URL.

Bell shows unread count/recent three; Center shows 25-row pagination, unread/category
filter, own read/unread/read-all, safe deep link and Preferences. Counts and rows share
a snapshot; ownership includes Membership. Notification queries are in-memory only,
foreground poll every 60 seconds with focus revalidation; correctness is independent
of Socket.IO and Render wake behavior. General notification email is deferred;
existing verification/reset/invitation SMTP remains unchanged and optional.

Unread messages are retained. Read messages older than 90 days can be pruned by the
explicit operator command `npm run notifications:prune -- --apply`, at most 1,000 per
invocation. It prints only the count, never reads/deletes append-only audit or business
rows. Schedule/ownership for maintenance is an operations decision, not web startup.

## Consequences / release boundary

Apply 016 explicitly before backend deployment; include it in future recovery proof.
Historical backup/restore proof is not automatically extended by this product release.
Staff updates retain unchanged branch assignments referenced by immutable histories;
removing a history-referenced assignment fails 409 rather than deleting history or
weakening its FK. No Atlas writes/deletion, TLS/security weakening or application
startup auto-migration. Render remains intentionally Free staging. **NO-GO FOR REAL
CUSTOMER DATA** and operational requirements remain unchanged. V2-08F does not start.
