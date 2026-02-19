# Architecture

**Analysis Date:** 2026-02-19

## Pattern Overview

**Overall:** Multi-layered event-driven research platform combining static site generation with browser-based dynamic narrative scoring

**Key Characteristics:**
- Dual-layer: Backend batch pipeline + browser client-side rendering
- Hypothesis-driven evidence scoring with time-decay weighting
- Event-reactive architecture with price signal detection
- Modular DNE (Dynamic Narrative Engine) as core scoring system
- JSON-driven data flow with immutable stock profiles
- Automated orchestration with manual editorial override capabilities

## Layers

**Data Source Layer:**
- Purpose: Fetch and normalize market data from external sources
- Location: `scripts/fetch-live-prices.js`, `scripts/event-scraper.js`, `scripts/fetch-macro-factors.js`
- Contains: Yahoo Finance scrapers, ASX announcement parsers, price fetchers
- Depends on: External APIs (Yahoo Finance, ASX RSS)
- Used by: Orchestrator pipeline

**Processing Pipeline Layer:**
- Purpose: Transform raw market data into research signals and narrative updates
- Location: `scripts/` directory - orchestrated by `update-orchestrator.js`
- Contains: Price analysis, event classification, narrative generation, HTML updates
- Depends on: Data source layer, configuration files
- Used by: GitHub Actions CI/CD, manual triggers

**Evidence Management Layer:**
- Purpose: Score and manage hypothesis survival based on evidence items
- Location: `js/dne/` directory (evidence.js, engine.js, price-signals.js, weighting.js)
- Contains: Evidence item utilities, decay calculations, hypothesis scoring logic, narrative flip detection
- Depends on: Configuration (price_rules.json), stock data structure
- Used by: Browser runtime, UI rendering layer

**Storage & Config Layer:**
- Purpose: Persist stock profiles, configuration, and historical data
- Location: `data/stocks/` (stock JSON), `data/config/` (config JSON), `data/research/` (research metadata)
- Contains: Stock evidence items, price rules, ticker metadata, event logs
- Depends on: File system
- Used by: All other layers

**UI Rendering Layer:**
- Purpose: Display hypothesis scores, narrative text, evidence support, alerts to users
- Location: `js/dne/ui.js`, `index.html`, stock page templates
- Contains: DOM manipulation, visual components, narrative history rendering
- Depends on: Evidence layer (recalculateSurvival, hypothesis scores)
- Used by: End users via browser

**Integration Layers:**
- Personalization: `js/personalisation.js` - Client-side user profiling (firm type, strategy, holdings)
- PDF generation: `js/dne/pdf.js` - Export institutional/retail report formats
- Override system: `js/dne/override.js` - Editorial narrative lock with expiry

## Data Flow

**Real-time Price Signal Flow (Browser):**

1. User loads stock page with `window.DNE_TICKER = "WOW.AX"`
2. `js/dne/app.js` initializes: loads stock JSON from `data/stocks/{ticker}.json` + config from `data/config/price_rules.json`
3. `recalculateSurvival()` scores each hypothesis T1-T4 based on existing evidence items
4. `renderNarrativeUI()` updates DOM with survival bar, hypothesis descriptions, what-to-watch guidance
5. 15-minute refresh loop calls `fetchPriceData()` → `evaluatePriceSignals()` → new price signal evidence items
6. `checkNarrativeFlip()` evaluates if dominant hypothesis should flip to ALERT or FLIP state
7. UI updates reactively with new scores and alert banners

**Batch Pipeline Flow (Scripts):**

1. **update-orchestrator.js** orchestrates full cycle:
   - Runs `update-prices.js` → fetches live prices → updates `data/latest-prices.json`
   - Runs `research-monitor.js` → calculates freshness metadata for each stock
   - Injects freshness data into `index.html`
   - Generates structured report for GitHub Actions logging

2. **Event Processing (On-demand):**
   - `event-scraper.js` fetches ASX announcements + Yahoo Finance data → `data/events/events-{YYYY-MM-DD}.json`
   - `narrative-generator.js` reads events + prices → classifies by type (Earnings, M&A, Management, etc.)
   - Creates evidence items → updates stock JSONs with new editorial evidence
   - `update-html.js` refreshes `index.html` with latest narrative text

**State Management:**

- Stock state stored in JSON: `data/stocks/{ticker}.json` immutable document
- Hypothesis object: `{ T1, T2, T3, T4 }` each with `survival_score`, `status`, `last_updated`
- Evidence items: array in `stock.evidence_items[]` with `date`, `diagnosticity`, `hypothesis_impact`, `decay` params
- Price signals: auto-generated in `stock.price_signals[]` from price rule evaluation
- Editorial override: top-level `stock.editorial_override` with `reason`, `until` (expiry timestamp)
- Current price: `stock.current_price` updated on each refresh

## Key Abstractions

**Hypothesis (T1-T4):**
- Purpose: Represent alternative investment theses competing for dominance
- Examples: T1="Growth/Recovery", T2="Managed/Base Case", T3="Risk/Downside", T4="Disruption"
- Pattern: Each stock defines 4 domain-specific hypotheses; survival scores sum to relative dominance
- Implementation: `stock.hypotheses` object with survival_score, status, weighted_inconsistency, plain_english description

**Evidence Item:**
- Purpose: Single data point supporting or contradicting a hypothesis
- Examples: Editorial (research findings), Price Signals (triggered rules), Events (ASX announcements)
- Pattern: `{ date, diagnosticity (CRITICAL/HIGH/MEDIUM/LOW), ratings (per hypothesis), decay params }`
- Implementation: Mixed array `stock.evidence_items + stock.price_signals` evaluated in `gatherActiveEvidence()`

**Survival Score:**
- Purpose: Quantify hypothesis credibility based on weighted evidence consistency
- Formula: `1.0 - (weighted_inconsistency / max_possible_weight)` normalized to [0, 1]
- Weighted by: Evidence diagnosticity weight × time-decay factor
- Decay: Full weight for `full_weight_days`, then exponential half-life
- Categorized: HIGH (0.7+), MODERATE (0.4+), LOW (0.2+), VERY_LOW (0-0.2)

**Price Signal:**
- Purpose: Auto-detect market events from price/volume data without human input
- Examples: INTRADAY_DROP_5 (-5% intraday), EARNINGS_MISS_5 (5% earnings surprise), HIGH_VOLUME_DOWN
- Pattern: Evaluated on each price refresh; creates evidence item if triggered
- Implementation: `evaluatePriceSignals()` tests `stock.current_price` against rules in `config.price_evidence_rules`

**Narrative Flip Logic (NORMAL → ALERT → FLIP):**
- Purpose: Alert users and transition dominant narrative when confidence shifts
- ALERT condition: Dominant hypothesis survival drops to MODERATE or below AND alternative reaches HIGH
- FLIP condition: Dominant hypothesis drops to LOW/VERY_LOW AND alternative sustains HIGH for 2+ trading days OR critical event with confirmation
- Override: Analyst can lock narrative for up to 48 hours with published rationale
- Implementation: `checkNarrativeFlip()` checks conditions; updates `stock.alert_state` and `stock.dominant`

## Entry Points

**Browser (Client-Side):**
- Location: `index.html` (static page generated by pipeline)
- Triggers: User navigates to stock page or index
- Responsibilities:
  1. Loads DNE scripts in sequence: evidence.js → engine.js → price-signals.js → override.js → ui.js → app.js
  2. Sets `window.DNE_TICKER` for target stock
  3. Initializes narrative engine on DOMContentLoaded
  4. Starts 15-minute price refresh loop

**Orchestrator (Pipeline):**
- Location: `scripts/update-orchestrator.js`
- Triggers: GitHub Actions on schedule (2x daily) or manual workflow dispatch
- Responsibilities:
  1. Run `update-prices.js` to fetch latest stock prices
  2. Run `research-monitor.js` to calculate research freshness
  3. Inject freshness metadata into `index.html`
  4. Generate structured report for CI logging

**Manual Analytics:**
- Location: Various scripts for analysis and enrichment
- `scripts/calc-idio-signal.js` - Calculate idiosyncratic price signals
- `scripts/calc-macro-signal.js` - Macro factor scoring
- `scripts/calc-sector-signal.js` - Sector-relative signals
- `scripts/run-automated-analysis.js` - Full analysis pipeline

## Error Handling

**Strategy:** Graceful degradation with console logging; failed components don't cascade

**Patterns:**
- Fetch failures: Return null, log error, skip initialization step (e.g., app.js fails silently if JSON unavailable)
- Config validation: Check for required fields (e.g., `!config.price_evidence_rules` → early return)
- Score calculation: Default to no-op if evidence array empty or max weight = 0
- Price signal evaluation: Deactivate expired signals without throwing; continue with remaining rules
- HTML injection: Revert to last-known-good if update fails (version control in CI)

## Cross-Cutting Concerns

**Logging:**
- Console-based: `console.log([DNE] ...)`, `console.error([DNE] ...)` with consistent prefix
- Browser storage: Stock updates logged to localStorage for persistence
- Analytics: Debounced via `startNarrativeRefresh()` to avoid event spam

**Validation:**
- Stock JSON schema: Required fields (ticker, company, sector, hypotheses, evidence_items, price_signals)
- Evidence item schema: date (ISO), diagnosticity (enum), hypothesis_impact (per-T object), decay (optional)
- Price data schema: current, previous_close, open, high_52w, low_52w, volume, avg_30day_volume, cumulative_5day_return, earnings_surprise
- Rule evaluation: Typed comparisons (e.g., earnings_surprise <= -0.05) with null handling

**Authentication & Authorization:**
- Client-side: None (public research platform)
- Editorial override: Analyst credentials checked at persistence layer (not implemented in Phase 1)
- Personalization: User selections stored in localStorage (no server validation)

---

*Architecture analysis: 2026-02-19*
