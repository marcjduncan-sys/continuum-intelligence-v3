# Continuum Intelligence v3 — CLAUDE.md

## Project Overview

21-stock ASX equity research SPA. Vanilla HTML/JS/CSS frontend on GitHub Pages, Python/FastAPI backend on Railway. Single-page application with hash-based routing. All research data stored as per-ticker JSON files in `data/research/`.

**Live URLs:**
- Frontend: GitHub Pages (marcjduncan-sys/continuum-intelligence-v3)
- Backend: `https://imaginative-vision-production-16cb.up.railway.app`
- Frontend sets `REFRESH_API_BASE` to Railway URL when on GitHub Pages

**21 Tickers:** BHP, CBA, CSL, DRO, DXS, FMG, GMG, GYG, HRZ, MQG, NAB, OCL, PME, RFG, RIO, SIG, WDS, WOR, WOW, WTC, XRO

---

## Architecture

### Frontend (index.html — ~13,700 lines)
- Monolithic SPA: all HTML, CSS, JS in one file plus external modules in `js/` and `css/`
- Hash-based routing via `route()` function
- `STOCK_DATA` object is the central in-memory data store, hydrated from `_index.json` then lazy-loaded per ticker
- Live prices via `MarketFeed` IIFE polling Yahoo Finance
- See `MODULE_MAP.md` for detailed line ranges and coupling matrix

### Backend (api/)
- `main.py` — FastAPI app, chat endpoints, refresh endpoints, static file serving
- `refresh.py` — 4-stage refresh pipeline with in-memory job tracking
- `config.py` — env vars (ANTHROPIC_API_KEY, GEMINI_API_KEY, model names)
- `ingest.py` / `retriever.py` — BM25 passage retrieval for RAG chat
- `gemini_client.py` — Gemini API wrapper for specialist analysis
- `web_search.py` — Data gathering (Yahoo Finance, ASX, news)

### Refresh Pipeline (4 stages)
1. **gathering_data** — `gather_all_data()` fetches Yahoo Finance, ASX announcements, news
2. **specialist_analysis** — Gemini extracts structured evidence updates
3. **hypothesis_synthesis** — Claude re-weights hypotheses, updates narrative (temperature=0)
4. **writing_results** — Merge into research JSON, update index

### Batch Refresh
- `POST /api/refresh-all` accepts optional `{"tickers": [...]}` body for partial retry
- `GET /api/refresh-all/status` polls batch progress
- `GET /api/refresh/{ticker}/result` fetches single ticker result
- Dual semaphore concurrency control: `_gather_semaphore(3)` for Stage 1, `_batch_semaphore(2)` for Stages 2-3

---

## Critical Lessons (Do Not Repeat)

### Railway Ephemeral Filesystem
Railway restarts wipe BOTH in-memory state AND disk writes. Never rely on server-side persistence for batch operations. All persistence must flow through the frontend to localStorage.

### Batch Refresh Must Cache Incrementally
The original design cached all results only after the entire batch completed. When Railway restarted mid-batch, ALL completed work was lost. The fix: `_fetchAndCacheSingleTicker()` caches each ticker to localStorage as soon as it completes, using the `_batchCachedTickers` tracking object. This is non-negotiable.

### Concurrency Causes OOM on Railway
Firing 21 `gather_all_data()` calls simultaneously caused out-of-memory crashes. The gather semaphore (3) and LLM semaphore (2) exist to prevent this. Do not increase these without testing on Railway's actual memory limits (~512MB).

### Server Restart Detection
Frontend polling detects 404 from `/api/refresh-all/status` and shows "Server restarted. N tickers cached." with the retry button re-enabled. On retry, only uncached tickers are sent via `{"tickers": [...]}` body. `_batchCachedTickers` is preserved across retries (never reset on new trigger).

### localStorage Key Format
Research data uses `ci_research_` prefix (e.g., `ci_research_BHP`). NOT `continuum_research_`. Check before assuming.

### Git Push After Edits
Always `git pull --rebase origin main` before pushing. The remote frequently has newer commits from automated market updates.

---

## File Coupling Warnings

### Do Not Modify Without Full Impact Analysis
- `computeSkewScore()` — 5+ callers across home, reports, snapshots, portfolio
- `prepareHypotheses()` — remaps N1-N4 labels across evidence, discriminators, tripwires, gaps, verdict, alignment table
- `route()` — master router, controls all page activation
- `loadFullResearchData()` — feeds all report/snapshot renders
- `data-ticker-card` attribute — queried by live price updater
- `.fc-price` class — queried by live price updater

### CSS Scoping Rule
Never edit shared CSS classes (`.hero`, `.site-footer`, `.section-header`, `.skew-badge`, etc.) directly. Always scope with page ID: `#page-home .hero-title { ... }`

### Currency Normalisation
When merging refreshed data into STOCK_DATA, the currency field must be normalised: `AUD` -> `A$`, `USD` -> `US$`, `GBP` -> pound sign, `EUR` -> euro sign. The `_fetchAndCacheSingleTicker()` function handles this. Any new data merge path must do the same.

---

## Common Operations

### Running Locally
```bash
cd api && pip install -r requirements.txt
# Set ANTHROPIC_API_KEY, GEMINI_API_KEY env vars
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Deploying
- Frontend: push to `main` branch, GitHub Pages auto-deploys
- Backend: push to `main`, Railway auto-deploys from `api/` directory
- Railway config: `railway.json` and `Procfile` in `api/`

### Adding a New Ticker
1. Create `data/research/{TICKER}.json` with full research schema
2. Update `data/research/_index.json`
3. The ticker will auto-appear in coverage table and batch refresh

---

## Known Issues
- `personalisation.js` has a SyntaxError (`Unexpected identifier 'PRODUCTION_API'`) that may affect the Personalisation tab
- Service worker returns 404 (non-critical)
- Coverage table "UPDATED" column may show stale dates after refresh if the pipeline doesn't update the `date` field in research JSON, or if the table reads from static data rather than localStorage cache
- The old `_fetchAndMergeBatchResults()` function still exists in index.html but is no longer called from the polling loop (dead code)
