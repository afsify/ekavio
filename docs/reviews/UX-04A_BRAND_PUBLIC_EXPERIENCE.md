# UX-04A — brand and public experience local acceptance

Date: 2026-11-13. **LOCALLY ACCEPTED** for the scoped UI change. Not CI-accepted, published or approved for hosted release. The local checkpoint is the commit containing this report, with the parent recorded below.

## Preserved baseline and execution boundary

- Worktree: `C:\Users\DELL\.codex\worktrees\ux04a-brand-public-experience\ekavio`.
- Branch: `feature/ux-04a-brand-public-experience`; parent: `a0627cd93ece9d7a634785bbc81d23f9fc4bd49c` (UX-03).
- Existing managed worktree creation succeeded. No duplicate worktree, reset, stash, clean, rebase or other worktree edits.
- The earlier baseline Playwright request did not execute because automatic review was interrupted by a usage limit. It was not a test failure. The same local baseline command subsequently received normal approval and passed 9/9 with exit 0. No alternate launcher or review bypass was used.
- Dependencies were already installed (572 packages added, 574 audited, zero vulnerabilities reported at installation). No dependency or lockfile edits. That installation-time audit is not a new full security certification.
- Final validation began with 3.54 GiB available RAM and no remaining UX-04A lint/Playwright Node process. Commands run sequentially; browser workers = 1, retries = 0, existing deadlines retained. Tests own isolated loopback servers and synthetic HTTP intercepts, not the running demo or a database.

## Before and after

1. **Original folded E:** the existing mark now has clearer three-bar geometry, balanced negative space and a restrained fold. Inline SVG, favicon, social SVG and generated PWA/social PNGs share it. Wordmark spacing is less compressed. Light/dark lockups use semantic text/readable-accent tokens, not duplicated logos or an external brand.
2. **One palette:** neutral slate surfaces, indigo brand/action accent, navy dark background and preserved success/warning/error semantics replace conflicting default green workspace and indigo public accents. Existing user accent preference remains authoritative. No theme-store or OS-detection replacement.
3. **Appearance:** compact icon/label disclosure reuses the existing native Light/Dark/System radio group and store. It focuses the selected radio, supports arrow keys, Escape/Done focus return, outside pointer dismissal and natural Tab exit. It is non-modal, not a focus trap. Event listeners are cleaned up. Only disclosure-open state is new.
4. **Landing:** restrained hero without a decorative gradient, clearer explanatory copy and synthetic workspace hierarchy, readable preview status labels, less repetitive audience cards, consistent module/CTA spacing. The preview remains explicitly illustrative; no invented customers, testimonials or production claims.
5. **Request Access:** responsive progress layout, clearer form grouping and quote separation. At 320/390px the country selector takes its own row above calling code and a readable phone field; tablet/desktop retain inline phone controls. This CSS is scoped to `.public-site .public-request`. The shared PhoneInput implementation, international parsing, validation, payloads and business rules are unchanged.

## Final checks

All results below were completed against the final responsive revision. Earlier 20/20 public and 8/8 shared passes are historical evidence only, not substitutes for these final reruns.

| Check | Final result |
| --- | --- |
| Focused 320px phone regression | PASS 1/1, exit 0; included again in final public suite, not double-counted |
| Public landing/request browser suite | PASS 20/20, exit 0, 1.4m |
| Shared theme/startup browser selection | PASS 8/8, exit 0, 41.4s |
| Theme, landing, public-commercial components | PASS 24/24 in 3 files, exit 0, 20.43s |
| Frontend ESLint | PASS, exit 0; rerun because prior process exit could not be recovered after interruption |
| Frontend TypeScript | PASS, exit 0 |
| Production build / worker generation | PASS, exit 0; 103 precache entries, 1335.95 KiB, sw.js and Workbox emitted |
| Theme bootstrap / build-dependency security / PWA runtime | PASS 17/17, exit 0 (4 bootstrap, 11 security/compatibility, 2 PWA) |
| Generated brand metadata/assets and small-size rendering | PASS 2/2, exit 0 |
| Git whitespace and source/staged scope review | PASS, exit 0; exactly 21 intended files, no unstaged source difference or runtime artifacts |

Final distinct executed checks: 28 public/shared Playwright cases + 2 brand cases + 24 component cases + 17 Node tests = **71 passed, 0 failed, 0 skipped**. The focused phone rerun and earlier baseline/intermediate runs are not counted again. No assertion, retry or deadline was weakened.

Build measurements: landing JS 23.31 kB / 7.08 kB gzip; landing CSS 8.07 kB / 2.00 kB gzip; main entry JS 241.83 kB / 75.04 kB gzip; shared CSS 100.63 kB / 18.79 kB gzip. One non-fatal `INEFFECTIVE_DYNAMIC_IMPORT` warning concerns the unchanged API client's simultaneous static and dynamic imports; no chunking refactor was introduced. Playwright emitted the harmless NO_COLOR/FORCE_COLOR warning. Production PWA runtime registered, controlled reload, served its offline shell, emitted no page errors and kept API/socket paths outside caches.

The public suite covers 320/390/768/1440 × Light/Dark/System, effective foreground/background text contrast >=4.5:1, 44px header/appearance controls, keyboard disclosure/radio behavior, saved preferences, live System changes, reduced motion, skip link, mobile navigation, login entry, synthetic quote/review/receipt and honest loading/error/empty/retry. The 320px request test checks invalid-phone feedback, country-to-phone keyboard order, >=150px phone width, >=44px controls and no document overflow. Synthetic request assertions preserve normalized phone and quote fingerprint, omit client-authoritative subtotal, do not persist contact details and do not imply subscription activation.

## Commands and local visual evidence

Run from `frontend` unless noted:

```text
npx playwright test e2e/ux04a-public.spec.ts --grep "receipt 320 light" --workers=1 --output=test-results/ux04a-phone-final
npx playwright test e2e/landing-experience.spec.ts e2e/ux04a-public.spec.ts --workers=1 --output=test-results/ux04a-final-public
npx playwright test e2e/premium-accessibility.spec.ts e2e/crm-theme-regressions.spec.ts e2e/startup-experience.spec.ts --grep "overview scoped accessibility|reduced motion keeps inherited account colors|landing renders before|privacy remains available" --workers=1 --output=test-results/ux04a-final-shared
npx vitest run src/test/themeControl.test.tsx src/test/landingSections.test.tsx src/test/publicCommercial.test.tsx --maxWorkers=1
npm run lint
npm run typecheck
npm run build
node --test ../scripts/theme-bootstrap.test.mjs ../scripts/pwa-dependency.test.mjs ../scripts/pwa-build.test.mjs
git diff --check
```

Brand checks: `npx playwright test --config playwright.commercial.config.ts brand-assets.spec.ts --workers=1 --output=test-results/ux04a-brand`, with the existing `IDENTITY_QA_EXTERNAL_API=1` and `IDENTITY_QA_EXTERNAL_WEB=1` flags. Only file reads and local SVG rendering were selected; no API/web service, database, identity fixture or external endpoint was started or accessed by this selection. PNGs were regenerated using the existing `node scripts/generate-brand-assets.mjs` script.

Build API/socket values are explicit non-secret loopback `http://127.0.0.1:5009/api` and `http://127.0.0.1:5009`; no hosted endpoint is tested. Existing metadata origin is preserved.

- Before: ignored `frontend/test-results/ux04a-before/`, 320/768/1440 × three themes.
- Final: ignored `frontend/test-results/ux04a-final-public/`, `landing-{width}-{mode}.png`, `appearance-{width}-{mode}.png` and four `request-{width}-{mode}.png` captures within test-specific directories.
- Earlier phone-clipping observation: `frontend/test-results/ux04a-after/`. Corrected 320px evidence: `frontend/test-results/ux04a-phone-final/` and final public captures.
- Full-element screenshots can include the sticky header at a capture seam; this is not evidence of a fixed overlay in the live form. Keyboard, dimensions and viewport assertions verify the actual controls. Screenshots stay local/ignored and contain synthetic inputs only.

Visual review: all twelve final appearance captures at 320/390/768/1440px and Light/Dark/System were inspected, along with full-page landing compositions and final request forms. Popovers stay within the viewport, selected state and focus rings remain visible, and mobile navigation/CTAs remain reachable. The mobile preview no longer squeezes a sidebar beside its content. The corrected country selector has a full row, the 10-digit synthetic national number is readable at 320/390px, validation stays visible and tablet/desktop preserve inline controls. Original SVG exports were inspected at 16/24/32/64px on light/dark surfaces; social and maskable PNGs were also inspected. No remaining scoped visual defect was observed. This is screenshot/DOM-based review, not a claim of manual assistive-device certification.

## Exact intended inventory

Production/configuration (7):

- `frontend/src/components/brand/Brand.tsx`
- `frontend/src/components/layout/PublicLayout.tsx`
- `frontend/src/components/ui/ThemeControl.tsx`
- `frontend/src/index.css`
- `frontend/src/pages/Landing/HeroSection.tsx`
- `frontend/src/pages/Landing/Landing.css`
- `frontend/vite.config.ts` (manifest background color only)

Original brand assets (6):

- `frontend/public/favicon.svg`
- `frontend/public/brand/social-card.svg`
- `frontend/public/brand/icon-192.png`
- `frontend/public/brand/icon-512.png`
- `frontend/public/brand/icon-maskable-512.png`
- `frontend/public/brand/social-card.png`

Tests (6):

- `frontend/e2e/landing-experience.spec.ts`
- `frontend/e2e/ux04a-public.spec.ts`
- `frontend/e2e-commercial/brand-assets.spec.ts`
- `frontend/e2e-commercial/commercial.spec.ts` (appearance interaction only; assertions retained)
- `frontend/src/test/publicCommercial.test.tsx`
- `frontend/src/test/themeControl.test.tsx`

Documentation (2): this report and `docs/reviews/UX-04B_IDENTITY_EXPERIENCE_PROPOSAL.md` (proposal only, not implementation).

No backend, identity/phone/authentication, commercial domain, database, CI workflow, dependency, environment or provider configuration changes. Generated build output, screenshots, caches and runtime artifacts are excluded. The React review checklist informed hook cleanup, state reuse and keyboard/focus checks; the Sites workflow is local-only, with no registration or publication.

## Limitations and release separation

- Real-PostgreSQL commercial/identity workflows and full repository CI are **NOT RUN** in this local UI task. The existing commercial suite's native-select interaction is adapted to the new control without removing assertions; identical public interaction is exercised using synthetic local browser/component fixtures.
- Browser evidence is local Windows Chromium, not cross-browser, screen-reader-device or hosted acceptance.
- UX-04B email-first/identity work is a separately gated proposal; no authentication work is implemented here.
- LOCAL: scoped validation and source review passed; one local checkpoint only. CI and GITHUB PR: not published. HOSTED FRONTEND/BACKEND: unchanged. POSTGRESQL MIGRATION: none. RECOVERY: no hosted operation or new restore proof. CUSTOMER/PILOT: **NO-GO FOR REAL CUSTOMER DATA**, Render Free staging-only.
- After local acceptance, the smallest next action is owner review of the local diff and visuals, followed by separately authorized dependent publication from the UX-03 ancestry. No push, merge or deployment is implied.
