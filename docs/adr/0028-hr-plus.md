# ADR 0028: Membership-scoped HR Plus

Date: 2026-10-08. Status: accepted design; release evidence in the V2-09C review.

## Authority and commercialization

Additive migration 020 extends the canonical PostgreSQL schema; 001–019 remain
unchanged. `hr_plus` / HR Plus and `module-hr-plus` are optional, unpublished and
unpriced. No Pilot Core inclusion or existing-subscription grant is introduced.
Attendance is independently entitled and authorized. Neither module manufactures
the other's business facts. PostgreSQL memberships, existing branch assignments,
identity/session, live replacement custom roles and Staff dynamic fields remain
authoritative; there is no `hr_employees` or parallel staff/authentication system.

`hr_plus.read` permits selected-branch overview, schedules and privacy-minimized
leave lists; `manage` controls types/calendars/templates/draft schedules/publication;
`approve` controls review. Owner/admin/HR receive all three; manager read/manage
only, staff self-service only. Custom roles replace built-ins, never union them.
Operators gain no tenant bypass. Self endpoints resolve the authenticated live
membership, not a client subject selector, and require HR entitlement plus an
active assigned branch. A global user with several memberships owns distinct HR
facts in each organization. Broad report access separately requires Reports read.

## Dates, leave and reviewers

Whole-day DATE leave is organization-membership-wide across all assigned branches.
Strict valid dates, ordered ranges and a 90-calendar-day cap apply. Every request
requires a different reviewer; automatic approval, an owner exception, half-days,
hourly leave, quotas/accrual/carry-forward and invented balances are deferred.
Types are explicit editable/archiveable configuration, not statutory entitlements.
Basic policies: required reason, past-date permission, calendar-day minimum notice,
and whether non-working days count. A branch calendar is required for working-day
counting. Count, type name and policy/calendar-version/timezone snapshots freeze at
submission; later edits do not rewrite historical requests.

Lifecycle: pending → approved/rejected/cancelled; approved → cancelled only by a
different authorized reviewer before its starting branch date. Started/past approved
correction is deferred. Requesters may cancel pending requests only. Rejection and
reviewer cancellation require a bounded private note. Reviewer authority must cover
ALL currently active branches assigned to the subject, not merely the selected UI
branch. No self-review or silent privilege exception. Terminal records stay retained.

Pending and approved requests reserve the entire inclusive date interval. Database
GiST exclusions protect membership overlaps. UUID equality support uses PostgreSQL
[`btree_gist`](https://www.postgresql.org/docs/17/btree-gist.html); range exclusions
follow the [range constraint model](https://www.postgresql.org/docs/17/rangetypes.html).
Hosting must support installation of this trusted extension; no application-side
overlap-only fallback substitutes for the database constraint.

## Calendars and schedules

Explicit branch setup supplies the weekly working pattern. Monday–Friday is an
editable UI suggestion, not a persisted or legal default. Manual DATE overrides
can mark working/non-working days, unique per organization/branch/date, with
versioned editing/archive. No external holiday feed or independent calendar timezone.
The canonical branch IANA timezone defines business dates. Calendar DATE strings
never pass through device-local instant conversion.

Organization shift templates carry name/local times/explicit overnight/break/status
and versions. Assignments reference canonical active same-organization branch-assigned
memberships, snapshot template name/timezone/break, and retain precise UTC instants
plus starting business DATE. Overnight end is explicitly the following day. Canonical
IANA conversion rejects ambiguous/nonexistent DST input. New/edit/publish checks the
current branch timezone. Template edits do not rewrite existing assignments.

Drafts reserve actual half-open UTC intervals across branches; published shifts are
immutable except explicit cancellation/replacement. Cancelled history is retained.
GiST exclusions reject overlapping draft/published intervals. Repeat creation is one
atomic employee batch, at most 31 calendar days/31 shifts; working-days-only requires
the explicit calendar. No multi-employee unbounded generation.

Approved leave blocks new/edit/publish work touching its dates in each assignment's
branch timezone, including overnight coverage. Approval rejects conflicting published
work; draft work may remain but cannot subsequently publish. Resolve the conflict
through an explicit cancellation; neither fact silently rewrites the other.

## Transaction ownership and privacy

One `PostgresDatabase.atomic` boundary owns command, history, private decisions and
attention delivery. The same organization lock used by RBAC serializes live
authority changes and cross-table leave/publication checks; database triggers take
it too. Versions reject stale commands. Organization-scoped idempotency keys and
normalized SHA-256 fingerprints include actor/branch/action/payload; identical
retries return the original safe ID/status/version result, altered retries conflict.
No sensitive free text is stored in command results. Lock/statement waits are bounded.
Events/decisions/commands are append-only; hard deletion and frozen fact rewrites fail.

Reasons are restricted to the requester and full-coverage approvers. Decision notes
are restricted to full-coverage approvers, not copied to staff notifications, reports,
CSV, dashboard or generic history. Availability uses batched bounded active roster
queries and four factual states: Scheduled, Approved leave, Non-working calendar day,
No published shift. Published overnight coverage includes each snapshot-local date
touched by the half-open interval, including carryover from before the read window;
an exact midnight end excludes the next day. Shift lists/widgets/daily assignment
reports separately select starting business dates. Availability exposes no
reason/type/decision notes, absence inference,
staffing score or invented count of hours actually worked.

Four independently gated domain widgets show pending requests, approved leave today,
published shifts starting today, and active assigned members without a published
shift starting today. The last includes leave/off days and does not mean absent.
Four closed reports (Leave Requests, Approved Leave by Period, Shift Schedule,
Assigned Published Shifts daily) reuse branch scope, range/row/byte budgets,
formula-safe CSV and append-only export evidence. Leave periods select overlap;
counted days label the WHOLE request, not a clipped period total. No private free-text
columns exist. Shift metrics are assignments, not attendance or payroll.

Event-driven in-app attention: submitted → exact full-coverage active approvers
excluding self; approved/rejected → requester; published/cancelled published shift
→ assigned member. Server batch SQL honors `hrUpdates`, dedupe and recipient budgets.
Live visibility gates HR entitlement and approval attention permission. Closed `/hr`
links recheck authority. Generic messages contain no private reason/note. No scheduler,
external delivery provider, paid dependency or guessed manager is introduced.

## UI, validation and deferrals

The shared shell exposes HR Plus / My Work independently of broad HR permissions.
Scoped cache keys include user/organization/branch/effective permission and module
sets (order-independent); authority changes clear state. Forms use existing controls,
intentional leave/review confirmation, bounded roster pagination, explicit empty/error/
retry states and unchanged uncertain-command retries. Separate Attendance links require
its own entitlement/read permission. Staff fields stay in the existing shared engine;
Leave/Shift custom fields are deferred.

No salaries, payroll runs, payslips, statutory PF/ESI/taxes, wages/overtime, bank files,
loans/expenses, biometrics/geolocation/face recognition or medical uploads. No legal
compliance claim. Render Free remains staging-only, extended hosted recovery OPEN,
Atlas retained and NO-GO FOR REAL CUSTOMER DATA unchanged. V2-10 is a separately
authorized final acceptance review, not automatically started by this implementation.
