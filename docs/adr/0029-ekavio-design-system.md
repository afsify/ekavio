# ADR 0029: original EkaVio experience system and scoped application shell

Date: 2026-10-09. Status: accepted for V2-11A local engineering implementation.

## Context

Accepted PostgreSQL domains already provide secure operations. The UI needs
connected navigation, mobile reachability and honest paginated data. Static
reference review found useful grouping/detail/card patterns but incompatible
auth/payment stores, effects, dependencies and local-sort ambiguities.

## Decision

Use one semantic CSS system and the existing ThemeProvider/store: first-use
Light, saved Light/Dark/System, live OS changes for System. Tokens cover
background/surface/elevated/subtle, primary/hover/secondary, primary/secondary/
muted text, border/focus, success/warning/danger/info, disabled and overlay;
type .75/.875/1/1.125/1.375/1.75rem; spacing 4/8/12/16/20/24/32/48px;
radii 6/10/14/18px; restrained shadows; 16/20px icons; 44px controls;
1440px content maximum; 140/200ms motion with reduced-motion override.

Breakpoints: below 768px mobile cards/bottom navigation/full-screen sheets;
768–1023px drawer navigation and adaptive toolbars; at 1024px grouped desktop
sidebar with optional 80px compact rail. Safe areas and dynamic viewport units
keep sticky form actions and bottom navigation reachable. Do not hide global
overflow to disguise layout defects.

Refine the existing Button/Input/Card/AdvancedModal/AdvancedTable/SearchSelect.
Small WorkspacePrimitives provide page/section/metric/action/status/search/
filter/detail/skeleton/error/pagination/confirmation building blocks. Existing
tabs, native fieldsets, icon/quiet/action controls and modal presentation classes
remain the common mechanism, not another UI kit. Domains retain layout choice.

AdvancedTable has a discriminated `server` mode: received rows are never filtered
or sorted locally, and search/sort controls exist only with corresponding
callbacks. Local mode explicitly labels its received-row scope and searches
declared columns only. Customers use canonical fixed alphabetical server order,
bounded page/search/page-size and the one supported typed custom filter;
unsupported server sorting is not added or advertised.

Navigation groups are presentation over `visibleDestinations`; route guards,
live permissions, commercial entitlements and operator checks remain unchanged.
Branch/workspace refresh unmounts old content, cancels and clears queries before
and after server selection, then remounts fresh scope. Pending mutations disable
switching. Existing session establishment owns socket reconnection; role labels
do not grant data. Keep credentials out of browser persistence.

Dashboard uses only existing authorized projections with scope descriptions,
quick links, honest errors, positive existing attention indicators and versioned
hide/order persistence. Customers is the canonical exemplar: desktop table,
mobile cards, structured side/full-screen detail, canonical dynamic forms,
explicit unsaved-change confirmation and sticky guarded submit.

## Consequences

No domain rewrite, migration, auth store, new paid service or large dependency.
Lazy modules remain lazy. Compatibility palette aliases allow phased B/C/D/E
domain work. Full cache clears cost refetches but prohibit stale old-workspace
presentation. Safe page-size/display preferences persist; PII searches do not.
Mock visual evidence and real local PostgreSQL acceptance are explicitly
distinct from hosted/provider/operations evidence. NO-GO remains unchanged.
