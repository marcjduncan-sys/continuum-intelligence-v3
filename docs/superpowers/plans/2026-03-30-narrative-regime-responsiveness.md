# Narrative Regime Responsiveness -- Revised Implementation Plan

> **For agentic workers:** REQUIRED: Use subagent-driven-development to implement bead-by-bead.

**Goal:** Make CIv3's narrative analysis system detect and respond to macro regime breaks (war, oil shocks, rate shocks) in near-real-time, with staleness badges for users and a throttled refresh endpoint for admins.

**Architecture:** Extends existing macro data pipeline (FRED, EIA, Alpha Vantage, RBA clients + SECTOR_COMMODITY_MAP) with rolling statistics, threshold detection, staleness metadata on research JSON, and a frontend badge. No new external APIs required.

**Tech Stack:** Python 3.11+, FastAPI (Fly.io), Vanilla JS (Cloudflare Pages), existing macro clients.

**Platform:** Fly.io (`ci-api`, Sydney, shared-cpu-1x, 1GB RAM). Not Railway.

**Revised scope (2026-03-30):** Open questions resolved. BEADs 001-003 and 006 are small. BEADs 004-005 are medium. Total: 1-2 sessions.

---

## Session 1: BEADs 001 + 002 + 003 + 006 (data layer + refresh endpoint)

---

### BEAD-001: Add `_generation_meta` to Research Data Output

**Objective:** Stamp every narrative with the macro driver values that existed at generation time.

**Files:**
- Modify: `api/refresh.py`

**Injection points (2 locations):**

1. `_merge_updates()` at line ~2439 (where `_lastRefreshed` is written):
   ```python
   updated["_lastRefreshed"] = datetime.now(timezone.utc).isoformat()
   # ADD AFTER:
   updated["_generation_meta"] = _build_generation_meta(gathered)
   ```

2. `_merge_initiation()` at line ~2869 (same pattern for new coverage):
   ```python
   updated["_lastRefreshed"] = datetime.now(timezone.utc).isoformat()
   # ADD AFTER:
   updated["_generation_meta"] = _build_generation_meta(gathered)
   ```

**New helper function** (add near top of refresh.py, after imports):
```python
def _build_generation_meta(gathered: dict) -> dict:
    """Capture macro driver snapshot at narrative generation time."""
    meta = {"generated_at": datetime.now(timezone.utc).isoformat(), "drivers": {}}
    macro_ctx = gathered.get("macro_context") if gathered else None
    if macro_ctx:
        for cp in macro_ctx.get("commodity_prices", []):
            if cp.get("price") is not None:
                key = cp.get("name", cp.get("ticker", "unknown")).lower().replace(" ", "_")
                meta["drivers"][key] = {
                    "value": cp["price"],
                    "change_pct": cp.get("change_pct"),
                    "ticker": cp.get("ticker", ""),
                }
    return meta
```

**Acceptance criteria:**
- Every newly refreshed stock's JSON contains `_generation_meta.generated_at` (ISO 8601) and `_generation_meta.drivers` (dict of commodity/macro snapshots)
- Existing stocks without `_generation_meta` do not break any consumer (frontend checks `data._generation_meta` before use)
- `_save_research()` (line 606) writes it to disk as part of the normal save flow

**Tests:**
- Unit: `_build_generation_meta()` with mock gathered data (commodity prices present, absent, partial)
- Unit: missing `_generation_meta` in research JSON does not error in frontend `loadFullResearchData()`

---

### BEAD-002: Macro State GET Endpoint

**Objective:** Expose current macro variable values and rolling statistics via a new API endpoint.

**Files:**
- Modify: `api/main.py` (add endpoint)
- Read from: `macro_prices` table (populated by `av_macro_client.py`), `macro_series` table (populated by `fred_client.py`, `eia_client.py`, `rba_client.py`)

**Existing infrastructure (no new polling needed):**
- `api/clients/av_macro_client.py` -- `refresh_all_fx()` fetches 8 FX pairs every 15 min during trading hours. Stores in `macro_prices` table.
- `api/clients/fred_client.py` -- `refresh_all_fred()` fetches 32 series (US 10Y `DGS10`, Fed Funds, CPI, etc.) daily at 06:00 UTC. Stores in `macro_series` table.
- `api/clients/eia_client.py` -- `refresh_all_eia()` fetches WTI (`RWTC`) and Brent (`RBRTE`) daily at 06:00 UTC. Stores in `macro_series` table.
- `api/clients/rba_client.py` -- `refresh_all_rba()` fetches RBA cash rate, bond yields, AUD/USD, commodity indices daily at 07:00 UTC. Stores in `macro_series` table.
- `api/web_search.py:fetch_commodity_price()` (line 743) -- Yahoo Finance spot prices for `BZ=F` (Brent), `GC=F` (Gold), `HG=F` (Copper), etc. Called per-ticker during refresh.

**New endpoint:**
```python
@app.get("/api/macro/state", dependencies=[Depends(verify_api_key)])
async def macro_state():
    """Return current macro variable values for staleness calculation."""
    pool = app.state.pool
    # Query macro_prices for latest FX/commodity prices
    # Query macro_series for latest yields/rates
    # Return structured dict with: brent, gold, audusd, us10y, asx200, rba_cash
    # Include: current value, previous value, change_pct, fetched_at
```

**Rolling statistics:** Add a `_compute_rolling_stats()` helper that queries the last 30 days of values from `macro_series`/`macro_prices` tables and returns mean + stddev for each variable. This is the foundation for BEAD-004's threshold detection.

**Acceptance criteria:**
- `GET /api/macro/state` returns JSON with current values for: Brent crude, gold, AUD/USD, US 10Y yield, RBA cash rate
- Each value includes: `current`, `previous`, `change_pct`, `fetched_at`, `rolling_30d_mean`, `rolling_30d_stddev`
- Endpoint handles missing data gracefully (returns `null` for unfetched series)

**Tests:**
- Unit: `_compute_rolling_stats()` with sample data (normal, empty, single point)
- Integration: endpoint returns 200 with expected structure

---

### BEAD-003: Extend Sensitivity Map with Direction and Magnitude

**Objective:** Extend `SECTOR_COMMODITY_MAP` (or create a parallel config) with directional sensitivity and magnitude for regime detection.

**Files:**
- Create: `data/config/macro_sensitivity.json`
- Modify: `api/web_search.py` (load and expose the new config)

**Existing map** (`api/web_search.py` lines 27-361, 31 tickers):
```python
SECTOR_COMMODITY_MAP = {
    "WDS": {"label": "Oil & Gas / LNG Producer", "commodities": [
        {"ticker": "BZ=F", "name": "Brent Crude"},
        {"ticker": "NG=F", "name": "Natural Gas"}
    ], "macro_queries": [...]},
    # ... 30 more tickers
}
```

**New config file** (`data/config/macro_sensitivity.json`):
```json
{
    "_comment": "Directional sensitivity of each ticker to macro variables. Used by regime detector.",
    "WDS": {"brent": {"direction": "positive", "magnitude": "high"}, "audusd": {"direction": "negative", "magnitude": "low"}},
    "STO": {"brent": {"direction": "positive", "magnitude": "high"}},
    "BHP": {"iron_ore": {"direction": "positive", "magnitude": "high"}, "copper": {"direction": "positive", "magnitude": "medium"}},
    "CBA": {"us10y": {"direction": "positive", "magnitude": "medium"}, "rba_cash": {"direction": "positive", "magnitude": "high"}},
    "NST": {"gold": {"direction": "positive", "magnitude": "high"}},
    "...": "all 31 tickers mapped"
}
```

**Lookup utility** (add to `api/web_search.py` or new `api/macro_sensitivity.py`):
```python
def get_affected_tickers(macro_variable: str) -> list[dict]:
    """Return tickers sensitive to a given macro variable, with direction and magnitude."""

def get_ticker_drivers(ticker: str) -> list[dict]:
    """Return macro drivers for a given ticker, with direction and magnitude."""
```

**Acceptance criteria:**
- All 31 platform tickers mapped to at least one macro driver with direction (positive/negative/mixed) and magnitude (high/medium/low)
- Lookup by macro variable returns correct tickers
- Lookup by ticker returns correct drivers
- Config loads at startup alongside `SECTOR_COMMODITY_MAP`

**Tests:**
- Unit: lookup functions return correct results for known tickers/variables
- Unit: all tickers in `SECTOR_COMMODITY_MAP` have a sensitivity entry

---

### BEAD-006: Regime-Aware Refresh Endpoint

**Objective:** Add a `POST /api/regime/refresh` endpoint that triggers narrative regeneration with regime context injected into the existing prompt template.

**Files:**
- Modify: `api/main.py` (add endpoint)
- Modify: `api/refresh.py` (add `regime_context` parameter to the synthesis prompt injection)

**Prompt injection point** (4 locations in refresh.py where `macro_section` is built):
- Lines 1440-1467 (evidence update)
- Lines 1503-1533 (initial coverage)
- Lines 1884-1965 (hypothesis synthesis -- most important)
- Lines 1590-1662 (structure update)

**At each injection point, after `macro_section`:**
```python
regime_section = ""
if regime_context:
    regime_section = (
        f"\n## REGIME BREAK ALERT\n"
        f"A material macro regime change has been detected since the last analysis:\n"
        f"- Variable: {regime_context['variable']}\n"
        f"- Previous (30d mean): {regime_context['baseline']}\n"
        f"- Current: {regime_context['current']}\n"
        f"- Move: {regime_context['change_pct']:.1f}% ({regime_context['sigma']:.1f} sigma)\n\n"
        f"CRITICAL: Your hypothesis reweighting and narrative MUST explicitly address this regime change. "
        f"Do not treat this as incremental drift -- it is a structural shift in the operating environment.\n"
    )
```

**New endpoint:**
```python
@app.post("/api/regime/refresh", dependencies=[Depends(verify_api_key)])
async def regime_refresh(body: RegimeRefreshRequest):
    """Trigger narrative refresh for tickers affected by a macro regime break.

    Throttled: max 3 concurrent, max 24/hour.
    """
    # Validate tickers against SECTOR_COMMODITY_MAP
    # Queue refreshes with regime_context passed through to refresh pipeline
    # Return: { "queued": ["WDS", "STO"], "rate_limited": [], "unknown": [] }
```

**Throttle:** Use existing `asyncio.Semaphore(3)` pattern (matches `gather_all_data()` concurrency). Add hourly counter with `time.time()` ring buffer.

**Acceptance criteria:**
- Endpoint accepts ticker list + regime event context
- Max 3 concurrent refreshes, max 24/hour
- Regime context appears in the LLM prompt alongside existing macro_section
- Refreshed narratives include updated `_generation_meta` (from BEAD-001)
- Endpoint returns status per ticker (queued/rate-limited/unknown)
- Existing refresh pipeline unchanged when `regime_context` is None

**Tests:**
- Unit: throttle logic (concurrent limit, hourly cap)
- Unit: regime context formatting
- Integration: single-ticker refresh with mock regime context

---

## Session 2: BEADs 004 + 005 (detection logic + frontend badge)

---

### BEAD-004: Regime Break Detection Logic

**Objective:** Threshold-based regime break detection that fires when a macro variable breaches defined thresholds.

**Files:**
- Create: `api/regime_detector.py`

**Consumes:**
- Rolling statistics from BEAD-002's `_compute_rolling_stats()`
- Sensitivity map from BEAD-003's `macro_sensitivity.json`

**Detection rules:**
- Fire when any macro variable moves >15% from its 30-day rolling mean
- Fire when any macro variable moves >2 standard deviations from its 30-day rolling mean
- Either threshold triggers (OR logic)
- Cooldown: 4 hours per variable (configurable). Second breach within window suppressed.

**Regime event structure:**
```python
@dataclass(frozen=True)
class RegimeEvent:
    variable: str           # e.g., "brent"
    current: float
    baseline: float         # 30d rolling mean
    change_pct: float
    sigma: float            # number of standard deviations
    timestamp: str          # ISO 8601
    affected_tickers: list  # from sensitivity map
```

**Integration:** Called after each macro data refresh cycle (scheduler runs FRED/EIA/RBA/FX on fixed schedules). When a `RegimeEvent` fires, log it and optionally call BEAD-006's endpoint.

**Acceptance criteria:**
- Fires correctly on >15% move or >2-sigma move
- Does not fire below both thresholds
- Cooldown suppresses repeated alerts for same variable within 4 hours
- Affected tickers correctly populated from sensitivity map
- All events logged for audit trail

**Tests:**
- Unit: threshold calculation (15% move, 2-sigma, both, neither)
- Unit: cooldown logic (within window suppressed, after window fires)
- Unit: affected ticker list matches sensitivity map
- Integration: mock data through detector, verify event fires

---

### BEAD-005: Staleness Badge (Frontend)

**Objective:** Display a staleness badge on the report page when the narrative's key drivers have moved materially since generation.

**Files:**
- Create: `src/features/staleness-badge.js`
- Modify: `src/pages/report-sections.js` (inject badge into hero)
- Create: `src/styles/staleness.css` (scoped styles)
- Modify: `src/styles/tokens.css` (add staleness colour tokens if needed)

**Injection point in hero** (`src/pages/report-sections.js` line ~233, inside `refresh-controls` div):
```html
<div class="refresh-controls">
  <button class="btn-refresh">...</button>
  <!-- INJECT STALENESS BADGE HERE -->
  <span class="refresh-timestamp">Last updated: ...</span>
</div>
```

**Data flow:**
1. `loadFullResearchData()` returns `data._generation_meta` (from BEAD-001)
2. Frontend calls `GET /api/macro/state` (from BEAD-002) to get current values
3. Compare `data._generation_meta.drivers` against current macro state
4. If any driver moved >15%: render amber badge
5. If any driver moved >30%: render red badge
6. Badge text: "[Driver] was [old value] when this analysis was written. It is now [current value] ([+/-X%])."
7. Show the most-material driver (largest percentage deviation)

**Graceful degradation:**
- No `_generation_meta` in data: no badge (existing stocks before BEAD-001)
- `GET /api/macro/state` fails: no badge (network error, backend down)
- No matching drivers between generation meta and macro state: no badge

**Acceptance criteria:**
- Badge appears when any driver moved >15% since generation
- Badge colour: amber (15-30%), red (>30%)
- Badge highlights the largest deviation when multiple drivers moved
- No badge for stocks without `_generation_meta`
- No badge when macro state endpoint is unavailable
- Styles scoped with `.staleness-*` prefix
- Light theme overrides included

**Tests:**
- Unit: staleness score calculation (0%, 15%, 30%, 50% moves)
- Unit: badge render with test data (amber, red, absent)
- Unit: most-material-driver selection
- Regression: report page renders correctly without `_generation_meta`

---

## Verification (end of Session 2)

- [ ] `npm run test:unit` -- all Vitest pass
- [ ] `python -m pytest api/tests/ -v --timeout=30` -- all pytest pass
- [ ] `npm run build` -- clean build
- [ ] Manual: load a stock page, confirm no badge appears (no `_generation_meta` yet)
- [ ] Manual: after next batch refresh, confirm `_generation_meta` appears in research JSON
- [ ] Manual: `GET /api/macro/state` returns current values
- [ ] Manual: `POST /api/regime/refresh` with test ticker returns expected response

---

## Dependency Graph

```
BEAD-001 (schema)  ──┐
                     ├──> BEAD-005 (badge, needs 001 + 002)
BEAD-002 (endpoint) ──┤
                     ├──> BEAD-004 (detector, needs 002 + 003)
BEAD-003 (map)      ──┤
                     └──> BEAD-006 (refresh, needs 001 + 004)

Session 1: 001 + 002 + 003 + 006 (all independent except 006 needs 001)
Session 2: 004 + 005 (both need Session 1 outputs)
```

---

## Thesis Monitor Ruling

Regime-triggered hypothesis shifts that fire thesis monitor alerts (Rules 1 and 2 in `src/features/thesis-monitor.js` lines 132-185) are **correct behaviour**, not false positives. The user's saved thesis IS stale relative to the regime shift. No exemption flag needed. The monitor is working as designed.
