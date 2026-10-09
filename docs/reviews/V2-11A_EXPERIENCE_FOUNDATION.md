# V2-11A experience foundation acceptance

Date: 2026-10-09. Scope: original frontend experience foundation, not a backend
domain rewrite or customer-data pilot approval. **NO-GO FOR REAL CUSTOMER DATA
remains unchanged. Render Free remains staging only.**

## Baseline and preserved work

Resumed the existing main working tree at accepted V2-10 commit
`5c254a14af6e083959e2b936dde826cbf82e6a4c`. The existing annotated
`pre-v2-11a-experience-foundation` checkpoint was retained, not recreated.
No reset, restore, stash, clean or discard was used. The user's narrow
`reference/` exclusion is preserved. All three reference directories were
verified ignored; no reference file is tracked. Their source was read only:
no dependency installation, server execution, source edits or credential copying.

The [source comparison](V2-11A_REFERENCE_UX_ANALYSIS.md) maps 18 reference
features through two keyed matrices and a quality benchmark. All 67 concrete
reference file citations were checked against the actual local directories.
CRM grouping/personalization, Biz Auth membership/context presentation and PMS
operational details/cards informed original implementations. Reference auth,
Mongo authority, gateways, messaging, effects, fonts and branding were rejected.
Levalor has no provided backend; no backend security or execution is claimed.

## Delivered architecture

See [ADR 0029](../adr/0029-ekavio-design-system.md) for the decision and complete
token scale. Semantic surface/text/border/focus/status/overlay tokens, restrained
elevation, consistent type/spacing/radii, 44px controls, 1440px content bound and
reduced-motion rules share the existing ThemeProvider. Legacy utility aliases
permit phased domain work without replacing the business pages wholesale.
First use remains Light; saved Light/Dark/System and live OS System changes use
one existing preference store, not a second theme or credential cache.

Reusable Button/Input/Card/AdvancedModal/SearchSelect/Table are refined in place.
WorkspacePrimitives adds page/section headings, metrics/actions/status,
search/filter, detail, skeleton/error/retry, pagination and confirmation. Inputs
have unique IDs, stable labels, composed help/error descriptions and required
indicators. The bounded selector supports keyboard options, search, clearing
and Escape/focus return; it is not advertised as a global server search.

AdvancedTable's explicit server mode emits controlled search/sort/page/page-size
callbacks and never filters or sorts a received server page locally. Unsupported
callbacks hide the corresponding controls. Local mode labels its received-row
scope and searches declared columns only. Customers retains canonical fixed
alphabetical server order; no unsupported global sort endpoint is invented.
Queue and Appointments now use honest server paging instead of subset sorting
and duplicate pagination, without changing operational workflows.

### Responsive shell and context

At 1024px and above, grouped desktop navigation has a compact 80px rail option.
Tablet navigation is an accessible drawer; below 768px the shell has a compact
header, safe-area-aware bottom navigation and More drawer. Nine presentation
groups derive only from the existing authorized destinations. Active links,
native keyboard controls, skip link, focus return and scroll locking are retained.
Mobile Work chooses a stable authorized Queue/CRM/HR/Inventory priority, not a
role-based grant. Profile links and the account sheet expose profile, security,
appearance and help. Normal context displays human organization/branch names.

Switching unmounts old workspace content, cancels/clears old queries before and
after server refresh and remounts scoped children. Pending mutations disable
switching. Rejected context leaves the current authorized workspace intact.
User/organization/branch/permission scope participates in queries and remounts;
existing session refresh, live authority polling and Socket.IO reconnect remain
the authority mechanisms. Compact navigation persists only a harmless boolean;
customer names/phones/custom filter values are not persisted.

### Dashboard and Customers exemplar

Dashboard has a greeting/context, server business date/timezone, permitted quick
actions, scoped metric labels and existing positive attention indicators.
Versioned widget hide/order and touch/keyboard reorder arrows remain server
persisted. Operator tools are separate. Unsupported activity/upcoming-work
projections are not fabricated, and failed facts are not replaced by fake zeros.

Customers demonstrates bounded server search/page/page-size and the existing
typed custom-field filter, desktop records and mobile cards, structured detail
drawer/full-screen sheet, accessible View/Edit/Back, collapsed technical IDs,
canonical E.164 and dynamic-field forms, loading/empty/error/genuine retry,
pending/duplicate-submit guards and a single unsaved-change confirmation.
Only safe page size is stored in the URL. Dynamic fields/layouts and backend
validation remain authoritative.

## Automated evidence

All evidence here is local engineering evidence with disposable fixtures, not
authenticated hosted/provider/recovery evidence. The managed browser bridge
could not bootstrap because sandbox metadata was unavailable; the requested
repository Playwright/Chromium fallback was used. No operator browser test loop
or manual customer test was required.

| Gate | Result |
| --- | --- |
| Locked frontend installation | PASS, 579 packages, no dependency/lockfile change |
| Frontend lint / typecheck | PASS |
| Frontend component tests | PASS, 100/100 (including 6 new behavior contracts) |
| Frontend production/PWA build | PASS with required local API/socket build variables |
| Backend lint / typecheck / unit / build | PASS, 196/196 unit tests |
| Backend dynamic fields integration | PASS, 19/19 |
| Backend analytics/notifications integration | PASS, 17/17 |
| Seven-module live HTTP/socket authority and audit metadata integration | PASS, 20/20 |
| Append-only audit persistence / redaction integration | PASS, 1/1 |
| Backup/recovery/watchdog/hosted-safety/strict acceptance source tests | PASS, 23/23 |
| Frontend full and production dependency audits | PASS, 0 vulnerabilities |
| Backend full and production dependency audits | PASS, 0 vulnerabilities |
| Docker Compose config / build / runtime | PASS, frontend/backend/PostgreSQL healthy |
| Local HTTP live / ready / root / login | PASS, all HTTP 200 |
| Bounded normal backend/frontend log review after final backend rebuild | PASS, 121 lines, no matched runtime errors |

| Chromium suite | Local evidence |
| --- | --- |
| Foundation workflows and presentation | All 61 cases passed across the full run and targeted correction/recapture runs; exact CI reruns the complete suite |
| Required final loaded visual matrix | PASS, 27/27, 270 sanitized captures |
| Real PostgreSQL identity/recovery | PASS, 11/11 |
| Real PostgreSQL organization administration | PASS, 18/18 |
| Real PostgreSQL dynamic forms/layouts | PASS, 14/14 |
| Real PostgreSQL analytics/notifications | PASS, 13/13 |
| Real PostgreSQL CRM | PASS, 15/15 |
| Real PostgreSQL purchasing | All 18 passed: full run 17/18 plus unchanged isolated login-timeout rerun 1/1 |
| Real PostgreSQL HR | PASS, 15/15 |
| Real PostgreSQL public/commercial/onboarding/Billing/renewal | PASS, 24/24 |
| Real PostgreSQL module shell/context | PASS, 10/10; 27 destinations x 3 widths x 3 themes, plus actual branch/filter/read-only/foreign-context case |

The final post-fix analytics owner journey and strengthened real branch/filter
case each passed again (1/1); the analytics audit-persistence warning is gone.
The table distinguishes unique cases from repeated verification runs (199 unique
browser cases across foundation and real PostgreSQL suites). All local gates are
accepted; release still requires the exact-commit CI/tag sequence below.

### Loaded visual and interaction review

The 27 required width/theme visual cases passed in a final fresh capture:
320, 360, 390, 430, 768, 1024, 1280, 1440 and 1920px, each in Light/Dark/System.
System was captured with dark OS preference; the existing first-use/live-OS test
also verifies System changing back to light. Ten loaded captures per case cover
Dashboard, Customers list/detail/create/edit, navigation/More, account/context,
appearance, empty and terminal-error states: 270 PNGs outside Git under
`frontend/test-results/experience-visual/`. Contact sheets and representative
full-resolution images were inspected, not accepted solely from test PASS.

Mobile cards, visible Create CTA, readable labels, safe bottom navigation,
full-screen detail/forms and reachable sticky actions fit the small widths.
Tablet drawers/toolbars and desktop table/detail/action hierarchy were reviewed
through 1920px. A separate 390x430 dirty-form test verifies reachable Save,
single confirmation, preserved edits, background lock and focus return.
An additional compact-rail case verifies named destinations and keyboard
group collapse/expansion, with a separate ignored screenshot. No clipping or
document-level horizontal overflow remained in accepted captures.

Chromium full-page capture resizing initially omitted paint in a sticky overflow
sidebar on a long Dashboard. A same-page viewport comparison showed the loaded
sidebar correctly painted. Final Dashboard screenshots therefore use viewport
capture; other matrix captures are full-page with separate navigation evidence.
This is a documented capture distinction, not a CSS workaround hiding content.
Terminal-error captures wait for the actual production three retries (1/2/4s),
with a bounded 20s boot allowance, rather than screenshotting a loading state.

Accessibility checks cover native named navigation/sort controls, editable-field
names across module smoke, focus/keyboard drawer and modal behavior, stable
labels, semantic status/error/landmarks, readable themes and reduced motion.
This is scoped automated/visual acceptance, not a comprehensive WCAG certificate
or a physical mobile-keyboard/device test.
Source-token contrast calculations also passed normal-text AA for text/muted
text on default Light/Dark surfaces (15.55/6.35 and 14.87/8.01), primary readable
links (6.29/9.88) and white text on all four shipped accent options (minimum 5.85).
These calculations do not certify every legacy utility/color combination.

### Genuine findings and corrections

Customer initial debounce previously reset an early page turn; it now schedules
only a changed search. Nested customer-name labels polluted the heading name;
visible heading semantics and accessible View/Edit actions are retained. Drawer
Escape/Tab handles document focus rather than depending on focus remaining in
the drawer. Existing genuine retry and required-label behavior remains tested.

Real branch tests use the actual required branch status and HTTP 200 creation
contract, and wait for the loaded page h1/completed switch. All-module smoke
uses real SPA navigation and exact source-backed h1s; repeated cold refreshes
must not exhaust or weaken deployed refresh rate limits. Earlier slow-host
timeouts were diagnosed and rerun without weakening existing assertions.

Analytics seed logs exposed an existing audit defect: ordinary queue record
metadata used `tokenId`, which correctly fails credential-key redaction.
Queue create/status and appointment check-in now label only that audit metadata
`queueRecordId`. API DTOs, events, business behavior and credential-redaction
policy are unchanged. A real HTTP/PostgreSQL regression verifies all three
events persist and idempotent replay adds no duplicate audit event.

Existing multi-actor HR/commercial QA client-phase hooks recreate their isolated
app/limiter state and can emit express-rate-limit creation-stack diagnostics.
Those test-only hooks are excluded from compiled runtime routing. They were not
silenced and deployed thresholds were not changed. Negative 401/403/404/409
requests are expected test evidence; the normal Docker log scan is separate.

### Performance

Measured production build sizes, not laboratory runtime latency claims:

| Output | Baseline | V2-11A |
| --- | --- | --- |
| Entry JavaScript | 392.19 kB / 125.82 kB gzip | 431.73 kB / 138.67 kB gzip |
| CSS | 63.62 kB / 12.09 kB gzip | 76.67 kB / 14.75 kB gzip |
| PWA precache | 79 entries / 1064.24 KiB | 77 entries / 1091.94 KiB |

The entry increase is 39.54 kB (12.85 kB gzip); no UI framework or dependency
was added. Lazy route boundaries remain intact. Existing toast/client dynamic
import warnings and slow-host plugin timing notices are not new bundle errors.
The first build invocation lacked required VITE variables and correctly refused
to build; the corrected production invocation passed, not an ignored failure.

## Security and release boundary

No backend domain, migration, auth store, TLS/credential, money/stock, entitlement
or HR privacy rule changes. Backend independent denials remain covered by real
local HTTP/socket tests. Browser tests use local disposable accounts; authenticated
automatic traces/screenshots are disabled and excluded from uploaded artifacts.
The visual matrix uses sanitized mock HTTP fixtures, not real customer records.
Reference source, secrets, backups, dependency trees and generated build/QA files
must not enter staging. Atlas was not touched or deleted.

Release sequence is strict: local acceptance, coherent main commit/push, exact
commit CI success, then annotated `v2-11a-experience-foundation`; verify clean
main and fresh remote equality. The completion tag identifies the accepted
release commit without requiring a self-referential SHA in this report.

## Remaining phases

See [V2-11 roadmap](../roadmap/V2_11_EXPERIENCE_ROADMAP.md): B daily operations;
C CRM/follow-ups and purchasing; D administration/workforce/reports/billing;
E cross-domain polish and final responsive/accessibility acceptance. Other
modules receive shell regression coverage here, not a final deep redesign.
No subsequent phase starts automatically. Operational/hosted real-data GO gates
remain independent and unchanged.
