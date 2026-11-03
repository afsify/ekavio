# Build-only security fork: deepmerge 4.3.1

This is an application-maintained patch, **not an upstream patched release**.
Derived from the MIT-licensed `deepmerge@4.3.1` published `dist/cjs.js`.
Original registry integrity is retained in the preceding Git lockfile revision.
Upstream tarball: `https://registry.npmjs.org/deepmerge/-/deepmerge-4.3.1.tgz`.
Upstream integrity: `sha512-3sUqbMEc77XqpdNO7FRyRog+eW3ph+GYCbj+rK+uYyRMuwsVy0rMiVtPn+QJlKFvWP/1PYpapqYn0Me2knFn+A==`.
The Git-reviewed source and package version pin this local replacement; it has no
install hooks, network operations or additional dependencies.

Reason: [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4),
with [reproduction and proposed mitigation](https://github.com/TehShrike/deepmerge/issues/273).
Both the source-copy and target-copy loops reject `__proto__`, `constructor` and
`prototype` before reading values. Own data-property definitions prevent invoking
inherited setters. Unsafe target proxy inspection fails closed. All normal merge
semantics are retained. Custom callbacks remain trusted executable configuration.

The root devDependency plus npm `$deepmerge` override anchors the local file link
portably. A graph regression restricts its sole transitive consumer to the dev-only
`@rollup/plugin-node-resolve`; new consumers require review. Nested relative file
overrides produced invalid links and were rejected. Version 16.0.3 clones static
DEFAULTS before freezing them; Workbox invokes it at build time. Do not expand to
runtime consumers or change PWA behavior. This fork intentionally drops prototype
keys even when enumerable own properties; no resolver default uses those keys.

`scripts/pwa-dependency.test.mjs` tests the actual resolver dependency, including
poisoned target/source objects and compatibility. It runs with the normal frontend
test command. npm audit remains unchanged and enabled; a clean audit does not
independently certify this local fork. Its safety relies on review and regressions.

Maintenance: replace this override with a verified upstream fix when available,
rerunning these regressions, the production build, manifest and service-worker
checks. Review this patch whenever Workbox or the resolver changes. Do not rename
or bump an unpatched copy merely to evade audit detection.
