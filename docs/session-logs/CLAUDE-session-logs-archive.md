# CLAUDE.md Session Logs Archive

Extracted from CLAUDE.md on 2026-03-27. These are historical session logs preserved for reference. They are no longer injected into conversation context.

---

## Session Log: 21 Mar 2026 -- PM Chat Phase A (Shell Implementation)

### Architecture

PM Chat is a separate right-rail panel that mode-switches with the Analyst panel. One panel is visible at a time, never both.

**Mode switch:** `pm-chat.js:_injectModeSwitch()` creates a `.rail-mode-switch` widget with two buttons (Analyst / PM) and inserts it into the Analyst panel header. A second copy is placed in the PM panel header. Clicking either button calls `switchRailMode()` which hides one aside and shows the other.

**localStorage keys:**
- `ci_rail_mode`: `'analyst'` or `'pm'` -- persists the user's last active rail mode
- `ci_pm_conversations`: JSON object keyed by portfolio key -- PM conversation history (sessionStorage)

**DOM ownership:**
- Analyst panel: `<aside id="analyst-panel">` -- untouched, managed by `chat.js`
- PM panel: `<aside id="pm-panel">` -- managed by `pm-chat.js`
- Mode switch: injected into both panel headers by `pm-chat.js:_injectModeSwitch()`

**Rail behaviour:**
- Desktop (>=1024px): one panel always visible, docked right, 480px wide. Mode switch toggles between Analyst and PM.
- Mobile (<1024px): panels slide up from bottom. FABs control open/close. Only one panel open at a time.
- Default mode on boot: Analyst (unless `ci_rail_mode === 'pm'` in localStorage)

**Backend:**
- `POST /api/pm-chat`: separate endpoint from `/api/research-chat`
- `api/pm_chat.py`: owns the PM router, request/response models, API key check
- `api/pm_prompt_builder.py`: PM system prompt identity, stub for future portfolio context injection

**CSS prefix:** all PM styles use `.pm-*` prefix. Rail mode switch uses `.rail-mode-*`. Zero overlap with `.ap-*`.

**Files created:** `src/features/pm-chat.js`, `src/styles/pm-chat.css`, `src/pages/pm.js`, `api/pm_chat.py`, `api/pm_prompt_builder.py`

**Files modified:** `src/lib/state.js` (added 'pm' to VALID_STATIC_PAGES), `src/lib/router.js` (PM lazy render + page name), `src/main.js` (imports + boot sequence), `src/styles/index.css` (CSS import), `index.html` (nav link, page div, PM panel aside, PM FAB), `api/main.py` (PM router mount), `src/lib/state.test.js` (updated Set size assertion)

---

## Session Log: 21 Mar 2026 -- PM Chat Phase B (Portfolio Data Layer)

### Schema

Three new tables via `api/migrations/013_portfolios.sql`:
- `portfolios`: id (UUID), user_id, guest_id, name, currency, active. Owner check constraint.
- `portfolio_snapshots`: id, portfolio_id (FK), as_of_date, total_value, cash_value, notes. Non-negative constraints.
- `portfolio_holdings`: id, snapshot_id (FK), ticker, quantity, price, market_value, sector, asset_class, notes. Positive constraints. Unique (snapshot_id, ticker).

Design decision: store market_value and quantity/price per holding; derive weights deterministically in Python. No weight column.

### Frozen design decisions (do not change without explicit instruction)

1. **Long-only v1.** The schema enforces positive quantity, price, and market_value. Short positions are not supported. If long/short is needed later, the constraints in `013_portfolios.sql` must be relaxed intentionally via a new migration, not patched.
2. **Derived weights are the source of truth.** `portfolio_db.compute_weights()` divides each holding's market_value by snapshot total_value. No user-supplied or stored weight column exists. This must remain the single derivation path.
3. **Validation tolerance for market_value.** `portfolio_validation.validate_snapshot()` allows market_value to deviate from qty * price by up to 1% or $0.01, whichever is greater. This accommodates rounding, FX conversion, and mid-price vs last-price discrepancies without false failures.

### Files created
- `api/migrations/013_portfolios.sql` -- migration (idempotent, auto-applied by `db.run_migrations()`)
- `api/portfolio_db.py` -- CRUD + pure analytics
- `api/portfolio_validation.py` -- `validate_snapshot()`
- `api/portfolio_api.py` -- REST endpoints
- `api/tests/test_portfolio.py` -- 24 unit tests

### Files modified
- `api/main.py` -- registered `portfolio_router`
- `api/pm_chat.py` -- expanded request/response models
- `src/features/pm-chat.js` -- mode switch factory + ARIA keyboard navigation
- `src/pages/pm.js` -- portfolio selector placeholder, snapshot summary metrics stub

---

## Session Log: 21 Mar 2026 -- PM Chat Phase C (Deterministic Portfolio Analytics)

### Analytics engine

`api/portfolio_analytics.py` -- pure deterministic module, no LLM, no network. Single entry point: `compute_analytics(holdings, total_value, cash_value, thresholds?)`.

**Metrics computed:**
- Position count, total value, cash value, cash weight
- Concentration: max single-name weight, top 5, top 10, HHI, equal-weight deviation, normalised concentration score (0-100)
- Sector exposure: market-value-weighted by sector
- Theme exposure: aggregated from sector map (Cyclical, Defensive, Growth, Financial, Real Assets)
- Top 5 positions with ticker, weight, market_value, sector
- Full holdings list with derived weights

**Threshold framework** (`ThresholdConfig` dataclass): max_single_position=15%, max_top5=50%, max_top10=75%, max_sector=35%, min_cash=3%, max_cash=25%. All configurable.

### Persistence

`api/migrations/014_portfolio_analytics.sql` -- `portfolio_analytics` table.

### PM dashboard

`src/pages/pm.js` -- exports `renderPMPage()` and `updatePMDashboard(analytics)`.

---

## Session Log: 21 Mar 2026 -- PM Chat Phase D (PM Intelligence and Structured Recommendations)

### PM Constitution

`api/pm_constitution.py` -- operational rules injected as hard constraints into the PM system prompt.

**Artefacts:**
- `CONVICTION_SIZE_LADDER`: 5 rungs from Highest (4-6%) to Watch (0%).
- `SOURCE_OF_FUNDS_HIERARCHY`: 6-step priority order.
- `PORTFOLIO_ROLES`: Core, Satellite, Starter, Legacy, Cash.
- `RECOMMENDATION_TYPES`: Add, Trim, Hold, Watch, Rebalance, Exit, No Action.
- `RISK_FLAG_TAXONOMY`: 7 codes with category and urgency.
- `RECOMMENDATION_SCHEMA`: 8-field structured output.
- `build_constitution_text(thresholds?)`: generates full Constitution text for prompt injection.

### PM context assembler

`api/pm_context.py` -- converts raw portfolio state into PM-readable context blocks.

### PM prompt builder

`api/pm_prompt_builder.py` -- single assembly point for the PM system prompt. 7 sections.

### Recommendation renderer

`src/features/pm-chat.js` -- `_renderRecommendationCard()` and `_parseRecommendationBlocks()`.

### Evaluation pack

`api/tests/pm_eval_pack.py` -- 9 scenarios for manual review or future LLM-graded evals.

---

## Session Log: 21 Mar 2026 -- PM Chat Phase D0 (Personalisation-PM Unification)

Phase D0 unifies the Personalisation system with PM Chat so PM operates off the user's actual mandate and portfolio context. Key architectural decisions: Phase B DB is canonical portfolio source; mandate in localStorage v1 only; alignment computed once on backend; Constitution safety caps > user mandate > house defaults.

### D0.1-D0.6 Summary

- Mandate settings added to Personalisation wizard (11 fields, safety caps, localStorage v3)
- Canonical portfolio bridge (Personalisation Step 3 syncs to Phase B DB)
- Shared PersonalisationContext dataclass (`api/personalisation_context.py`)
- Backend alignment engine (`api/portfolio_alignment.py` ~330 lines, pure deterministic)
- PM prompt builder extended with mandate and alignment sections
- 56 tests (17 personalisation + 39 alignment)

---

## Session Log: 21 Mar 2026 -- PM Chat Phase D1 (Decision Discipline Remediation)

Phase D1 closes the governance gaps identified in the D0/D audit. Adds mandate breach engine, not-covered name rules, reweighting signal rules, five PM answer types, 9 mandate-aware eval scenarios, and mandate status bar in PM UI.

---

## Session Log: 21 Mar 2026 -- PM Memory Phase E (PM Memory and Journal Integration)

Phase E adds persistent memory, structured decision logging, and Journal integration for the PM. 4 new tables (pm_conversations, pm_messages, pm_decisions, pm_insights), PM database layer, Haiku-powered extraction with 7-type taxonomy, PM Chat persistence wiring, PM Conversations API, PM Journal API, frontend Journal integration with Analyst|PM source toggle. 34 tests.

---

## Session Log: 21 Mar 2026 -- Phase F (Analyst-to-PM Handoff)

Phase F adds explicit cross-role handoff, structured summary delivery, handoff logging, and UI actions in both panels. Migration 016, `api/handoff.py`, `api/handoff_api.py`, PM prompt injection via enriched `build_analyst_context()`, decision basis version F.1, frontend buttons in both panels, 6 new eval scenarios (24 total), 42 tests.

---

## Session Log: 21 Mar 2026 -- Portfolio Go-Live Verification Gates 2 and 3

Gate 2: 92 golden portfolio tests across 15 fixed portfolios with hand-computed expected outputs (0.05% tolerance).
Gate 3: 43 tests validating 24-scenario PM eval pack structurally. 5-dimension rubric (100-point max).
Full suite: 394 pytest + 206 Vitest = 600 total tests passing.

---

## Session Log: 21 Mar 2026 -- Gates 4-6 Verification and Defect Fixes

119 items checked. 113 pass, 5 defects found (D4-1 through D6-4), 1 N/A. Release decision: GO FOR CANARY.

---

## Session Log: 24 Mar 2026 -- PM Chat Bug Sweep (8 fixes across alignment, handoff, context, and protocol)

1. Short position direction hardcoded to "long" (`798c7f1`)
2. PM handoff "not covered" false negative (`4f38606`)
3. Skew computation from stale narrative field (`2cb57ea`)
4. Audit defects D1/D6/D8 (`cfe9718`)
5. FPH.AX exchange suffix breaks coverage lookup (`4de10dd`)
6. PM blocking protocol changed to advisory (`b612e78`)
7. Missing return in analyst context builder (`569cabd`)
8. Handoff verdict key mismatch -- all 38 tickers hollow (`b7748ac`)

---

## Session Log: 17 Mar 2026 -- PDF Report Redesign + Price Drivers Workflow Fix

PDF: Complete rewrite of `src/features/pdf.js` targeting Goldman Sachs equity research layout standards.
Price Drivers: Workflow rewritten with fail-fast on credit exhaustion, freshness skip, and 502 retry.

---

## Earlier Session Logs (Phases 0-3, Gold Agent, Batch Analysis, Insights, Memory Pipeline, UI Fixes, Infrastructure Migration)

These are summarised in the Current State section of the trimmed CLAUDE.md. For full detail, see git history from 2026-03-07 through 2026-03-20.
