# Continuum Intelligence v3 — CLAUDE.md

> Operational playbook for AI agents working on this codebase.
> Read this FIRST, in full, before touching anything.

---

## 1. Project Identity

Continuum Intelligence is an institutional-grade equity research platform applying Analysis of Competing Hypotheses (ACH) methodology to ASX-listed securities. The platform synthesises cross-domain evidence into hypothesis-weighted investment reports for sophisticated institutional investors.

Current implementation: 21-stock ASX equity research SPA. Vanilla HTML/JS/CSS frontend on GitHub Pages, Python/FastAPI backend on Railway. Single-page application with hash-based routing. All research data stored as per-ticker JSON files in `data/research/`.

- **Frontend:** GitHub Pages (marcjduncan-sys/continuum-intelligence-v3)
- **Backend:** `https://imaginative-vision-production-16cb.up.railway.app`
- **Frontend sets `REFRESH_API_BASE`** to Railway URL when running on GitHub Pages; uses empty string on localhost (Vite proxy)
- **21 Tickers:** BHP, CBA, CSL, DRO, DXS, FMG, GMG, GYG, HRZ, MQG, NAB, OCL, PME, RFG, RIO, SIG, WDS, WOR, WOW, WTC, XRO

### Predecessor Context (V2)

V3 is a ground-up rebuild. The parent `Continuum` repo (V2) covered 12 stocks and used GitHub Actions for twice-daily automated event scraping and price updates. V3 moved the automation server-side to Railway with a full LLM-powered refresh pipeline. Several design documents in the parent repo (Narrative Framework V2, Top 0.1% Framework, Event System, Price-Narrative Integration Guide) define architectural intent that V3 partially implements through the Dynamic Narrative Engine and refresh pipeline. These documents remain the authoritative specification for future expansion.

---

## 2. Analytical Framework (ACH Methodology)

Understanding the methodology is prerequisite to working on any analytical component. Do not modify hypothesis scoring, evidence weighting, or narrative generation without reading this section.

### Core Concept
The platform applies ACH (Analysis of Competing Hypotheses) to equity research. For each stock, 3-4 mutually exclusive hypotheses compete. Evidence from 8 domains is assessed against each hypothesis. The editorial value is in identifying which hypothesis the evidence is accumulating *against*, not which one has the most support. This is disconfirmation analysis.

### Hypothesis Structure
- **N1 (H1):** Always the dominant/priced hypothesis (what the market assumes)
- **N2-N4:** Alternative hypotheses ranked by survival score
- Each hypothesis has: description, direction (upside/downside/neutral), survival score, supporting evidence, contradicting evidence, conditions, implied price
- `prepareHypotheses()` remaps N1-N4 labels across all sections after sorting by survival score. Never modify this function without understanding the full downstream impact.

### Evidence Hierarchy (Epistemic Ranking)
1. **Facts** (price, volume, filed financial data) -- non-negotiable accuracy
2. **Scrutinised** (regulatory filings, ASIC, ACCC) -- under oath/obligation
3. **Motivated** (corporate communications, earnings calls) -- management has purpose
4. **Consensus** (broker research) -- blend of fact and opinion
5. **Independent** (competitor disclosures, economic data) -- not controlled by subject
6. **Noise** (media, social) -- contextual signal at best, never treated as evidence

### Eight Evidence Domains
Corporate Communications, Regulatory Filings, Broker Research, Competitor Disclosures, Economic Data, Alternative Data, Academic Research, Media & Social. Each domain has an epistemic character that determines how its evidence is weighted.

### Risk Skew
Not a recommendation. Answers: does cross-domain evidence support or undermine what the current price assumes? Three states: Upside (green), Balanced (amber), Downside (red). Derived from evidence alignment, survival score direction, price vs consensus, and diagnosticity.

### Skew Scoring Formula (Current Implementation)
```
Net = Sum(upside hypothesis normalised weights) - Sum(downside hypothesis normalised weights)
```
Neutral hypotheses contribute zero. No sqrt amplification. No company weight multiplier. No macro/sector/tech overlay. Normalisation via `normaliseScores()` with floor=5, ceiling=80, scale to 100% is retained. See `DEVELOPER-BRIEF-Skew-Scoring-Simplification.md` in the project OneDrive for the full specification of changes done and remaining.

**Backend skew scripts (`scripts/calc-idio-signal.js`, `scripts/calc-composite-sentiment.js`) still use the OLD formula.** These are marked TODO in the developer brief. The frontend computes live from hypothesis data and is correct. The backend values in `data/stocks/*.json` are stale.

---

## 3. Architecture

### Frontend (Vite + ES Modules)

**Build:** `npm run dev` (Vite dev server) / `npm run build` (production → `dist/`)

```
index.html (~726 lines — HTML shell only, no inline CSS/JS)
src/
├── main.js                    Entry point — boots app, exposes window globals
├── styles/                    11 CSS modules imported via styles/index.css
│   ├── tokens.css             Design tokens (CSS custom properties)
│   ├── base.css               Reset, typography, layout primitives
│   ├── nav.css, home.css, report.css, portfolio.css, thesis.css
│   ├── chat.css, batch.css, snapshot.css
│   └── index.css              Imports all partials
├── lib/
│   ├── state.js               STOCK_DATA, REFERENCE_DATA, FRESHNESS_DATA (shared objects)
│   ├── format.js              Number/date/currency formatting
│   ├── router.js              Hash-based SPA router + renderedPages set
│   └── dom.js                 escapeHtml, computeSkewScore, announcePageChange
├── data/
│   ├── loader.js              Fetch _index.json + on-demand per-ticker research JSON
│   └── dynamics.js            ContinuumDynamics (hydration engine for computed fields)
├── pages/
│   ├── home.js                Featured grid, coverage table, search
│   ├── report.js              Report page orchestrator — renderReport(data)
│   ├── report-sections.js     ~1600 lines, all section renderers + Chart.js timeline
│   ├── portfolio.js, snapshot.js, thesis.js, about.js
├── features/
│   ├── chat.js                Research chat (FAB + inline per-ticker)
│   ├── pdf.js                 PDF report generation (institutional + retail)
│   └── batch-refresh.js       Single + batch research refresh via API
└── services/
    ├── live-data.js            Yahoo Finance OHLCV + localStorage cache
    └── market-feed.js          Live price polling, ticker strip, market status bar
```

- **CDN deps** loaded via `<script>` tags: Chart.js, marked.js, DOMPurify, SheetJS (lazy)
- **5 classic (non-module) scripts:** 3 DNE engines, personalisation.js, snapshot-generator.js
- **Build output:** ~194 KB JS (58 KB gzip) + 132 KB CSS (21 KB gzip)

### Backend (api/)
- `main.py` -- FastAPI app, chat endpoints, refresh endpoints, static file serving
- `refresh.py` -- 4-stage refresh pipeline with in-memory job tracking
- `config.py` -- env vars (ANTHROPIC_API_KEY, GEMINI_API_KEY, model names)
- `ingest.py` / `retriever.py` -- BM25 passage retrieval for RAG chat
- `gemini_client.py` -- Gemini API wrapper for specialist analysis
- `web_search.py` -- Data gathering (Yahoo Finance, ASX, news)

### Dynamic Narrative Engine (DNE) -- `js/dne/`
The DNE is the analytical core of the frontend. It scores hypothesis survival, normalises weights, detects price dislocations, and renders the analytical UI. The DNE partially implements the three-layer architecture defined in the V2 design documents (see Section 4).

- `engine.js` -- hypothesis survival scoring (core algorithm, modify with care)
- `normalise.js` -- score normalisation to 100% (used by 5+ callers)
- `evidence.js` -- constants, decay calc, utilities
- `price-signals.js` -- price dislocation detection (implements Layer 1 of the Narrative Framework)
- `weighting.js` -- price-correlation analysis (implements elements of Layer 2)
- `ui.js` -- DNE UI rendering
- `override.js` -- editorial override mechanism
- `pdf.js` -- PDF report generation

### Refresh Pipeline (4 stages)
1. **gathering_data** -- `gather_all_data()` fetches Yahoo Finance, ASX announcements, news
2. **specialist_analysis** -- Gemini extracts structured evidence updates
3. **hypothesis_synthesis** -- Claude re-weights hypotheses, updates narrative (temperature=0)
4. **writing_results** -- Merge into research JSON, update index

### Full Pipeline Architecture (Target State from Spec)
The current 4-stage pipeline is a simplified implementation. The full specification in `continuum-v3-refresh-mechanism-spec.md` defines a 7-stage pipeline with parallelised specialist agents, earnings forecast, and valuation computation. Reference the spec for architectural decisions on future expansion.

### Batch Refresh
- `POST /api/refresh-all` accepts optional `{"tickers": [...]}` body for partial retry
- `GET /api/refresh-all/status` polls batch progress
- `GET /api/refresh/{ticker}/result` fetches single ticker result
- Dual semaphore concurrency control: `_gather_semaphore(3)` for Stage 1, `_batch_semaphore(2)` for Stages 2-3

### Three Refresh Cadences
1. **Real-time price update** -- continuous polling via MarketFeed, no pipeline execution
2. **Manual per-stock refresh** -- user-triggered, full pipeline, $2.25-$5.80 per entity
3. **Batch refresh** -- all 21 tickers, controlled concurrency, resilient to Railway restarts

---

## 4. Price-Narrative Engine Architecture (Design Reference)

The V2 design documents define a three-layer architecture for dynamic, price-responsive narrative intelligence. The V3 DNE (`js/dne/`) partially implements this. These specifications are the authoritative reference for future DNE expansion.

### Layer 1: Price Dislocation Detection
Statistical significance testing of price moves using Z-scores, volume confirmation, drawdown severity, and pattern recognition. V3's `price-signals.js` implements this layer.

Dislocation severity thresholds:
| Severity | Z-Score | Drawdown | Volume | Classification |
|----------|---------|----------|--------|----------------|
| CRITICAL | > 3.0 | > 30% | > 3x avg | Narrative regime change |
| HIGH | 2.0-3.0 | 20-30% | > 2x avg | Significant narrative shift |
| MODERATE | 1.5-2.0 | 10-20% | > 1.5x avg | Narrative tension building |
| NORMAL | < 1.5 | < 10% | Normal | No adjustment needed |

### Layer 2: Dynamic Hypothesis Weighting
Bayesian updating of hypothesis weights based on price-narrative correlation. Weights are a blend of long-term (fundamental research, 60% influence) and short-term (market-implied from price action, 40% influence). V3's `weighting.js` implements elements of this layer.

Key concept: the engine infers which hypothesis the market is pricing from price action patterns (gap down on news = competitive threat hypothesis, steady decline = valuation mean-reversion, etc.), then blends market-implied weights with research weights.

### Layer 3: Knowledge Graph Narrative Generation
The design calls for zero-hardcoding narrative generation using a knowledge graph of vocabulary building blocks, dynamically assembled based on dislocation severity, pattern type, hypothesis weights, and divergence analysis. This replaces template-based commentary with contextually unique institutional-grade prose.

Six framework sections receive tailored commentary: Executive Summary, Investment Thesis, Valuation, Technical Structure, Evidence Check, Catalysts & Tripwires. Each section has specific content requirements and connects price action to thesis implications.

### Research-Market Divergence
The framework surfaces where research views contradict market-implied weights. Divergences above 25 points on any hypothesis are flagged for immediate review. This is the highest-value analytical output: it tells the analyst where the market disagrees with them and by how much.

### Reference Documents (OneDrive)
- `NARRATIVE_FRAMEWORK_V2.md` -- Three-layer architecture specification
- `TOP_0.1pct_FRAMEWORK.md` -- Knowledge graph approach, section coverage, quality standards
- `PRICE_NARRATIVE_INTEGRATION.md` -- Integration guide, UI components, data persistence

---

## 5. Event Classification System (Design Reference)

The V2 event system defines automated event detection and classification. V3 handles this through the refresh pipeline's data gathering stage rather than GitHub Actions, but the classification hierarchy and severity model remain the target specification.

### Event Priority Order
1. **Earnings** -- quarterly/annual results, guidance changes
2. **Management** -- CEO/CFO changes, board appointments
3. **M&A** -- acquisitions, divestments, capital raisings
4. **Macro** -- RBA rates, commodity prices, economic data
5. **Analyst** -- upgrades, downgrades, target changes
6. **Regulatory** -- ACCC actions, ASIC investigations, fines

### Severity Levels
| Level | Criteria | Action |
|-------|----------|--------|
| HIGH | CEO change, profit warning, major acquisition, regulatory fine >$50M | Immediate narrative update |
| MEDIUM | Earnings miss/beat, guidance change, analyst downgrade | Queue for next refresh cycle |
| LOW | Routine announcements, minor board changes | Log only, no immediate action |

### Freshness Monitoring
Urgency score (0-100) based on: days since last review, price dislocation from last review, pending catalyst proximity, unprocessed high-impact events.

Badges: OK (0-15), MODERATE (16-35), HIGH (36-60), CRITICAL (61-100).

The V3 frontend displays freshness via `renderFreshnessBadge()` on home page cards and coverage table. The refresh pipeline resets freshness on completion. Any new event detection mechanism should feed into this urgency scoring system.

---

## 6. Research Content Standards

All research content must comply with `docs/research-content-style-guide.md`. This is non-negotiable. The style guide was enforced across all 22 research JSON files (501 fixes applied). Any new content generation or refresh must produce output that passes the style guide.

### Voice
Senior equity research analyst at a top-tier investment bank. Authoritative, precise, economical. Write for portfolio managers and CIOs who read 30 research notes before lunch. Every sentence must earn its place.

### Audience
Maximum financial literacy. Never explain a ratio, a mechanism, or a concept. Treat the reader as a peer.

### Absolutely Prohibited in Research Content
- **Em-dashes** (use commas, colons, or full stops). This was the single largest class of violation (488 instances fixed). Any LLM generating research prose must be instructed to avoid em-dashes.
- **Exclamation marks, rhetorical questions**
- **Filler phrases:** "It's important to note", "Notably", "Importantly", "Interestingly", "In terms of", "It is worth mentioning"
- **Weak openings:** "It is...", "There are...", "This is..."
- **Prohibited words (context-dependent):** `headwinds` (use pressures/constraints/risks), `tailwinds` (use catalysts/drivers), `leverage` as verb (use utilise/capitalise on), `landscape` as metaphor (use market/environment), `navigate` (use manage/address), `unlock value` (use realise value)
- **Exception:** `leverage` as a financial noun (net debt/EBITDA ratios) is correct and must NOT be changed

### Required Patterns
1. Open with price action or the single most material fact. Never open with background.
2. State what you don't know explicitly.
3. Distinguish fact from inference. Use "Management guides...", "Consensus expects...", "Evidence suggests..." appropriately.
4. Call the evidence. If six of eight domains contradict the narrative, say so.
5. End with action: specific, time-bound monitoring trigger.

### Tone
Write like someone whose bonus depends on being right, not on being liked. Dry, direct, occasionally wry. Never sycophantic. Never breathless.

---

## 7. Hard-Won Rules (Violations Caused Production Failures)

These are not suggestions. Each rule exists because ignoring it caused data loss, OOM crashes, or hours of wasted work.

### 7.1 Railway Is Ephemeral
Railway restarts wipe BOTH in-memory state AND disk writes. Never rely on server-side persistence for anything that matters. All durable state must flow through the frontend to localStorage. This is the single most important architectural constraint.

### 7.2 Always Cache Incrementally
Never design a batch operation that only persists results on full completion. Cache each unit of work the moment it completes. The batch refresh uses `_fetchAndCacheSingleTicker()` to cache each ticker to localStorage as it finishes, tracked via `_batchCachedTickers`. This pattern survived three consecutive Railway OOM restarts and preserved all completed work across retries. Apply this pattern to any new batch operation.

### 7.3 Concurrency Budget on Railway
Railway has ~512MB memory. Firing 21 `gather_all_data()` calls simultaneously caused OOM. Current limits: gather semaphore = 3, LLM semaphore = 2. Do not increase without load testing on Railway. If adding new concurrent operations, audit total memory footprint first.

### 7.4 Server Restart Detection
Frontend polling detects 404 from `/api/refresh-all/status` and shows "Server restarted. N tickers cached." On retry, only uncached tickers are sent via `{"tickers": [...]}`. `_batchCachedTickers` is preserved across retries (never reset). Any new polling mechanism must handle mid-operation server restarts gracefully.

### 7.5 localStorage Key Format
Research data uses `ci_research_` prefix (e.g., `ci_research_BHP`). NOT `continuum_research_`. Verify before reading or writing.

### 7.6 Git: Always Rebase Before Push
`git pull --rebase origin main` before every push. The remote has automated market update commits that land frequently. Pushing without rebase will fail.

### 7.7 Currency Normalisation on Data Merge
When merging refreshed data into STOCK_DATA, currency must be normalised: `AUD` to `A$`, `USD` to `US$`, `GBP` to pound sign, `EUR` to euro sign. `_fetchAndCacheSingleTicker()` handles this. Any new data merge path must do the same or prices display incorrectly.

### 7.8 Live Data Preservation on Merge
When patching STOCK_DATA with refreshed research data, preserve `_livePrice`, `priceHistory`, and `_liveChart`. These are injected by MarketFeed at runtime and are not part of the research JSON. Overwriting them blanks the price display.

---

## 8. File Coupling (Read Before Editing)

### 8.1 Never Modify Without Full Impact Analysis
- `computeSkewScore()` -- 5+ callers across home, reports, snapshots, portfolio
- `prepareHypotheses()` -- remaps N1-N4 labels across evidence, discriminators, tripwires, gaps, verdict, alignment table
- `normaliseScores()` -- floor 5, ceiling 80, scale to 100%. Used by DNE engine, frontend skew, and must be replicated by backend scripts
- `route()` -- master router, controls all page activation
- `loadFullResearchData()` -- feeds all report/snapshot renders
- `data-ticker-card` attribute -- queried by live price updater at lines 8495, 8556, 8731
- `.fc-price` class -- queried by live price updater at line 8734

### 8.2 CSS Scoping Rule
Never edit shared CSS classes (`.hero`, `.site-footer`, `.section-header`, `.skew-badge`) directly. Always scope with page ID: `#page-home .hero-title { ... }`

### 8.3 Independence Matrix (from MODULE_MAP.md)

**Fully isolated (safe):** Personalisation (Unit 7), API Backend (Unit 8), About page

**Low risk:** Thesis Comparator (Unit 6), Portfolio (Unit 5), Snapshots (Unit 3), Home Page sub-sections 1B/1C (unique CSS)

**Medium risk:** Home Page sub-sections 1D/1E (shared skew CSS), Home Page sub-sections 1A/1F (shared hero/footer CSS, use `#page-home` scoping), DNE Engine (Unit 2, isolated files but core algorithms)

**High risk:** Stock Reports (Unit 4, many live-data coupling points), Data Loader (Unit 9, feeds everything), Routing (Unit 10, controls everything)

### 8.4 Live Data Coupling Chain
```
MarketFeed.poll() / prefetchAllLiveData()
  -> fetchAndPatchLive(ticker)
    -> sets stock._livePrice, stock._liveChart, stock._liveTA
      -> updateLiveUI(ticker)
        -> ContinuumDynamics.onPriceUpdate() -> hero metrics
        -> applyNarrativeAnalysis() -> narrative text
        -> replaces TA chart container
        -> updates hero price element
```

### 8.5 Shared CSS Classes (Danger Zone)
These classes are used across multiple pages. Never edit the base definition:
`.hero`, `.hero-title`, `.hero-subtitle`, `.hero-tagline`, `.page`, `.page.active`, `.page-inner`, `.site-footer`, `.footer-*`, `.section-header`, `.section-title`, `.skew-badge`, `.skew-bar-track`, `.skew-bar-bull`, `.skew-bar-bear`, `.skew-score`, `.callout`, `.brand-green`, `.report-section`

### 8.6 Shared Data Structures (Danger Zone)
| Asset | File | Consumed By |
|---|---|---|
| Lightweight Index | `data/research/_index.json` | Home, Snapshots, Portfolio, Personalisation |
| Full Research JSON | `data/research/{TICKER}.json` | Reports, Snapshots, Portfolio, Thesis |
| STOCK_DATA object | In-memory | Most units |
| TC_DATA object | In-memory | Portfolio, Thesis Comparator |
| COVERAGE_DATA object | In-memory | Portfolio |
| REFERENCE_DATA object | In-memory | DNE, live price system |
| FRESHNESS_DATA object | In-memory | Home page cards |

### 8.7 CSS Prefix Registry (Safe to Edit)
| Prefix | Unit | Safe? |
|---|---|---|
| `.fc-*` | Featured Cards | Yes (keep `data-ticker-card` and `.fc-price`) |
| `.snap-*`, `.snapshot-*` | Snapshots | Yes |
| `rh-*`, `rs-*`, `ta-*`, `ec-*`, `hc-*`, `tw-*`, `disc-*`, `sb-*`, `vs-*`, `pir-*`, `vr-*`, `ndp-*`, `nt-*`, `rf-*` | Stock Reports | Yes |
| `.portfolio-*`, `.upload-*`, `.port-*`, `.alignment-*`, `.change-alert-*`, `.rw-*` | Portfolio | Yes |
| `.tc-*` | Thesis Comparator | Yes |
| `.pn-*`, `.wizard-*` | Personalisation | Yes (fully isolated) |
| `.coverage-table`, `.td-*`, `.sort-arrow` | Coverage Table | Yes |
| `.about-*` | About Page | Yes |

---

## 9. AI Agent Operating Principles

### 9.1 Think Before Acting
Before writing any code, answer three questions: (a) what exactly is the desired end state, (b) what is the minimal change to get there, (c) what could break. If you cannot answer (c), read more code first. The modular structure has coupling chains (see Section 8) that are not obvious from reading a single module.

### 9.2 Scope Discipline
Do the thing you were asked to do. Do not "improve" adjacent code, refactor for style, or add features that were not requested. Every additional change is a risk surface. If you notice something worth fixing, note it in the response, don't fix it silently.

### 9.3 Verify After Every Change
After making a change, verify it works. Do not declare success based on "the code looks right." Run the relevant check: load the page, trigger the function, check the API response, inspect localStorage. If running in a browser, take a screenshot and actually read it.

### 9.4 Never Assume, Always Check
- Do not assume a variable name, key prefix, or function signature from memory. Grep or read the file.
- Do not assume a feature works from reading one code path. Check error paths, edge cases, and what happens on server restart.
- Do not assume the remote is in sync. Check with `git log --oneline -5` and `git status`.
- Do not assume Railway has the same environment as local. It has ~512MB RAM, ephemeral disk, and restarts under load.

### 9.5 Edit Precision
When using Edit tool or equivalent:
- Include enough surrounding context to make the match unique
- Never use find-and-replace patterns that could match in multiple locations
- After editing, verify the edit landed where intended (read the file back at the target lines)
- Prefer editing existing code over rewriting large blocks

### 9.6 Error Handling Is Not Optional
Every async operation (fetch, localStorage write, DOM query) can fail. Handle the failure case. In this codebase specifically:
- `fetch()` to Railway can return 404 (server restarted), 409 (conflict), 500 (OOM), or network error
- `localStorage.setItem()` can throw quota exceeded
- `document.getElementById()` can return null if the page hasn't rendered yet
- `JSON.parse()` can throw on malformed data

### 9.7 Commit Messages
Be specific about what changed and why. "Fix bug" is useless. "Fix batch refresh: cache each ticker incrementally to survive Railway restarts" tells the next person what happened and why.

### 9.8 Read the Relevant Reference Docs
Before making changes to analytical components, read these project documents:

In repo:
- `docs/research-content-style-guide.md` -- content quality standard
- `MODULE_MAP.md` -- line ranges and coupling matrix

In OneDrive (`Continuum Intelligence` folder):
- `DEVELOPER-BRIEF-Skew-Scoring-Simplification.md` -- skew formula changes (frontend done, backend TODO)
- `continuum-v3-refresh-mechanism-spec.md` -- full 7-stage refresh architecture

In OneDrive (parent `Continuum` folder):
- `NARRATIVE_FRAMEWORK_V2.md` -- three-layer price-responsive narrative architecture
- `TOP_0.1pct_FRAMEWORK.md` -- knowledge graph narrative generation, section coverage
- `PRICE_NARRATIVE_INTEGRATION.md` -- DNE integration guide, UI components
- `EVENT_SYSTEM.md` -- event classification, freshness monitoring, automation

### 9.9 Respect the Architecture
This codebase is a vanilla JS SPA with ES modules bundled by Vite. No framework (React/Vue/Svelte). Do not suggest migrating to a framework. The modular structure under `src/` was extracted from a 13,700-line monolith in Feb 2026 and each module has clear ownership boundaries. Do not merge modules back together or create cross-cutting abstractions that weren't requested.

---

## 10. AI-Specific Anti-Patterns (Observed Failures)

### 10.1 "It Should Work" Without Testing
Never claim a change works without observing it work. This includes: "I've updated the function, it should now correctly..." followed by no verification. The word "should" in a completion message is a red flag.

### 10.2 Optimistic Concurrency
Do not fire N parallel operations and hope the server handles it. Always ask: what is the memory and CPU cost of each operation? What happens if they all run simultaneously? The answer in this codebase was OOM. Use semaphores or sequential execution.

### 10.3 All-or-Nothing Persistence
Never design a system where partial progress is lost on failure. Cache incrementally. Checkpoint. Make operations resumable. This applies to batch refreshes, data migrations, file processing, anything with >1 unit of work.

### 10.4 Ignoring Platform Constraints
Railway's ephemeral filesystem was documented. The OOM threshold was observable. Both were ignored in the initial batch implementation. Before building anything, enumerate the platform's actual constraints: memory, disk persistence, request timeouts, concurrent connection limits.

### 10.5 Scope Creep During Implementation
When fixing a bug, fix that bug. Do not simultaneously refactor the surrounding code, add logging, rename variables, or "clean up" the file. Each additional change multiplies the risk of introducing a new bug and makes the diff harder to review.

### 10.6 Stale Context
In long sessions, earlier assumptions may no longer hold. The server may have restarted. The git remote may have new commits. The localStorage may have been cleared. Re-check state before acting on assumptions from earlier in the conversation.

### 10.7 LLM Output Trust
Never trust LLM-generated structured data without validation. The refresh pipeline asks Gemini and Claude to produce JSON. Both will occasionally return malformed output, hallucinate fields, or omit required keys. Always: (a) validate against the expected schema, (b) log the raw response before parsing, (c) handle parse failures with a fallback or retry.

### 10.8 Generating Research Prose Without the Style Guide
Any code path that generates research prose (refresh pipeline, chat responses, narrative updates) must include the style guide constraints in the prompt. Without explicit instruction, LLMs default to em-dashes, filler phrases, and hedging language that violates the content standard. The style guide must be injected as a system constraint, not left to the model's discretion.

### 10.9 Trusting LLM Memory Over Source Code
When an AI agent "remembers" a function signature, variable name, or API endpoint from earlier in a conversation, that memory may be wrong. Always grep or read the file to confirm. Context compaction and long conversations degrade recall accuracy. The codebase is the source of truth, never the agent's recollection.

### 10.10 Generating Content That Sounds Like an AI Wrote It
The platform serves institutional investors who will immediately dismiss content that reads like LLM output. Specific tells to avoid: em-dashes (the single biggest violation class), "It's worth noting", "Let's dive in", "Here's the thing", "In this section we will", exclamation marks, rhetorical questions, and any phrase that hedges without adding information. The style guide exists precisely because LLMs naturally produce these patterns. Inject the style guide into every prompt that generates user-facing text.

---

## 11. Code Quality Standards

### 11.1 JavaScript (Frontend)
- Vite builds to `dist/` — ES2020+ syntax is fine in `src/` modules (Vite transpiles)
- `src/` modules use `const`/`let` and ES module `import`/`export`
- Classic scripts (`js/`, `scripts/`) still use `var` for consistency with their existing style
- All DOM queries must null-check before use
- All fetch calls must handle non-200 responses
- Console.log with `[Module]` prefix for debuggability (e.g., `[BatchRefresh]`, `[MarketFeed]`)
- Service Worker uses cache-first for static assets (CSS, JS, fonts), network-first for research data, stale-while-revalidate for HTML shell

### 11.2 Python (Backend)
- Type hints on all function signatures
- Structured logging with `logger.info/warning/error`, not `print()`
- All async operations must have timeout handling
- Semaphores for any concurrent external API calls
- Pydantic models for request/response validation

### 11.3 Data Integrity
- Research JSON schema must be consistent across all 21 tickers
- When merging new data into existing research JSON, preserve fields not being updated
- When patching STOCK_DATA in memory, preserve `_livePrice` and `priceHistory` (injected by MarketFeed, not part of research JSON)
- Index file (`_index.json`) must stay in sync with individual ticker JSONs
- History JSON files use `entries` key (NOT `history`)

### 11.4 Writing Standard
Australian English (Macquarie/Oxford, Australian Government Style Manual). No em-dashes in any output. No LLM-characteristic phrasing ("It's worth noting", "Let's dive in", "Here's the thing"). The platform serves institutional investors; every piece of text must read as if written by a senior analyst.

---

## 12. LLM Integration Patterns

### 12.1 Model Selection
- **Gemini (gemini-2.5-flash):** Used for Stage 2 specialist analysis. Fast, cheap, good at structured extraction.
- **Claude (claude-sonnet-4-5-20250929):** Used for Stage 3 hypothesis synthesis and RAG chat. Better reasoning, used at temperature=0 for deterministic outputs.
- **Rule:** Use the cheapest model that meets quality requirements. Gemini for extraction/classification. Claude for reasoning/synthesis.

### 12.2 Prompt Architecture
- System prompts are defined as constants, not constructed dynamically from user input
- Research context is injected via `<research_context>` XML tags in user messages
- Conversation history is truncated to `MAX_CONVERSATION_TURNS * 2` messages
- Custom system prompts (personalisation) override the default but never modify the safety constraints
- The research content style guide must be included in any prompt that generates prose for research JSONs

### 12.3 API Error Handling
- Anthropic API errors return 502 to frontend with error detail
- Gemini failures should fall back to Claude-only path (not crash the pipeline)
- Rate limits: implement exponential backoff, not immediate retry
- Token limits: truncate context before hitting model limits, do not let the API return a truncation error

### 12.4 Structured Output
When asking an LLM to produce structured data (JSON, scores, classifications):
- Provide the exact schema in the prompt with field descriptions
- Validate the output against the schema before using it
- Handle malformed responses (the LLM will occasionally return invalid JSON, wrap in markdown code blocks, or omit fields)
- Log the raw response before parsing for debugging
- Strip markdown code fences (```json ... ```) before parsing, both Gemini and Claude do this unpredictably

### 12.5 Temperature Settings
- temperature=0 for anything that feeds into data (hypothesis scores, evidence extraction, structured outputs)
- temperature=0.7 for conversational chat responses
- Never use temperature>0 for operations where consistency matters across runs

### 12.6 Cost Awareness
Full pipeline cost per entity: $2.25-$5.80. Batch refresh of 21 tickers: ~$50-$120. Do not add unnecessary LLM calls. Do not increase context window sizes without justification. Every token costs money and adds latency.

---

## 13. Frontend Data Contract

The frontend consumes a JSON object per stock with these top-level sections. Any refresh or generation must produce output conforming to this structure:

```
meta:           ticker, company_name, price, date, descriptor
hero:           embedded_thesis, skew, next_decision_point
hypotheses[]:   id, label, weight, direction, description, supporting[], contradicting[]
narrative:      theNarrative, priceImplication, evidenceCheck, narrativeStability
evidence:       intro, cards[] (per domain: finding, tension, alignment)
discriminators: intro, rows[] (evidence, diagnosticity), nonDiscriminating
tripwires:      intro, cards[] (conditions, then-clauses)
gaps:           analyticalLimitations
identity:       overview, key metrics
technicalAnalysis: trend structure
```

Fields are stored (analytical judgment, computed at pipeline time) or computed live (anything depending on current share price). The refresh mechanism regenerates stored fields. Live fields recalculate on every page load.

---

## 14. Deployment

### Frontend
Push to `main` branch. GitHub Actions runs `npm ci → npx vitest run → npm run build` then deploys `dist/` to GitHub Pages. Unit tests gate deployment — if tests fail, the site does not deploy.

### Backend
Push to `main`. Railway auto-deploys from `api/` directory via `railway.json` and `Procfile`.

### Pre-Push Checklist
1. `npm run test:unit` -- all Vitest tests pass
2. `npm run build` -- production build succeeds
3. `git status` -- no unintended files staged
4. `git diff` -- review what's actually changing
5. `git pull --rebase origin main` -- sync with automated commits
6. `git push origin main`
7. After push: verify GitHub Actions deploy succeeds, then Railway health (`/api/health`)

---

## 15. Common Operations

### Running Locally (Frontend)
```bash
npm run dev              # Vite dev server (localhost:5173+), proxies /api to Railway
npm run build            # Production build → dist/
npm run preview          # Serve dist/ locally
npm run test:unit        # Vitest (104 tests on src/ modules)
npm run test:all         # Jest + Vitest (145 total)
npm run typecheck        # tsc --noEmit (JSDoc type checking)
npm run test:unit:watch  # Vitest watch mode (re-runs on save)
```
Note: No Python installed locally. All API calls go through Vite proxy to Railway production API.

### Running Backend (if Python available)
```bash
cd api && pip install -r requirements.txt
# Set ANTHROPIC_API_KEY, GEMINI_API_KEY env vars
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Adding a New Ticker
1. Create `data/research/{TICKER}.json` with full research schema (see Section 13 for structure)
2. Update `data/research/_index.json`
3. Ensure content complies with `docs/research-content-style-guide.md`
4. Ticker auto-appears in coverage table and batch refresh

### Adding a New Page
1. Add `<div class="page" id="page-{name}">` to HTML
2. Add `'{name}'` to `VALID_STATIC_PAGES` set
3. Add `<a href="#{name}" data-nav="{name}">` to `.nav-links`
4. Use unique CSS prefix for all styles (see Section 8.7)
5. Add rendering function gated by `renderedPages` tracking

### Triggering Batch Refresh
- Full: `POST /api/refresh-all` with empty body
- Partial retry: `POST /api/refresh-all` with `{"tickers": ["WOR", "WOW"]}`
- Frontend handles this via "Refresh All Research" button with automatic retry logic

---

## 16. Testing

### 16.1 Automated Tests
Two test runners coexist (disjoint scopes, no conflict):

| Runner | Command | Scope | Module system |
|--------|---------|-------|---------------|
| **Vitest** | `npm run test:unit` | `src/**/*.test.js` (104 tests) | ESM |
| **Jest** | `npm test` | `tests/*.test.js` (41 tests) | CommonJS |

- `npm run test:all` — runs both suites sequentially
- `npm run test:unit:coverage` — Vitest with V8 coverage
- `npm run typecheck` — tsc with checkJs (scoped to tested files in tsconfig.json)
- CI: `npx vitest run` gates deployment in `.github/workflows/deploy.yml`

Test files are co-located: `src/lib/format.test.js` next to `src/lib/format.js`.

### 16.2 Manual Verification
Automated tests cover pure logic. UI and integration still require manual checks:

1. **API changes:** Hit the endpoint with curl or browser dev tools. Check the response shape and status code.
2. **Frontend data changes:** Open browser console, inspect `STOCK_DATA[ticker]` and `localStorage.getItem('ci_research_TICKER')`.
3. **UI changes:** Load the page, navigate to the affected view, visually confirm.
4. **Batch operations:** Trigger the operation, watch the progress modal, verify localStorage after completion.
5. **Resilience:** Kill the server mid-operation and verify the frontend recovers gracefully.
6. **Content quality:** After any prose generation, check output against the style guide. Search for em-dashes, prohibited phrases, and filler. If found, the prompt constraints need strengthening.

---

## 17. Known Issues

- `personalisation.js` has a SyntaxError (`Unexpected identifier 'PRODUCTION_API'`) affecting the Personalisation tab (fixed in modularisation — `isLocal` ternary corrected)
- Service worker returns 404 (non-critical)
- Coverage table "UPDATED" column may show stale dates after refresh (pipeline may not update the `date` field, or table reads from static data rather than localStorage cache)
- Backend skew scripts (`scripts/calc-idio-signal.js`, `scripts/calc-composite-sentiment.js`) still use old sqrt formula. Frontend is correct. Backend values in `data/stocks/*.json` are stale. See `DEVELOPER-BRIEF-Skew-Scoring-Simplification.md` for TODO list.
- V2 event-scraper scripts (`event-scraper.js`, `narrative-generator.js`, `update-html.js`) exist in the parent repo but are not used by V3. V3's refresh pipeline replaces this automation.
- DNE engines (`js/dne/`) still loaded as classic scripts — not yet converted to ES modules
- `tsconfig.json` only covers 4 files in `include` — expand as JSDoc is added to more modules

---

## 18. Session Continuity Notes

When resuming from a previous session or context compaction:
- Re-read this CLAUDE.md first
- Check `git log --oneline -10` for what's changed since last session
- Check Railway health: `curl https://imaginative-vision-production-16cb.up.railway.app/api/health`
- Do not assume any in-memory state from prior sessions. Railway may have restarted. Browser may have been closed. localStorage is the only durable store.
- If the task involves research content, re-read `docs/research-content-style-guide.md`
- If the task involves analytical components (skew, hypotheses, evidence), re-read Section 2 of this file
- If the task involves the DNE or narrative generation, re-read Section 4 for the target architecture
