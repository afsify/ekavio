# UX-01 — Premium Workspace local acceptance

Date: 2026-10-28. Status: **LOCAL ACCEPTANCE PASS; published-candidate full CI pending**.

This is a presentation/interaction increment, not production approval. **NO-GO FOR REAL CUSTOMER DATA** remains unchanged. Render Free is synthetic staging-only. No merge, deployment, hosted migration or provider change is authorized by this report.

## Baseline and preservation

- Existing worktree: `C:\Projects\ekavio\.cache\ux01-premium-workspace`.
- Branch: `feature/ux-01-premium-workspace`.
- Pre-publication HEAD/base: `4d451a5a1cc107bd87d66cf3e2aa9eb5c88da509`, matching draft PR #6.
- Fresh remote main: `374fe470e4c2f0c1ac3e30078dea2ec9f68fb7c4`.
- PR #6 was independently confirmed open, draft and unmerged. Its PR description contains historical pending results; this report does not alter that description or infer new CI results from it.
- Preserved all 17 existing UX source/test files, original worktrees, protected reports, ignored reference sources and local demo. No reset, stash, rebase, cleanup or history rewrite.
- The UX increment comprises the following 17 source/test files plus this report: **18 files**. The final commit and exact CI URL are recorded in the publication handoff/PR, avoiding a self-referential commit SHA in this document.

## Delivered improvements

1. Neutral light surfaces and charcoal dark surfaces replace the blue-heavy workspace palette. Green navigation accents improve selection hierarchy without changing the original purple logo or saved primary-color preference. System mode still follows the device and reduced-motion preferences remain supported.
2. Quieter grouped sidebar, consistent icons/spacing, 80px collapsed rail, group state retained across navigation, and the active destination kept visible. Permission/entitlement filtering remains in the existing catalogue.
3. Compact responsive header removes duplicate context text, retains accessible organization/branch selectors and uses a single desktop row at larger widths.
4. Desktop account dialog anchors to the avatar; mobile uses a bounded bottom sheet. Actual identity, profile, security, Settings, Help, appearance and shared sign-out remain available through existing routes/contracts.
5. Mobile account stacking/height defect corrected: portal outside the sticky-header stacking context, scoped automatic height and viewport-bounded scrolling. Tests check actual hit-testing above bottom navigation, focus containment/restoration, Escape, backdrop and short-screen logout reachability.
6. Editable searchable combobox retains input focus with `aria-activedescendant`, Arrow/Enter selection, Escape restoration, explicit optional clearing, multi-selection and disabled-option protection. Typing does not change canonical IDs. Search is explicitly limited to received authorized options, not advertised as server-global search.
7. Larger organization/branch, CRM assignment/stage, Tasks staff, reception customer/service and Purchasing supplier/item choices reuse this control. Small lists remain native. Existing server search, pagination, retained historical choices and eligibility/duplicate guards remain intact.
8. Billing module cards separate identity/description from Enabled/Unavailable status; no grants, billing claims or commercial behavior change.

## Reviewed change inventory

```text
frontend/src/components/forms/ReceptionSelection.tsx
frontend/src/components/layout/AdminLayout.tsx
frontend/src/components/layout/AdminSidebar.tsx
frontend/src/components/layout/TenantSwitcher.tsx
frontend/src/components/layout/AccountMenu.tsx
frontend/src/components/layout/SignOutButton.tsx
frontend/src/components/ui/AdvancedModal.tsx
frontend/src/components/ui/AdvancedSearchSelect.tsx
frontend/src/components/ui/OptionSelect.tsx
frontend/src/index.css
frontend/src/pages/Billing/BillingPage.tsx
frontend/src/pages/CRM/CrmPage.tsx
frontend/src/pages/Purchasing/forms.tsx
frontend/src/pages/Tasks/forms.tsx
frontend/src/test/experience.test.tsx
frontend/src/test/workspaceControls.test.tsx
frontend/e2e/ux01-workspace.spec.ts
docs/reviews/UX-01_PREMIUM_WORKSPACE_ACCEPTANCE.md
```

No backend, API client/session store, migrations, dependency manifest/lockfile, CI, environment, entitlement or reference-source changes.

## Verification evidence

| Check | Actual result |
| --- | --- |
| Changed-file ESLint | PASS, exit 0; all changed TS/TSX source/test files |
| TypeScript `tsc -b` | PASS, exit 0 |
| Production/PWA `npm run build` | PASS, exit 0; 2,260 modules; 98 precache entries / 1,307.13 KiB |
| Focused component regressions | **110/110 PASS**, 9 files, exit 0 |
| Initial UX browser matrix | 22 passed / 1 failed: test queried all page options, including the native branch option. Scoped to the intended workspace listbox; retained exact one-match assertion. |
| Corrected prior UX matrix | **23/23 PASS**, one Chromium worker, zero retries |
| Final UX matrix including short-screen logout | **24 cases**, final `.last-run.json` status `passed`, `failedTests: []`, recorded 2026-10-28 10:41:04 +05:30. Last console chunk preserved 20 passing cases; final stdout/exit code was unavailable after session loss. Passed completion is established by the final runner artifact, not by treating an interrupted stream as success. |
| Real PostgreSQL/HTTP demo browser review | **6/6 distinct workflow groups PASS**, exit 0; no unexpected API failures or uncaught page errors |
| Working-tree whitespace check | `git diff --check` PASS |

The 24 browser cases are 21 width/theme variants plus three distinct interaction scenarios. They are not 24 independent business workflows. The earlier 23-case run is superseded, not added to make 47. The six real-demo groups are reported separately; screenshots are not counted as tests.

Component selection: `experience`, `workspaceControls`, `crm`, `crmConfiguration`, `crmWorkbench`, `tasks`, `themeControl`, `operations`, `purchasing`. It includes received-option keyboard/disabled/clear semantics, canonical business-form behavior, scoped CRM/Tasks replacement, permission/entitlement denial and draft preservation/removal rules. Existing assertions/deadlines were retained; no added retry, skip, force click or disabled security guard.

Final source was unchanged after successful lint/typecheck/build/components. The last browser-file addition only added the 320x480 account focus/logout regression; final browser completion includes it. The earlier interrupted lint/typecheck attempt was not counted: fresh checks completed successfully.

Build warnings: existing mixed static/dynamic `client.ts` import prevents separate chunking; Vite plugin timing notice. Neither was treated as a failure or hidden. Final output: main JS 239.90 kB (gzip 74.52), CSS 100.24 kB (gzip 18.72), selector chunk 4.57 kB (gzip 2.05), CRM 46.23 kB (gzip 12.06), Tasks 27.50 kB (gzip 8.53). No new dependency, font, decorative request or image asset. No comparable baseline build was rerun solely to manufacture a bundle delta.

## Visual and accessibility review

Widths: **320, 360, 390, 768, 1024, 1280, 1440**, Light/Dark/System. System was also changed from dark to light device preference. Additional 200% text combobox and 320x480 account checks cover constrained layouts.

Local-only evidence roots (intentionally excluded from Git):

- Before: `C:\Projects\ekavio\.cache\local-full-demo\.cache\local-demo\screenshots\`, including `crm-mobile-dark.png`.
- Final synthetic shell matrix: `C:\Projects\ekavio\.cache\ux01-premium-workspace\frontend\test-results\ux01\` (`{width}-{theme}-{shell,account,drawer,rail}.png`, plus `390-zoom-combobox.png`).
- Real-demo evidence: `C:\Projects\ekavio\.cache\ux01-premium-workspace\.cache\ux01-real\`, including CRM width/theme captures, `tasks.png`, `billing.png`, `mobile-account-dark.png`, `mobile-drawer-dark.png`, `lead-detail.png`, `custom-fields.png` and `results.json`.

Inspected actual rendered examples include 320 dark account/CRM, 360 light CRM/System shell, 390 dark account and enlarged combobox, 768 dark account/System CRM, 1024 System shell, 1280 dark rail/CRM, 1440 light shell/CRM and real Tasks/Billing. Findings: calmer surfaces, readable text, consistent active-navigation hierarchy, bounded account actions, clear form selection feedback and no asserted document overflow. Native context labels truncate at narrow widths; the full organization identity remains in the account dialog.

Some full-page real CRM captures were taken with nonzero scroll after focus restoration; Chromium composites fixed/sticky chrome at that captured viewport offset (including off-viewport skip-link pixels). These are not clean top-of-page presentation images. Use the shell matrix and viewport account captures for header/stacking assessment; do not interpret those full-page composites as proof that a heading is permanently obscured. A proposed temporary capture-normalization edit was declined; it was not applied, retried, renamed or bypassed. It changed no source or test evidence and does not invalidate the completed functional checks.

Keyboard evidence: mobile drawer initial focus, Shift+Tab wrap, Escape and trigger restoration; account dialog focus/wrap/backdrop/Escape; short viewport sign-out hit-testing; combobox retained input focus, Arrow/Enter/Escape and large-choice search. No accessibility certification is claimed. Calculated token contrasts: light text/surface 15.10:1, muted 6.44:1, sidebar accent 5.81:1; dark equivalents 14.85:1, 8.25:1, 9.74:1. These are token-pair checks, not a claim that every rendered combination was formally audited.

## Real-demo preservation and coverage boundary

Existing PostgreSQL 17.11 cluster / 21-migration demo was reused, not reseeded. Original demo branch remains `codex/local-full-demo` at `d4bf5a82aea63b84adb8b26947fc4d2fb2d8d3d8` with no tracked changes.

Six completed groups: owner login and eight authorized modules; canonical CRM Kanban/Lead detail; seven-width three-theme CRM/account presentation; real Tasks/Customers/Services/Queue/Inventory/Purchasing/Attendance/HR/Forms/Reports/Billing/Organization routes; mobile navigation/account/profile; no unexpected API errors and canonical logout. Only temporary appearance preference changes were made and restored; no business record mutation was needed.

The owner-approved swap replaced only frontend port 4179. Original frontend restoration was confirmed HTTP 200, then independently reconfirmed with the process command pointing to `local-full-demo/frontend/demo/server.mjs`. PostgreSQL/backend listener identities stayed unchanged on 55439/5019. Local URL remains `http://127.0.0.1:4179` and now serves the original demo, not UX-01.

There is only one real demo organization and Main branch. Their selectors correctly remain disabled; a real cross-organization/branch switch was **not** fabricated or claimed. Source review confirms the existing cancellation/cache/context-refresh sequence is unchanged. Synthetic component scope-reset tests and large-choice browser keyboard checks provide separate evidence, not a substitute claim of multi-tenant real-demo verification.

## Resource control and security review

Testing resumed only after available memory recovered to about 5.5 GiB with approximately 21 GiB commit headroom. Components were sequential, one worker; browser used one Chromium worker, zero retries. Later finalization measured about 1.53 GiB available RAM, so successful heavy suites were not repeated. No unrelated applications, Docker/WSL or paging settings were changed.

Reviewed canonical ID handling, disabled historical/duplicate options, scoped state/caches, modal focus and shared logout. Search is local to returned options; existing authorized server pagination is retained. No permission aliases, entitlement grants, tenant/branch bypass, mutation replay, price edits or session protocol changes. The secure logout adapter preserves the existing revoke/local-clear/cache-clear/navigation/error behavior.

Before publication, explicitly stage only this inventory, run `git diff --cached --check`, and inspect the staged list. Exclude all ignored runtime scripts, private credential/state files, PostgreSQL binaries/data, screenshots, traces, logs, builds and unrelated reports. Review did not find a secret or copied reference implementation in the intended increment.

## Draft publication and remaining gates

The unchanged workflow runs full CI for PRs targeting main (branch pushes alone do not trigger it). Create one DRAFT PR targeting main with a prominent dependency on #6. PR #6 includes unmerged #1–#5 ancestry; therefore the main comparison is combined integration work, **not solely UX-01**. The new commit atop `4d451a5` identifies the isolated 18-file UX increment. Do not merge it independently or modify predecessor PRs.

Exact-head full Linux CI is still required for integrated acceptance: backend/frontend audits, PostgreSQL/session/business contracts, browser/visual matrices and Docker gates. No pending/skipped check is a pass. Record actual run/job/step statuses in the publication handoff; do not claim production or staging-release approval from local tests.

Deferred UX-02 recommendations, not started: independently prioritized domain-page polish, larger real synthetic multi-organization fixtures under separate authorization, and manual assistive-technology review. Server-global search, new backend capabilities and operational production-readiness work are not part of UX-01. Staging integration/backup/migration/deployment approvals remain independent gates.

## Security repair checkpoint — 2026-10-28 (publication BLOCKED)

This addendum supersedes the earlier pending-CI wording only for the published
candidate: draft PR #7 HEAD `87c54b129b14fea5744e29c659171129ab1a911a` failed
[CI 40665021613](https://github.com/afsify/ekavio/actions/runs/40665021613)
at **Audit frontend dependencies**. Subsequent skipped gates are not passes.
The accepted UI source and its historical local evidence remain unchanged.

### Finding and bounded remediation

- GHSA-gcqx-w48m-w2h4 affects `deepmerge@4.3.1`, reached through
  `vite-plugin-pwa@1.3.0 -> workbox-build@7.4.1 -> @rollup/plugin-node-resolve@16.0.3`.
  These are dev/build dependencies. The inspected resolver uses the merge for
  static DEFAULTS, not customer input. No application source imports this chain;
  verification of the newly generated production assets is still pending.
- Upstream had no published patched version at investigation time. The repair is
  an explicitly application-maintained MIT fork, `@ekavio/deepmerge-build@4.3.1-ekavio.1`,
  not a claim of an upstream fix. Source tarball, integrity, license and replacement
  policy are recorded in `frontend/vendor/deepmerge-build/README.md`.
- Both copy paths reject `__proto__`, `constructor` and `prototype` before reading
  values, use own data-property definitions, and fail closed on unsafe target
  membership inspection. Compatibility checks cover clone/merge options, arrays,
  symbols, special values and actual Rollup resolver construction. Custom callbacks
  remain trusted configuration; this is not a general sandbox.
- Root devDependency `deepmerge: file:vendor/deepmerge-build` plus
  `overrides.deepmerge: $deepmerge` resolves the actual Rollup dependency to the
  reviewed local fork. Earlier nested relative overrides produced invalid links
  and were rejected. A clean audit with an unresolved dependency was **not** accepted.
  The graph regression also guards against new transitive/runtime consumers.
- npm audit remains enabled and unchanged. Its zero finding does not certify a
  local fork; the source review and executable regressions are separate evidence.

### Exact completed and outstanding checks

| Check | Result |
| --- | --- |
| Fail-first reproduction on upstream | Four security failures; four compatibility passes in the initial corrected selection |
| Normal install and actual resolver loading | PASS; valid local fork and deduplicated resolver graph |
| Clean `npm ci --ignore-scripts --no-fund` | PASS, exit 0; 579 packages added, 581 audited; lifecycle hooks deliberately not executed by this install check |
| Post-clean-install `npm ls deepmerge --all` | PASS, valid resolved fork; no missing/invalid link |
| Post-clean-install `node --test ../scripts/pwa-dependency.test.mjs` | **11/11 PASS**, zero failures; actual resolver dependency tested |
| `npm audit` | PASS, exit 0, **0 vulnerabilities** |
| `npm audit --omit=dev` | PASS, exit 0, **0 vulnerabilities** |
| Node syntax checks: fork and two new test scripts | PASS, exit 0 |
| `git diff --check` | PASS, exit 0 |
| Frontend ESLint / TypeScript after dependency repair | NOT RUN; resource gate |
| Production build with repaired dependency | NOT RUN; resource gate; prior UI build is not claimed as patch acceptance |
| Two targeted production PWA checks | Added but NOT RUN: generated manifest/registration/bundle boundaries and real Chromium service-worker activation, offline shell, API cache exclusion |
| Standard clean Linux CI including lifecycle/build/browser gates | NOT RUN for this patch; no new commit or push |

The install took approximately eight minutes. RAM fell during execution. The final
read-only Windows counter showed **490 MiB available physical memory**, committed
bytes **19,627,839,488**, limit **35,081,060,352** (about 14.39 GiB commit headroom).
Physical RAM, not commit capacity, is the immediate blocker. A narrowly scoped
stop check found the installer had already finished; **no process was terminated**.
No heavy compilation or Chromium startup was attempted at that reading. Resume
sequential lint/typecheck/build and the two PWA checks when approximately 3 GiB
physical RAM is available. Do not repeat the successful install/security checks
without a relevant dependency change or fresh-environment verification need.

### Intended repair inventory and preservation

```text
frontend/package.json
frontend/package-lock.json
frontend/vendor/deepmerge-build/package.json
frontend/vendor/deepmerge-build/index.cjs
frontend/vendor/deepmerge-build/LICENSE
frontend/vendor/deepmerge-build/README.md
scripts/pwa-dependency.test.mjs
scripts/pwa-build.test.mjs
docs/reviews/UX-01_PREMIUM_WORKSPACE_ACCEPTANCE.md
```

All nine files remain uncommitted; nothing is staged. Application/UX source,
existing browser assertions, CI configuration and PWA configuration are unchanged.
No unrelated worktree changes are included. In particular, the separate local-demo
frontend repair is outside this patch and is not part of this inventory.
No Docker startup, provider operation, deployment, merge or hosted database action
occurred. PR #7 remains a draft at the previously published SHA. Publication is
blocked until the remaining build/PWA/static gates pass, followed by exact-head CI.
**NO-GO FOR REAL CUSTOMER DATA; Render Free is synthetic staging-only.**

### Authorized CI-validation continuation — 2026-10-28

The owner subsequently authorized publishing this reviewed repair as an
**unaccepted CI-validation candidate** when local resources cannot safely finish
the remaining gates. This supersedes the local-build-before-publication restriction
above, not the exact-head CI acceptance requirement.

At continuation, available physical RAM was **3,422 MiB (3.34 GiB)**, but committed
memory was **51,148,865,536 / 53,982,031,872 bytes**, leaving only **2.64 GiB** commit
headroom. No repeated install, compilation or browser startup was attempted.
Previously passing security tests and audits are retained without reruns.

Fresh remote branch and draft PR #7 both matched `87c54b129b14fea5744e29c659171129ab1a911a`.
The complete nine-file repair was reviewed, including MIT license, upstream
provenance, actual local dependency link, lockfile and malicious-input/compatibility
assertions. No accepted UI implementation or existing assertion is changed.
The two production-PWA checks are now chained before the existing `test:e2e`
command. The unchanged CI workflow builds production assets and installs Chromium
before that command; failure stops the step. The normal frontend `npm test` runs
the eleven dependency regressions. No audit, timeout, retry or CI gate is weakened.

Remaining evidence must come from the new exact-head Linux run: normal `npm ci`
with lifecycle scripts, full audit, lint, typecheck, production/PWA generation,
eleven loaded-dependency regressions, two production-PWA checks, and all existing
integrated browser/PostgreSQL/security/Docker gates. None is assumed PASS in
advance. Exact SHA, CI link and conclusion belong in the publication handoff;
this report is not self-certification of an unfinished CI run.

Only the nine-file inventory is authorized for this commit. Private runtime data,
credentials, generated builds, screenshots and unrelated worktrees are excluded.
Keep PR #7 draft; no merge, deployment, main update or provider operation.
