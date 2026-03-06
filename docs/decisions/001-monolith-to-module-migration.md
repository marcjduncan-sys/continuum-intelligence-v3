# ADR 001: Monolith-to-Module Migration

**Status:** Complete
**Date:** 2025-Q4
**Deciders:** Marc Duncan

---

## Context

The application originated as a single `index.html` file containing all logic in inline `<script>` blocks. As the codebase grew past ~15,000 lines, this created several problems:

- No module boundaries: any function could call any other function
- No test coverage: Jest/Vitest cannot import inline scripts
- No linting: ESLint cannot analyse inline script blocks
- CI was a no-op: the only "test" was whether the HTML was well-formed

The codebase needed to support incremental feature development across multiple sessions without regressions accumulating silently.

## Decision

Extract all application logic from `index.html` inline scripts into ES modules under `src/`. Keep a small set of classic `<script>` tags for code that has runtime dependencies on global state initialised before the module bundle loads.

**The boundary rule:**
- `src/` contains ES modules. Tested by Vitest. Linted by ESLint.
- `js/` contains classic scripts (`personalisation.js`, DNE engines). These run before `src/main.js` and write globals (`window.pnBuildSystemPrompt`, `window.TC_DATA`, `window.renderPersonalisationPage`). Not tested. Not linted.

**The load order in `index.html` (bottom of `<body>`):**
1. `scripts/price-narrative-engine.js`
2. `scripts/institutional-commentary-engine.js`
3. `scripts/narrative-framework-integration.js`
4. `js/personalisation.js`
5. `<script type="module" src="./src/main.js">` (the Vite entry point)

`src/main.js` must run last. It depends on globals set by the classic scripts.

## Consequences

- Two test runners are required: Vitest for `src/`, Jest for `tests/` (integration). CI runs Vitest only.
- `js/personalisation.js` remains outside the module system. It is ~1,300 lines, untested, and cannot be safely refactored without a dedicated migration session.
- The `STOCK_DATA`, `REFERENCE_DATA`, `FRESHNESS_DATA`, and `SNAPSHOT_DATA` objects are exported by reference from `src/lib/state.js` and aliased to `window.*` in `src/main.js`. Both the module system and classic scripts share the same object references. Replacing a reference will cause silent divergence.
- `FEATURED_ORDER` and `SNAPSHOT_ORDER` are Proxy objects backed by live `Object.keys(STOCK_DATA)`. Modules that cache a destructured snapshot will silently stale.
