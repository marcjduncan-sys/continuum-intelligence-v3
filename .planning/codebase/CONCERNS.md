# Codebase Concerns

**Analysis Date:** 2026-02-19

## Tech Debt

### Data Persistence Layer Not Implemented

**Issue:** Narrative engine state lives only in browser memory with no server-side persistence.

**Files:**
- `js/dne/app.js` (lines 51-57)
- `js/dne/engine.js` (narrative flip logic)
- `js/dne/price-signals.js` (signal generation)

**Impact:**
- Page refresh loses all dynamically generated narrative analysis state (alert conditions, flips, confidence scores)
- Editorial overrides and narrative locks do not persist between sessions
- No audit trail of when narrative hypotheses changed or why
- Data inconsistency if multiple browser tabs are open simultaneously

**Fix approach:**
Implement server-side persistence via backend API endpoint (likely FastAPI at `api/main.py`). Save stock state mutations to database after each significant event (flip, alert, override). Restore state on page load from API endpoint.

---

### Global State via `window` Object

**Issue:** DNE engine exposes global functions and state directly on `window` object instead of encapsulated modules.

**Files:**
- `js/dne/app.js` (lines 97-98: `window.DNE_STOCK`, `window.DNE_RULES`, `window.saveStockData`)
- `js/dne/engine.js` (global function `recalculateSurvival`)
- `js/dne/evidence.js` (global constants and functions)
- `js/dne/price-signals.js` (global function `evaluatePriceSignals`)
- `js/dne/weighting.js` (global function `computeNarrativeWeighting`)

**Impact:**
- Risk of name collisions with other scripts on same page
- No namespace isolation; debugging and testing difficult
- Implicit coupling between modules makes refactoring risky
- State mutations unpredictable across loaded scripts

**Fix approach:**
Refactor from IIFE (Immediately Invoked Function Expression) global pattern to ES6 modules with explicit imports. Define single `DNE` namespace object and attach all modules to it. Update `app.js` to require all dependencies explicitly.

---

### Hardcoded Configuration Values Scattered Across Codebase

**Issue:** Magic numbers and string literals embedded in logic without centralized configuration.

**Files:**
- `js/dne/price-signals.js` (lines 53, 66, 68, 72, 75, 78, 84-85, 88, 91, 94): hardcoded percentage thresholds (0.05, 0.10, 0.08, 3.0, 1.5)
- `js/dne/evidence.js` (lines 15-20): survival thresholds (0.7, 0.4, 0.2)
- `js/dne/engine.js` (line 146): hardcoded trading day threshold (2 days for alert→flip)
- `scripts/update-prices.js` (line 25): hardcoded MAX_HISTORY = 252 trading days
- `api/config.py` (lines 18-19): hardcoded MAX_PASSAGES = 12, MAX_CONVERSATION_TURNS = 20

**Impact:**
- Changing thresholds requires code edits across multiple files
- No audit trail of when/why thresholds changed
- A/B testing or threshold tuning difficult
- Risk of inconsistent values across files

**Fix approach:**
Consolidate all thresholds and magic numbers into configuration objects. Store in `data/config/` alongside existing `price_rules.json`. Load centrally in app initialization.

---

## Known Bugs

### Narrative Flip Not Respecting 2-Trading-Day Confirmation Period

**Symptoms:**
Narrative can flip from T1 to T2/T3/T4 on a single large price move despite documented requirement for 2 trading days of sustained alternative dominance.

**Files:** `js/dne/engine.js` (lines 146-157)

**Trigger:**
On critical price signal (e.g., `INTRADAY_DROP_10` with `can_trigger_immediate_flip: true`), the flip occurs immediately without checking how long the alternative hypothesis has been HIGH. The 2-day check exists but is only for alert→flip transition, not for immediate critical-signal flips.

**Workaround:**
Editorial override can lock narrative back to dominant state (line 99-112 of `engine.js`), but this requires manual intervention.

**Reproduction:**
1. Stock in T1 dominant state
2. Trigger `INTRADAY_DROP_10` (≤-10% intraday) with critical signal config
3. Observe immediate flip to T3/T4 without 2-day confirmation

---

### Price History Array Grows Unbounded

**Issue:** `price_history` array in stock data has no enforced maximum length, only soft limit via `MAX_HISTORY = 252`.

**Files:**
- `scripts/update-prices.js` (lines 24-25, 113-127)
- `data/stocks/*.json` (price_history arrays)

**Impact:**
- Stock JSON files grow indefinitely with each price update
- Larger file size = slower parsing on page load
- Page memory usage increases with each visited stock
- Over months, could reach multi-MB per stock file

**Cause:**
Limit is enforced in Node.js script but not validated in browser DNE engine. If backend persistence is added (see Tech Debt), this soft limit won't be enforced there.

**Fix approach:**
Add validation in `price-signals.js` to truncate history to MAX_HISTORY after each price update. Persist truncated version back to server.

---

### CORS Wildcard Allows Any Origin

**Issue:** Python FastAPI allows requests from any origin via wildcard.

**Files:** `api/main.py` (line 70)

```python
allow_origins=config.ALLOWED_ORIGINS + ["*"],
```

**Impact:**
- Any web origin can call research chat API
- Potential for API abuse, rate limit exhaustion
- If credentials are ever added, they could be leaked

**Risk Level:** Medium (depends on deployment environment and rate limiting)

**Fix approach:**
Remove wildcard. Replace with explicit allowlist in `config.ALLOWED_ORIGINS`. Enforce strict origin validation.

---

### No Validation of Stock Data Structure on Load

**Issue:** When stock JSON loads in `app.js`, no schema validation occurs. If data is malformed, engine silently fails.

**Files:** `js/dne/app.js` (lines 74-92)

**Impact:**
- Missing required fields (e.g., `hypotheses`, `price_signals`) cause undefined reference errors in engine
- No clear error message to user about what went wrong
- Silent failures make debugging difficult

**Trigger:** Manually editing `data/stocks/*.json` and introducing missing fields

**Fix approach:**
Add schema validator function. Check for required top-level keys: `hypotheses` (object with T1-T4), `price_signals` (array), `evidence` (array). Return detailed error message on validation failure.

---

## Security Considerations

### HTML Injection via `innerHTML` in UI Rendering

**Risk:** Content from hypothesis labels, evidence text, and narrative history is injected into DOM via `innerHTML` without sanitization.

**Files:**
- `js/dne/ui.js` (lines 138, 162, 221, 340)
- Specifically: `container.innerHTML = html` where `html` is constructed from stock data

**Current Mitigation:**
Function `escapeHtml()` exists but is called inconsistently. Not all text content is escaped before `innerHTML` assignment.

**Recommendations:**
1. Use `textContent` instead of `innerHTML` for user-generated content
2. If HTML formatting is needed, use a safe DOM API: `document.createElement()` + `appendChild()`
3. Run security audit on all `innerHTML` assignments; search codebase for pattern and enforce escapeHtml() consistently

---

### API Key Exposure in Config Logging

**Risk:** `api/main.py` logs ANTHROPIC_API_KEY presence in plaintext at startup.

**Files:** `api/main.py` (lines 36-41)

```python
elif not config.ANTHROPIC_API_KEY.startswith("sk-ant-"):
    logger.warning("ANTHROPIC_API_KEY does not look like a valid Anthropic key")
```

**Current Mitigation:**
Key value is NOT logged, only prefix check is logged. Risk is low.

**Recommendations:**
Still avoid any reference to key value or format in logs. Use generic message: "ANTHROPIC_API_KEY is configured" without any format checking.

---

### No Authentication on Research Chat Endpoint

**Risk:** `/api/research-chat` endpoint is publicly accessible with no authentication.

**Files:** `api/main.py` (lines 190-281)

**Impact:**
- Any client can call endpoint and consume API quota
- No rate limiting visible in code
- Anthropic API calls are expensive; vulnerable to abuse

**Recommendations:**
1. Add API key authentication (bearer token in Authorization header)
2. Implement per-client rate limiting (e.g., 10 requests/minute)
3. Add user session management if this moves beyond research tool
4. Log all API calls with client ID for audit trail

---

### Research Passages Not Validated Before Sending to LLM

**Risk:** Passages retrieved and passed to Claude are not validated for malicious content.

**Files:** `api/retriever.py` and `api/main.py` (lines 244-254)

**Impact:**
- If stock data is compromised, malicious prompts could be injected into Claude context
- LLM prompt injection attack surface

**Recommendations:**
1. Validate passage content length and format
2. Add content moderation check before sending to Claude (check for suspicious patterns)
3. Log all passages sent to Claude for audit trail

---

## Performance Bottlenecks

### Research Data Loaded Entirely into Memory at Startup

**Issue:** All research passages for all stocks loaded into memory during API startup.

**Files:** `api/main.py` (lines 43-53, `ingest()` function in `ingest.py`)

**Impact:**
- Large memory footprint if coverage universe grows (currently 20+ stocks)
- Slow startup time (scores of seconds for large corpus)
- No pagination or lazy-loading of passages

**Current state:** Takes ~2-5 seconds on typical machine. Scales linearly with stock count.

**Improvement path:**
1. Index passages to SQLite or similar lightweight DB
2. Load only passages for requested ticker on demand
3. Implement LRU cache for frequently-accessed stocks
4. Measure memory usage per ticker; if >50MB per stock, implement chunking

---

### BM25 Ranking Recalculated on Every Query

**Issue:** `retriever.py` rebuilds BM25 index from scratch for every query.

**Files:** `api/retriever.py` (lines 239-241)

```python
bm25 = BM25(passages)
scored = bm25.score(query)
```

**Impact:**
- O(n) IDF calculation per query
- Noticeable latency if passage corpus is large (>1000 passages)

**Improvement path:**
1. Pre-compute IDF at startup
2. Cache BM25 index or use persistent search library (e.g., Whoosh, Elasticsearch)
3. For now, acceptable if corpus stays <5000 passages

---

### 15-Minute Price Refresh Loop Blocks UI

**Issue:** Price fetch and signal evaluation in `price-signals.js` (lines 147-200) happens on main thread.

**Files:** `js/dne/price-signals.js` (function `startNarrativeRefresh()`)

**Impact:**
- If price fetch is slow or rules evaluation is expensive, page freezes
- No indication to user that refresh is in progress

**Improvement path:**
1. Move price fetch to Web Worker
2. Post signals back to main thread for UI update
3. Add spinner/indicator during refresh

---

## Fragile Areas

### Narrative Flip Logic Is Complex and Tightly Coupled

**Files:** `js/dne/engine.js` (lines 97-209)

**Why fragile:**
- `checkNarrativeFlip()` has multiple conditional branches checking alert state, trading days, override status
- Logic depends on global constants from `evidence.js` (SURVIVAL_THRESHOLDS, HYPOTHESIS_IDS)
- Mutation of stock object deep in recursion; state changes scattered across file
- No clear invariants or preconditions documented

**Safe modification:**
1. Add comprehensive comments explaining each state transition
2. Extract flip logic into separate function per state (alert→flip, override→restore)
3. Add unit tests for each branch (requires refactor to testable module)
4. Before changing thresholds, run through all test cases manually

**Test coverage gaps:**
- No tests for flip logic (only happy path in `tests/data-integrity.test.js`)
- No edge case tests: multiple rapid signals, overlapping overrides, timezone edge cases

---

### Editorial Override Can Persist Indefinitely

**Files:** `js/dne/override.js` (lines 31-57)

**Why fragile:**
- Override expiry stored as ISO timestamp in stock JSON
- If clock on client machine is wrong, override may persist longer than intended
- No server-side validation of expiry time

**Safe modification:**
1. Move override expiry validation to backend
2. Server should check expiry on every request, not trust client
3. If no backend persistence, add local validation: if override.until < now, clear it on page load

---

### Price Rules Configuration Not Validated Against Stock Data

**Files:** `data/config/price_rules.json` and `js/dne/price-signals.js`

**Why fragile:**
- If price_rules.json specifies a rule ID (e.g., "EARNINGS_MISS_5") but priceData doesn't have the required field (e.g., "earnings_surprise"), the rule silently does nothing
- No error if rule condition references undefined property

**Safe modification:**
1. Add schema validation for price_rules.json at startup
2. Check that all properties referenced in rule conditions exist in priceData
3. Log warnings for unrecognized rule IDs

---

## Scaling Limits

### ASX Data Only; Non-Extensible Stock Universe

**Current capacity:** 20 stocks (WOW, CSL, XRO, etc.)

**Limit:**
Script-based data pipeline (`event-scraper.js`, `narrative-generator.js`) manually added per ticker. No dynamic ticker registry expansion.

**Scaling path:**
1. Already started: `scripts/lib/registry.js` centralizes ticker list
2. Add admin endpoint to add/remove tickers without code changes
3. Implement ticker onboarding workflow (validate data, configure hypotheses, seed analysis)

---

### GitHub Actions Scheduler Not Resilient to Failures

**Issue:** Event scraper and narrative generator run on fixed 2x daily schedule via GitHub Actions.

**Impact:**
- If scraper fails, narrative generator still runs on stale data
- No exponential backoff; hard failures cascade
- No alerting if pipeline fails silently

**Improvement path:**
1. Add error handling and retry logic to scripts
2. Send slack/email alert if any step fails
3. Implement health check endpoint to validate data freshness

---

## Dependencies at Risk

### Yahoo Finance API Fragility

**Risk:** Event scraper and price fetcher depend on Yahoo Finance free APIs (no auth).

**Files:**
- `scripts/event-scraper.js` (lines 44-71)
- `scripts/update-prices.js` (lines 50-83)
- `js/dne/price-signals.js` (lines 147-180)

**Impact:**
- Yahoo can change API without notice
- Rate limiting can cause cascading failures
- Delayed quotes (15-20 min) lag ASX
- Cookie/crumb auth fragile; can break suddenly

**Migration plan:**
1. Evaluate paid APIs: ASX Official, Bloomberg, Bloomberg Open API
2. Implement adapter pattern for price feed (allow multiple sources)
3. Add fallback to previous price if fetch fails
4. Cache prices locally with last-update timestamp

---

### FastAPI Version Pinning Weak

**Issue:** `api/requirements.txt` likely has loose version pins (or no requirements.txt).

**Files:** `api/main.py` uses FastAPI, anthropic SDK

**Impact:**
- Breaking changes in dependencies could break deployment
- No reproducible builds across environments

**Recommendations:**
1. Generate `requirements.txt` with exact versions: `pip freeze > requirements.txt`
2. Regularly audit for security updates: `pip-audit`
3. Test dependency upgrades in CI before deploying

---

## Missing Critical Features

### No A/B Testing or Threshold Tuning Infrastructure

**Problem:**
Narrative thresholds (alert → flip at 2 days, survival scores, hypothesis sensitivity) are not tunable without code changes. No way to measure impact of different thresholds on user engagement or accuracy.

**Blocks:**
- Hypothesis calibration workflow
- Model improvement iteration
- Data-driven decision making on narrative parameters

---

### No Audit Log of Narrative State Changes

**Problem:**
When narrative hypothesis changes or flips, no persistent record of:
- What triggered the change (price signal, editorial override, etc.)
- When it happened (timestamp)
- Who triggered it (if editorial)
- What evidence was considered

**Blocks:**
- User trust (no transparency into why narrative changed)
- Debugging (can't replay narrative logic)
- Regulatory compliance (if applicable)

---

### No Multi-User Collaboration on Editorial Overrides

**Problem:**
Editorial override stored in stock JSON with no access control. If multiple analysts access same stock, they can overwrite each other's overrides without knowing.

**Blocks:**
- Team workflows
- Audit trail of who changed what
- Conflict resolution

---

## Test Coverage Gaps

### No Tests for Core DNE Engine Logic

**What's not tested:**
- `recalculateSurvival()` function (main scoring logic)
- `checkNarrativeFlip()` function (all branches)
- Evidence decay calculations with various time windows
- Price signal evaluation against all rule types

**Files:** `js/dne/engine.js`, `js/dne/price-signals.js`

**Risk:** High. Changes to scoring logic can introduce bugs that go undetected.

**Priority:** High. Add unit tests for all hypothesis scoring functions.

---

### No Integration Tests for Data Pipeline

**What's not tested:**
- Full flow: event scraper → narrative generator → HTML update
- Data consistency: prices parsed correctly, written to JSON, read back by UI
- Error recovery: if scraper fails, what state is left?

**Files:** `scripts/event-scraper.js`, `scripts/narrative-generator.js`, `scripts/update-html.js`

**Risk:** Medium. Pipeline errors could silently corrupt data.

**Priority:** Medium. Add end-to-end tests using mock data.

---

### No Tests for API Request Validation

**What's not tested:**
- Invalid ticker in `/api/research-chat` request
- Missing required fields in request body
- Malformed thesis_alignment values
- Oversized conversation history

**Files:** `api/main.py` (lines 190-281)

**Risk:** Medium. Invalid requests could cause crashes.

**Priority:** Medium. Add request validation tests.

---

### No Load/Stress Testing

**What's not tested:**
- API performance under concurrent requests (e.g., 100 simultaneous chat queries)
- Memory usage with large stock data sets
- Browser performance rendering 20+ stocks with active DNE engine

**Risk:** Low (not user-facing yet). Will become critical if deployed publicly.

**Priority:** Low now, High before public launch.

---

## Data Quality Issues

### Stock JSON Schema Drift

**Issue:** Stock JSON files in `data/stocks/` and `data/research/` have evolved with new features added, but old stocks may lack new fields.

**Files:** All files in `data/stocks/` and `data/research/`

**Impact:**
- DNE engine expects all stocks to have `weighting`, `price_history`, `alert_state` fields
- Missing fields cause undefined reference errors
- No schema validation on load

**Recommendations:**
1. Define JSON Schema for stock data
2. Add migration script to backfill missing fields with defaults
3. Validate all stock files on startup

---

## Summary: Immediate Action Items

**Critical (fix before next deploy):**
1. Add validation for stock data schema on page load
2. Add data persistence backend for narrative state
3. Remove CORS wildcard from API

**High (fix within sprint):**
1. Consolidate magic numbers into configuration
2. Add unit tests for DNE scoring engine
3. Add HTML sanitization audit to UI rendering
4. Implement narrative flip confirmation period correctly

**Medium (roadmap):**
1. Add audit log for narrative changes
2. Implement editorial override access control
3. Upgrade price feed to paid reliable source
4. Optimize BM25 indexing for API performance

---

*Concerns audit: 2026-02-19*
