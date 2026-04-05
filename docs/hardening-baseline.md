# Hardening Baseline -- Phase 1

**Date:** 2026-04-05
**Branch:** redesign/phase5-hardening
**Based on:** redesign/phase5-cleanup HEAD

## Build
Status: WARNINGS (pre-existing, non-blocking)

Warnings:
- `<script src="scripts/price-narrative-engine.js">` in index.html can't be bundled without type="module" attribute (3 classic scripts, pre-existing)
- pm-chat.js is dynamically imported by economist-chat.js but also statically imported by chat.js and main.js -- dynamic import will not move module into another chunk (pre-existing)

Bundle output:
- index.html: 42.75 kB (gzip: 9.63 kB)
- index-CT2PFoyM.css: 309.37 kB (gzip: 48.41 kB)
- index-DU-pLtEC.js: 499.30 kB (gzip: 146.99 kB)

Build time: 2.18s

## Tests
Vitest: 1029 passing / 1029 total (39 test files) -- AFTER fixing pre-existing import bug
Jest: 59 passing / 60 total (1 pre-existing failure: renderCoverageRow)
Combined: 1088/1089 (1 pre-existing Jest failure)

**Pre-existing fix applied in baseline:** 34 Vitest test files had `import { describe, it, expect, vi } from 'vitest'` which is incompatible with `globals: true` in Vitest 4. The import lines were removed to restore 1029-test pass state. This was a Vitest 4 compatibility issue introduced when the test files were written.

**Pre-existing Jest failure (not fixed):** `tests/html-structure.test.js` checks `renderCoverageRow` is exported from home.js, but the home page was refactored and this function no longer exists. This is a stale test from before the redesign.

## Encoding lint
Status: CLEAN

## CSS token lint
Status: CLEAN

## Config drift lint
Status: CLEAN
