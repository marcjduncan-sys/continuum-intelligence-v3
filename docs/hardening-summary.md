# Hardening Summary -- redesign/phase5-hardening

**Date:** 2026-04-05
**Branch:** redesign/phase5-hardening
**Based on:** redesign/phase5-cleanup (at HEAD when branch was cut)

## Test Count
- Baseline (phase5-cleanup HEAD): 182 Vitest (34 test files broken, 5 passing)
- Final: 1062 Vitest (42 test files, all passing)
- Delta: +880 tests recovered/restored, +33 new tests

Note: The 882-test difference between "baseline as found" and final is explained by:
1. 847 tests restored by fixing Vitest 4 globals compatibility (34 test files)
2. 33 new tests added (router: 10, hero: 12, risk-register: 11)

## Root Cause of Pre-existing Vitest Failures
34 test files explicitly imported `{ describe, it, test, expect, vi }` from `'vitest'`,
which conflicts with `globals: true` in Vitest 4. In Vitest 4, explicit imports of globals
cause "No test suite found" errors. Fix: remove the redundant import lines from all 34 files.
The symbols remain available as configured globals.

## New Tests Added
- `src/lib/router.test.js` (10 tests): route-type body attribute -- verifies `report-*` and
  `deep-report-*` hashes set `routeType="report"`, all others set `routeType="page"`.
- `src/features/report/hero.test.js` (12 tests): market cap fmtB formatting, 52W range
  en-dash separator (U+2013), and confidence percentage computation from hypothesis scores.
- `src/features/report/risk-register.test.js` (11 tests): tripwires.items, tripwires.cards,
  gaps.items, gaps.coverageRows rendering; severity assignment; cap at 6 items.

## Pre-commit Hook Assessment
**What exists:** Only `.git/hooks/*.sample` files (not active). No husky, no lint-staged,
no `prepare` script in package.json.

**What is missing for automated enforcement:**
- Encoding contamination check (`bash scripts/check-encoding.sh`) -- manual only
- CSS token lint (`bash scripts/check-css-tokens.sh`) -- manual only
- Config drift check (`bash scripts/check-config-drift.sh`) -- manual only
- Unit tests (`npm run test:unit`) -- manual only, runs in CI via GitHub Actions on main
- Build check (`npm run build`) -- manual only

**What was changed:** Nothing. Per CLAUDE.md, a linter/hook tool must not be added without
explicit instruction. The gates are fully specified in the CLAUDE.md Pre-Commit Checklist
and must be run manually before pushing.

## Build Assessment
- Baseline: CLEAN (3 pre-existing non-blocking warnings, unchanged)
- Final: CLEAN (identical warnings, no new issues)
- Bundle delta: index.js 499.30 kB -> 499.27 kB (slight reduction from routing .toFixed()
  calls through format.js)
- CSS: 309.37 kB (unchanged)
- Source maps: not generated (no `sourcemap: true` in vite.config.js)

## Magneto Findings

### !important inventory (all CSS files)
| File | Line | Selector | Property |
|------|------|----------|----------|
| base.css | 69-71 | `@media prefers-reduced-motion` | animation-duration, iteration, transition (3 rules -- accessibility, legitimate use) |
| batch.css | 166-167 | `.status-completed/failed .batch-card-mini-fill` | width (state override -- minor cascade risk) |
| chat.css | 25-26 | `.ap-panel--collapsed` | width/min-width (panel collapse -- intentional) |
| chat.css | 35 | `.ap-panel--collapsed .ap-content` | display (collapse -- intentional) |
| chat.css | 40 | `.ap-panel--collapsed .ap-resize-handle` | display (collapse -- intentional) |
| chat.css | 768 | `.ap-fab` in print query | display (print -- intentional) |
| pm-chat.css | 582 | `.pm-fab` in print query | display (print -- intentional) |
| report.css | 1359-1360 | responsive breakpoint | width/height (responsive -- intentional) |
| report.css | 299 | `.rh-live-indicative` | display (hide indicative text -- intentional) |
| shell.css | 400 | `body:not([data-route-type="report"]) .pm-fab` | display (route gating -- intentional) |
| shell.css | 406 | `body:not([data-route-type="report"]).analyst-panel-open` | padding-right (new rule -- intentional, overrides report-page panel offset) |
| snapshot.css | 24, 31 | responsive grid breakpoints | grid-template-columns (responsive -- intentional) |

**Cascade conflict risk assessment:** shell.css line 406 overrides the body padding-right that
the analyst panel applies on non-report routes. This is the intended fix from the remediation
wave. The specificity is high (`body:not([...]).class`) but this is deliberate -- it must
win over the generic `.analyst-panel-open { padding-right }` rule.

### Console.logs removed
None removed. All 121 console.log/warn/error statements in production JS files are
intentional diagnostic logs with module-name prefixes (e.g., `[Route]`, `[StockDataLoader]`,
`[Auth]`). These are production monitoring infrastructure, not development debug statements.
No debugger statements found.

### .toFixed() violations fixed
7 files fixed (see commit `9a870f7f`). Zero violations remain outside `src/lib/format.js`.
Files fixed: hero.js, hypothesis.js, chat-panel.js, ws-computed.js, ws-quality.js,
ws-schema-validator.js, home.js.

### Specificity issues
The two new rules in shell.css use `body:not([data-route-type="report"])` selectors:
- Line 400: `body:not([data-route-type="report"]) .pm-fab { display: none !important; }`
- Line 406: `body:not([data-route-type="report"]).analyst-panel-open { padding-right: 0 !important; }`

These are high-specificity by design. The `!important` on padding-right at line 406 is
necessary to override the inline-or-JS-applied padding from the analyst panel system.
No unexpected cascade conflicts found in base.css or home.css -- they do not set
`padding-right` on `body` or `body.analyst-panel-open`.

## !important Inventory (all CSS files)
12 total `!important` occurrences across 7 files (see table above).

## Pre-existing Jest Failure (NOT FIXED)
`tests/html-structure.test.js` fails on `renderCoverageRow() is exported from its module`
because `renderCoverageRow` was removed from home.js during the phase 5 redesign refactor.
The test is stale. This was pre-existing before this branch was cut and is not in scope.

## Merge Readiness
**Assessment: READY**

Justification:
- Build: CLEAN (same pre-existing non-blocking warnings as source branch)
- Vitest: 1062/1062 passing (42 test files) -- up from 182/1029 on cut point
- Jest: 59/60 passing -- 1 pre-existing stale test, same as source branch
- Encoding: CLEAN
- CSS tokens: CLEAN
- Config drift: CLEAN
- No new .toFixed() violations
- No CSS style changes (hardening only)
- No debugger statements
- !important inventory documented

Merge order when ready:
1. Merge `redesign/phase5-cleanup` into `main` (visual parity, routing, CSS fixes)
2. Merge `redesign/phase5-hardening` into `main` (or into phase5-cleanup first, then main)
   -- the hardening branch is strictly additive: new tests, fixed imports, toFixed routing
