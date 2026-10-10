# V2-11C CRM, relationships and purchasing experience

Engineering evidence, 2026-10-10. **NO-GO FOR REAL CUSTOMER DATA remains unchanged.**
Render Free is staging-only; Atlas is retained. This frontend-only milestone
does not close hosted authentication, provider/recovery, monitoring/ownership
or always-on requirements in V2-10. No manual operator browser test is required.

## Baseline and scope

Started on clean `main`, HEAD/origin/fresh remote
`49f6fdc8aa18abb0cce7b75f1863ea06142a8e9e`. Accepted V2-11B annotated tag and
exact successful CI `37963905634` verified. The one annotated checkpoint
`pre-v2-11c-crm-purchasing-experience` is published at that SHA, never replaced.

Existing APIs, PostgreSQL authority and ADRs 0026/0027/0029 are reused. No backend,
migration, dependency, lockfile, credential, deployment policy or reference source
change. No second UI/theme/custom-field/Contact/stock system or new business domain.
The [source audit](V2-11C_CRM_PURCHASING_UX_AUDIT.md) records the exact read-only
Bizforz CRM, Biz Auth and frontend-only Levalor source patterns adopted/adapted
or rejected. No reference application was executed or source copied.

## Before / after and domain safeguards

| Journey | Experience delivered | Canonical boundary retained |
| --- | --- | --- |
| CRM priorities / list | Compact factual attention, native server filters, 20-row desktop table/mobile cards, intentional page reset | Selected-branch search/status/stage/assignee/date/attention, supported newest/oldest/name ordering; no revenue, forecasts or fake global sort |
| Pipeline | Desktop stage/count selection retains its bounded Lead workspace; mobile stage selector and cards | Organization stages, versions, recommended setup and archive/history; accessible select movement, no drag dependency/hard-delete |
| Lead create/edit/detail | Contact/source/staff/custom information, contextual valid actions, readable retained activity and human actors | E.164/optional contact validation, canonical Lead layouts/required fields and exact versions; no raw JSON/security audit or UUID as primary content |
| Follow-ups | Today/Overdue/Upcoming/Completed/All, branch-local dates, reviewed creation/edit, explicit Complete/Cancel confirmation | Manual actions only; expected versions, terminal rules, active-Lead attention and retained history; no device-timezone interpretation or automatic messaging |
| Conversion / cross-links | Explicit new/existing Customer choice, required canonical Customer fields, permanent-link review and canonical Customer navigation | Atomic conversion/exactly-one concurrent winner, repeat/foreign rejection, no contact matching or second Contact store; ordinary CORE Customers independent of CRM |
| Suppliers | Organization alphabetical server pages/mobile records; grouped name/optional contacts/business/address/notes/lifecycle and review | Name alone sufficient, versioned Archive/Reactivate, no phone/email merge/deletion/AP; latest 10 orders/25 events clearly selected-branch scoped |
| PO draft | Supplier/date/item/unique-line/value sections, bounded server Supplier and Inventory selectors, readable final review | Maximum 50 unique items; decimal strings and exact milli-quantity × paise BigInt, positive half-paise up; no invoice/payment/tax/profit claim |
| PO lifecycle/detail | Human reference/status, frozen item snapshots, ordered/received/remaining, receipts/history and valid contextual transitions | Draft/Ordered/unreceived cancellation never add/reverse stock; ordered lines immutable, no amendments or bypassing receipt with Mark Delivered |
| Receiving | Blank Receive Now quantities, positive ≤ remaining up to 3 decimals, blank lines excluded, review of actually entered lines/notes/branch effect | Confirmed payload/version/key frozen for identical retry; one outer transaction, partial/full progress, no catalogue-price rewrite/payment or independent reversal |
| History / context | Paginated receipt directory, latest 50 detail receipts/events and authorized canonical item/movement links | No shadow stock; live independent Purchasing/Inventory intersections, tenant/branch isolation, query cancellation and private dialog/draft unmount |

Shared `RelationshipRecords` consumes `AdvancedTable` in explicit server mode;
it never filters/sorts one loaded page as a global result. OperationForm supplies
one edit/review/discard dialog and a synchronous duplicate-confirmation latch,
pending guards, focus and reachable footer. Untouched forms are not marked dirty.
Unknown non-idempotent creates/conversion stop replay and require checking the
authoritative directory/link. Receipt retry alone retains its proved command key.
One-time Lead/PO deep links are consumed, preventing an old UUID reopening after
a workspace switch. Errors never optimistically claim success.

## Automated evidence register

Real workflows use isolated disposable local PostgreSQL and Chromium; local
legacy compatibility tests use a separate loopback-only Mongo fixture. Hosted
databases and Atlas are not used or changed by these tests. Presentation fixtures
are sanitized and not authority evidence. Managed in-app browser bootstrap failed
because sandbox metadata was unavailable; repository Playwright/Chromium provides
the automatic fallback, not fabricated hosted/operator evidence.

| Gate | Result |
| --- | --- |
| Backend lint / typecheck / unit / build | PASS; 196 unit tests |
| All 34 PostgreSQL integration files, serial | PASS; 328/328, zero skipped; includes CRM 16, Purchasing 22, live authority 22 and current recovery checks |
| Fresh migration / checksum status | PASS; 001–020 applied in disposable `ekavio_v211c_migration_gate`; historical/repeat/fresh upgrade assertions also pass |
| Mongo source boundary | PASS; 4/4; normal runtime remains PostgreSQL-only |
| Backup/envelope/watchdog/hosted/final-acceptance contracts | PASS; 23/23; strict NO-GO retained |
| Frontend clean install / lint / typecheck / components | PASS; clean npm ci, 108/108 component tests |
| Final production/PWA build | PASS after final CRM spacing fix; 77 precache entries / 1112.46 KiB |
| CRM browser | PASS; final stable regression 15/15 |
| Purchasing browser | PASS; final stable regression 18/18 |
| New real relationship browser | PASS; 6/6; explicit existing Customer, lifecycle/history, server pages/filter reset/pipeline, committed lost-response identical receiving, three open-draft branch switches |
| New sanitized visual matrix | PASS; frozen final run 31/31 and 24 contact sheets; includes all required width/theme combinations, loaded states and short-height review |
| Prior foundation / identity / administration | PASS; foundation 61 distinct cases (60 initial + one stable recheck), identity 11/11, administration 18/18 |
| Prior fields / analytics / commercial / HR / module shell / operations | PASS; respectively 14/14, 13/13, 24/24, 15/15, 10/10 and 13/13 in stable serial runs |
| Prior operations visual | PASS; 175/175 |
| Docker config / build / 3 healthy services | PASS after final spacing fix; backend, frontend and PostgreSQL healthy |
| Local live / ready / root / login | PASS after final spacing fix; all HTTP 200; no runtime-error indicators in inspected backend/frontend logs |
| Backend/frontend full + production-only npm audit | PASS; four audits, zero vulnerabilities |
| Local complete diff / security / artifact review | PASS; only the 28 intended frontend/test/CI/documentation files; no credentials, private/generated evidence, backend or reference changes |
| Exact commit CI / annotated completion tag / clean remote-equal main | Mandatory post-commit release gates; record exact outcomes in the release closeout and tag annotation, never infer from local passes |

## Loaded visual and accessibility review

Required matrix: widths 320/360/390/430/768/1024/1440/1920 × Light/Dark/System.
Each width/theme captures 20 loaded journeys: CRM overview/list/pipeline,
Lead form/review/detail, Follow-up form/review/list, conversion review,
Supplier list/detail/form, PO list/editor/review/detail, partial receipt form,
receipt confirmation/history. Six additional read-only/empty/error cases produce
18 captures at 390/1440, plus a 390×430 short review/discard example: **499**
sanitized journey/state PNGs and 24 rendered contact sheets, all ignored/out of Git.
System follows emulated dark and a live OS-light transition, not a third palette.

Screenshot inspection covered all 24 width/theme contact sheets and detailed
originals for Lead detail, PO editor/review, receipt confirmation/history,
read-only/empty/error states and the short-phone footer. After capture-framing
adjustments, mobile Light/Dark/System and representative tablet/desktop sheets
and empty-state originals were inspected again. Initial review identified and fixed
oversized phone attention cards and empty read-only CRM builtin placeholders;
the latter is a narrow CSS layout correction, not a duplicate field renderer.
Long names/references wrap, loaded desktop tables/mobile cards retain actions,
and confirmation facts and footers remain readable/reachable in inspected images.
Loaded list screenshots scroll to actual records, not merely skeletons; the
Pipeline selector also passes a center hit-test against sticky-header obstruction.
Most journeys use height 900; phone Pipeline captures use height 1100 to show
selector, long card and pagination together, while the separate 390×430 case
proves short-screen scrolling/focus/footer behavior. Widths are unchanged.
Automated checks cover horizontal document overflow, modal viewport bounds,
keyboard focus trap, footer hit-testing/reachability, live themes and short-height
discard. Real journey suites exercise labeled controls, permission states, context
switching, canonical links, errors and version/idempotency rules. This is local
browser/layout evidence, not blanket WCAG certification, screen-reader/mobile-OS
or hosted authenticated acceptance.

Failed setup/locator attempts were corrected without removing domain assertions.
Earlier foundation navigation and Dynamic Forms authentication interruptions were
not counted as passes: the affected foundation case and full 14-case forms suite
passed in the stable serial run. Existing test-only rate-limit initialization
warnings originate from `identityBrowserServer.ts` rebuilding independent apps
inside disposable fixture/client-phase handlers; deployed middleware initialization
and limits are unchanged. Normal Docker runtime logs were reviewed separately.
An intermediate capture run passed 29/31 while its capture source was still
being edited; two CRM outage captures timed out at loading. The subsequent
frozen run passed all 31 with the same outage assertions and timeouts intact.
Across retained and new suites, 424 distinct browser cases passed locally;
reruns are not added to that total. No interrupted/failed attempt is counted
as a pass without its successful final rerun.

## Performance

Measured before from accepted built assets and after the final production build:

| Asset | Before raw bytes | After raw bytes / gzip kB |
| --- | ---: | ---: |
| Main entry | 431644 | 432135 / 138.79 |
| Shared CSS | 74212 | 75262 / 14.68 |
| CRM lazy route | 29455 | 35433 / 9.04 |
| Purchasing lazy route | 21555 | 24512 / 6.87 |
| Suppliers lazy route | 7976 | 9749 / 3.37 |

Entry increase is 491 bytes (0.11%); CSS increase is 1050 bytes (1.41%).
Lazy-route growth reflects the reviewed workflows and shared server-page consumer.

Routes remain lazy, no new dependency; selectors/list pages are bounded. Existing
Vite warnings for already-shared toast/client ineffective dynamic imports remain
non-blocking and do not imply those dependencies were newly split.

## Review, release and deferred work

Changed groups: three workspaces/forms/contracts, tiny shared table wrapper,
command-outcome/deep-link helpers, OperationForm/CSS, retained+new component/browser
tests/configs and CI, this report/audit, two roadmaps, README and PROJECT_CONTEXT.
No backend/migration/lockfile/env/reference or generated/private artifact changes.
Local complete diff/security/artifact review passed. Explicit staging is limited
to the reviewed 28 files and must pass a second cached-diff check before commit.
Exact-final-commit CI remains required before annotated
`v2-11c-crm-purchasing-experience`. Commit message:
`feat: transform CRM and purchasing experience`. No release tag before exact CI
success; main must be clean and HEAD == origin/main == fresh remote main.

V2-11D: organization/branches/RBAC/staff/HR, reporting/notifications and Billing
experience. V2-11E: cross-domain/public/account polish, accessibility/performance
and final responsive acceptance. Neither starts automatically. New Sales,
accounting/AP, returns/corrections/amendments, automatic messaging, drag libraries
and external integrations remain outside this UX milestone. **STOP after V2-11C.**
