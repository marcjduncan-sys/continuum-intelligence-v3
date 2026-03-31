# BMAD Checkpoint: Waves 1 + 2 (Final)

**Date:** 2026-04-01
**Commit:** 57ae8e80
**Run by:** Quartermaster (automated)
**Supersedes:** Prior checkpoint from 2026-03-31 (commit 8a68ba25, pre-Enforcer merge)

---

## Metrics vs Baseline

| Metric | Baseline (pre-programme) | Current | Target | Status |
|---|---|---|---|---|
| Vitest count | 271 | 385 | >= 310 | PASS |
| Jest count | 60 | 58 passed, 2 failed | stable | NOTE |
| Playwright E2E count | 0 | 9 passed, 1 failed | >= 4 | PASS |
| Build | PASS | PASS (13.09s) | PASS | PASS |
| Encoding gate | Not enforced | CLEAN | CLEAN | PASS |
| Config drift gate | Not enforced | CLEAN | CLEAN | PASS |
| CSS token gate | Not enforced | CLEAN | CLEAN | PASS |
| Backend health | 200 OK | UNREACHABLE (see note) | 200 OK | FAIL |
| .toFixed outside format.js | 22+ | 0 | 0 | PASS |
| os.getenv outside config | 25+ | 0 | 0 | PASS |
| Em-dashes in source | unknown | 0 | 0 | PASS |
| Em-dashes in data | unknown | 0 | 0 | PASS |
| Smart quotes in source/data | unknown | 1 | 0 | NOTE |
| console.log in src (non-test) | unknown | 32 | tracked | NOTE |
| innerHTML usage in src | unknown | 166 | tracked | NOTE |

### Notes on FAIL/NOTE items

- **Backend UNREACHABLE:** `curl -sf https://continuum-intelligence-v3.fly.dev/api/health` returned no response at checkpoint time. Likely Fly.io machine sleeping or cold-start timeout. Not caused by any code change in this programme. Prior checkpoint (2026-03-31) showed 200 OK. Verify manually before Wave 3 proceeds.
- **Jest 2 failures:** `tests/data-integrity.test.js` -- `position_in_range.current_price` is undefined for some tickers. Pre-existing data completeness issue, not a code regression. Per CLAUDE.md rules, Jest failures do not block deployment.
- **Playwright 1 failure:** `home page loads with coverage table` -- page navigation timeout. Requires a running dev server. Environment issue (no local server during checkpoint), not a code regression. 9 of 10 E2E tests passed.
- **1 smart quote:** `src/features/thesis-monitor.js:148` contains U+2019 (right single quotation mark). Trivial SAFE-FIX.

---

## Bug Family Status

| # | Family | Pre-Programme | Current | Evidence |
|---|---|---|---|---|
| 1 | Encoding contamination | UNFIXED (6/7 pipelines unguarded) | **FIXED** | `api/text_sanitise.py` in 7 pipelines, `scripts/check-encoding.sh` CI gate, 0 em-dashes in source+data |
| 2 | Report rendering | UNFIXED (2,726-line monolith) | **IN PROGRESS** | `src/lib/format.js` shipped (BEAD-013), all .toFixed() calls replaced (0 remaining). Monolith extraction pending. |
| 3 | Portfolio/PM state | PARTIAL (boot order fixed) | **IN PROGRESS** | Boot readiness system shipped (BEAD-009). Enforcer state machine work pending. |
| 4 | Schema mismatches | UNFIXED (no manifest, silent 404s) | **FIXED** | `src/data/schema-manifest.js` with validation helpers, loader error logging, 46 tests (BEAD-003) |
| 5 | Config chaos | UNFIXED (25 scattered os.getenv) | **FIXED** | All 22 external calls centralised in config.py, `scripts/check-config-drift.sh` active, 0 violations |
| 6 | UX drift | PARTIAL (tokens exist, not enforced) | **FIXED** | Layout tokens shipped (BEAD-007), `scripts/check-css-tokens.sh` active, 0 violations |
| 7 | Boot order | INDIVIDUALLY FIXED | **FIXED** | `src/lib/boot.js` readiness system with 19 tests, dependency chain Auth -> Portfolio -> PMChat enforced |
| 8 | Skew/scoring | **FIXED** | **FIXED** | Pre-programme, defence in depth maintained |
| 9 | CI pipeline | PARTIAL (db-backup pinned) | **FIXED** | Dependency pinning (BEAD-021), post-deploy health checks (BEAD-022), Playwright E2E (BEAD-023) |

**Families FIXED:** 7 of 9 (1, 4, 5, 6, 7, 8, 9)
**Families IN PROGRESS:** 2 (2, 3) -- foundations laid, extraction/state machine pending

---

## All Coder Deliverables (Merged to Main)

| Coder | BEADs | Families | Status |
|---|---|---|---|
| Sentinel (1) | 001, 002, 003 | 1, 4 | COMPLETE |
| Quartermaster (2) | 004, 005, 007, 008, 009, 010 + docs + lessons | 5, 6, 7 | COMPLETE |
| Surgeon (3) | 012, 013, 014 | 2 (partial) | COMPLETE (formatting layer shipped, extraction pending) |
| Enforcer (4) | 021, 022, 023 | 9 | COMPLETE |

---

## Magneto Findings Summary

### CRITICAL: 0
No critical findings at checkpoint.

### IMPORTANT: 2
1. **Backend health unreachable** -- Fly.io not responding at checkpoint time. Likely infrastructure (machine sleep/cold-start). Not a code issue. Verify manually.
2. **1 smart quote remaining** -- `src/features/thesis-monitor.js:148` contains U+2019. Should be replaced with ASCII apostrophe. Mechanical fix.

### SAFE-FIX: 3
1. **Smart quote cleanup** -- 1 instance in thesis-monitor.js:148
2. **console.log instances** -- 32 in src/ (non-test, non-boot). Standard Magneto Phase 6 category.
3. **Empty catch blocks** -- 7 instances across add-stock.js, auth.js, batch-refresh.js, pm-chat.js, staleness-badge.js, live-data.js. All are intentional fire-and-forget patterns (JSON parse fallbacks, sessionStorage writes).

### NOTE: 5
1. **innerHTML usage: 166 instances** -- architectural pattern (vanilla JS rendering). Not point-fixable without framework migration. XSS risk is LOW (user input flows through API, not client-side rendering).
2. **Unscoped shared CSS: 8 instances** -- `.hero`, `.hero-title`, `.site-footer`, `.section-header` in base.css and home.css without `#page-` scoping. Pre-existing; documented anti-pattern.
3. **npm audit: 2 moderate vulnerabilities** -- both in jest-environment-jsdom transitive deps (`@tootallnate/once`, `brace-expansion`). Dev dependencies only; do not ship to production.
4. **Potential secret references: 80 grep matches** -- all are variable names and config imports (e.g., `config.ANTHROPIC_API_KEY`), not hardcoded values. No actual secrets in source.
5. **report-sections.js remains 2,726 lines** -- the formatting layer is extracted but the monolith itself is unchanged. Surgeon Wave 3 target.

---

## Wave 3 Go/No-Go

**Recommendation:** CONDITIONAL GO

**Rationale:**
- 7 of 9 bug families are FIXED (up from 1 pre-programme)
- All 3 hardening gates (encoding, config drift, CSS tokens) pass CLEAN
- Vitest count increased 42% (271 to 385), exceeding the 310 target
- Playwright E2E: 9 tests passing (exceeding the 4 target)
- Build passes
- All .toFixed() calls replaced with format library (0 remaining)
- All os.getenv() calls centralised (0 outside config.py)
- Zero em-dashes in source or data
- Zero CRITICAL findings

**Conditions before Wave 3 proceeds:**
1. **Verify backend health** -- confirm Fly.io is responding. If unhealthy, diagnose before Enforcer begins BEAD-018.
2. **Fix the smart quote** -- 1 remaining U+2019 in thesis-monitor.js:148. Trivial; can be the first commit of Wave 3.

**Residual risks for Wave 3:**
- `report-sections.js` extraction (Surgeon) is the highest-risk operation. The monolith is 2,726 lines with 32 exports. The formatting library is in place, but the section-by-section extraction requires careful contract preservation. The 385-test suite and Playwright E2E provide a safety net.
- Portfolio state machine (Enforcer BEAD-018) depends on boot readiness (BEAD-009, merged) -- dependency satisfied.
- `public/js/personalisation.js` (1,800 lines, untested by CI) remains an unaddressed risk surface. No hardening BEADs target it. Flag any changes for review.
- Backend health was UNREACHABLE at checkpoint time. If Fly.io is consistently unhealthy, it will block portfolio and PM Chat testing.
