# Recurring Issues Registry v2

> Catalogued 2026-03-31 from 60 days of git history (2026-01-30 to 2026-03-31).
> Analysed 1,424 non-automated commits. 402 were fixes. **28% of all commits are rework.**
> Purpose: stop fixing the same bugs. Each entry names the pattern, counts occurrences, identifies the root cause with exact file/line references, and prescribes a permanent fix.

---

## How to use this document

1. **Before fixing a bug**, check if it matches a family below. If it does, apply the permanent fix, not a point fix.
2. **After fixing a bug**, check if it belongs to an existing family or creates a new one. Update the registry.
3. **At session start**, scan this list for any families relevant to the current task.

---

## Bug Family 1: Em-dash / Encoding Contamination

**Occurrences:** 15 commits, 3 production outages, 7 unguarded entry points
**Period:** 2026-02-26 to 2026-03-31 (continuous)
**Files hit:** 58 data JSONs, 55 public/scripts/js files, 11 src files, `api/refresh.py`, `api/price_drivers.py`, `api/gold_agent.py`, `api/scaffold.py`, `api/economist_system_prompt.py`, `api/ingest.py`

### Timeline

| Date | Commit | What broke | Impact |
|------|--------|------------|--------|
| 2026-02-26 | `b0f4a662` | Smart quotes (U+2018/2019/201C/201D) used as JS string delimiters in `index.html` | SyntaxError, page blank |
| 2026-02-27 | `affe3ac6` | Double-encoded UTF-8 mojibake in emoji on Portfolio page | Garbled text |
| 2026-03-09 | `8ceebc77` | Agent wrote literal null byte (0x00) into `api/main.py:101-130` (_INJECTION_MARKERS) | **Platform-wide outage** -- Python cannot compile file with null bytes; healthcheck timeout |
| 2026-03-17 | `5de4610e` | 8x em-dashes in PDF output (`src/features/pdf.js`) | Style violation |
| 2026-03-18 | `591872ad` | 195 em-dashes + double-encoded smart quotes in 21 `data/stocks/*.json` files | Data corruption; HRZ had 5x double-encoded em-dash |
| 2026-03-22 | `0c7c8255` | Windows-1252 byte 0x96 in SNX/WIA JSON + `_index.json`; `json.load()` crashed | **Server startup crash** -- UnicodeDecodeError in ingest pipeline |
| 2026-03-27 | `c1e6ec8c` | Magneto sweep: 699 em-dashes in 58 data/ JSON files | Bulk contamination discovered |
| 2026-03-27 | `e5f4a8bf` | 240 em-dashes in 55 public/scripts/js files | Bulk contamination |
| 2026-03-27 | `e4409afa` | Mega-sweep: 956 total em-dashes + XSS fix + null guards | Bulk contamination |
| 2026-03-28 | `d333a82c` | 27 em-dashes in AMC.json; added `_recursive_fix_strings()` to validate_research.py | Data corruption |
| 2026-03-28 | `217cd7c0` | **Null bytes injected into `api/refresh.py` during em-dash replacement** (2871 lines rewritten) | File corruption from fix attempt |
| 2026-03-28 | `8fc36777` | Added em-dash prohibition to 6+ system prompts in refresh.py | Prompt-level guard |
| 2026-03-29 | `b8666994` | Em-dashes in price driver prompts (lines 596-643) | Style violation |
| 2026-03-29 | `fbd47ce4` | Windows-1252 en-dashes in `api/economist_system_prompt.py` | **Import crash on Fly.io** -- Python 3.11 rejects 0x96 bytes |
| 2026-03-31 | `6a249bf0` | Markdown DOM breakout causing oversized font rendering | Rendering break |

### What exists today

**Sanitisation function:** `api/validate_research.py:93-109` -- `_recursive_fix_strings(obj)`:
- 9 mojibake mappings (double-encoded en-dash, em-dash, smart quotes, ellipsis, bullet, NBSP)
- Em-dash U+2014 to en-dash U+2013
- Emoji strip via `_EMOJI_PATTERN`
- Called from `validate_fix()` at line 140 before writing research JSON to disk

**Prompt guards:** "Do not use em-dashes" in refresh.py (lines 852, 1014, 1054, 1188, 2179) and price_drivers.py (lines 601, 643, 752).

### 7 unguarded entry points (where contamination still enters)

1. **`api/refresh.py:2430-2525`** (`_merge_updates`) -- LLM hypothesis updates merged into research JSON without sanitisation. `_recursive_fix_strings()` called AFTER merge at line 2402, not before. Fields: narrative_rewrite, price_implication, evidence_check, verdict_update, tripwire_updates. **Line 2502 appends raw tripwires unsanitised.**
2. **`api/price_drivers.py:865`** (`_call_llm_sync`) -- Layer 0/2/3 LLM responses parsed and returned without character cleaning. No `_recursive_fix_strings()` call after response parsing.
3. **`api/scaffold.py`** -- New stock scaffolds from Yahoo Finance + LLM may contain em-dashes. No sanitisation grep hits.
4. **`api/gold_agent.py:596,645,706`** -- Gemini and NotebookLM responses used directly. No character cleaning before JSON serialisation.
5. **`api/web_search.py:930-941`** -- HTML-stripped titles/snippets from DuckDuckGo/Yahoo/news APIs passed unsanitised.
6. **`api/source_upload.py:191`** -- PDF extraction: filename sanitised but extracted text content is not.
7. **`api/gemini_client.py:20-29`** -- All Gemini outputs returned without sanitisation wrapper.

### Root cause

Prompt-level guards are insufficient because LLMs ignore instructions non-deterministically. The sanitisation function exists (`_recursive_fix_strings`) but is called at the wrong point (after merge) and is not called at all in 6 of 7 LLM output pipelines.

### Permanent fix

1. **Move `_recursive_fix_strings()` call in refresh.py from line 2402 (post-merge) to line ~2360 (pre-merge, after `_extract_json()`)**
2. **Add `_recursive_fix_strings()` to:** `price_drivers.py` after line 876, `gold_agent.py` lines 596/645/706, `scaffold.py` after LLM response, `web_search.py` line 941, `gemini_client.py` return path
3. **Extract to shared module:** `api/text_sanitise.py` with `sanitise_llm_output(text)` used at every boundary
4. **Validation gate in `api/github_commit.py`:** scan all files for em-dashes/null bytes before committing. Reject with clear error.
5. **Test:** pytest parameterised test feeding em-dash-laden text through every save path

### Status: FIXED (BEAD-001/002, 2026-03-31)

**BEAD-001:** Extracted `_recursive_fix_strings()` to shared `api/text_sanitise.py` as `sanitise_text()`. Added `sanitise_text()` call at LLM output boundary in all 7 pipelines: `refresh.py` (5 entry functions), `price_drivers.py` (3 extraction points), `scaffold.py` (Yahoo metadata), `gold_agent.py` (3 corpus functions), `web_search.py` (DDG parser), `gemini_client.py` (all returns), `decompose.py` (decomposition output). Smart quotes now replaced with straight quotes in addition to em-dash normalisation. 24 pytest regression tests added.

**BEAD-002:** CI encoding gate (`scripts/check-encoding.sh`) added to `fly-deploy.yml`. Scans `src/` for em-dashes, smart quotes, NBSP, and `api/` for null bytes. Full mode (`--full`) also scans `data/` JSON and `api/` Python. Cleanup script (`scripts/clean-encoding.py`) provided for one-time legacy data sanitisation.

---

## Bug Family 2: Report Rendering Regressions

**Occurrences:** 15 specific rendering commits + 26 total fix commits touching report-sections.js
**Period:** 2026-02-15 to 2026-03-31 (continuous)
**Monolith stats:** `src/pages/report-sections.js` is **2,726 lines, 32 exported functions, 11 section types**

### Timeline

| Date | Commit | What broke | Fix |
|------|--------|------------|-----|
| 2026-02-15 | `0e98929e` | Floating-point hypothesis % display (35.4%) | Math.round() on normalised scores |
| 2026-02-28 | `14f071d2` | Hero skew contradicts thesis skew bar (static JSON vs computed) | Sync hero.skew from _skew in hydrate() |
| 2026-03-01 | `9597f3f9` | Hero shows +0.00 price change (_livePrice overwrites stock.price) | Use _liveChange/_liveChangePct from server |
| 2026-03-02 | `32a23a9d` | Vite builds overwrites src/scripts/ with public/ version | Sync both copies |
| 2026-03-03 | `200cd0ba` | MIN/STO/REA crash: `rp.vsSector.name` on undefined (line 915+) | 21-line guard refactor |
| 2026-03-15 | `84864f66` | Gold section renamed but nav links not updated | Updated nav labels |
| 2026-03-15 | `ee2fd9ee` | Old-format reports missing Price Drivers section | Backward compat layer |
| 2026-03-16 | `e825fc78` | JSON parse errors crash price drivers rendering | Retry loop + bump max_tokens |
| 2026-03-19 | `f5214e33` | String passed instead of object to alignmentSummary | typeof guard at lines 449-451 |
| 2026-03-20 | `5e159b61` | `alignmentSummary.rows` undefined; `couldntAssess` undefined | Array.isArray guard; `\|\| []` fallback (line 596) |
| 2026-03-20 | `4420f2d7` | `position_in_range.worlds.map()` on undefined | 4-level guard chain at line 75 |
| 2026-03-27 | `0318f2b8` | External Research numbered Section 12 instead of 09 | 1-line section number change |
| 2026-03-28 | `3ccb2abf` | Section 07 renders 10+ gap items as individual callout boxes | Consolidated to single `<ul>` |
| 2026-03-28 | `5613fbb3` | Section 05 lists at browser default 16px instead of 0.82rem | Replaced `<p>` with `<div>`, added CSS |
| 2026-03-30 | `cf4eb0d5` | Unrounded weight floats; duplicate "External Research" h2; 64 inline font-sizes; hardcoded #ef4444 | Math.round(); dedup; CSS classes; var(--signal-red) |
| 2026-03-30 | `e19d41e8` | Section 06 font-size too small; Section 09 missing from deep research path | Bumped CSS values; added sourcesSection() call |

### Null guard inconsistency (15 different styles in one file)

The file uses `!= null`, `!==`, `typeof`, chained `&&`, `|| []`, `|| ''`, `.get()` fallbacks, and conditional ternaries interchangeably. Critical misses: iteration over undefined arrays without guard (fixed in 5e159b61 and 3ccb2abf).

### Float formatting chaos (22+ `.toFixed()` calls, 4 different precisions)

- Position-in-Range bar: `.toFixed(1)` for %, `.toFixed(0)` for price labels, `.toFixed(2)` for prices
- TA Chart axis: `.toFixed(gv >= 100 ? 0 : 2)` -- conditional precision
- Support/resistance: `.toFixed(2)` for prices but `.toFixed(1)` for axis labels
- Moving averages: `.toFixed(1)` with hardcoded `'0.0'` string fallback
- SVG paths: `.toFixed(1)` for coordinates but `.toFixed(2)` for price text

### Section numbering history

External Research renumbered from Section 12 to 09 (2026-03-27). Gold section renamed and reordered (2026-03-15). Section numbers hardcoded in JS nav builder, CSS selectors, and section renderer independently.

### Root cause

2,726-line monolith with no data validation layer, no formatting utilities, no section registry, and no snapshot tests. Each section assumes its own data shape without validation. Guards added reactively after production crashes.

### Permanent fix

1. **Section registry object** mapping section ID to `{ title, order, renderFn, requiredFields }`. Nav, renderer, and CSS all derive from this. No hardcoded section numbers.
2. **`validateSectionData(sectionId, data)`** -- checks required fields before render. Missing fields show "Data unavailable" placeholder, not a crash.
3. **`formatNumber(value, decimals)` utility** -- single function for all numeric display. No inline `.toFixed()`.
4. **Standardised null guard:** one pattern everywhere: `value != null ? format(value) : fallback`. No mixed styles.
5. **Vitest snapshot tests** for each section's HTML output given known input data.
6. **Extract to `src/pages/report-sections/`** -- one file per section once the monolith exceeds 800 lines (it is currently at 2,726).

### Status: FIXED (BEADs 012-017, 2026-04-01). Monolith decomposed from 2,760 lines to 23-line barrel re-export. 13 domain modules in src/features/report/. Formatting library in src/lib/format.js. Zero .toFixed() calls outside format.js.

---

## Bug Family 3: Portfolio / PM Chat State Instability

**Occurrences:** 25 targeted commits over 60 days (5 boot/state races, 5 short position, 7 reweighting, 5 PM integration, 3 UI)
**Period:** 2026-02-22 to 2026-03-27
**Files hit:** `src/pages/portfolio.js`, `src/features/pm-chat.js`, `api/portfolio_alignment.py`, `api/portfolio_api.py`, `public/js/personalisation.js`

### Timeline (critical incidents only)

| Date | Commit | What broke | Root cause |
|------|--------|------------|------------|
| 2026-02-22 | `84e918fb` | Portfolio shows stale JSON prices before MarketFeed completes | No re-render trigger on live price update |
| 2026-03-02 | `2cc388a2` | `priceHistory:{}` on MSB/PYC crashes hydrateAll(); SW serves deleted bundle hashes | Data type mismatch + stale cache |
| 2026-03-06 | `36339da4` | Short positions in downside-skew stocks mislabelled "Contradicts" | deriveAlignment hardcoded "long"; shorts excluded from weight model |
| 2026-03-09 | `b5a576b4` | All positions treated as longs; contradicting got nonzero weights | No alignment-based scoring; 679-line rewrite |
| 2026-03-23 | `1c7c05a8` | **PM Chat shows "NO PORTFOLIO"** -- guest_id:null violates DB constraint | initPortfolioPage ran BEFORE initAuth. Boot order: Auth was last, should be first |
| 2026-03-23 | `98b21b99` | PM badge shows "NO PORTFOLIO" after refresh | pnSetPortfolioId defined in personalisation.js but never exposed to window |
| 2026-03-23 | `a73931f5` | PM Chat receives null portfolio_id after refresh | renderPortfolioFromSaved() never called _syncPortfolioToPMDatabase() |
| 2026-03-23 | `d60ef362` | PM badge not updating on portfolio sync | No event listener for ci:portfolio:synced |
| 2026-03-24 | `798c7f1d` | Short positions (GYG -49091) misclassified as contradictory | Line 547 hardcoded "long" from Phase B; derive logic never implemented |
| 2026-03-24 | `8c979b00` | Short positions lose direction through DB (CHECK quantity > 0) | Direction smuggled through notes field: `direction:short` |
| 2026-03-24 | `a59808f9` | PM badge wrong; Send to PM reads nonexistent 'action' field | Backend returns `suggested_direction`, frontend read `action` |

### State dependency graph (current)

**Portfolio reads from:**
- `STOCK_DATA` (ticker prices) -- `src/pages/portfolio.js:4,901`
- `window.CI_AUTH.getGuestId()` -- line 770 (for DB sync)
- `window.pnGetPortfolioId()` -- line 814
- `localStorage 'continuum-portfolio'` -- line 721
- `window.pnGetPersonalisationContext()` -- line 417

**Portfolio writes to:**
- `localStorage 'continuum-portfolio'` -- line 717
- `window.pnSetPortfolioId()` -- lines 818, 831, 832
- `window dispatchEvent 'ci:portfolio:synced'` -- line 852
- `API POST /api/portfolios` -- line 796

**PM Chat reads from:**
- `window.pnGetPortfolioId()` -- lines 69, 674
- `API /api/portfolios/{id}/state` -- line 835
- `sessionStorage 'ci_pm_conversations'` -- line 48

### Boot order (after fix, `src/main.js:301-315`)

```
1. Auth ← MUST be first (CI_AUTH.getGuestId needed by Portfolio)
2. Home
3. BatchRefresh
4. Portfolio ← depends on Auth
5. Thesis
6. Notifications
7. Chat ← setupListeners() after DOM query
8. PMChat ← depends on Portfolio having synced
9. EconomistChat
10-12. AddStock, SourceUpload, DeepResearch
```

**Remaining vulnerability:** MarketFeed starts at 800ms delay (line 445), prefetchAllLiveData at 3000ms (line 446). Portfolio renders before 3s; prices are stale until refreshPortfolioPrices() hook fires.

### Short position handling (current workaround)

**DB constraint:** `CHECK (quantity > 0)` and `CHECK (market_value > 0)` -- positive only.
**Workaround:** Direction encoded in `notes` field as `direction:short`.
**Backend priority (portfolio_alignment.py:687-700):**
1. notes contains `direction:short` -- highest priority
2. quantity < 0 (if DB constraints ever relaxed)
3. market_value < 0
4. Default: long

### Root cause

Portfolio state is split across frontend globals, localStorage, and Fly.io database with no state machine. Each consumer (PM Chat, PM badge, reweighting, alignment) independently queries state with different assumptions. Short positions cannot be natively stored in the schema.

### Permanent fix

1. **State machine** in `src/lib/state.js`: states EMPTY/LOADING/LOADED/SYNCING/SYNCED/ERROR. PM Chat and badge subscribe to transitions.
2. **Single `syncPortfolioState()`** that runs at boot and after mutation. Consumers await SYNCED state.
3. **DB migration:** add `direction` ENUM column to holdings table. Drop notes-field workaround.
4. **Integration test:** simulate boot sequence through to PM Chat receiving portfolio.

### Status: FIXED (BEADs 009-010, 018-019, 2026-04-01). Boot readiness protocol (src/lib/boot.js), portfolio state machine (src/features/portfolio-state.js), DB migration 022 (signed quantities), PM Chat observer pattern via onStateChange().

---

## Bug Family 4: Data Schema Mismatches (Frontend/Backend Contract)

**Occurrences:** 10 major mismatches, all in March
**Period:** 2026-03-22 to 2026-03-31
**Files hit:** `api/scaffold.py`, `api/main.py`, `api/portfolio_alignment.py`, `api/notebook_context.py`, `src/data/loader.js`, `src/features/economist-chat.js`, `src/features/staleness-badge.js`

### Timeline

| Date | Commit | Frontend expected | Backend provided | Impact |
|------|--------|-------------------|------------------|--------|
| 2026-03-22 | `0c7c8255` | UTF-8 en-dashes | Windows-1252 (0x96) | Server startup crash |
| 2026-03-24 | `4de10dd7` | `FPH.json` | `FPH.AX.json` (exact match) | Alignment engine found no research data for suffixed tickers |
| 2026-03-28 | `a76092af` | `data/stocks/{TICKER}.json` | Not created for 14 tickers | Silent failure: three_layer_signal, valuation_range, price_signals absent |
| 2026-03-28 | `bb79021b` | Fatal commit + stocks file | Non-fatal commit, no stocks file | Data lost on Fly.io redeploy |
| 2026-03-29 | `2cb57ea9` | Skew from hypothesis scores | Stale `narrative.skew` field | 19/38 tickers had divergent direction; CSL/WTC/XRO flipped |
| 2026-03-30 | `9dee5b9d` | `nb.title` | `nb.name` | 22 notebooks skipped in sync |
| 2026-03-31 | `3d17c92e` | `ask(question=...)` | `ask(message=...)` | All NLM corpus queries silently failed |
| 2026-03-31 | `66917904` | `c.id`, `c.title` | `conversation_id`, `macro_context_summary` | Chat history sidebar rendered blank |
| 2026-03-31 | `97f07588` | `CASH_RATE`, `AUDUSD` | `RBA_CASH_RATE`, `RBA_AUD_USD` | Staleness badges mapped to wrong series |
| 2026-03-31 | `18b3ee32` | Series IDs without prefix | Series IDs with `RBA_` prefix | Macro filters failed |

### Data file architecture

**Frontend fetches per ticker (src/data/loader.js):**
1. `data/research/{TICKER}.json` (line 74) -- full research object
2. `data/stocks/{TICKER}.json` (line 102) -- signal fields (three_layer_signal, valuation_range, price_signals). **Missing file is silent** -- no error logged.

**Backend creates on onboarding (api/main.py:1442-1523):**
1. `data/research/{TICKER}.json`
2. `data/research/_index.json` (appended)
3. `data/config/tickers.json`
4. `data/reference.json`
5. `data/freshness.json`
6. `data/stocks/{TICKER}.json` (added in bb79021b)

### Root cause

No shared schema contract. Field names, data shapes, and file expectations are implicit. The frontend loader swallows missing files silently. Changes on either side break the other with no error surfacing.

### Permanent fix

1. **Schema manifest** (`data/config/schema-manifest.json`): every data file the frontend expects per ticker, with required fields. Backend validates against this before committing.
2. **Ticker normalisation utility:** one `normaliseTicker()` function (strip `.AX`, `.L`, etc.) used everywhere: loader.js, portfolio_alignment.py, scaffold.py.
3. **Onboarding integration test:** pytest that scaffolds a mock ticker and asserts every file in the manifest was created with all required fields.
4. **Frontend loader error logging:** `loader.js` line 102 must `console.error()` when `data/stocks/{TICKER}.json` returns 404. Silent failures are the primary reason 14 tickers went unnoticed.

### Status: FIXED (BEAD-003 complete, 2026-03-31)

**BEAD-003 (Wave 1):** Initial manifest with 2 per-ticker + 5 global files. Loader error logging for stocks fetch.

**BEAD-003 (Wave 2 -- Sentinel redeployment):** Full schema reconciliation. Comprehensive audit identified 12+ backend-generated files and 11 frontend fetch paths. Manifest expanded to 3 per-ticker files (research, stocks, stocks-history), 5 boot files (index, reference, freshness, tc, announcements), 1 polling file (live-prices), with per-file metadata: generatedBy, consumers, errorImpact, criticality. Added PAGE_DEPENDENCIES map linking each page to required/optional files. Added required field definitions for index, reference, and live-prices entries. Added `validateResearchFields()` and `validateReferenceFields()` helpers. Boot sequence in `src/main.js` now logs explicit errors (console.error for critical, console.warn for optional) on all 5 fetch failures. Loader validates research JSON required fields post-parse and warns on missing stocks signal fields. 46 Vitest tests covering manifest completeness, criticality classification, page deps, field definitions, validation helpers, and error handling.

---

## Bug Family 5: API Config / Environment Variable Chaos

**Occurrences:** 8 commits + 25 scattered `os.getenv()` calls outside config.py
**Period:** 2026-03-18 to 2026-03-31
**Audit:** 52 total `os.getenv()` calls, 27 in config.py, 25 distributed across client modules

### Current state of config.py

| Variable | Type | Default | Validated at boot? |
|----------|------|---------|---------------------|
| ANTHROPIC_API_KEY | Required | None | **No** |
| JWT_SECRET | Secret | `dev-insecure-secret` | Yes (check_production_secrets) |
| BATCH/INSIGHTS/PRICE_DRIVERS/OPS_SECRET | Secret | None | Yes |
| GEMINI_API_KEY | Required | None | **No** |
| FINNHUB_API_KEY | Optional | None | **No** (fallback to FINNHUB_API in client) |
| ALPHA_VANTAGE_API_KEY | Optional | None | **No** (fallback to ALPHA_VANTAGE in client) |
| EIA_API_KEY | Optional | None | **No** (fallback to EIA_API in client) |
| DATABASE_URL | Required | Empty string | **No** |
| NOTEBOOKLM_AUTH_JSON | Optional | None | **No** (expires ~2 weeks, no alerting) |
| ALLOWED_ORIGINS | CORS | Hardcoded list | N/A |

### 3 naming conventions for the same keys

- Primary: `ALPHA_VANTAGE_API_KEY`, `FINNHUB_API_KEY`, `EIA_API_KEY`
- Legacy: `ALPHA_VANTAGE`, `FINNHUB_API`, `EIA_API`
- Fallback logic in individual client files, not coordinated with config.py

### Distributed os.getenv() calls (outside config.py)

- `av_macro_client.py`: 2x (ALPHA_VANTAGE_API_KEY + fallback)
- `eia_client.py`: 3x (EIA_API_KEY + fallback)
- `finnhub_calendar_client.py`: 2x
- `fred_client.py`: 2x (FRED_API_KEY)
- `acled_client.py`: 2x (ACLED_USERNAME, ACLED_PASSWORD)
- Plus ~14 more across other client modules

### Root cause

No single env var manifest. Clients invent their own var names and fallback chains. CORS origins are hardcoded. Production security check only covers secrets, not data source API keys.

### Permanent fix

1. **Config manifest dict** in config.py: `{ logical_name: { env_var, required, fallback_vars, default, description } }`. All clients import from manifest.
2. **`check_all_config()` at boot:** required vars fail loudly, optional log warnings. No silent fallbacks in client modules.
3. **CORS from env:** `CORS_ORIGINS` env var (comma-separated) with sensible defaults. No hardcoded domain list in source.
4. **Deprecation of legacy names:** log warning for `FINNHUB_API` / `ALPHA_VANTAGE` / `EIA_API` fallbacks; remove after migration.

### Status: FIXED (BEAD-004/005)

**Fix applied 2026-03-31:**
- All 22 external `os.getenv()` calls moved into `api/config.py`
- Added `_getenv_with_deprecation()` for legacy names (`FINNHUB_API`, `ALPHA_VANTAGE`, `EIA_API`)
- Added `validate_config()`: fails in production for missing `ANTHROPIC_API_KEY`, `DATABASE_URL`, `GEMINI_API_KEY`
- Updated production detection to include Fly.io (`FLY_ALLOC_ID`)
- Added `scripts/check-config-drift.sh` linter: fails if `os.getenv` found outside config.py
- 6 new pytest tests in `api/tests/test_config.py`

---

## Bug Family 6: UX Incremental Drift

**Occurrences:** 10+ commits
**Period:** 2026-03-14 to 2026-03-31
**Files hit:** `src/styles/tokens.css`, `src/styles/chat.css`, `src/styles/nav.css`, `src/styles/report.css`, `src/styles/deep-report.css`, `src/pages/pm.js`

### Panel width progression (4 commits)

| Date | Commit | Change |
|------|--------|--------|
| 2026-03-14 | `a00e4b78` | 380px to 480px |
| 2026-03-20 | `037c3a67` | 380px to 480px (duplicate -- race?) |
| 2026-03-24 | `8f3916fd` | 480px to 580px |
| 2026-03-24 | `5fcc55da` | 580px to 640px |

**Final value:** `--analyst-panel-width: 640px` in `tokens.css:64`.

### Hardcoded values still present

- `chat.css`: 52px, 10px, 14px, 6px, 28px, 18px, 4px, 3px (should be tokens)
- `nav.css`: 12px, 8px, 44px, 56px, 2px (should be tokens)
- `pm.js` had 65+ lines of inline styles (extracted 2026-03-31 in `2fd2b593`)
- `report.css` / `deep-report.css` had hardcoded RGBA colors (fixed 2026-03-31 in `c00b97a5` via `color-mix()`)

### Root cause

Token system exists (`tokens.css` lines 1-69, well-defined colours/typography/spacing) but is not enforced. No CSS linter. Inline styles and hardcoded px values freely added to component files.

### Permanent fix

1. **Lock panel width:** `--analyst-panel-width: 640px` is set. All panel CSS must reference this token only.
2. **Token audit script:** grep for hardcoded px values and hex/rgba colours in CSS files; flag any not using `var(--token)`. Run in CI.
3. **Ban inline styles:** no `style=` attributes in JS render functions. Extract to CSS classes.
4. **WCAG AA contrast check** in the uxfront audit skill.

### Status: FIXED (BEAD-007/008)

**Fix applied 2026-03-31:**
- Added layout tokens to `tokens.css`: content widths (narrow/md/prose/report/lg/wide), modal widths (sm/md/lg), panel collapsed width
- Replaced 21 hardcoded px values across 11 CSS files with token references
- Added `scripts/check-css-tokens.sh` linter: fails if layout widths >= 400px use hardcoded px instead of tokens
- Visual appearance unchanged; all tokens set to current px values

---

## Bug Family 7: Boot Order / State Initialisation Races

**Occurrences:** 3 high-severity crashes + 5 related fixes
**Period:** 2026-02-27 to 2026-03-23
**Files hit:** `src/main.js:301-315`, `src/features/chat.js`, `src/data/dynamics.js`, `public/js/personalisation.js`

### 3 critical incidents

1. **Auth order race** (`1c7c05a8`, 2026-03-23): initPortfolioPage ran BEFORE initAuth. `window.CI_AUTH.getGuestId()` returned undefined. Portfolio sync sent guest_id:null, violating DB constraint. **Boot order was:** Home, BatchRefresh, Portfolio, Thesis, Auth. **Fixed:** moved Auth to position 1.

2. **Event listeners never attached** (`3b929647`, 2026-03-18): `chat.js` wrapped ALL event listeners in `if (panel) { ... }` at module load time. `panel` was undefined at load (before initChat queried DOM refs). Every listener silently failed. Chat panel was dead on arrival. **Fixed:** moved listeners to `_setupListeners()` called from initChat() after DOM refs assigned.

3. **hydrateAll crash** (`8ba0e9b0`, 2026-03-23): MSB/PYC scaffolded with `priceHistory: {}` (object) instead of `[]` (array). `hydrateAll()` calls `.slice()` on priceHistory. TypeError on objects crashes boot. **Fixed:** `Array.isArray()` guard in dynamics.js + corrected data files.

### Remaining vulnerability

`public/js/personalisation.js` loads via classic `<script>` tag BEFORE `src/main.js` module (index.html line 830 before 834). `window.pnBuildSystemPrompt` was not assigned to window until `100b9c62` (2026-03-08). If personalisation.js is slow to load, Chat's use of `window.pnBuildSystemPrompt` will silently fail.

### Root cause

Boot is a sequence of implicit dependencies: classic scripts load before ES modules, data hydrates before pages render, pages render before features bind. Ordering relies on script tag position in `index.html` with no explicit dependency graph.

### Permanent fix

1. **Boot dependency manifest** in `src/lib/boot.js`: each phase emits a readiness event. Downstream consumers `await` the event.
2. **Every init*() function checks prerequisites:** either waits or logs a clear error. No silent failures.
3. **Boot integration test:** assert all globals are defined before initRouter() runs.

### Status: FIXED (BEAD-009/010)

**Fix applied 2026-03-31:**
- Created `src/lib/boot.js`: subsystem registry with dependency tracking, readiness signals (CustomEvents + Promise-based `waitFor()`), dev logging
- Replaced sequential init loop in `main.js` with `initSubsystem()` calls declaring explicit dependencies: Auth -> Portfolio -> PMChat
- If Auth fails, Portfolio is skipped; if Portfolio fails, PMChat is skipped
- `waitFor(name)` allows consumer modules to explicitly await upstream readiness
- 19 Vitest tests (15 unit + 4 regression scenarios), run 3x to confirm no flakiness

---

## Bug Family 8: Skew / Scoring Display Consistency

**Occurrences:** 7 major scoring bugs + 3 display issues
**Period:** 2026-02-11 to 2026-03-31
**Files hit:** `src/lib/dom.js:159-189`, `src/data/dynamics.js:322-372,401-409`, `src/pages/home.js`, `src/pages/report-sections.js`, `api/portfolio_alignment.py`, `api/refresh.py`

### Timeline

| Date | Commit | What broke | Impact |
|------|--------|------------|--------|
| 2026-02-15 | `0e98929e` | Floating-point % display (35.4%) | Math.round() fix |
| 2026-02-19 | `d92fbeea` | BUGFIX_002: company signal + overall sentiment stale (486 lines) | Live compute + verdict sync |
| 2026-02-20 | `f57ffe0b` | **Tile/report score drift:** featured card showed -30 (skew), report showed +19 (three_layer_signal) | Two different calculations; backfilled narrative_weights in _index.json; added CI validator |
| 2026-02-24 | `91366041` | Sqrt formula obfuscated computation | Replaced with transparent net arithmetic |
| 2026-02-27 | `24bbdee1` | **Idempotency bug:** skew scores diverged across home/report/snapshot (-30 vs -28) | stock._skew computed repeatedly. Cached once in hydrate(); all 19 sites read cache |
| 2026-02-28 | `7cc1b334` | **Score compounding:** adjustHypothesisScores mutated hyp.score on every hydrate() call; scores drifted 35 to 32 to 29 to 26% | Save _origScore on first adjustment; always adjust from original (idempotency anchor) |
| 2026-03-13 | `4768a846` | **Verdict score desync:** verdict.scores carried stale hypothesis copies; analyst chat hallucinated wrong % values | Four-layer fix: report-sections.js normalises from hypotheses; ingest.py uses hypothesis scores; refresh.py syncs; validate_research.py Rule 19 auto-fixes |
| 2026-03-24 | `2cb57ea9` | **Portfolio/PM skew divergence:** resolve_skew() read stale narrative.skew; 19/38 tickers diverged; CSL/WTC/XRO direction flipped | Rewrote with _compute_skew_from_hypotheses() matching frontend exactly |

### Architecture (current, after all fixes)

**Single source of truth:** `computeSkewScore()` in `src/lib/dom.js:159-189`.
**Cached:** `stock._skew` set once in `src/data/dynamics.js:401` during hydrate().
**Pattern enforced at 19 call sites:** `const skew = data._skew || computeSkewScore(data);`
**Backend mirror:** `_compute_skew_from_hypotheses()` in `api/portfolio_alignment.py` matches frontend exactly (commit 2cb57ea9).

**4 display surfaces, all using same source:**

| Surface | File | Source |
|---------|------|--------|
| Featured card (Home) | `home.js:45-96` | `data._skew \|\| computeSkewScore()` |
| Coverage table (Home) | `home.js:118-161` | `data._skew \|\| computeSkewScore()` |
| Report hero | `report-sections.js:17-259` | `data.hero.skew` synced from _skew |
| Report Section 02 | `report-sections.js:262-283` | `data._skew \|\| computeSkewScore()` |

**Idempotency anchor:** `adjustHypothesisScores()` at `dynamics.js:336-339` saves `_origScore` on first call; all subsequent calls adjust from original.

**CI validator:** `scripts/validate-scores.js` blocks if tile/report mismatch detected.

### Root cause (historical)

Multiple independent computations of the same score: frontend computed live, backend read stale narrative field, verdict carried copied scores. Each surface computed independently rather than reading from one cache. Score adjustment function mutated in place without idempotency.

### Status: FIXED with defence in depth. Monitor for regression if new display surfaces are added.

---

## Bug Family 9: GitHub Actions / CI Pipeline Fragility

**Occurrences:** 8+ commits
**Period:** 2026-02-26 to 2026-03-31
**Files hit:** `.github/workflows/db-backup.yml`, `.github/workflows/fly-deploy.yml`, `.github/workflows/deploy.yml`

### Key incidents

- DB backup: SSL negotiation, pg_dump version mismatch, Ubuntu runner OpenSSL changes (multiple commits)
- Deploy: multiple workflows commit to main without coordination, causing race conditions with local pushes
- Environment detection: changed from PORT env var to RAILWAY_ENVIRONMENT + RAILWAY_SERVICE_NAME (fragile)

### Root cause

Workflows depend on external service behaviour that changes without notice. No pinned versions. No post-deploy health check. Multiple workflows commit to main concurrently.

### Permanent fix

1. Pin runner images and tool versions in all workflows
2. Every workflow that commits to main ends with health check verification
3. Workflows that commit to main use bot branch + auto-merge or check for concurrent runs

### Status: FIXED -- all npm, Python, Docker, and CI action versions pinned; post-deploy health checks added (BEADs 021-022)

---

## Fix Protocol Template

When fixing any bug, use this checklist:

```markdown
## Fix: [Brief description]
## Bug Family: [Number or "NEW"]

### 1. Classification
- [ ] Checked recurring-issues-registry.md for matching family
- [ ] If new family: will add to registry after fix

### 2. Root Cause
- [ ] Identified root cause (not symptom)
- [ ] Traced to the boundary where the defect enters
- [ ] Documented in commit message

### 3. Fix Scope
- [ ] Fix applied at the boundary, not downstream
- [ ] Grep'd for same pattern elsewhere in codebase
- [ ] Checked all related display surfaces / call sites

### 4. Regression Guard
- [ ] Added test that fails without fix, passes with it
- [ ] If no test possible: added runtime validation/guard

### 5. Documentation
- [ ] Updated recurring-issues-registry.md (status, commits, notes)
- [ ] Updated tasks/lessons.md if new rule learned
- [ ] Commit message format: fix(family): description

### 6. Verification
- [ ] Reproduced bug before fixing
- [ ] Confirmed fix resolves symptom
- [ ] Ran npm run validate
- [ ] Checked no regressions in related areas
```

---

## Summary Statistics (60 days: 2026-01-30 to 2026-03-31)

| # | Bug Family | Fix Commits | Top File(s) | Status |
|---|---|---|---|---|
| 1 | Encoding contamination | 15 | refresh.py, validate_research.py, 58 data JSONs | **FIXED** (BEAD-001: all 7 pipelines sanitised at boundary) |
| 2 | Report rendering | 15 specific + 26 total | report-sections.js (2,726 lines) | UNFIXED (no validation, no tests) |
| 3 | Portfolio/PM state | 25 | portfolio.js, pm-chat.js, portfolio_alignment.py | PARTIAL (races fixed, no state machine) |
| 4 | Schema mismatches | 10 major | scaffold.py, loader.js, main.py | **FIXED** (BEAD-003: full manifest, field validation, error logging on all fetch paths) |
| 5 | API config chaos | 8 + 25 scattered | config.py + 25 client os.getenv() calls | **FIXED** (BEAD-004/005: centralised + linter) |
| 6 | UX incremental drift | 10+ | tokens.css, chat.css, nav.css | **FIXED** (BEAD-007/008: tokens + linter) |
| 7 | Boot order races | 3 critical + 5 related | main.js:301-315, chat.js, dynamics.js | **FIXED** (BEAD-009/010: readiness + tests) |
| 8 | Skew/scoring display | 7 major + 3 display | dom.js:159-189, dynamics.js:322-409 | **FIXED** (defence in depth + CI validator) |
| 9 | CI pipeline fragility | 8+ | db-backup.yml, fly-deploy.yml | PARTIAL (some versions pinned) |

**Total: 1,424 non-automated commits. 402 fix commits (28%). 9 bug families. 1 fully fixed.**

### Priority order for systemic remediation

1. ~~**Encoding (Family 1)** -- Highest ROI. Add `sanitise_llm_output()` to 6 files. Prevents ~15 future commits.~~ **DONE (BEAD-001/002)**
2. ~~**Schema manifest (Family 4)** -- Create manifest + loader error logging. Prevents silent failures.~~ **PARTIAL (BEAD-003)**
3. **Config manifest (Family 5)** -- Centralise env vars. Prevents deployment debugging.
4. **Report-sections decomposition (Family 2)** -- Extract monolith. Prevents 26+ fix commits/month.
5. **Portfolio state machine (Family 3)** -- Formalise state. Prevents PM Chat boot races.
6. **Boot readiness signals (Family 7)** -- Systemic fix for implicit ordering.
7. **Token enforcement (Family 6)** -- CSS linter. Prevents incremental drift.
8. **CI pinning (Family 9)** -- Pin all versions. Prevents external breakage.

---

## Hardening Programme Fix Log

### 2026-03-31 BEAD-001: Encoding Sanitisation Boundary
- **Family:** 1 (Encoding contamination)
- **Symptom:** Em-dashes, smart quotes, mojibake, and emoji in rendered research reports, price drivers, and chat output
- **Root cause:** `_recursive_fix_strings()` existed in validate_research.py but was (a) called post-merge instead of pre-merge, and (b) absent from 6 of 7 LLM output pipelines
- **Fix:** Extracted to shared `api/text_sanitise.py` with enhanced `sanitise_text()`. Added pre-merge sanitisation call at every LLM/external output boundary: refresh.py (5 functions), price_drivers.py (3 extraction points), scaffold.py, gold_agent.py (3 functions), web_search.py, gemini_client.py, decompose.py
- **Fix layer:** BOUNDARY
- **Regression gate:** 24 pytest tests in `api/tests/test_text_sanitise.py` (string, dict, list, pipeline-specific)
- **Recurrence risk:** LOW -- every pipeline now sanitises at extraction, before merge

### 2026-03-31 BEAD-002: Encoding Regression Gate
- **Family:** 1 (Encoding contamination)
- **Symptom:** Contamination characters re-introduced by future LLM prompt changes or new pipelines
- **Root cause:** No CI check for encoding contamination in source or data files
- **Fix:** `scripts/check-encoding.sh` scans src/ for em-dashes, smart quotes, NBSP; scans api/ for null bytes. Added to fly-deploy.yml as pre-deploy step. Full mode (--full) includes data/ JSON audit.
- **Fix layer:** REGRESSION-GATE
- **Regression gate:** CI step in fly-deploy.yml
- **Recurrence risk:** LOW -- CI blocks deployment if contamination detected in source

### 2026-03-31 BEAD-003: Schema Manifest and Loader Hardening (Wave 1 + Wave 2)
- **Family:** 4 (Schema mismatches)
- **Symptom:** 14 tickers silently missing signal fields; boot fetches silently skipped on failure; no contract between backend file generation and frontend consumption
- **Root cause:** No schema contract, no error logging on missing files, frontend loader and boot() silently continued with incomplete data
- **Fix (Wave 1):** Created initial `src/data/schema-manifest.js` with 2 per-ticker + 5 global files. Hardened loader.js signal data fetch with explicit error logging.
- **Fix (Wave 2):** Full reconciliation audit identified 12+ backend files and 11 frontend fetch paths. Expanded manifest to 3 per-ticker files (research, stocks, stocks-history), 5 boot files (index, reference, freshness, tc, announcements), 1 polling file (live-prices). Added per-file metadata (generatedBy, consumers, errorImpact), PAGE_DEPENDENCIES map, required field definitions for all file types, and `validateResearchFields()`/`validateReferenceFields()` helpers. Hardened `src/main.js boot()` with explicit error/warn logging on all 5 fetch failures. Loader now validates research required fields post-parse and warns on missing stocks signal fields.
- **Fix layer:** BOUNDARY
- **Regression gate:** 46 Vitest tests in `src/data/loader.test.js` (manifest completeness, criticality, page deps, field definitions, validation helpers, error handling)
- **Recurrence risk:** LOW -- manifest is the single source of truth; all fetch failures now logged; field validation catches missing data at load time

### 2026-03-31 BEAD-021: Dependency Pinning
- **Family:** 9 (CI pipeline fragility)
- **Symptom:** npm, Python, Docker, and GitHub Actions dependencies used range specifiers (`^`, `~`, `>=`, `@master`), allowing silent version drift between builds
- **Root cause:** No pinning discipline. 12 npm deps used `^`, 8 Python deps used `>=`, Dockerfile used `python:3.11-slim` (floating tag), fly-deploy.yml used `@master` for flyctl-actions
- **Fix:** Pinned all npm deps to exact resolved versions in package.json (12 packages). Pinned all Python deps to exact versions in api/requirements.txt (8 packages). Pinned Dockerfile base to `python:3.11.15-slim`. Pinned `superfly/flyctl-actions/setup-flyctl@1.5` in fly-deploy.yml.
- **Fix layer:** BOUNDARY
- **Regression gate:** `npm ci` validates lockfile matches pinned versions; any `^` or `~` in package.json is a visible diff
- **Recurrence risk:** LOW -- exact versions prevent silent upgrades; upgrades require explicit version bump

### 2026-03-31 BEAD-022: Post-Deploy Health Checks
- **Family:** 9 (CI pipeline fragility)
- **Symptom:** Fly.io deploys succeeded in CI without verifying the application was actually healthy. Broken deploys passed CI silently.
- **Root cause:** fly-deploy.yml had no post-deploy verification step. Deploy success meant only that `flyctl deploy` exited 0, not that the application was serving correctly.
- **Fix:** Added `post-deploy-health-check` job to fly-deploy.yml with `needs: deploy`. Three checks: (1) backend `/api/health` JSON status != "unhealthy", (2) frontend HTTP 200, (3) frontend content contains "Continuum Intelligence". 30s propagation delay. 15s timeouts per check.
- **Fix layer:** REGRESSION-GATE
- **Regression gate:** The health check itself is the gate -- runs automatically after every Fly.io deploy
- **Recurrence risk:** LOW -- every deploy now verified end-to-end before CI reports success

### 2026-03-31 BEAD-023: E2E Smoke Tests
- **Family:** 9 (CI pipeline fragility) + 1 (Encoding contamination, regression gate)
- **Symptom:** No automated browser-level verification of page rendering, routing, or encoding contamination. Rendering regressions only discovered by manual inspection.
- **Root cause:** Playwright was installed but tests only covered basic navigation. No console error detection, no encoding contamination check, no chat panel or portfolio upload zone verification.
- **Fix:** Added 4 new Playwright smoke tests: (1) console error detection on home page with backend-offline filters, (2) analyst chat panel existence/visibility, (3) portfolio upload zone presence, (4) critical encoding contamination check (null bytes, mojibake, smart quotes). Fixed playwright.config.js baseURL from stale GitHub Pages path to current Cloudflare Pages `/`. Total: 10 E2E smoke tests.
- **Fix layer:** REGRESSION-GATE
- **Regression gate:** `npx playwright test` in CI; encoding contamination test blocks if null bytes or mojibake detected in rendered report content
- **Recurrence risk:** LOW -- automated browser rendering verification catches regressions invisible to unit tests

### 2026-04-01 BEAD-018: Portfolio State Machine
- **Family:** 3 (Portfolio/PM state instability)
- **Symptom:** Portfolio state split across frontend globals, localStorage, and DB with no formalised transitions. 25 fix commits over 60 days. Short positions encoded in notes field because DB schema enforced positive-only quantities.
- **Root cause:** No state machine; implicit state derived from DOM visibility. Short position direction smuggled through notes field (`direction:short`) because `013_portfolios.sql` has `CHECK (quantity > 0)`.
- **Fix:** Created `src/features/portfolio-state.js` with explicit state machine (EMPTY, LOADING, READY, EDITING, SYNCING, ERROR). All transitions validated; invalid transitions throw. Observer pattern for consumers. Created migration `022_portfolio_signed_quantities.sql` to drop positive-only constraint and backfill shorts from notes. Updated `portfolio.js` to send signed quantities. Updated `portfolio_alignment.py` to read signed quantities with legacy notes fallback. Updated `portfolio_validation.py` to accept non-zero quantities.
- **Fix layer:** BOUNDARY
- **Regression gate:** 13 Vitest tests in `src/features/portfolio-state.test.js`
- **Recurrence risk:** LOW -- state machine enforces valid transitions; DB natively supports short positions

### 2026-04-01 BEAD-019: PM Chat State Integration
- **Family:** 3 (Portfolio/PM state instability)
- **Symptom:** PM Chat relied on multiple CustomEvent listeners (`ci:portfolio:synced`, `ci:portfolio:cleared`) and a startup HTTP check to track portfolio state. Events could be missed or arrive out of order.
- **Root cause:** No centralised state observation. PM Chat independently queried portfolio state through different mechanisms at different times.
- **Fix:** PM Chat now imports and observes portfolio state machine via `onStateChange()`. READY triggers badge refresh, EMPTY resets badge, ERROR shows error state. Legacy event listeners retained as backward compatibility during migration.
- **Fix layer:** BOUNDARY
- **Regression gate:** 4 Vitest tests in `src/features/pm-chat-state.test.js`
- **Recurrence risk:** LOW -- single observer pattern replaces multiple independent event listeners

---

## Bug Family 10: Silent Integration Degradation (No Reconciliation Loop)

**Occurrences:** 1 confirmed (NotebookLM), pattern likely present in other fire-and-forget integrations
**Period:** Since NotebookLM integration launch through 2026-04-02
**Files hit:** `api/notebook_context.py`, `api/main.py`, `api/refresh.py`, `data/config/notebooklm-notebooks.json`

### Pattern

External integration provisioning runs once (at add-stock or startup scaffold retry). If it fails silently (auth expired, timeout, transient error), the ticker is permanently degraded with no reconciliation process to detect or repair the gap. The system reports healthy because each individual failure is handled gracefully (returns None, logs warning, continues). The cumulative effect is invisible.

### Distinguishing characteristics

- Fire-and-forget provisioning with no periodic reconciliation
- Silent fallback that masks total integration failure (Analyst Chat works without corpus, just worse)
- No cross-reference between "what should exist" and "what does exist"
- JSON fallback file manually maintained, never synced from authoritative DB source

### 2026-04-02 BEAD-020: NotebookLM Registry Gap -- 24 of 45 Tickers Unprovisioned
- **Family:** 10 (Silent Integration Degradation)
- **Symptom:** Analyst Chat returned "meaningful gap" for management questions on GNP despite rich data existing in the NotebookLM notebook. Investigation revealed 24 of 45 tickers (53%) had no notebook ID in the registry. Zero tickers had persisted `notebookCorpus` in their research JSON.
- **Root cause:** `provision_notebook()` only ran at AddStock time (once) and startup scaffold retry (once). No process ever asked "which tickers have research but no notebook?" If auth was expired at provisioning time, the ticker silently got no notebook forever. The JSON registry (`data/config/notebooklm-notebooks.json`) was manually maintained with 22 entries and never synced from the DB. Track 6 in refresh silently skipped tickers without notebooks (returned empty dict).
- **Fix:** Added `ensure_all_notebooks()` to `api/notebook_context.py` which cross-references all research files against the DB registry, retries failed/timed-out entries, and provisions missing tickers sequentially. Called on startup (120s delay) and every 6 hours via periodic loop. Added admin endpoints: `POST /api/notebooks/ensure-all` (immediate trigger) and `POST /api/notebooks/sync-registry` (DB to JSON sync). Auth expiry still blocks provisioning but the next run after auth refresh catches everything missed.
- **Fix layer:** BOUNDARY (reconciliation loop at the registry level, not patching individual consumers)
- **Regression gate:** Fly.io logs `[NotebookSync]` entries on every startup and 6-hour cycle. `GET /api/notebooks/status` surfaces full registry state. `GET /api/notebooks/pending` lists unprovisioned tickers.
- **Recurrence risk:** LOW for notebook provisioning. MEDIUM for the general pattern -- other fire-and-forget integrations should be audited for the same silent degradation (see checklist below).

### Audit checklist for Family 10 pattern

When adding any new external integration, verify:
1. Is there a reconciliation loop that periodically checks "expected vs actual"?
2. Does silent failure aggregate into invisible degradation?
3. Is there an admin endpoint to surface the gap?
4. Does the periodic retry handle auth expiry recovery?
