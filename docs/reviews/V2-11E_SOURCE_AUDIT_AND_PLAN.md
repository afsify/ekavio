# V2-11E source audit and proposed implementation plan

Status: **PROPOSED — awaiting approval; no implementation or release.**
Audit date: 2026-10-11. **NO-GO FOR REAL CUSTOMER DATA** remains unchanged.
Render Free remains staging-only. PostgreSQL remains the sole normal-runtime
authority; Atlas, recovery keys and provider settings are outside this work.

## Recovery and evidence boundary

- Branch: `main`; HEAD, origin/main and fresh remote main all equal
  `3bfc3baf9359c3270f447eb2789557b74f32c463`.
- Existing annotated `v2-11d-administration-experience` peels locally and remotely
  to that SHA; tag object `2b24a65088157bf007dd30056e9b61158bed93e1`.
- [Exact baseline CI](https://github.com/afsify/ekavio/actions/runs/38139853544)
  was rechecked: completed/success, main, exact SHA above, attempt 1.
- Before this audit document: no staged, unstaged or nonignored untracked changes;
  no local/remote V2-11E tag or existing V2-11E audit/partial source work found.
- `reference/` is still intentionally ignored. Existing ignored build outputs,
  private environment files and `frontend/test-results/` diagnostics, logs,
  sanitized screenshots and CI archives were preserved. Environment contents
  were not read. Prior D logs are historical evidence, not new E test passes.
- No AGENTS.md was found at the repository/parent roots or in the searched
  nonreference source tree. README, PROJECT_CONTEXT, product/experience roadmaps,
  ADRs 0023/0029 and V2-08D, V2-09A, V2-11A–D reviews/acceptance establish scope.
- Reference review was static and read-only: no install, execution, dependency,
  source copy, credential access or reference modification. No tests/browser
  review were performed in this audit-only phase.

## Source-backed comparison

Reference paths below start at `reference/biz_crm-main/`; EkaVio paths start at
the repository root. Reference capabilities are not authority to add features.

| Area | Bizforz source and observed pattern | EkaVio source and current capability | Proposed disposition |
| --- | --- | --- | --- |
| Field catalogue | `frontend/src/modules/field-configuration/FieldsAndLayoutsPage.tsx`; `frontend/src/modules/custom-fields/CustomFieldsPage.tsx`: fields/layout navigation, module/status/search controls, factual indicators, edit drawer, option editor and contextual help | `frontend/src/pages/Settings/CustomFieldsPage.tsx`: six-entity selector, definition cards, add/edit modal, stable option ordering/status, flags/defaults; no catalogue search/filter or inspect-only detail | Improve hierarchy, bounded received-catalogue filters, empty/error/read-only states and contextual editor. Existing API only |
| Field contracts | `connect-crm-backend/src/modules/custom-fields/customField.{routes,validation,service}.ts`: Mongo organization-scoped definitions, metadata flags/reminder configuration; service supports non-system identity changes and unused-field deletion | `backend/src/domains/dynamicFields/{policy,service}.ts`; `backend/src/routes/dynamicFieldRoutes.ts`: immutable keys/types, optimistic versions, typed PostgreSQL values, stable option identities and archive history | Reuse EkaVio contracts, not reference storage/deletion/re-keying. Explain required/default/archive consequences |
| Layout studio | `frontend/src/modules/module-form-layout/ModuleFormLayoutPage.tsx`; `frontend/src/components/common/modals/FormLayoutModal.tsx`: ordered field rows, dirty switch confirmation, counts, search, preview, drag/up/down controls | `CustomFieldsPage.tsx`; `components/forms/formSchema.ts`: ordered sections/placements, move buttons/section selector, visibility, empty-section archive, reset and preview, all on one long page | Desktop catalogue/layout workspace; stacked mobile views; explicit draft/save/discard. Keep keyboard move controls; no new drag dependency |
| Layout API | `connect-crm-backend/src/modules/module-form-layout/moduleFormLayout.{routes,validation,service}.ts`: module/form-type/campaign variants and per-layout required flags | `backend/src/domains/dynamicFields/service.ts`: one organization/entity layout shared by create/edit/view, version check, protected required fields, server-computed reset | No multiple layouts, campaign form or independently required placements. Freeze opened draft version rather than use a refreshed version |
| Actual forms | Routed `frontend/src/modules/leads/{CreateLeadModal,EditLeadModal}.tsx`, `modules/custom-fields/CustomFieldInput.tsx`, `hooks/useFormLayout.ts`: resolved core/custom controls, create/edit layout selection, drawer actions | `frontend/src/components/forms/{DynamicForm,CustomerFormFields,EntityFields}.tsx`; `hooks/useDynamicForm.ts`; Customer/Service/Appointment/Inventory/Staff/CRM consumers: shared renderer, canonical built-ins, exact values, scoped queries, historical detail | Improve shared control clarity/validation and actual integrations, not a separate preview/form engine. The reference common `components/common/leads/LeadForm.tsx` is not the routed creation flow |
| Preview | `ModuleFormLayoutPage.tsx` FormPreview draws mock control shapes | `CustomFieldsPage.tsx` uses real DynamicForm and unsaved sections, with disabled generic built-ins and hook-owned preview values | Reuse real renderer; isolate disposable preview values, label unsaved state, reset with context and offer phone/desktop presentation without record writes |
| Lead/Customer detail | `frontend/src/modules/leads/LeadDetailsPage.tsx`, `hooks/useLeadFieldVisibility.ts`: grouped facts, additional information, tabs, timeline and next follow-up/actions; visibility follows resolved layout | `frontend/src/pages/CRM/CrmPage.tsx`: structured facts, canonical custom values, bounded activity/follow-ups, guarded conversion; `pages/Customers/CustomersPage.tsx`: structured drawer and `CustomerCrmContext` links | Polish consistency only where verified gaps exist. Retain explicit conversion and one canonical Customer store; do not import Contacts/Deals/projects/messaging |
| Tables/filtering | `frontend/src/modules/leads/LeadsPage.tsx`, `components/common/ui/Table.tsx`: server sort callbacks, column/density configuration, table/card/kanban presentation and broad filters | `frontend/src/components/ui/AdvancedTable.tsx`, `WorkspacePrimitives.tsx`; Customer/CRM pages: explicit server/local distinction, server paging, supported typed filters and mobile cards | Reuse existing table primitives. Field catalogue filtering is local over at most 50 received definitions, not record search; do not fabricate global sorting/filtering |
| Responsive/accessibility | Reference layout page has responsive rows, mobile preview and named controls; older FormLayoutModal includes a click-only div switch and unnamed icon move buttons | `frontend/src/components/ui/{Input,AdvancedModal,OperationForm}.tsx`, `ThemeProvider.tsx`, `index.css`: semantic tokens, labels/errors, focus trap/return, protected reviewed dialogs, Light/Dark/System, reduced motion/mobile shell | Adopt information grouping, not accessibility defects or branding. Static inspection cannot establish rendered accessibility/fit; automatic loaded QA is required later |

Reference route mounting in `connect-crm-backend/src/app.ts` includes tenant/auth
middleware before custom-field/layout routers. This limited review does **not**
certify reference RBAC, security or production quality. Metadata such as `unique`
is not, by itself, proof of race-safe uniqueness enforcement.

## Verified API reuse and concrete gaps

Existing `/api/forms/:entity` routes provide schema GET, definition POST/PUT,
layout PUT/reset POST and authorized record-value GET. Appointment metadata PATCH
retains its canonical expected version. Other values remain inside canonical
domain commands, not independent arbitrary writes.

The engine already supports Customer, Service, Appointment, Inventory item,
organization Membership and Lead, with text, textarea, number, currency, date,
datetime, email, phone, checkbox, select, multiselect, radio and URL controls.
Lead support is the accepted CRM extension, not a new entity proposal.

Source-confirmed UX weaknesses in `CustomFieldsPage.tsx`:

- Full catalogue and full layout are always displayed; no type/status/flag search
  or deliberate read-only inspection view; raw entity/type names need clear labels.
- Field close/entity switching drops drafts without a dirty warning. Layout save
  is available without a change; reset uses a browser confirm rather than the
  shared consequence/review experience.
- Field definition version is copied when editing, but layout save reads live
  `schema.version`; a refreshed schema can relabel an older layout draft. Freeze
  the original layout/version together and test a genuine concurrent stale save.
- Pending controls/close behavior and conflict recovery need consistent guarding;
  broad schema/value invalidation should be reviewed for scoped refresh cost.
- Preview already uses unsaved layout sections, but not unsaved definition edits;
  its sample values are mixed into the hook draft. Separate preview-only state.
- DynamicForm supports labels/help/errors and historical values. Further tests
  should establish radio/group naming, native date control readability, long
  options, hidden/archived historical display and submitted-validation timing;
  static inspection is not a passing browser result.
- Services still uses a plain modal/direct save while other accepted operational
  editors use protected draft/review flows. Consider a narrow shared-pattern
  alignment, preserving service availability/provider and uncertain-write rules.

## Proposed interruption-safe implementation batches

Each batch should end with focused passing tests, an explicit changed-file list
and a short progress record of completed/pending gates. No automatic new milestone.

1. **Catalogue and editor:** reuse PageHeader, StatusBadge, SearchField,
   Empty/Error/Skeleton states, AdvancedTable/cards and AdvancedModal/OperationForm.
   Add labelled bounded catalogue filters, inspect-only mode and compact contextual
   definition/options/default editor. Preserve immutable identities and limits.
   Exit: component tests plus real config/read-only browser journey pass.
2. **Layout draft and preview:** scoped immutable base snapshot/version; dirty
   save/discard/switch guards; keyboard ordering and section placement; required
   protections; archive/reset consequences; desktop/mobile real-renderer preview
   with isolated safe samples. No record mutation. Exit: component and real
   stale-save/reset/archive/layout/preview-no-write tests pass.
3. **Six-entity forms and coherence:** verify actual create/edit/detail integrations
   and improve only demonstrated inconsistencies; long labels/options, historical
   values and validation; shared Service draft treatment if approved. Review
   existing public/account/shell and A–D domain patterns without wholesale redesign.
   Exit: affected real PostgreSQL workflows and authority/context regressions pass.
4. **Acceptance and documentation:** loaded Linux Chromium responsive review,
   retained regressions, quality/security/Docker/performance gates and accurate
   E acceptance/roadmap record. Advanced Forms proposal stays separate. Release
   actions require the subsequently approved implementation/release scope.

Likely source files: `frontend/src/pages/Settings/CustomFieldsPage.tsx`, new small
studio components under `frontend/src/components/forms/`, existing `DynamicForm.tsx`,
`formSchema.ts`, `hooks/useDynamicForm.ts` and scoped `frontend/src/index.css`.
Only evidence-driven edits to six consumer pages/shared helpers; `App.tsx` should
remain unchanged unless existing navigation requires a justified adjustment.
Tests: `frontend/src/test/dynamicFields.test.tsx`, `frontend/e2e-fields/forms.spec.ts`,
new sanitized responsive studio fixtures/config, and affected retained suites.
Backend implementation/migrations are **not planned**; integration assertions may
be extended in `backend/tests/dynamicFields.integration.ts` and CRM/authority tests.
Later documentation: E acceptance, experience/product roadmaps, README and
PROJECT_CONTEXT only as needed; separate advanced-forms proposal.

## Security, performance and approval boundaries

Keep `fields.read/manage` separate from entity read/manage and paid entitlements;
configuration permission never grants record access. Retain organization/branch/
user/grants/entitlements/operator-scoped cancellation and draft reset from
`useOperationalScope` and the keyed workspace. Hidden fields are not field-level
security. Membership metadata must not alter global identity or expose HR facts.

Retain atomic canonical/custom writes, version conflicts, existing idempotency
contracts, immutable archives/options, no backfill and new-only defaults. Keep
decimal/minor-unit strings, E.164 phones, calendar dates and explicit UTC custom
datetimes distinct from branch-local Appointment/Follow-up scheduling. No HTML,
SQL, expression execution, sensitive preview samples or credential logging/storage.

Retain bounded schema reads (definitions/options and layout/sections, no per-field
requests), 50 total/40 active definitions, 100 options, 20 sections and 40 patched
values. Lazy-load studio within existing route; no new paid/UI/drag/chart framework.
Measure bundle/PWA change against D rather than claiming static audit performance.

Conditional fields, formulas/dependencies, field-level permissions/masking,
uniqueness, files/relationships, new entity types, multiple layouts/templates,
broader record filtering/report builders and automated reminders require separate
backend/security/database approval. A proposal must identify authorization,
migration/history, privacy, performance/cost and tests for each; no enabled or
misleading placeholder controls in E.

## Estimated acceptance scope (not results)

- Component coverage: catalogue/editor/options, typed preview, scoped draft and
  frozen versions, dirty guards, pending/failed writes and read-only states.
- Disposable PostgreSQL: six actual entity integrations; thirteen types, required/
  defaults/options/archive/history; stale/concurrent/rollback/idempotency and
  foreign tenant/branch, permission, membership/entitlement negatives. Reuse
  existing fields/CRM/domain/authority suites; add cases for actual source changes.
- Eight widths: 320/360/390/430/768/1024/1440/1920 × Light/Dark/System = **24 viewport/
  theme combinations**, multiplied by loaded studio/form/detail states. Include
  long labels/options, validation/review/denied/loading/empty/error, keyboard/focus,
  OS theme flip, reduced motion, nested control clipping and footer hit-testing.
  Inspect real screenshots; sanitized presentation evidence is not authority proof.
- Retain foundation, daily operations, relationships, administration, identity,
  analytics, commercial, Purchasing and HR regressions with original deadlines,
  assertions and zero retries. Run private fixture suites serially with isolated
  disposable databases; never hosted/customer mutations.
- Frontend/backend lint/typecheck/tests/build; affected/full integration acceptance
  as warranted; four dependency audits; source/backup/recovery boundaries; normal
  Compose config/build/three healthy services and live/ready/root/login checks.
- Baseline D recorded 121 frontend tests, 196 backend tests, 328 database tests,
  23 operational contracts and 495 browser checks. These are sizing references,
  **not E results or a promise that new totals remain identical**.
- Final diff/artifact/security review and exact-final-commit CI/tag verification
  belong to a later approved release, not this source-audit request.

## Approval requested

Approve batches 1–4 as existing-capability UX work, including the narrow Service
editor alignment, or narrow that scope. No product implementation, commit,
checkpoint/completion tag, push or publication has been performed here.
