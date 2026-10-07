# V2-08D: Dynamic fields and form layouts

Date: 2026-10-07. Product foundation only; **NO-GO FOR REAL CUSTOMER DATA** unchanged.

## Baseline and release boundary

Started on clean `main`, with HEAD, origin/main and freshly checked remote main at
`2e393bbd5bc5bf1289a2b32e0e29b8893b314029`. V2-08C implementation ancestry and its
completion tag were checked. Existing personal Git identity was retained. Annotated
`pre-v2-08d-dynamic-fields-form-layouts` was created/pushed at that exact baseline.
No reset, restore, stash, clean, feature branch or second checkpoint was used.

## Delivered model and behavior

- Additive migration 015; 001–014 checksums preserved. No canonical data backfill.
- Five entities: Customer, Service, Appointment, Inventory item, organization-local
  Membership. No dynamic financial journals, Queue tokens, security events or global users.
- Thirteen types: text, textarea, number, currency, date, datetime, email, phone,
  checkbox, select, multiselect, radio, url. See [ADR 0023](../adr/0023-dynamic-fields-and-form-layouts.md)
  for exact representations, safety limits, required/default/history and tradeoffs.
- Definition identity/version, stable relational option sets, typed values with
  organization/canonical/type-qualified FKs, multiselect child rows and constrained
  entity registry are separate from ordered layouts/sections/placements.
- Keys/types are immutable; labels/help can change. Options cannot disappear or
  change identity. Archives retain values and readable option labels. React renders
  all organization-supplied content as text; no HTML/code/unsafe URL execution.
- Active required rules validate new records and normal metadata edits, not reads.
  Safe defaults apply only to new records, never historical rows or accepted retries.
- Atomic canonical/custom writes, live permission/branch rereads, existing canonical
  versions, config/layout stale-write conflicts and request fingerprints prevent
  partial writes and retry overwrite. Pre-015 retries remain unchanged without defaults.

## Product surface

`/custom-fields` (Data & Forms) provides five entity tabs, type/label/help/required/
searchable/filterable/reportable/default/status editors, stable option lifecycle,
keyboard-accessible ordering, section titles/order/archive, field placement/visibility,
versioned save, default reset and desktop/mobile previews. The shared renderer is
used in actual forms, not only preview. There is no new dependency or paid form service.

Customer create/edit/detail, Service metadata/detail, Appointment create/detail and
versioned custom-metadata edit, Inventory catalogue create/edit/history detail, and
Staff membership create-compatible administration/edit/detail use the schema. Stock
commands/balances, appointment status/timezone rules and global identity are untouched.
Service availability remains canonical. Historical staff invitations do not receive
invented required metadata; ordinary administrative edits validate current rules.

Customer search augments canonical search with active flagged bounded text/textarea/
email/phone. One user-facing typed filter supports equality and numeric/date gte/lte.
Single choice and checkbox filters use stable option IDs/booleans. Query parameters
are bounded and SQL is parameterized with closed column/operator mappings. Other
entity search/filter UIs, multiselect filtering, unique-value constraints, reports,
bulk import and active-reportable custom CSV export are explicitly deferred to V2-08E.
The reportable flag is metadata only. No frontend-only uniqueness promise.

## Authorization, audit and cost

Configuration requires `fields.read/manage`; owner/admin receive built-in grants,
custom roles retain replacement/subset rules. Ordinary authorized entity users can
render/edit business fields without configuration authority. Configuration-only users
cannot fetch entity values. Customer/Service remain CORE; Appointment/Inventory values
retain existing entitlement and branch/tenant guards. Hidden fields are presentation,
not a field-level security boundary. Foreign organization/field/option/entity references
are denied, including the relational constraints independent of UI checks.

Redacted append-only field administration events cover configuration, grouped options,
layout/sections, reset and value changes by identifiers/categories only, integrated
into organization audit. No raw custom values or sensitive bodies in generic audit.

Schema has two data queries without a layout, three with one (plus one read-only
isolation command and transaction control). Definition/options use one bounded
projection; values are one batched projection; selected options batch per field.
React Query caches schema and scoped values, invalidating after admin/entity writes.
Customer lists do not fetch per-row custom values. Selected-filter metadata loads one
definition. Scope and partial number/date/option indexes are additive; small disposable
fixtures do not establish production-scale latency. Per-organization write serialization
is intentional. No arbitrary dynamic columns/tables or per-field index provisioning.

Limits are enforced server-side: 50 total/40 active fields per entity; 100 options;
20 sections; 100 placements per section; 40 patched keys; 50 selected options; key
64, label 100, help 500, text 1,000, textarea 10,000; exact number 18+6 digits and
currency 18 minor-unit digits. Existing bounded Customer page/search contracts remain.

## Automated acceptance evidence

Final local acceptance on 2026-10-07:

| Gate | Result |
| --- | --- |
| Backend/frontend `npm ci` | Passed; no dependency additions or upgrades |
| Backend lint/typecheck/unit/build | Passed; 172/172 unit/contract tests |
| Dynamic-field PostgreSQL suite | 19/19 tests (18 subtests plus parent) |
| Database regression chain | All 27 integration files passed against latest 015 |
| Explicit Mongo source contract | 4/4 passed; no normal runtime Mongo authority |
| Backup/encryption/tooling/watchdog regressions | 15/15 passed |
| Frontend lint/typecheck/component/PWA build | Passed; 45/45 component tests |
| Chromium dynamic forms | 14/14 passed; actual five-entity writes/readback, negative RBAC/tenant/entitlement, stale Appointment version |
| Chromium identity / administration / foundation | 11/11, 18/18, 19/19 passed respectively |
| Responsive acceptance | 390/768/1440 × Light/Dark/System: all 13 controls, long labels/help/options; no document overflow or page errors |
| Dependency audits | Backend and frontend full and production: zero vulnerabilities |
| Docker config/build/up | Passed; normal frontend/backend/PostgreSQL all healthy; offline Mongo and disposable QA stopped |
| Local HTTP | 200 for `/health/live`, `/health/ready`, `/`, `/login`, `/admin`, `/custom-fields` |
| Normal runtime log review | No error/fatal/exception/unhandled/failure signatures observed after startup/probes |

The initial added legacy-retry regression required a valid branch timezone and
service availability fixture; that setup was corrected, not production assertions.
The strengthened long-label responsive test exposed real admin button overflow;
scoped wrapping and correctly sized native choice controls fixed it. Final runs above
passed after those corrections. Native datetime minute precision is normalized to
explicit UTC seconds and covered by a component regression. Inventory metadata edits
preserve the exact quantity and do not create stock movements; Service and Membership
edited values persist; stale Appointment custom metadata writes return 409 unchanged.
Tenant/branch/entity-scoped local drafts prevent carrying edits into another context;
membership socket invalidation occurs only after the outer atomic commit succeeds.

Build retains non-blocking existing mixed static/dynamic import warnings and the
approximately 526 KB main chunk warning. The lazy Data & Forms page is approximately
11.6 KB minified / 3.5 KB gzip; shared form code approximately 7.6 KB / 2.9 KB gzip.
These are not a production latency/load benchmark. No large form-builder framework.

No hosted authenticated smoke or real-customer claim is implied. The managed browser
bridge could not initialize because sandbox metadata lacked `sandboxPolicy`; the
requested local Playwright Chromium fallback used only disposable PostgreSQL, generated
credentials and test mail capture. No manual browser validation group was required.
Sensitive authenticated traces/screenshots are disabled and excluded from CI upload.
Only a safe local preview screenshot may be retained under ignored test-results.

Hosted staging status initially showed 001–014 applied and only 015 pending.
After all local acceptance passed, the standard runner applied 015 and the separate
status check confirmed all 15 applied with matching checksums. Existing ignored
staging configuration was read only into process memory; no database URI, TLS policy,
credentials, encryption keys or provider settings were changed or printed.
Hosted `https://api.ekavio.afsify.com/health/live` and `/health/ready` both returned
HTTP 200 after migration. This is schema/public-health evidence only, not authenticated
hosted dynamic-field acceptance or a pilot decision.

Final security/artifact review found no secret/environment file, dump, backup, key,
node_modules, build output, screenshot or browser evidence selected for commit.
Credential-pattern matches in CI are unchanged disposable CI-only placeholders.
Old SQL/checksums, Mongo retention and pinned runtime/backup images are untouched.

## Deployment and operations

Apply pending 015 through the standard migration runner before deploying the new
backend. Startup never automatically applies migrations. Migration status/health
evidence is not authenticated hosted acceptance. Normal Docker remains frontend,
backend, PostgreSQL; Mongo is a temporary offline compatibility-test profile only.
External backup client/image, TLS, provider credentials and local PG server version
are unchanged. Migration 015 extends the next retained-schema recovery proof requirement;
this milestone does not fabricate a new hosted backup/restore proof.

**NO-GO FOR REAL CUSTOMER DATA** remains. Render Free is intentionally staging-only;
Atlas is retained and must not be deleted. Existing recovery/monitoring/ownership/
always-on and final hosted acceptance requirements remain separately tracked. Do not
start V2-08E automatically. Completion tag is permitted only after exact final-commit CI.

## Change manifest

The release changes 60 repository files. Older migration tests change only
their latest-schema expectations; historical upgrade/checksum assertions remain.

- `.github/workflows/ci.yml`
- `PROJECT_CONTEXT.md`
- `README.md`
- `backend/package.json`
- `backend/postgres/migrations/015_dynamic_fields.sql`
- `backend/src/controllers/appointmentController.ts`
- `backend/src/controllers/customerController.ts`
- `backend/src/controllers/inventoryController.ts`
- `backend/src/controllers/serviceController.ts`
- `backend/src/domains/customers/repository.ts`
- `backend/src/domains/dynamicFields/customerFilter.ts`
- `backend/src/domains/dynamicFields/policy.ts`
- `backend/src/domains/dynamicFields/service.ts`
- `backend/src/postgres/database.ts`
- `backend/src/routes/dynamicFieldRoutes.ts`
- `backend/src/routes/index.ts`
- `backend/src/routes/organizationRoutes.ts`
- `backend/src/schemas/inventorySchemas.ts`
- `backend/src/schemas/operationalSchemas.ts`
- `backend/src/services/authorizationPolicy.ts`
- `backend/src/services/dynamicFieldsService.ts`
- `backend/src/services/inventoryService.ts`
- `backend/src/services/operationalRuntimeService.ts`
- `backend/src/services/organizationAdministrationService.ts`
- `backend/tests/attendanceMigration.integration.ts`
- `backend/tests/commercialRenewal.integration.ts`
- `backend/tests/corporateMigration.integration.ts`
- `backend/tests/customerDuesMigration.integration.ts`
- `backend/tests/dynamicFields.integration.ts`
- `backend/tests/dynamicFields.test.ts`
- `backend/tests/identityAccount.integration.ts`
- `backend/tests/identityBrowserServer.ts`
- `backend/tests/inventoryMigration.integration.ts`
- `backend/tests/manualCommercial.integration.ts`
- `backend/tests/organizationAdministration.integration.ts`
- `backend/tests/postgres.integration.ts`
- `backend/tests/publicCommercial.integration.ts`
- `docs/adr/0023-dynamic-fields-and-form-layouts.md`
- `docs/reviews/V2-08D_DYNAMIC_FIELDS_FORM_LAYOUTS.md`
- `docs/roadmap/V2_PRODUCT_COMPLETION_ROADMAP.md`
- `frontend/e2e-fields/forms.spec.ts`
- `frontend/e2e/fixtures.ts`
- `frontend/package.json`
- `frontend/playwright.fields.config.ts`
- `frontend/src/App.tsx`
- `frontend/src/components/forms/DynamicForm.tsx`
- `frontend/src/components/forms/EntityFields.tsx`
- `frontend/src/components/forms/formSchema.ts`
- `frontend/src/components/layout/navigation.ts`
- `frontend/src/components/ui/PhoneInput.tsx`
- `frontend/src/hooks/useDynamicForm.ts`
- `frontend/src/hooks/useInventory.ts`
- `frontend/src/index.css`
- `frontend/src/pages/Appointments/AppointmentsPage.tsx`
- `frontend/src/pages/Customers/CustomersPage.tsx`
- `frontend/src/pages/Inventory/InventoryPage.tsx`
- `frontend/src/pages/Services/ServicesPage.tsx`
- `frontend/src/pages/Settings/CustomFieldsPage.tsx`
- `frontend/src/pages/Staff/StaffAccessCards.tsx`
- `frontend/src/test/dynamicFields.test.tsx`
