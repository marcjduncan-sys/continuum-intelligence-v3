# Session Log

## 2026-03-18 -- Structured Research Context Injection (Analyst Chat)

**Duration**: ~25 min
**Branch**: main (direct commit)
**Commit**: `4817bb4`

### What was done

**Analyst chat now sees the full ACH research framework on every request.**

Previously, the chat LLM received only BM25/cosine-ranked passage fragments and a minimal price snapshot (current price, 2D/5D/10D moves, raw skew number). It had no stable view of the hypothesis structure, scores, verdict, discriminators, or tripwires -- answering from training data instead of platform research.

**`api/prompt_builder.py`** (parallel session authored `build_structured_research_context()`):
- Reads `data/research/{TICKER}.json` and produces a `<structured_research>` block
- Contains: hypotheses ranked by weight with scores/direction/status/description, skew direction and rationale, position in range with scenario prices, next decision point, tripwires (up to 6 with dates and consequences), discriminators sorted by diagnosticity (top 5 with current readings), evidence cards (top 8 with epistemic labels and alignment tags), conviction scores, verdict, narrative, price implication
- Character budget capped at 6,000 chars (~1,500 tokens) with graceful truncation
- Helper functions: `_truncate()`, `_safe_text()` for object-typed narrative fields
- `_RESEARCH_DIR` resolves from `PROJECT_ROOT`

**`api/main.py`** (this session):
- Replaced `_get_price_snapshot()` call with `prompt_builder.build_structured_research_context(ticker)` in the `research_chat()` handler
- Structured context injected as `<structured_research>` tags, passage context as `<research_context>` tags -- LLM can distinguish them
- Injected fresh on every request (not stored in conversation history)
- Removed dead `_build_research_snapshot()` function (written then superseded by parallel session's implementation)
- Removed dangling call to `_build_research_snapshot()` left by parallel session

### Key design decisions

1. **Server-side, not client-side**: the server already has the research JSON; sending it from the frontend would duplicate data and add untrusted payload
2. **Every request, not first-message-only**: research data updates with live prices; conversation history may be truncated; stale context from message 1 would mislead
3. **Not stored in history**: keeps conversation records compact; every request gets current research state
4. **Distinct XML tags**: `<structured_research>` for the framework snapshot, `<research_context>` for retrieved passages -- avoids confusion

### Test results

- 195/195 Vitest passing
- `npm run build` succeeds
- Python syntax validated for all changed files
- Railway healthy post-deploy (DB ok)

### Files changed

```
api/prompt_builder.py  -- build_structured_research_context() (parallel session)
api/main.py            -- wiring, removed _get_price_snapshot, removed dead code
```

### Handoff notes for next session

1. **Embeddings returning 404**: Railway health shows `embeddings: error:404` -- Gemini API key issue, pre-existing, unrelated to this change. Hybrid retrieval falls back to BM25-only when embeddings unavailable.
2. **Parallel session coordination**: the parallel session authored `build_structured_research_context()` in prompt_builder.py and the initial wiring in main.py. This session cleaned up dangling references and dead code from the merge.
3. **Not yet verified end-to-end in browser**: the structured context is injected server-side but has not been tested with a live chat question to confirm the LLM references hypothesis scores, skew, and tripwires by name. This is the critical verification step.
4. **System prompt drift**: three divergent prompts exist (DEFAULT_SYSTEM_PROMPT, ANALYST_SYSTEM_PROMPT in chat.js, personalisation prompt). Separate task to unify.

**Supplementary (parallel session, same date):**
- Added `tests/test_structured_research_context.py` (9 pytest tests: graceful degradation, required sections, real data, token budget 600-1500, multi-ticker, ticker isolation, case insensitivity)
- Fixed `None` ticker crash: added early `if not ticker: return ""` guard
- Added em-dash sanitisation: `\u2014` to `\u2013` in output (27 em-dashes found across 12 tickers from source JSON data)
- Restored `_build_research_snapshot()` call accidentally dropped during initial edit (live price, recent performance, primary driver data)
- Token budget verified across all 32 tickers: 1,161 to 1,372 tokens (avg 1,318)
- 22/22 Python pytest passing (including 9 new), 195/195 Vitest passing
- Files: `api/prompt_builder.py` (guard + sanitisation), `tests/test_structured_research_context.py` (new)
- **Not yet committed.** `prompt_builder.py` and test file are independently committable.

---

## 2026-03-18 -- Track D Infrastructure Hardening (D1, D3)

**Duration**: ~20 min
**Branch**: main (uncommitted; other session owns main.py wiring)

### What was done

**D1: Database Pool Health Check and Reconnection** (`api/db.py`):
- Added `health_check()` function: runs `SELECT 1` on pool, returns `"ok"` / `"reconnecting"` / `"no_database"`
- On failure: logs warning, closes dead pool, sets `_pool = None` so next `get_pool()` recreates it
- If pool already None: attempts recreation via `get_pool()`
- Wired into `/api/health` endpoint (returns `"db": status`) and 60-second background `asyncio.create_task` loop in lifespan

**D3: Embeddings Connection Pooling** (`api/embeddings.py`):
- Replaced per-request `httpx.AsyncClient` creation with module-level pooled client
- Lazy init via `_get_client()` with `httpx.Limits(max_connections=10)`
- Added `close_client()` for shutdown cleanup, wired into lifespan shutdown
- Another session added `health_check()` to embeddings.py (not authored here)

**`api/main.py` changes** (co-owned with parallel session):
- `import embeddings` added
- `/api/health` calls `db.health_check()`, includes `"db"` key in response
- Lifespan: periodic `_db_health_loop` task (60s interval), `embeddings.close_client()` on shutdown
- Note: parallel session has expanded `main.py` further (task_monitor, subsystem health, llm status)

### Test results

- 195/195 Vitest passing
- `npm run build` succeeds
- Python syntax validated for all changed files
- No pytest tests collected (existing test suite does not cover backend modules)

### Files changed

```
api/db.py          -- health_check() added (D1)
api/embeddings.py  -- connection pooling + close_client() (D3)
api/main.py        -- wiring (co-owned with parallel session)
```

### Handoff notes for next session

1. **Do not commit main.py independently** -- parallel session is actively modifying it with task_monitor, expanded health endpoint, and llm status. Let that session own the main.py commit.
2. `api/db.py` and `api/embeddings.py` are clean and independently committable if needed
3. D2 (LLM client resilience) and D4+ not started in this session
4. The parallel session added `embeddings.health_check()` and `api/task_monitor.py` -- review those changes before committing

---

## 2026-03-17 Session 5 -- Workflow Push, Comparator Triage, Coverage Confirmation

**Duration**: ~15 min
**Branch**: main (direct commit)
**Commit**: `133906b`

### What was done

1. **Workflow commit and push**: pushed user-authored `.github/workflows/price-drivers.yml` rewrite (fail-fast on credit exhaustion, freshness skip, 502 retry). Validated YAML with `yaml.safe_load()` before commit.
2. **Thesis Comparator 502 triage**: tested `POST /api/research-chat` for XRO directly; returned 200 with full analysis. Confirmed the 502 was transient (likely Anthropic rate limit saturation from the price driver scan). Verified `api/llm.py` already has retry logic covering 429, 500, 503, and overloaded errors. No code change required.
3. **Price driver coverage check**: all 32/32 tickers now returning 200 from `/api/drivers/{ticker}`. Full coverage achieved, up from 26/32 (81%) at end of previous session.

### Coverage results

| Metric | Previous session | This session |
|--------|-----------------|--------------|
| Price driver cache | 26/32 (81%) | 32/32 (100%) |
| Railway health | Healthy (1,014 passages) | Healthy (1,014 passages) |
| Comparator endpoint | 502 (transient) | 200 |

### Commits this session

```
133906b price-drivers workflow: fail-fast on credit exhaustion, freshness skip, 502 retry
```

### Handoff notes for next session

1. Browser visual verification still outstanding: open 2-3 reports, test performance grid (green/red/muted) and both PDF buttons in print preview
2. Test briefing with data-sparse (OBM, WIA) and data-dense (BHP, CBA) tickers
3. `tasks/todo.md` still needs updating to mark price driver waves complete
4. Fonts not embedded as base64 in PDF print HTML; falls back to system fonts without Inter/Source Serif 4

---

## 2026-03-17 -- Price Driver Agent Upgrade

**Duration**: ~3 hours (02:00-05:30 AEDT)
**Branch**: main (direct commits)
**Commits**: `e1e880d` through `0e8465d` (6 session commits)

### What was done

Price Driver Agent upgraded from a fragile fire-and-forget pipeline with 48% ticker coverage to a robust per-ticker workflow with 81% coverage (26/32) and climbing.

**Backend (`api/price_drivers.py`, `api/main.py`)**:
- DB TTL extended from 48 hours to 7 days (in-memory cache also 7 days)
- Scan endpoint made synchronous (removed `asyncio.ensure_future` fire-and-forget)
- Added `_compute_period_returns()` helper: programmatic 2D/5D/10D returns for stock, ASX200, and relative performance from Yahoo Finance OHLCV
- Broker queries split into upgrades, downgrades, and notes (3 separate DDG searches)
- Social queries split into HotCopper, Reddit, and X-via-media (3 separate DDG searches)
- Layer 3 synthesis prompt updated: expanded `price_action_summary` schema (2D/5D/10D with ASX200 and relative), added `broker_activity` and `social_signal` output blocks, instruction to copy pre-computed returns exactly
- Rate limit on per-ticker endpoint relaxed from 1/min to 2/min

**Frontend (`src/pages/report-sections.js`, `src/styles/report.css`)**:
- Both renderers (`renderPriceDrivers` embedded + `renderPriceDriversContent` async) updated: 4x3 performance comparison grid (ticker/ASX200/relative x 2D/5D/10D), broker upgrade/downgrade alert banners, HotCopper social activity badge
- CSS: 16 new rules for `.pd-perf-grid`, `.pd-broker-alert`, `.pd-social` classes with green/red/muted colour coding via CSS variables

**Workflow (`.github/workflows/price-drivers.yml`)**:
- Replaced monolithic `POST /scan` curl with sequential per-ticker `GET /drivers/{ticker}?force=true` loop
- Per-ticker success/failure reporting in Actions log
- Workflow only fails if >10 tickers fail
- Timeouts: 180 min job, 480s per ticker

**Migration (`api/migrations/010_price_drivers.sql`)**:
- Default `expires_at` updated to `INTERVAL '7 days'`

### Coverage results

| Metric | Before | After |
|--------|--------|-------|
| Tickers with cached reports | 12/25 (48%) | 26/32 (81%) |
| Schema fields | 10 keys, old `price_change_1d_pct` | 12 keys, new 2D/5D/10D + ASX200 + relative + broker + social |
| Workflow runtime | 9 seconds (fire-and-forget) | ~100 min (synchronous per-ticker) |
| Workflow visibility | No failure detection | Per-ticker pass/fail in Actions log |

### What remains

- **6 tickers still 404** (WAF, WDS, WOR, WOW, WTC, XRO): workflow timed out at 120 min before reaching them. Re-triggered with 180 min timeout (run `23178485049`, in progress)
- **2 tickers hit 502** during scan (ASB, NST): transient Railway errors, both have cached reports from prior runs
- **Visual verification**: performance grid, broker alerts, and social badges are code-complete but need browser verification once new-schema reports are cached
- **`tasks/todo.md`**: still shows original wave plan with unchecked items; should be updated to reflect completion

### Commits this session

```
0e8465d price-drivers workflow: increase timeouts (180min job, 480s per ticker)
b38f604 price-drivers: increase timeout to 180 min
a7a72fc price-drivers: per-ticker workflow, fix Railway timeout
5a210ea Frontend: add perf grid, broker alerts, social badges to embedded price drivers
b202bfb fix: use price_history key for stock OHLCV in computed returns
3724b9d Frontend: price driver perf grid vs ASX200, broker alerts, social indicators
e1e880d price_drivers: 7-day TTL, peer map, computed returns, broker/social queries, prompt upgrades
```

### Handoff notes for next session

1. Check run `23178485049` completed successfully. Run the 32-ticker coverage check to confirm all return 200.
2. Open 3 stock reports in browser and verify the performance grid renders correctly (green up, red down, muted flat).
3. Update `tasks/todo.md` to mark waves 1-4 complete and add review section.
4. The `_compute_period_returns()` function uses `price_history` key (not `history`) for stock OHLCV -- this was a mid-session fix (`b202bfb`). If returns show as N/A, check the key name in `fetch_yahoo_price()` response.
5. ASB and NST returned 502 during the scan. If they persistently fail, check Railway memory pressure or add a retry loop in the workflow.

---

## 2026-03-17 -- PDF Report Redesign Review

**Duration**: ~30 min
**Branch**: main (direct commit)
**Commit**: `5de4610`

### What was done

Reviewed and fixed the `src/features/pdf.js` rewrite (Goldman Sachs-standard layout for Institutional and Investor Briefing reports). The rewrite was code-complete but had two categories of issue.

**Fixes applied (commit `5de4610`)**:
- Replaced 8 `&mdash;` HTML entities with `&ndash;` across both report builders (Australian English compliance)
- Added Section 09 (Verdict): colour-coded callout box with direction-aware border/background (green upside, red downside, amber balanced), verdict text, and normalised hypothesis scores with labels and direction indicators
- Added Section 10 (Price Drivers): executive summary, primary driver, period returns table (2D/5D/10D for stock vs ASX 200 vs relative), broker upgrade/downgrade alerts (max 3 each), HotCopper social signal, and confidence indicator

**Review findings (no issues)**:
- `pdfEsc()` correctly escapes `&`, `<`, `>`, `"` entities
- All data sections from STOCK_DATA rendered: identity rows, hypotheses (with requires/supporting/contradicting), all evidence cards (institutional), discriminators (all 4 columns), tripwires (green/red conditions), gaps (all sub-keys), technical analysis (all 6 sub-sections)
- No CSS class collisions (isolated `window.open()` context)
- Public API unchanged: `generatePDFReport(ticker, type)` same signature and export

**Test results**: 157/157 Vitest pass; 1 pre-existing Jest failure (EVN scaffold evidence cards) unrelated. Build succeeds.

### What remains

- **Browser visual verification**: print layout, page breaks, colour printing, Position in Range bar rendering, Investor Briefing 2-page fit -- all require manual browser check
- **Font embedding**: Inter and Source Serif 4 referenced by name but not embedded as woff2 in the print HTML; falls back to system fonts on machines without them installed
- **Investor Briefing overflow**: truncation limits calibrated for typical data but not stress-tested across all 32 tickers

### Handoff notes for next session

1. Open 2-3 stock reports in dev mode, click both PDF download buttons, verify layout in print preview
2. Test with a data-sparse ticker (e.g. OBM, WIA) to confirm no crash on missing fields
3. Test with a data-dense ticker (e.g. BHP, CBA) to confirm Investor Briefing fits 2 pages
4. The `pdf.js.bak` file referenced in the original brief does not exist -- the old version was overwritten in place, not backed up

---

## 2026-03-17 Session 3 -- PDF Briefing Polish + Price Drivers Workflow Hardening

**Duration**: ~3 hours
**Branch**: main (direct commits)
**Commits**: `7781dd6` through `a68ec06` (PDF), plus workflow fixes

### What was done

**PDF Briefing iteration (6 commits):**
- Full Goldman Sachs-standard rewrite of `src/features/pdf.js` with `baseCSS()` shared foundation, `buildInstitutional()` and `buildBriefing()` builders
- Cover page CSS grid (`1fr 170px`) with right-column sidebar
- Evidence grids: 2-col (institutional), 3-col (briefing)
- Typography: Source Serif 4 headers, Inter data/labels, ALL CAPS at 5-6pt
- Colour system: navy `#003A70` primary, rule-based hierarchy
- Print CSS: `page-break-inside: avoid`, `@page` margins 8mm/10mm
- Fixed `[object Object]` in narrative fields via `narrText()` helper
- Fixed `&mdash;` → `&ndash;` (8 instances)
- Moved identity/narrative from page 2 to page 1; removed evidence gaps to keep 2-page constraint
- Hypothesis description truncation 200 → 350 chars

**Price Drivers workflow hardening:**
- Fail-fast on API credit exhaustion (checks response body for "credit balance")
- Freshness skip: checks `/api/agents/drivers/{ticker}/latest` before processing
- 502 retry with 600s timeout after 10s cooldown
- Manual dispatch inputs: `tickers` (custom list) and `force_all` (bypass freshness)
- Exit code 1 on credit exhaustion for GitHub Actions visibility

### Coverage results

- PDF: both report types rendering end-to-end; 157/157 Vitest passing
- Price drivers: 26/32 tickers cached (81%); 7 awaiting API credit refresh

### Handoff notes for next session

1. 7 tickers (WAF, WDS, WIA, WOR, WOW, WTC, XRO) need price driver re-run after API credit refresh
2. Browser visual verification needed: open 2-3 reports, test both PDF buttons in print preview
3. Test briefing with data-sparse (OBM, WIA) and data-dense (BHP, CBA) tickers
4. Fonts not embedded as base64 -- falls back to system fonts without Inter/Source Serif 4
5. Enable auto-reload on Anthropic billing to prevent future mid-run credit exhaustion
