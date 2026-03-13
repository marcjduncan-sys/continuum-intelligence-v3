# Task Tracker

<!-- Claude: update this file as you work. Check items off, add review notes, track blockers. -->

## Current Task

**Price Driver Agent -- Phase 10: Short-term Price Attribution**

Build a daily-scheduled agent that discovers what drove each stock's share price movement over the last 5-10 trading days. Three-pass LLM pipeline (research, red-team, synthesis) with programmatic data gathering. Output renders in the report page just above "WHAT THE PRICE EMBEDS".

---

## Architecture

### Data Flow
1. **Cron** (08:00 AEDT / 22:00 UTC) triggers `POST /api/agents/drivers/scan`
2. **Scan** iterates all tickers with active research data
3. **Per ticker**: programmatic data gathering → 3 LLM passes → store in PostgreSQL
4. **Frontend**: fetches `GET /api/agents/drivers/{ticker}/latest` on report page load
5. **Render**: new block in report hero, just above "WHAT THE PRICE EMBEDS"

### Pipeline (per ticker, ~60s)
- **Layer 0 -- Data Gathering** (parallel, ~15s)
  - Yahoo Finance: 10-day OHLCV + 30-day volume baseline + ASX200 index
  - ASX announcements (14 days, existing `fetch_asx_announcements`)
  - DuckDuckGo: company news, earnings, macro, broker research, HotCopper snippets, Reddit
  - Commodity/FX prices for sector-relevant pairs (existing `fetch_commodity_price`)
- **Layer 1 -- Research Pass** (Claude Sonnet, ~15s)
  - Scores and classifies candidate drivers using the 5-factor grid
  - Produces evidence pack JSON
- **Layer 2 -- Red-Team Pass** (Claude Sonnet, ~10s)
  - Challenges conclusions, proposes alternatives, adjusts confidence
- **Layer 3 -- Final Synthesis** (Claude Sonnet, ~10s)
  - Merges research + red-team into final output JSON
  - Produces `report_text` prose paragraphs

### LLM Model
All 3 passes: `claude-sonnet-4-6` (existing `config.ANTHROPIC_MODEL`)

---

## Wave 1: Backend Core

- [ ] **1A** -- `api/migrations/010_price_drivers.sql`
- [ ] **1B** -- `api/config.py` -- add `PRICE_DRIVERS_SECRET`
- [ ] **1C** -- `api/price_drivers.py` -- data gathering layer (reuse `web_search.py`)
- [ ] **1D** -- `api/price_drivers.py` -- 3 LLM passes (research, red-team, synthesis)
- [ ] **1E** -- `api/price_drivers.py` -- cache, entry point, health check, DB storage

## Wave 2: API Endpoints

- [ ] **2A** -- `GET /api/agents/drivers/{ticker}` (on-demand, API key, 1/min rate limit)
- [ ] **2B** -- `POST /api/agents/drivers/scan` (batch, X-Drivers-Secret header)
- [ ] **2C** -- `GET /api/agents/drivers/{ticker}/latest` (fetch cached, API key)

## Wave 3: Frontend Rendering

- [ ] **3A** -- `renderPriceDrivers()` in `report-sections.js`
- [ ] **3B** -- Insert block into `renderReportHero()` above "WHAT THE PRICE EMBEDS"
- [ ] **3C** -- Async fetch on report page load in `report.js`

## Wave 4: Scheduling + Deployment

- [ ] **4A** -- `.github/workflows/price-drivers.yml` (cron `0 22 * * *`)
- [ ] **4B** -- Add `PRICE_DRIVERS_SECRET` to Railway + GitHub Secrets
- [ ] **4C** -- Push, verify Railway health, trigger workflow_dispatch test

---

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS price_driver_reports (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(10) NOT NULL,
    report_json JSONB NOT NULL,
    analysis_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '48 hours',
    UNIQUE(ticker, analysis_date)
);
CREATE INDEX idx_pdr_ticker_date ON price_driver_reports(ticker, analysis_date DESC);
CREATE INDEX idx_pdr_expires ON price_driver_reports(expires_at);
```

## Endpoint Signatures

```
GET  /api/agents/drivers/{ticker}         — run now (API key, 1/min)
POST /api/agents/drivers/scan             — batch (X-Drivers-Secret)
GET  /api/agents/drivers/{ticker}/latest   — cached result (API key)
```

---

## Backlog (unchanged)

- [ ] Mandatory login enforcement
- [ ] Gold agent section rendering (Wave 1-3 from previous plan)
- [ ] Technical analysis agent
- [ ] Rates/property/banks agent
- [ ] OHLCV Railway proxy
