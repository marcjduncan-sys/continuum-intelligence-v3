# Continuum Intelligence v3 — CLAUDE.md

## Operating Context

You are a senior engineer maintaining a production equity research platform used daily by fund managers. Mistakes ship to Cloudflare Pages (frontend) and Fly.io (backend) and break live sessions with no rollback beyond a manual revert commit. The default posture is conservative: understand before changing, smallest possible diff, test before marking done. Experimental approaches require explicit instruction.

---

## Commands

```bash
npm run dev          # Dev server on port 5000, proxies /api → localhost:8000
npm run build        # Vite build → dist/; copies data/ → dist/data/
npm run test         # Jest suite (tests/, src/**/*.test.js) — 61 tests
npm run test:unit    # Vitest suite — what CI runs; must pass before pushing — 206 tests
# Python tests: 394 (run via pytest from api/ directory)
npm run test:all     # Jest + Vitest combined — 263 tests total
npm run lint         # ESLint over scripts/, src/, and public/js/
npm run validate     # lint + test:all — run before any push
```

**Never run** `npm run test:e2e` without a local server running (Playwright requires a live page).
**Frontend** deploys automatically to Cloudflare Pages on push to `main`. The GitHub Pages deploy workflow (`.github/workflows/deploy.yml`) is disabled (`if: false`). Cloudflare Pages builds are configured in the Cloudflare dashboard (build command: `npm run build`, output: `dist/`).
**Backend** deploys automatically to Fly.io on push to `main` when `api/`, `data/`, `Dockerfile`, or `fly.toml` change (`.github/workflows/fly-deploy.yml`). Confirm success: `curl https://ci-api.fly.dev/api/health`. Required environment variables are set in the Fly.io dashboard, not in code -- read [api/config.py](api/config.py) to see what is required.

---

## Architecture Constraints

- **`index.html` is owned by GitHub Actions.** The `continuum-update`, `update-daily`, `update-intraday`, and `live-prices` workflows all commit directly to `main`. Never edit `index.html` from a local copy that has not been pulled. One stale push caused commit `58b2c99`, which simultaneously broke the analyst panel, portfolio DOM, dark mode, and comparator.
- **`public/js/personalisation.js` and the DNE engine scripts load before `src/main.js`.** They are classic `<script>` tags, not ES modules. They write `window.renderPersonalisationPage`, `window.initPersonalisationDemo`, `window.pnBuildSystemPrompt`, and `window.TC_DATA`. If `src/main.js` is loaded before them, those globals will be undefined and `initChat()`, `initRouter()`, and `initThesisPage()` will silently fail.
- **Never replace the `STOCK_DATA`, `REFERENCE_DATA`, `FRESHNESS_DATA`, or `SNAPSHOT_DATA` object references.** They are exported by reference from `src/lib/state.js` and aliased to `window.*`. Replace the reference and every module holding the old pointer will silently diverge. Use `initStockData()`, `setStockData()`, `patchStock()`, or `Object.assign()` instead.
- **`FEATURED_ORDER` and `SNAPSHOT_ORDER` are Proxy objects** backed by live `Object.keys(STOCK_DATA)`. Do not destructure them into a plain array at module load time; they will become stale immediately. Call `.forEach()`, `.map()`, etc. at render time, not at import time.
- **`src/lib/state.js` owns all global state.** No module may declare its own copy of stock, freshness, reference, or snapshot data. The only exceptions are local caches invalidated within the same render cycle.
- **`api/` is the Fly.io backend (FastAPI/Python), not part of the Cloudflare Pages build.** Changes to `api/` trigger a Fly.io redeploy, not `npm run build`. The frontend connects to `https://api.continuumintelligence.ai` (Fly.io) in production and to `localhost:8000` (via Vite proxy) in dev. The API no longer serves static frontend files; Cloudflare Pages handles all frontend hosting.
- **`Documents/continuum-v3/` is a dead git worktree.** It contains its own `node_modules`, test files, and stale source. Never edit files there. The active codebase is at the repo root.
- **Do not touch `data/research/_index.json` manually.** It is the canonical stock list and the authoritative source for stock count (currently 25 tickers). Editing it locally will conflict with the next automated commit. When adding a new ticker, update `_index.json` and `data/reference.json` -- do not rely on `REFERENCE_DATA` in `index.html`, which is a known defect covering fewer tickers than `_index.json`. Note: `reference.json` currently has 25 entries (RMC corrected 2026-03-07).
- **`public/js/personalisation.js` is now linted by ESLint** (Task C4). `npm run lint` covers `scripts/`, `src/`, and `public/js/`. Zero errors; warnings only (no-var, prefer-const, etc.).
- **`window.CI_API_KEY` injection is undocumented.** It is not set in `index.html`; Claude Code configured the injection mechanism. Do not modify anything related to `CI_API_KEY` without first grepping the entire repo for all references and tracing the injection point. If it is broken, check (in order): Fly.io environment variables, GitHub Secrets, any `<script>` tag in `index.html` setting the global.
- **GitHub Actions secrets are not documented in the repo.** Do not rename or delete secrets without checking every workflow file for references first. To diagnose a failing workflow: open the workflow YAML, find which secret it references, then verify that secret exists at GitHub repo Settings > Secrets and variables > Actions.
- **`js/personalisation.js` (root-level) was deleted 2026-03-08.** The canonical file is `public/js/personalisation.js`, which Vite copies verbatim to `dist/js/personalisation.js` via `publicDir: 'public'`. The root-level `js/` directory still exists for `js/dne/` (the DNE engine). Do not recreate `js/personalisation.js` at the repo root -- it is never served in production and creates a shadow copy problem where fixes appear to apply but have no effect.

---

## Current State — 2026-03-20

**Phase 0 COMPLETE (2026-03-07).** The extraction of logic from `index.html` into `src/` modules is complete. `computeSkewScore` canonicalised to zero-contribution convention (commit `4493e8c`; see `docs/decisions/003-computeskewscore-neutral-convention.md`). `VALID_STATIC_PAGES` confirmed correct: `home`, `deep-research`, `portfolio`, `comparator`, `personalisation`, `about`.

**Phase 1 COMPLETE (2026-03-07).**
- [x] Add Stock modal (`src/features/add-stock.js`) -- already fully implemented, no changes needed.
- [x] Deep Research page (`src/pages/deep-research.js`) -- already fully implemented; fixed hardcoded `DEEP_RESEARCH_TICKERS`, replaced with `_deepResearch` flag (commit `ddada42`).
- [x] Portfolio extraction -- already complete; fixed `renderChangeAlerts`, replaced fake demo data with real `_overcorrection`, freshness, and skew signals (commit `3d9591d`). 15 Vitest tests added.
- [x] TC_DATA externalised to `data/tc.json` -- follows `reference.json` pattern, `initTcData()` wired in `boot()` (commit `415095e`).

**Session work (2026-03-08):**
- [x] Shadow copy elimination complete (commit `f309fef`): deleted root-level `js/personalisation.js`, reconciled 57 divergent lines into `public/js/personalisation.js`, updated all references in CLAUDE.md and `src/features/chat.js`.
- [x] Thesis Comparator rebuilt with LLM pipeline (commit `bebcb9c`): `tcAnalyze()` now POSTs to `/api/research-chat` with a structured ACH system prompt; `renderComparatorResult()` parses the ALIGNMENT line, populates hypothesis map from `tc.json`, and renders supporting/contradicting evidence. Loading animation, error state, and contrarian banner CSS added. Enter key wired. Verified end-to-end against WOW with real Railway responses on preview server.
- [x] Analyst chat consistency and voice rules unified (commit `236bfee`): extracted `VOICE_RULES` constant from `src/features/chat.js`; bridged to `window.CI_VOICE_RULES` in `src/main.js`; dead Step 5 centre-panel chat code removed. **Superseded by Task C2**: voice rules now live in `data/config/voice-rules.json` (single source of truth); `chat.js` and `prompt_builder.py` both load from JSON; `window.CI_VOICE_RULES` bridge removed. `personalisation.js` falls back to simplified rules (acceptable since server-side `prompt_builder.py` is the real prompt source).

**Phase 2 COMPLETE (2026-03-09).**
- [x] Track A (auth backend): OTP email flow, JWT HS256, `api/auth.py`, `api/email_service.py`, `api/config.py`, `api/migrations/002_auth.sql` -- commit `566e945`.
- [x] Track B (conversation persistence): `api/conversations.py`, `api/db.py` helpers, `POST /api/conversations`, `GET /api/conversations/{ticker}` -- commit `566e945`.
- [x] Track C (frontend): `src/features/auth.js` (guest UUID, JWT storage, two-step OTP modal), surgical edits to `src/features/chat.js` (`_ensureConversation`, `_persistMessage`, `_restoreFromDB`), `initAuth()` wired in `src/main.js` before `initChat()` -- commit `566e945`.
- [x] Railway 502 fix: `asyncio.wait_for(asyncpg.create_pool(...), timeout=15.0)` in `api/db.py`; removed lifespan pre-warm from `api/main.py` -- commit `9a8dad7`.
- [x] PostgreSQL provisioned in Railway; `DATABASE_URL` injected; migrations applied automatically.
- [x] `JWT_SECRET` added to Railway dashboard.
- [x] **OTP email LIVE (2026-03-18)**: Migrated from aiosmtplib/SMTP to Resend HTTP API (`api/email_service.py`, `api/config.py`). Railway blocks all outbound SMTP; Resend uses HTTPS (port 443). Required env vars: `EMAIL_FROM` (sender address), `RESEND_API_KEY`. Both set in Railway dashboard. Confirmed working: OTP email received and login flow verified end-to-end. `aiosmtplib` removed from `requirements.txt`. Old SMTP vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`) are no longer used.

**Phase 3 COMPLETE (2026-03-09).**
- [x] Wave 1A: Sign in button added to `.nav-actions` in `index.html`; `initAuth()` wires click handler, updates button text on `ci:auth:login` event -- commit `fbb7a35`.
- [x] Wave 1B: Rolling summarisation (`api/summarise.py`, `api/db.py` context helpers, `api/migrations/003_summaries.sql`). `ResearchChatRequest` accepts `conversation_id`; handler calls `summarise_if_needed()` when provided. `chat.js` passes `dbConversationIds[ticker]` -- commit `fbb7a35`.
- [x] Railway deploy fix: `from . import db` relative import in `summarise.py` crashed Railway at startup. Changed to bare `import db` matching project convention -- commit `28694bd`.
- [x] Sign in button CSS fix: `.ci-signin-btn` rules were injected lazily in `_getOrCreateModal()`; button rendered with browser defaults until modal first opened. Moved to eager injection in `initAuth()` -- commit `208b2e3`. Verified: border styled, background transparent at page load.

**Session work (2026-03-09 sessions 2-3):**
- [x] Diagnosed Railway 502: `asyncpg.create_pool(timeout=10.0)` controls `pool.acquire()` timeout, not TCP connect. Fixed with `asyncio.wait_for()` (commit `9a8dad7`).
- [x] Debugged three consecutive Railway healthcheck failures: root cause `from . import db` in `summarise.py`. Correct test context is `cd api/ && python3 -c "import summarise"` -- not `from api import summarise` which grants package context and masks the error.
- [x] Phase 3 fully deployed and verified: `conversation_id` in OpenAPI schema; Sign in button styled correctly at page load.

**Session work (2026-03-09 session 1):**
- [x] Session audit: scraped 78 Claude sessions across 6 projects, categorised usage patterns into skills/plugins/agents/CLAUDE.md recommendations.
- [x] Built 3 new CI skills: `ci:bug-repro` (autonomous bug reproducer), `ci:stock-integrity` (data integrity audit), `ci:add-ticker` (stock onboarding workflow).
- [x] Confirmed 5 pre-existing CI skills functional: `ci:session-close`, `ci:session-debrief`, `ci:push-safe`, `ci:deploy-check`, `ci:verify-deploy`.

**Session work (2026-03-10) -- Gold Agent pilot:**
- [x] Phase 3 (gold analysis sessions) COMPLETE: NST (skew 60), EVN (skew 63), WAF (skew 40) -- all three pass schema validation and content standards (Phase 3G gate).
- [x] Phase 4 COMPLETE -- commit `627f74d`: `api/gold_agent.py` (7-query NLM runner + Claude synthesis); `GET /api/agents/gold/{ticker}` endpoint in `api/main.py`; `notebooklm-py>=0.3.3` added to `requirements.txt`; `NOTEBOOKLM_GOLD_NOTEBOOK_ID` + `NOTEBOOKLM_AUTH_JSON` env vars added to `api/config.py`. 129/129 tests pass; Fly.io healthy.
- [x] **Phase 4 LIVE (2026-03-10)**: Fly.io env vars set. Live test against NST returned full CI v3 JSON (skew 52, 10 evidence items, 6 gaps) in ~90 seconds. Endpoint confirmed operational.
- **NOTE**: NOTEBOOKLM_AUTH_JSON credentials expire every 1-2 weeks. When the endpoint returns 503, re-run Get NotebookLM Auth.bat from Desktop, copy NOTEBOOKLM_AUTH_JSON.txt content, and update the Fly.io variable.

**Session work (2026-03-12) -- Phase 8: Batch Analysis:**
- [x] Phase 8 COMPLETE -- commit `d70b6ae`: `api/migrations/008_batch_analysis.sql` (two tables: `memory_batch_runs`, `memory_consolidation_events`); `api/batch_analysis.py` (union-find clustering, Haiku contradiction detection, per-user consolidation); `BATCH_SECRET` added to `api/config.py`; `POST /api/batch/run` endpoint added to `api/main.py` (X-Batch-Secret auth guard); `.github/workflows/batch-analysis.yml` (cron 0 16 * * * = 02:00 AEDT). 218/218 tests passing.
- [x] Endpoint live and auth-guarded: returns 401 on wrong secret; returns batch summary on valid secret.
- [x] **8E DONE (user)**: `BATCH_SECRET` added to Fly.io env vars and GitHub Secrets.
- [x] **8G DONE**: `batch-analysis` workflow_dispatch triggered; Railway logs confirmed `POST /api/batch/run HTTP/1.1' 200 OK`.

**Session work (2026-03-12) -- Phase 9: Proactive Insights:**
- [x] Phase 9 COMPLETE -- commit `7ec36e1`: `api/migrations/009_notifications.sql` (notifications table + 3 indices); `api/insights.py` (Haiku classifier, 7-day re-notification guard, `scan_ticker`, `run_insight_scan`, `get_notifications`, `dismiss_notification`); `api/main.py` (`GET /api/notifications`, `PATCH /api/notifications/{id}/dismiss`, `POST /api/insights/scan` with X-Insights-Secret auth); `api/config.py` (`INSIGHTS_SECRET`); `src/features/notifications.js` (badge + panel surface, 5-min poll, dynamic CSS injection); `src/main.js` (`initNotifications` wired between Auth and Chat); `.github/workflows/insights-scan.yml` (cron `0 17 * * 1-5` = 03:00 AEDT Mon-Fri). 157/157 Vitest tests passing. Fly.io healthy; `GET /api/notifications?guest_id=test` returns `[]`.
- [x] **9D DONE (user)**: `INSIGHTS_SECRET` added to Fly.io env vars and GitHub Secrets.
- [x] **9E DONE**: `insights-scan` workflow_dispatch triggered; Railway logs confirmed `POST /api/insights/scan HTTP/1.1' 200 OK`. 9 tickers scanned (tickers with active memories in DB), 97 memories checked -- expected behaviour; scan discovers tickers dynamically from memory table.

**Session work (2026-03-13) -- Memory pipeline audit fixes:**
- [x] Independent audit commissioned and completed. Verdict: architecture correct, no critical issues, 4 medium + 5 low severity findings.
- [x] Commit `f4585a7`: 4 medium severity fixes applied:
  - `memory_extractor.py`: confidence default 0.8 → 0.5 (weakly-inferred memories were over-weighted)
  - `memory_extractor.py`: ticker normalised to `.upper()` at insertion (ticker boost in `memory_selector.py` was not firing on case mismatch)
  - `memory_extractor.py`: 2,000-char truncation documented
  - `embeddings.py`: 768-dim validation added; one retry with 1s delay on transient Gemini failure
- [ ] **Next**: Phase 10 (firm features) -- user confirmed each user has own login; info barrier concern deferred. Or pivot to chat output quality (system prompt, memory extraction prompt, injection format, research retrieval). Awaiting direction.

**Session work (2026-03-13) -- Hypothesis score divergence fix:**
- [x] Root cause: `verdict.scores` carried stale copies of hypothesis probabilities; all 25 tickers diverged. The analyst chat received both arrays as separate passages and blended contradictory data.
- [x] Commit `4768a84`: four-layer fix:
  - `report-sections.js`: `renderVerdict()` normalises from `data.hypotheses` (canonical), fallback to `v.scores`
  - `ingest.py`: verdict passage uses hypothesis scores, not stale verdict copy
  - `refresh.py`: both update paths sync `verdict.scores` from canonical hypothesis score (no stale fallback)
  - `validate_research.py`: Rule 19 catches and auto-fixes divergence; rule count 18 -> 19, fix count 12 -> 13
  - All 25 research JSONs repaired via `scripts/repair_verdict_scores.py`
- [x] 218/218 tests passing.

**Session work (2026-03-13 session 2) -- Add Stock synchronous coverage:**
- [x] Commit `e1bbb19`: `api/main.py` `add_stock()` now runs `run_refresh()` synchronously (150s timeout) instead of fire-and-forget background task. Quality gate checks evidence cards >= 5, hypothesis scores ending in "%", and `theNarrative` present. Returns `coverage_status` (completed/degraded/failed/timeout) and `coverage_error`.
- [x] `src/features/add-stock.js` rewritten: `AbortController` (180s client timeout), progress poller (2.5s interval on `/api/refresh/{ticker}/status`), handles all coverage outcomes, extracted `_loadResearchIntoApp()` and `_loadScaffold()` helpers, fixed `$` sign corruption via Unicode escapes, removed fragile `triggerRefresh` polling.
- [x] 157/157 Vitest passing. Build succeeds. Fly.io healthy (29 tickers). Pre-existing Jest data-integrity failures (EVN scaffold missing hypotheses in `_index.json`) unrelated.

**Session work (2026-03-16) -- Gold Agent Mapping Persistency:**
- [x] Commit `749e46c`: Persisted `NOTEBOOKLM_TICKER_NOTEBOOKS` mapping in the repo. Created `data/config/notebooklm-notebooks.json` as primary source; `config.py` now merges this with env var overrides. This removes the need for manual Fly.io env var edits when adding new gold stocks.
- [x] Verified syntax and mapping integrity locally.

**Session work (2026-03-13 session 3) -- Home page tile data audit:**
- [x] Commit `f362d11`: Populated `reference.json` for ASB, WAF, NST, EVN (sharesOutstanding, EPS, divPerShare, analyst targets). Fixed RMC `sharesOutstanding` from 396000000 (raw) to 396 (millions convention) -- was producing nonsensical "A$372,240B" market cap. Replaced "Div Yield: N/A" with "Analyst Target" for ASB/WAF (non-dividend payers).
- [x] Commit `3ae5b9c`: Patched `_index.json` for EVN and NST -- missing `featuredMetrics`, `featuredRationale`, `hypotheses`, `skew` fields caused literal "undefined" text on home page cards. Root cause: scaffold process wrote full research JSON but did not copy card fields to `_index.json`.
- [x] 157/157 Vitest passing. Fly.io healthy (29 tickers).

**Session work (2026-03-17) -- Price Driver Agent Upgrade:**
- [x] Backend: DB TTL 48h → 7 days, scan endpoint synchronous, `_compute_period_returns()` helper (2D/5D/10D stock vs ASX200), broker queries split (upgrades/downgrades/notes), social queries split (HotCopper/Reddit/X-via-media), Layer 3 synthesis prompt expanded. Rate limit relaxed to 2/min.
- [x] Frontend: both renderers updated with 4x3 performance grid, broker alert banners, HotCopper social badge. 16 new CSS rules.
- [x] Workflow: per-ticker sequential curl replacing monolithic scan. 180 min timeout, 480s per ticker. Fails only if >10 tickers fail.
- [x] Coverage: 48% → 81% (26/32 tickers). 6 tickers timed out at 120 min; re-triggered at 180 min.

**Session work (2026-03-17) -- PDF Report Goldman Sachs-standard Rewrite:**
- [x] Commit `7781dd6`: Full rewrite of `src/features/pdf.js`. `baseCSS()` shared foundation, `buildSidebar()` cover page, two-column evidence grids, rule-based hierarchy, Source Serif 4 / Inter typography, print CSS with `page-break-inside: avoid`.
- [x] Commit `6226032`: Briefing layout -- moved identity and narrative from page 2 to page 1 after hypothesis bars. Hypothesis description truncation 200 → 350 chars.
- [x] Commit `4ce17e1`: Fixed `[object Object]` bug in narrative fields (added `narrText()` helper for object-typed fields). Moved technical structure to page 1. Removed forced page break.
- [x] Commit `386f2c0`: Page 2 density -- all evidence cards in 2-col grid (truncation 400/250), all discriminator rows with currentReading column, all tripwires (no caps), verdict callout between discriminators and tripwires.
- [x] Commit `a68ec06`: Removed evidence gaps section from briefing to keep 2-page constraint.
- [x] 157/157 Vitest passing. Build succeeds. Fly.io healthy (32 tickers).

**Session work (2026-03-18) -- UI fixes, OTP email, memory pipeline hardening:**
- [x] **OTP email migration**: `api/email_service.py` rewritten to use Resend HTTP API via `httpx` (10s timeout). Root cause was Railway blocking all outbound SMTP. `api/config.py` simplified to `EMAIL_FROM` + `RESEND_API_KEY`. Login flow verified end-to-end.
- [x] **Fix 6 -- Card truncation** (commits in this session): `truncateAtWord(str, maxLen)` added to `src/lib/format.js`; imported in `src/pages/home.js` and applied at 120 chars to `fc-skew-rationale`.
- [x] **Fix 7 -- Pending state for cards without price data**: `isDataPending()` helper in `home.js`; early return renders a dimmed "Analysis pending" card when all `featuredMetrics` are N/A/--. CSS: `.featured-card.fc-pending` (opacity 0.45/0.65), `.fc-pending-msg`. `src/styles/home.css` updated.
- [x] **Fix 9 -- Collapsible analyst panel**: `--analyst-panel-width` corrected to 380px in `tokens.css`. `ap-user-collapsed` CSS class (52px wide, hides all content except collapse button) added to `chat.css`. `chat.js`: collapse button toggles class + persists state to `localStorage('ci_panel_collapsed')`; `initChat()` restores on load. FAB bug fixed: `closePanel()` now always restores FAB (removed `window.innerWidth < 1024` guard).
- [x] **Fix 11 -- Personalisation wizard purpose banner**: `<div class="pn-wizard-purpose">` inserted before step 1 form grid in `public/js/personalisation.js`. CSS appended to `css/personalisation.css`.
- [x] **ingest.py type guards** (commit `b557ab7`): `alignmentSummary` and `priceImplication` guarded with `isinstance(x, dict)` before `.get()` calls. 8 pytest tests added (`tests/test_ingest_type_guards.py`).
- [x] **Em dash sweep** (commit `591872a`): 183 Unicode em dashes + 5 double-encoded em dashes fixed across 21 stock JSONs.
- [x] **Memory pipeline -- Item 1** (commit `5127fff`): `api/migrations/011_remove_evolved_action.sql` drops `evolved` from `memory_consolidation_events` action CHECK constraint. Auto-applies on next Railway restart.
- [x] **Memory pipeline -- Item 2** (commit `99adff6`): `db.enforce_memory_ceiling()` deactivates lowest-confidence active memories when a user exceeds 500. Priority: tactical > positional > structural. Called from `memory_extractor.py` after each successful insertion turn.
- [x] **Memory pipeline -- Item 5** (commit `d527a5c`): `prompt_builder.format_memories_section()` capped at 1,200 chars (~300 tokens). Lower-scored memories dropped first; truncation notice appended so LLM is aware.
- [x] 195/195 Vitest passing. Build succeeds.

**Audit Track work (2026-03-18):**
- [x] **A1**: Staleness warning injection in prompt_builder (commit `76ab244`).
- [x] **A5**: Chat debounce guard -- 2s cooldown on send (commit `76ab244`).
- [x] **B1**: Pre-compute passage embeddings at ingestion via Google text-embedding-004 (commit `f88eb1c`).
- [x] **B2**: Hybrid retrieval with Reciprocal Rank Fusion -- BM25 + cosine similarity combined via RRF (commit `cac218e`).
- [x] **B3**: BM25 index caching per ticker with version-gated invalidation (commit `cac218e`).
- [x] **B4**: Conversation history token budget -- sliding window with 4000-token cap (commit `b16e3fc`).
- [x] **C1**: Bundle CDN dependencies via Vite -- `marked` and `dompurify` as npm deps, CDN script tags removed, regex fallback parser removed, SheetJS CDN failure shows user alert (commit `4ae62e7`).
- [x] **C3**: Structured error responses -- `api/errors.py` with `ErrorCode` constants and `{error, code, detail}` JSON envelope. All `HTTPException` raises in `main.py` replaced with `api_error()`. Custom handlers for `APIError` and `RateLimitExceeded` (commit `4ae62e7`).
- [x] **C2**: Voice rules as build-time static JSON -- canonical rules in `data/config/voice-rules.json`. `api/prompt_builder.py` and `src/features/chat.js` both load from JSON. `window.CI_VOICE_RULES` bridge removed from `src/main.js` (commit `47372f1` + `4ae62e7`).
- [x] **C4**: Personalisation.js ESLint coverage -- `public/js/` added to lint scope. Zero errors (194 warnings, all pre-existing no-var/prefer-const) (commit `4ae62e7`).
- [x] **C5**: Package version and metadata cleanup -- `package.json` name updated to `continuum-intelligence-v3`, version to `3.0.0` (commit `4ae62e7`).

**Session work (2026-03-19) -- Gold Stock Coverage Pipeline (PRD complete):**
- [x] **S0**: Fixed OBM/SNX NotebookLM notebook ID collision. SNX set to dedicated notebook `c5470e1a`.
- [x] **S1**: Added `archetype` field to `reference.json` for all 32 tickers. 7 archetypes: `producer` (FMG, MIN, STO, WAF, NST, EVN, OBM), `developer` (HRZ, RMC), `explorer` (WIA, SNX), `diversified` (WOW, GYG, CSL, WDS, BHP, OCL, RFG, RIO, WOR), `financial` (MQG, NAB, CBA), `reit` (GMG, DXS), `tech` (XRO, WTC, DRO, PME, SIG, REA, ASB).
- [x] **S2**: Created `data/config/metric-templates.json` with archetype-specific featuredMetrics templates. Explorer: [Mkt Cap, 52w Range, Gold Exposure, Drawdown]. Developer: [Mkt Cap, 52w Range, Analyst Target, Drawdown]. Tech: [Mkt Cap, Fwd P/E, Rev Growth, Drawdown]. Default/producer/financial/reit: [Mkt Cap, Fwd P/E, Div Yield, Drawdown].
- [x] **S3**: `home.js` imports `REFERENCE_DATA`, uses `_getArchetype()` for archetype lookup.
- [x] **S4**: `isDataPending()` now archetype-aware: explorer/developer stocks only require Mkt Cap or Drawdown to show as active (not P/E or Div Yield).
- [x] **S5**: Populated `reference.json` for OBM (520M shares, A$775M), WIA (353M, A$177M), SNX (1860M, A$112M).
- [x] **S6**: Regenerated `featuredMetrics` in `_index.json` for 6 gold stocks using archetype templates.
- [x] **S7**: Unified gold section: single "Gold" nav entry in `renderSectionNav()`. `renderReport()` prefers `goldAgent`, falls back to `goldAnalysis`. Removed duplicate Section 11 nav entry.
- [x] **S8**: SNX gold agent endpoint verified (HTTP 200, 55s). Notebook content contains RMS data; parked for manual notebook population.
- [x] **S9**: `scaffold.py`: `_build_featured_metrics()` selects template by archetype at scaffold time.
- [x] **S10**: `scaffold.py`: `infer_archetype()` with sector/sub-sector heuristics + `_ARCHETYPE_OVERRIDES` dict.
- **NOTE**: SNX NotebookLM notebook (`c5470e1a`) currently contains Ramelius Resources (RMS) documents. Must be repopulated with SNX-specific source material before re-running the gold agent.

**Session work (2026-03-20) -- Infrastructure migration and workflow fixes:**
- [x] **Cloudflare Pages frontend deployment**: migrated from Vercel. GitHub Pages deploy workflow disabled (`if: false`).
- [x] **Fly.io backend deployment**: `fly-deploy.yml` updated with `--lease-timeout=120s --wait-timeout=300` to handle VM lease contention from concurrent data pipeline deploys.
- [x] **Database Backup workflow fixed**: `db-backup.yml` pinned to `ubuntu-22.04` with pg 17 client from PGDG repo; `sslmode=disable` forced in connection URL (Fly.io proxy handles transport encryption, does not support PostgreSQL SSL negotiation).
- [x] **Daily Research Update workflow fixed**: Added `git checkout -- .` and `git clean -fd` after commit but before `git pull --rebase` to clean unstaged changes from scripts.
- [x] **Analyst panel width**: `--analyst-panel-width` changed from 380px to 480px in `src/styles/tokens.css`.
- [x] **Static file serving removed from API**: `serve_frontend` catch-all and `DIST_ROOT` removed from `api/main.py`. `/data/` endpoint preserved for research JSON serving to Cloudflare Pages frontend.
- [x] **Sector ETF tickers fixed**: All 14 entries in `SECTOR_ETF_MAP` (`api/price_drivers.py`) changed from `.AX` ETF format to `^AX` index format. Yahoo Finance returns 404 for all `.AX` sector ETF symbols; `^AX` equivalents all return 200.
- [x] 202/202 Vitest passing. Build succeeds. Fly.io healthy.

**Recent commits (last six):**
- `fcd77b5` fix: remove static file serving + fix sector ETF Yahoo tickers
- `b954bff` chore: Vercel config (since removed; migrated to Cloudflare Pages)
- `4b991ff` fix: install pg 17 client on ubuntu-22.04 for db-backup
- `71ce5ea` fix: repair three failing GitHub Actions workflows
- `037c3a6` fix: widen analyst panel from 380px to 480px
- `db3b031` feat: wire custom domain api.continuumintelligence.ai (Phase 4)

**Do not fix without instruction:**
- `previousSkew` is empty string on the first Fly.io refresh after a fresh deploy. This is expected; momentum arrows are suppressed when empty.
- `window.CI_API_KEY` is not set in `index.html`. It is injected via a mechanism not in this repo. The fallback `window.CI_API_KEY || ''` disables auth in dev mode. Do not add a hardcoded key.

---

## Gotchas

- **Two test frameworks with a defined ownership boundary.** Vitest owns unit tests for `src/` modules (`src/lib/*.test.js`, `src/data/*.test.js`, `src/pages/*.test.js`). Jest owns data integrity and integration tests (`tests/*.test.js`). New unit tests for `src/` logic go in Vitest; new data or integration tests go in Jest. `npm run test:unit` runs Vitest only -- what CI runs. Jest tests can fail without blocking deployment. Do not assume passing `npm run test` means CI will pass.
- **`loadFullResearchData()` has a localStorage fast-path.** If `ci_research_TICKER` exists in localStorage with a `_lastRefreshed` field, the function returns cached data without fetching `data/research/TICKER.json`. During debugging, stale localStorage will mask whether a file change is actually being served.
- **`ContinuumDynamics.hydrateAll()` runs at boot before pages initialise.** Calling it again after `initHomePage()` will re-derive all computed metrics from the current `STOCK_DATA` live price. This will silently overwrite manual test values.
- **`git log --all` throws mmap errors** on this path due to OneDrive file locking. Use `git log` without `--all`.
- **`npm run build` copies `data/` via a Vite plugin, not `publicDir`.** The `public/` directory is copied separately. Verify new data files land in `dist/data/` after build.
- **SheetJS is lazy-loaded on portfolio upload interaction only.** It loads from a CDN URL stored in a `data-src` attribute on a placeholder element in `index.html`. If the CDN fails, an `alert()` tells the user to try CSV instead.
- **`marked` and `DOMPurify` are bundled npm dependencies** (commit `4ae62e7`). `chat.js` imports them as ES modules. The CDN script tags and regex fallback parser were removed. `cdnjs.cloudflare.com` removed from the CSP.

---

## Decision Rules

- **Before editing `index.html`:** run `git pull origin main` and confirm you are at the latest commit. No exceptions.
- **Before touching the skew-gate logic in `src/pages/portfolio.js`:** re-read the three-branch rules in MEMORY.md. The logic has been broken twice.
- **If a bug is in `public/js/personalisation.js`:** stop and flag it. That file is ~1,800 lines, untested by CI, and owns the personalisation pipeline. Changes have outsized blast radius.
- **If a fix touches more than two files:** enter Plan Mode. Present the diff surface before writing code.
- **If a Jest test fails but Vitest passes:** report it rather than patching to silence it. Jest uses jsdom; some DOM interactions behave differently. Do not block the task on a Jest-only failure.
- **If you find a bug unrelated to the current task:** record it in a note and raise it. Do not fix it inline. Silent scope creep has caused multiple regressions in this codebase.
- **If Fly.io returns 5xx on `/api/refresh/TICKER`:** do not retry automatically. The job may already be running. Check `/api/refresh/TICKER/status` first.
- **When uncertain about environment:** `src/lib/api-config.js` is the canonical source. It returns `https://api.continuumintelligence.ai` for any non-localhost hostname. The frontend runs on Cloudflare Pages (`continuum-intelligence-v3.pages.dev` or custom domain `app.continuumintelligence.ai`).

---

## Style

- Australian English throughout. No em-dashes. En-dashes or restructured sentences only.
- Commit messages: imperative mood, present tense, referencing the specific file or feature (`Portfolio: fix weight calculation`). Match the pattern in `git log`.
- Variable declarations in classic scripts (`js/`, `scripts/`): use `var`. In `src/`: `const`/`let` per existing file convention.
- Do not add JSDoc to functions you did not write. Do not remove existing JSDoc.

---

## Workflow Orchestration

### Plan Mode

Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions). Write a plan to `tasks/todo.md` with checkable items before writing code. If something goes sideways mid-execution, STOP and re-plan immediately rather than pushing forward. Use plan mode for verification steps, not just building.

### Subagent Strategy

Use subagents liberally to keep the main context window clean. Offload research, exploration, and parallel analysis to subagents. For complex problems, throw more compute at it via subagents. One focused task per subagent.

### Self-Improvement Loop

After ANY correction from the user, update `tasks/lessons.md` with the pattern and write a rule that prevents the same mistake. Review `tasks/lessons.md` at the start of every session for patterns relevant to the current project.

### Verification Before Done

Never mark a task complete without proving it works. Run tests, check logs, demonstrate correctness. Diff behaviour between main and your changes when relevant. Ask: "Would a staff engineer approve this?"

### Elegance Check

For non-trivial changes, pause and ask "is there a more elegant way?" If a fix feels hacky, step back and implement the clean solution. Skip this for simple, obvious fixes.

### Autonomous Bug Fixing

When given a bug report, just fix it. Point at logs, errors, failing tests, then resolve them. Zero hand-holding required from the user. Go fix failing CI tests without being told how.

### Task Tracking

1. Write plan to `tasks/todo.md` with checkable items
2. Check in with user before starting implementation
3. Mark items complete as you go
4. High-level summary at each step
5. Add review section to `tasks/todo.md` on completion
6. Update `tasks/lessons.md` after any correction

### Core Principles

- Simplicity first. Make every change as simple as possible. Minimal code impact.
- No laziness. Find root causes. No temporary fixes. Senior developer standards.
- Minimal blast radius. Changes touch only what is necessary. Avoid introducing bugs.

## Session Log: 21 Mar 2026 -- PM Chat Phase D (PM Intelligence and Structured Recommendations)

### PM Constitution

`api/pm_constitution.py` -- operational rules injected as hard constraints into the PM system prompt. Not guidelines; these are limits the PM must obey.

**Artefacts:**
- `CONVICTION_SIZE_LADDER`: 5 rungs from Highest (4-6%) to Watch (0%). Maps conviction level to position sizing range.
- `SOURCE_OF_FUNDS_HIERARCHY`: 6-step priority order for funding new positions (excess cash first, do-not-fund last).
- `PORTFOLIO_ROLES`: Core, Satellite, Starter, Legacy, Cash.
- `RECOMMENDATION_TYPES`: Add, Trim, Hold, Watch, Rebalance, Exit, No Action.
- `RISK_FLAG_TAXONOMY`: 7 codes (HIGH_SINGLE_NAME, HIGH_TOP5, HIGH_TOP10, HIGH_SECTOR, LOW_CASH, HIGH_CASH, UNMAPPED_SECTOR) with category and urgency.
- `RECOMMENDATION_SCHEMA`: 8-field structured output (action, security, sizing_band, rationale, portfolio_effect, risks_tradeoffs, data_basis, confidence).
- `build_constitution_text(thresholds?)`: generates full Constitution text for prompt injection. Accepts custom thresholds.

### PM context assembler

`api/pm_context.py` -- converts raw portfolio state into PM-readable context blocks.

- `snapshot_staleness_days(as_of_date)`: days between snapshot and today.
- `staleness_warning(days)`: None if fresh (<2 days), note if 2-4 days, WARNING if >=5 days.
- `build_portfolio_context(portfolio_state, analytics?)`: formats snapshot + analytics into markdown with holdings table, sector exposure, theme exposure, active flags.
- `build_analyst_context(ticker, summary?)`: optional Analyst summary for referenced ticker. "No Analyst summary available" if None.
- `build_safe_failure_context(...)`: graduated degradation: no portfolio, no snapshot, stale data, unmapped sectors, zero holdings. Returns None when all clear.

### PM prompt builder

`api/pm_prompt_builder.py` -- single assembly point for the PM system prompt. 7 sections:

1. PM_IDENTITY: first-person plural, numerically precise, trade-off aware, defers to Analyst on stock quality.
2. PM_VOICE_RULES: lead with decision, use sizing ranges, cite actual numbers, structured recommendation format.
3. Constitution: hard constraints from `pm_constitution.py`.
4. Safe-failure warnings: conditional, only if data problems detected.
5. Portfolio context: snapshot + analytics + flags (only if portfolio loaded).
6. Analyst summary: for referenced ticker (only if selected_ticker or candidate_security provided).
7. Candidate security framing: source-of-funds and portfolio-effect analysis (only if candidate_security provided).

`build_pm_system_prompt()` accepts: portfolio_state, analytics, thresholds, analyst_summary, selected_ticker, candidate_security.

### PM Chat endpoint update

`api/pm_chat.py` -- endpoint now fetches portfolio state via `portfolio_db.get_portfolio_state()` and passes full context to `build_pm_system_prompt()`. Conversation history bounded to MAX_CONVERSATION_TURNS * 2 messages.

### Recommendation renderer

`src/features/pm-chat.js` -- `_renderRecommendationCard()` and `_parseRecommendationBlocks()` parse structured recommendation blocks from PM responses and render colour-coded cards. Colours: Add (teal), Trim (amber), Exit (red), Hold (blue-grey), Watch (purple), Rebalance (cyan), No Action (grey-green).

### Evaluation pack

`api/tests/pm_eval_pack.py` -- 9 scenarios for manual review or future LLM-graded evals. Each has portfolio data, question, expected_behaviours list, anti_behaviours list. Scenarios: concentrated_winner, good_stock_wrong_portfolio, new_idea_no_source, high_cash_no_action, sector_crowding, incomplete_mapping, zero_holdings, do_nothing, stale_data.

### Files created
- `api/pm_constitution.py` -- PM Constitution (~150 lines)
- `api/pm_context.py` -- context assembler (~170 lines)
- `api/tests/test_pm_prompt.py` -- 30 unit tests (Constitution, context, safe-failure, staleness, prompt builder)
- `api/tests/pm_eval_pack.py` -- 9 evaluation scenarios

### Files modified
- `api/pm_prompt_builder.py` -- complete rewrite from Phase A stub to 7-section prompt assembly
- `api/pm_chat.py` -- endpoint now fetches portfolio state and builds full PM prompt with context
- `src/features/pm-chat.js` -- recommendation card renderer with colour-coded structured output parsing

### Test results
- Vitest: 206/206 passing (no regressions)
- Pytest portfolio (Phase B): 24/24 passing
- Pytest analytics (Phase C): 47/47 passing
- Pytest PM prompt (Phase D): 30/30 passing
- Total Python tests: 101/101 passing

---

## Session Log: 21 Mar 2026 -- PM Chat Phase D0 (Personalisation-PM Unification)

Phase D0 unifies the Personalisation system with PM Chat so PM operates off the user's actual mandate and portfolio context. Reclassified from Phase E to D0 (prerequisite to PM intelligence). Key architectural decisions: Phase B DB is canonical portfolio source; mandate in localStorage v1 only; alignment computed once on backend; Constitution safety caps > user mandate > house defaults.

### D0.1: Mandate settings in Personalisation wizard

`public/js/personalisation.js` -- added `mandate` object to `pnState` with 11 fields (maxPositionSize, sectorCap, cashRangeMin, cashRangeMax, turnoverTolerance, concentrationTolerance, styleBias, riskAppetite, positionDirection, restrictedNames, benchmarkFraming). `PN_MANDATE_SAFETY_CAPS` enforces absolute limits. `pnClampMandate()` clamps on save. Step 2 extended with sliders, selects, restricted names input, long-short warning. localStorage bumped v2 to v3 with backward compatibility.

### D0.2: Canonical portfolio bridge

`public/js/personalisation.js` -- `pnSyncPortfolioToDB()` converts Step 3 holdings to Phase B snapshot via `POST /api/portfolios/{id}/snapshots` using notional $1M total value. `pnLoadPortfolioFromDB()` fetches DB state and populates Step 3. `window.pnGetPortfolioId` and `window.pnGetPersonalisationContext` exports wired. `src/features/pm-chat.js` updated to include `portfolio_id` and `personalisation_context` in fetch body.

### D0.3: Shared PersonalisationContext

`api/personalisation_context.py` (~260 lines) -- `SAFETY_CAPS` dict (absolute maximums), `MANDATE_DEFAULTS` dict. `MandateSettings` dataclass: 11 fields, `__post_init__` clamps to safety caps, `to_thresholds()`, `has_custom_values()`. `CognitiveProfile` dataclass: big_five, crt_score, biases, preferences. `PersonalisationContext` dataclass: mandate + cognitive_profile + firm/fund fields. `parse_personalisation_context(data)` parses frontend JSON with percentage-to-decimal conversion. `api/pm_chat.py` updated to parse personalisation context and derive mandate thresholds.

### D0.4: Backend alignment engine

`api/portfolio_alignment.py` (~330 lines) -- pure deterministic, no LLM, no network (except local research JSON reads).

- `classify_alignment(position_direction, evidence_skew)`: single source of truth for alignment classification (aligned/contradicts/neutral/not-covered)
- `compute_hypothesis_dna()`: portfolio-level upside/downside weighted exposure, concentration risk detection (>50% of covered weight on single hypothesis)
- `compute_hedge_gaps()`: correlated downside (>=2 holdings, >10% combined weight sharing same downside hypothesis) and single-name unhedged (>40% score, >5% weight)
- `compute_reweighting_deltas()`: trim contradicts, review aligned below half-max, trim above mandate limit
- `detect_changes()`: new/removed positions, weight changes >1pp
- `compute_alignment()`: master entry point, returns complete diagnostics dict

### D0.5: PM prompt builder extension

`api/pm_prompt_builder.py` -- added `personalisation` and `alignment_diagnostics` parameters. `_build_mandate_section()` renders firm/fund context, mandate settings with percentage formatting, cognitive profile with behavioural cues (high neuroticism = calm framing, high CRT = Socratic questioning), bias vulnerabilities. `_build_alignment_section()` renders alignment summary, hypothesis DNA, hedge gaps (capped at 5), restricted violations, reweighting signals, recent changes. Section ordering: Identity > Voice > Constitution > Mandate > Safe-failure > Portfolio Context > Alignment > Analyst Summary > Candidate Security.

### D0.6: Eval pack

- `api/tests/test_personalisation_context.py` -- 17 tests (MandateSettings defaults/clamping/thresholds/custom values, parse_personalisation_context full payload/clamping/pct conversion, CognitiveProfile)
- `api/tests/test_portfolio_alignment.py` -- 39 tests (classify_alignment 7, parse_score 4, resolve_skew 3, hypothesis_dna 3, hedge_gaps 3, reweighting_deltas 4, detect_changes 5, compute_alignment integration 4, prompt builder integration 6)

### Bug fix during testing

`portfolio_alignment.py` line 424: no-research fallback skew direction was `"balanced"` (classifying as neutral) instead of `""` (classifying as not-covered). Fixed to empty string so tickers without research correctly report as not-covered.

### Files created
- `api/personalisation_context.py` -- shared PersonalisationContext (~260 lines)
- `api/portfolio_alignment.py` -- alignment engine (~330 lines)
- `api/tests/test_personalisation_context.py` -- 17 tests
- `api/tests/test_portfolio_alignment.py` -- 39 tests

### Files modified
- `public/js/personalisation.js` -- mandate settings, DB bridge, window exports
- `public/css/personalisation.css` -- mandate section styling
- `api/pm_prompt_builder.py` -- mandate section, alignment diagnostics section
- `api/pm_chat.py` -- personalisation_context field, alignment computation, prompt wiring
- `src/features/pm-chat.js` -- portfolio_id and personalisation_context in fetch body

### Test results
- Vitest: 206/206 passing (no regressions)
- Pytest personalisation context (Phase D0.3): 17/17 passing
- Pytest portfolio alignment (Phase D0.4-D0.6): 39/39 passing
- Pytest existing (Phases B+C+D): 101/101 passing
- Total Python tests: 157/157 passing

---

## Session Log: 21 Mar 2026 -- PM Chat Phase D1 (Decision Discipline Remediation)

Phase D1 closes the governance gaps identified in the D0/D audit. The bones of PM existed (Constitution, context assembler, prompt builder, recommendation renderer, 9 eval scenarios) but the decision discipline was incomplete. D1 adds the controls that stop PM from behaving like a polished generalist instead of a real allocator.

### D1.1: Mandate breach engine

`api/portfolio_alignment.py` -- `compute_mandate_breaches()` added. Deterministic, backend-only. Cross-references actual portfolio analytics against the user's mandate limits.

**Breach types detected:**
- `POSITION_BREACH`: single-name weight exceeds mandate max. Recommended posture: `trim`.
- `SECTOR_BREACH`: sector exposure exceeds mandate cap (Unclassified sector ignored). Recommended posture: `trim`.
- `CASH_BELOW_MIN`: cash weight below mandate minimum. Recommended posture: `block_add`.
- `CASH_ABOVE_MAX`: cash weight above mandate maximum. Recommended posture: `review`.

**Breach object structure:** code, severity (critical/warning), metric, metric_name, limit, recommended_posture, description.

Severity thresholds: position breach critical if overshoot >10pp; sector breach critical if overshoot >15pp; cash-above-max critical if >50%.

Integrated into `compute_alignment()` master entry point. New parameters: `mandate_sector_cap`, `mandate_cash_min`, `mandate_cash_max`, `mandate_turnover_tolerance`, `analytics`. `pm_chat.py` passes all mandate parameters and analytics to alignment computation.

### D1.2: PM prompt discipline patch -- not-covered names and reweighting signals

`api/pm_prompt_builder.py` -- two new prompt sections added to `PM_VOICE_RULES`:

**NOT-COVERED NAME RULES:** Flag explicitly as unsupported by research. Treat conservatively (zero alignment contribution). Do not recommend increase without Analyst coverage. If material (>5%), recommend requesting coverage. Frame as information gap, not sell signal.

**REWEIGHTING SIGNAL RULES:** Explicitly framed as evidence inputs, not instructions. PM must assess mandate fit, source of funds, turnover cost, concentration effect, and coverage quality for each signal. If signals conflict, explain tension and use mandate hierarchy to resolve.

### D1.3: Five PM answer types codified

`api/pm_prompt_builder.py` -- `PM ANSWER TYPES` section added with explicit response policies:

1. **Mandate-aware recommendations**: check breach/approach to limits, state constraint explicitly, address existing breaches first.
2. **Evidence contradictions**: name the contradiction, state weight at risk, recommend proportional action, do NOT auto-sell.
3. **Hypothesis concentration risks**: name shared hypothesis and combined weight, distinguish intentional thematic bet from accidental correlated risk.
4. **Source-of-funds within mandate constraints**: apply hierarchy strictly, check funding source does not create new breach, flag turnover tolerance, state what worsens.
5. **Change-driven alerts**: state what changed, assess alignment impact, address mandate breaches immediately.

### D1.4: Eval pack expansion -- 9 mandate-aware scenarios

`api/tests/pm_eval_pack.py` -- 9 new scenarios added (total: 18):

10. `restricted_name_violation` -- BHP on restricted list, PM must flag and recommend exit
11. `uncovered_top5_position` -- NOEXIST at 33% weight with no research coverage
12. `mandate_tighter_than_default` -- user max 10% vs Constitution default 15%
13. `sector_breach_user_mandate` -- Financials 80% vs user cap 25%
14. `turnover_constrained_rebalance` -- low turnover tolerance constrains trade count
15. `evidence_contradiction_no_sell` -- contradiction present but no automatic exit
16. `reweight_blocked_by_mandate` -- evidence supports but mandate max already breached
17. `long_short_unsupported` -- user selected long-short but analytics do not support
18. `do_nothing_despite_signals` -- reweighting signals exist but best action is no action

### D1.5: Mandate and breaches surfaced in PM UI

`src/features/pm-chat.js` -- PM Chat response handler now captures `mandate_breaches`, `alignment_score`, and `not_covered_count` from the API response. `_renderMandateStatus()` renders a compact status bar above the messages area with:

- Alignment score pill (green >=70%, gold 40-69%, red <40%)
- Uncovered count pill (if any holdings lack research)
- Breach summary pill with count by severity (tooltip shows descriptions)

`api/pm_chat.py` -- `PMChatResponse` extended with `mandate_breaches` (list of `MandateBreach`), `alignment_score` (float), `not_covered_count` (int).

`src/styles/pm-chat.css` -- 6 new status pill classes with both dark and light theme support.

### Files created
- None (all changes are modifications to existing files)

### Files modified
- `api/portfolio_alignment.py` -- `compute_mandate_breaches()`, expanded `compute_alignment()` signature
- `api/pm_prompt_builder.py` -- answer types, not-covered rules, reweighting rules, mandate breach prompt section
- `api/pm_chat.py` -- `MandateBreach` model, expanded response, full mandate params to alignment
- `api/tests/pm_eval_pack.py` -- 9 new mandate-aware scenarios (18 total)
- `api/tests/test_portfolio_alignment.py` -- 15 new tests (mandate breaches, prompt rules)
- `src/features/pm-chat.js` -- mandate status bar rendering, response metadata capture
- `src/styles/pm-chat.css` -- mandate status bar styling

### Test results
- Vitest: 206/206 passing (no regressions)
- Pytest personalisation context (D0): 17/17 passing
- Pytest portfolio alignment (D0+D1): 50/50 passing
- Pytest existing (Phases B+C+D): 101/101 passing
- Pytest eval pack prompt tests: 4/4 new passing
- Total Python tests: 172/172 passing

---

## Session Log: 21 Mar 2026 -- Phase F (Analyst-to-PM Handoff)

Phase F makes Analyst and PM work like a real investment team. The Analyst underwrites stocks; the PM decides portfolio action. Phase F adds explicit cross-role handoff, structured summary delivery, handoff logging, and UI actions in both panels.

### F.1: Database schema (migration 016)

`api/migrations/016_handoffs.sql` -- handoff log table:
- `handoffs`: source_role, destination_role, ticker, summary_payload JSONB, source_conversation_id, handoff_reason, coverage_state, analyst_summary_version
- Indexes on identity + recency, ticker + recency

### F.2: Analyst summary assembly

`api/handoff.py` -- assembles Analyst summary from existing memories:
- `build_analyst_summary()`: async, pulls memories from DB, computes coverage state (covered/stale/not_covered)
- Extracts: conviction_level (high/medium/low/none), valuation_stance (undervalued/fair/overvalued/unknown), key_risks (max 5), tripwires (max 5)
- `_compute_summary_version()`: deterministic hash of memory IDs + timestamps
- `_assess_coverage_state()`: checks freshness of most recent memory against staleness threshold (default 30 days)
- Handoff payload schema: ticker, analyst_summary_text, conviction_level, valuation_stance, key_risks, tripwires, coverage_state, timestamp, summary_version

### F.3: Handoff API endpoints

`api/handoff_api.py` -- REST endpoints:
- `POST /api/handoffs/analyst-to-pm`: Analyst sends ticker to PM, assembles summary, logs handoff
- `POST /api/handoffs/pm-requests-analyst`: PM requests Analyst summary, logs handoff
- `GET /api/handoffs/summary/{ticker}`: read-only Analyst summary (no log)
- `GET /api/handoffs`: list handoff log entries with ticker/role filters

### F.4: PM prompt injection

`api/pm_context.py` -- enhanced `build_analyst_context()`:
- Now accepts str (legacy), dict (handoff payload), or None
- Dict path renders rich context: coverage state badge, conviction, valuation, risks, tripwires, version
- Stale coverage gets explicit WARNING before content
- Not-covered gets clear information gap framing

`api/pm_chat.py` -- auto-fetch:
- When `selected_ticker` or `candidate_security` is set, auto-fetches Analyst summary via `handoff.build_analyst_summary()`
- Passes structured payload to `build_pm_system_prompt(analyst_summary=...)`

### F.5: Decision basis extensions

`api/pm_memory_extractor.py` -- `build_decision_basis()` now F.1:
- Added: `analyst_summary_version`, `analyst_coverage_state`
- Version bumped from E.1 to F.1
- PM decisions now record whether they had Analyst input and its freshness

### F.6: Frontend UI

`src/features/chat.js` -- Analyst panel:
- "Assess portfolio fit in PM" button on every Analyst response when ticker is active
- Button calls `POST /api/handoffs/analyst-to-pm`, logs handoff, then switches to PM mode
- PM receives a contextualised question including conviction and valuation from the Analyst

`src/features/pm-chat.js` -- PM panel:
- `handleAnalystToPMHandoff()`: receives ticker + summary payload, switches to PM mode, auto-sends
- `viewAnalystSummary()`: fetches and displays inline card with coverage state, conviction, risks, tripwires
- "View Analyst Summary" button on PM responses when a handoff ticker is tracked
- Analyst summary card shows: source badge, coverage state, conviction level, valuation, risks, tripwires, version

### F.7: Eval scenarios (6 new, 24 total)

`api/tests/pm_eval_pack.py` -- Phase F scenarios:
- 19: `handoff_covered_stock` -- Analyst-to-PM with full coverage
- 20: `handoff_uncovered_stock` -- Analyst-to-PM with no coverage
- 21: `handoff_stale_analyst_summary` -- PM requests stale coverage
- 22: `handoff_missing_analyst_record` -- PM handles missing Analyst record
- 23: `handoff_no_duplicate_clutter` -- handoff doesn't duplicate memory
- 24: `handoff_recommendation_changes` -- PM changes after Analyst input

### F.8: Tests

`api/tests/test_handoff.py` -- 42 tests across 7 classes:
- `TestAnalystSummaryAssembly` (17): version hash, conviction extraction, valuation, risks, tripwires, summary text
- `TestCoverageState` (4): not_covered, covered, stale, custom threshold
- `TestHandoffPayload` (4): no pool, no identity, field schema, ticker uppercasing
- `TestDecisionBasisPhaseF` (4): version F.1, analyst fields, defaults
- `TestHandoffDBGuards` (5): pool-None and identity-None guards
- `TestPMContextHandoff` (5): plain string, None, dict covered/not_covered/stale
- `TestPhaseFFEvalCoverage` (4): 24 scenarios, Phase F names, analyst_summary fields

### Test results

- Pytest: 259/259 passing (42 new Phase F tests)
- Vitest: 206/206 passing
- Vite build: passes

---

## Session Log: 21 Mar 2026 -- Portfolio Go-Live Verification Gates 2 and 3

### Gate 2 -- Golden Portfolio Test Suite

Built and passing.

**Coverage:** 92 tests across 15 fixed portfolios with hand-computed expected outputs.

**Assertions:**
- position weights
- concentration metrics
- risk flags
- mandate breaches
- alignment classifications
- theme exposures

All asserted against manually calculated values with **0.05% tolerance**.

**Portfolio set includes:**
- balanced portfolio
- concentrated portfolio
- single-stock portfolio
- all-cash portfolio
- cash-heavy portfolio
- cash-light portfolio
- exact-threshold edge cases
- mixed alignment with real research files
- multi-breach detection
- tight and relaxed mandates
- restricted names
- change detection
- HHI verification
- determinism
- input non-mutation

**Result:** all 92 tests pass.

### Gate 3 -- PM Decision Quality Scoring Harness

Built and passing.

**Coverage:** 43 tests validating the 24-scenario PM eval pack structurally.

**Rubric:** 5 dimensions at 20 points each, for a **100-point maximum**:
- Decision Clarity
- Constitution Fidelity
- Evidence Grounding
- Role Discipline
- Trade-off Disclosure

**Harness guarantees:**
- each scenario covers 2 or more rubric dimensions
- all dimensions are tested by 5 or more scenarios
- expected and anti-behaviours do not overlap
- anti-behaviours contain explicit negation language
- all 5 PM answer types are covered
- all 4 breach types are covered
- all 3 coverage states are represented: `covered`, `stale`, `not_covered`

Includes a keyword-based `score_pm_response()` function for offline scoring.
**Production recommendation:** use LLM-as-judge for final qualitative grading.

**Result:** all 43 tests pass.

### Verification status

**Full suite:** 394 pytest + 206 Vitest = **600 total tests passing**.
**Build:** Vite production build clean.

---

## Session Log: 21 Mar 2026 -- Gates 4-6 Verification and Defect Fixes

### Gates 4-6 verification

Code-level verification of all checklist items in `GATES_4_6_CHECKLIST.md`. 119 items checked across UX walkthrough, memory/journal audit, and production readiness. Results: 113 pass, 5 defects found, 1 not applicable.

### Defects found and fixed

**D4-1 (Low, FIXED):** PM insight confidence not displayed in Journal. Added confidence badge to `_renderPMInsightCard` in `src/pages/memory.js` with green/gold/red styling. CSS classes: `.jnl-pm-confidence--high/med/low`.

**D5-1 (Low, accepted risk):** No deduplication between PM decisions and insights. Extraction prompt discourages it; max caps (3 decisions, 5 insights) limit blast radius.

**D6-1 (Medium, FIXED):** No feature flag for PM endpoints. Added `ENABLE_PM` environment variable gate to `api/main.py`. Defaults to `true`. Set `ENABLE_PM=false` to disable all 5 PM routers without code changes.

**D6-2 (Low, FIXED):** PM Chat requests not logged. Added `logger.info()` to PM Chat endpoint in `api/pm_chat.py` logging identity, portfolio_id, and context_mode.

**D6-3 (Low, FIXED):** Handoff events not logged. Added `logger.info()` to `log_handoff()` in `api/handoff.py` logging source_role, destination_role, ticker, coverage_state, and handoff_id.

**D6-4 (Low, operational):** PM monitoring dashboards not set up. Blocks full rollout, not canary.

### Release decision

GO FOR CANARY. Full rollout after D6-4 monitoring dashboards and 48-hour clean canary window. See `RELEASE_SIGNOFF.md` for complete sign-off sheet.

### Files created
- `GATES_4_6_CHECKLIST.md` -- 78-item operator checklist for Gates 4-6
- `RELEASE_SIGNOFF.md` -- formal release sign-off sheet

### Files modified
- `api/main.py` -- ENABLE_PM feature flag on PM router registration
- `api/pm_chat.py` -- request logging on PM Chat endpoint
- `api/handoff.py` -- event logging in log_handoff()
- `src/pages/memory.js` -- confidence badge in PM insight cards + CSS

### Test results
- Pytest: 394/394 passing
- Vitest: 206/206 passing
- Vite build: clean

---

## Session Log: 21 Mar 2026 -- PM Memory Phase E (PM Memory and Journal Integration)

Phase E adds persistent memory, structured decision logging, and Journal integration for the PM. PM conversations, decisions, and insights are stored separately from Analyst memory. The PM extractor uses a conservative 7-type taxonomy and logs a compact `decision_basis` object with every decision.

### E.1: Database schema (migration 015)

`api/migrations/015_pm_memory.sql` -- 4 new tables:

- **pm_conversations**: PM conversation sessions linked to portfolio_id and snapshot_id. Separate from Analyst `conversations` (which are per-ticker).
- **pm_messages**: Messages within PM conversations, with `metadata_json` for response metadata (breaches, alignment score).
- **pm_decisions**: Structured decision log with `action_type` (trim/add/exit/hold/rebalance/watch/no_action), `rationale`, `sizing_band`, `source_of_funds`, `mandate_basis`, `breach_codes`, `coverage_state`, and `decision_basis` (JSONB).
- **pm_insights**: PM-specific insights with 7-type taxonomy, `tickers[]`, `tags[]`, `confidence`, `active` flag, and `archived_at` for archive-not-delete semantics.

Indexes on identity + recency for all tables, plus ticker index on decisions and type index on insights.

### E.2: PM database layer

`api/pm_db.py` -- CRUD helpers for all 4 tables, following the same patterns as `db.py`:

- `create_pm_conversation()`, `get_pm_conversation()`, `append_pm_message()`, `list_pm_conversations()`
- `insert_pm_decision()`, `get_pm_decisions()`
- `insert_pm_insight()`, `get_pm_insights()`, `archive_pm_insight()`, `restore_pm_insight()`

All functions are no-op safe (return None/[] if pool is None or identity is missing).

### E.3: PM memory extraction

`api/pm_memory_extractor.py` -- Haiku-powered extraction after each PM Chat turn. Fire-and-forget pattern matching `memory_extractor.py`.

**Decision extraction**: max 3 per turn. Valid action types: trim, add, exit, hold, rebalance, watch, no_action. Each decision gets a compact `decision_basis` object with: snapshot_id, alignment_score, breach_codes, uncovered_count, related_tickers, mandate_hash, version.

**Insight extraction**: max 5 per turn. Conservative taxonomy (7 types):
1. `pm_decision` -- explicit action recommendation logged
2. `portfolio_risk` -- portfolio-level risk or concentration concern
3. `mandate_breach` -- mandate limit violation
4. `sizing_principle` -- sizing or position-management principle
5. `rebalance_suggestion` -- suggested rebalance with trade-offs
6. `uncovered_exposure` -- exposure to names without research coverage
7. `change_alert` -- recent portfolio change affecting alignment

`build_decision_basis()` constructs the compact decision context object (version E.1).

### E.4: PM Chat persistence wiring

`api/pm_chat.py` -- modified for Phase E:
- Added `pm_conversation_id` and `guest_id` to request model
- Added `pm_conversation_id` to response model
- Identity resolution via JWT/guest_id pattern
- Auto-creates PM conversation if none provided
- Stores user + assistant messages with metadata
- Fires background `extract_pm_memory()` task after each response
- Added `_mandate_hash()` for deterministic mandate versioning

### E.5: PM Conversations API

`api/pm_conversations.py` -- endpoints:
- `GET /api/pm-conversations` -- list conversations
- `GET /api/pm-conversations/latest` -- latest for portfolio
- `POST /api/pm-conversations` -- create new
- `GET /api/pm-conversations/{id}` -- restore by ID
- `POST /api/pm-conversations/{id}/messages` -- append message

### E.6: PM Journal API

`api/pm_journal.py` -- unified Journal view:
- `GET /api/pm-journal` -- combined decisions + insights feed, chronologically sorted, with `journal_type` field for frontend filtering
- `GET /api/pm-journal/decisions` -- decisions only
- `GET /api/pm-journal/insights` -- insights only, with type/ticker filters
- `POST /api/pm-journal/insights/{id}/archive` -- archive (soft-delete)
- `POST /api/pm-journal/insights/{id}/restore` -- restore archived

### E.7: Frontend Journal integration

`src/pages/memory.js` -- extended with Analyst | PM source toggle:
- Source toggle bar at top of Journal page (Analyst | PM tabs)
- PM view renders decisions (with action badges, sizing, source-of-funds, breach tags) and insights (with type badges, ticker tags, archive/restore actions)
- Archive-not-delete semantics: archived insights shown in collapsed section with restore option
- PM-specific CSS with action badge colours and decision card layout

`src/features/pm-chat.js` -- conversation persistence:
- Tracks `_pmConversationId` across turns
- Sends `pm_conversation_id` and `guest_id` in request body
- Captures `pm_conversation_id` from response for continuity
- Resets on conversation clear

### E.8: PM memory quality evals

`api/tests/test_pm_memory.py` -- 34 tests:
- `TestDecisionBasis` (4): minimal, full, defaults
- `TestPMExtraction` (8): skip guards, decision/insight extraction, action type validation, insight type validation, cap enforcement, no_action validity
- `TestPMExtractionPrompt` (4): taxonomy coverage, action types, caps, no_action
- `TestPMChatPersistence` (4): request/response model fields, mandate hash determinism
- `TestPMDB` (9): pool-None guards, identity-None guards for all CRUD ops
- `TestPMEvalScenarioCoverage` (4): 18 scenarios parse, key scenarios exist

### Bug fix: pm_eval_pack.py

`api/tests/pm_eval_pack.py` -- Fixed syntax error where scenarios 10-18 were outside the `EVAL_SCENARIOS` list. Removed stray `]` at line 280 so all 18 scenarios are in a single list.

### Files created
- `api/migrations/015_pm_memory.sql`
- `api/pm_db.py`
- `api/pm_memory_extractor.py`
- `api/pm_conversations.py`
- `api/pm_journal.py`
- `api/tests/test_pm_memory.py`

### Files modified
- `api/pm_chat.py` -- persistence wiring, identity resolution, background extraction
- `api/main.py` -- registered pm_conversations_router and pm_journal_router
- `api/tests/pm_eval_pack.py` -- syntax fix (scenarios inside list)
- `src/pages/memory.js` -- Analyst|PM source toggle, PM card rendering, PM API calls
- `src/features/pm-chat.js` -- conversation ID tracking, guest_id in request

### Test results
- Vitest: 206/206 passing (no regressions)
- Pytest Phase E (PM memory): 34/34 new passing
- Pytest total: 217/217 passing
- Build: succeeds

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

**Explainability:** Each flag is an `AnalyticsFlag` with code, severity, human-readable message (containing the actual number and threshold), metric_name, metric_value, threshold. Flag codes: HIGH_SINGLE_NAME, HIGH_TOP5, HIGH_TOP10, HIGH_SECTOR, UNMAPPED_SECTOR, LOW_CASH, HIGH_CASH.

### Persistence

`api/migrations/014_portfolio_analytics.sql` -- `portfolio_analytics` table: snapshot_id (unique FK), analytics_json (JSONB), thresholds_json (JSONB). One row per snapshot; upserts on re-computation.

CRUD in `portfolio_db.py`: `save_analytics()`, `get_analytics()`. Auto-computed and persisted on snapshot creation via `portfolio_api.py`. On-the-fly computation for pre-Phase-C snapshots via `GET /api/portfolios/{id}/analytics`.

### PM dashboard

`src/pages/pm.js` -- exports `renderPMPage()` (static layout) and `updatePMDashboard(analytics)` (dynamic data injection). Sections: summary metrics, concentration (4-metric grid), top positions (ticker/weight/value rows), sector exposure (bar chart), risk flags (icon + message).

### Files created
- `api/portfolio_analytics.py` -- analytics engine (~300 lines)
- `api/migrations/014_portfolio_analytics.sql` -- analytics table migration
- `api/tests/test_portfolio_analytics.py` -- 47 hand-checked test cases

### Files modified
- `api/portfolio_db.py` -- added `save_analytics()`, `get_analytics()`, analytics injection in `get_portfolio_state()`
- `api/portfolio_api.py` -- analytics auto-persist on snapshot create, new `GET /{id}/analytics` endpoint
- `src/pages/pm.js` -- Phase C dashboard with concentration, top positions, sector exposure, flags

### Test results
- Vitest: 206/206 passing (no regressions)
- Pytest portfolio (Phase B): 24/24 passing
- Pytest analytics (Phase C): 47/47 passing (71 total Python)

### Test coverage by scenario
- Long-only diversified (10 positions) -- all metrics hand-checked
- Concentrated (2 positions, 92% single name) -- flags and explanations verified
- Cash-heavy (80% cash) -- HIGH_CASH flag, no LOW_CASH
- Unknown sectors -- UNMAPPED_SECTOR flag, Unclassified bucket
- Single holding -- concentration score = 100
- Zero holdings (all cash) -- no divide-by-zero, position_count = 0
- Custom thresholds -- relaxed = no warnings, tight = many warnings
- Explainability -- every flag has message, metric_value, threshold, percentage
- Low cash -- LOW_CASH flag with correct numbers
- Determinism -- repeated calls produce identical output, no input mutation

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
- `api/portfolio_db.py` -- CRUD + pure analytics: `create_portfolio`, `get_portfolios`, `get_portfolio`, `create_snapshot`, `get_latest_snapshot`, `get_snapshots`, `add_holding`, `add_holdings_batch`, `get_holdings`, `compute_weights`, `compute_sector_exposure`, `concentration_flags`, `get_portfolio_state`
- `api/portfolio_validation.py` -- `validate_snapshot()`: checks negative values, duplicate tickers, missing prices, zero quantities, market_value mismatch, sum inconsistency
- `api/portfolio_api.py` -- REST endpoints: `POST /api/portfolios`, `GET /api/portfolios`, `POST /api/portfolios/{id}/snapshots`, `GET /api/portfolios/{id}/state`, `GET /api/portfolios/{id}/snapshots`
- `api/tests/test_portfolio.py` -- 24 unit tests covering validation, weight derivation, sector exposure, concentration flags

### Files modified
- `api/main.py` -- registered `portfolio_router`
- `api/pm_chat.py` -- expanded `PMChatRequest` with `snapshot_id`, `selected_ticker`, `candidate_security`, `context_mode`; expanded `PMChatResponse` with `snapshot_id`, `context_mode`
- `src/features/pm-chat.js` -- replaced cloned mode switch with `_createModeSwitch()` factory + `_syncAllModeSwitches()` for proper ARIA tablist keyboard navigation (arrow keys, Home/End), synced active states, mobile FAB visibility fix
- `src/pages/pm.js` -- added portfolio selector placeholder, snapshot summary metrics stub (Total Value / Cash / Positions)

### Test results
- Vitest: 206/206 passing (no regressions)
- Pytest portfolio: 24/24 passing

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

## Session Log: 17 Mar 2026 -- PDF Report Redesign + Price Drivers Workflow Fix

### PDF Reports (`src/features/pdf.js`)

Complete rewrite targeting Goldman Sachs equity research layout standards. Both Institutional (long-form) and Investor Briefing (2-page) reports rebuilt from scratch.

**Architecture:** `baseCSS()` shared foundation with colour tokens (`--navy`, `--grn`, `--red`, `--amb`), `buildInstitutional()` and `buildBriefing()` as separate builders. `buildSidebar()` generates the cover key-data panel. All CSS is inlined in the print window -- no external dependencies.

**Key design patterns:**
- Cover page: CSS grid (`1fr 170px`) with right-column sidebar (price, mkt cap, P/E, yield, 52w range, sector, date)
- Evidence: 2-column grid (institutional), 3-column grid (briefing) via `.grid2` / `.grid3`
- Technical analysis: side-by-side columns for MAs and key levels
- Typography: Source Serif 4 for company headers, Inter for data/labels, ALL CAPS labels at 5-6pt
- Colour system: navy `#003A70` primary, rule-based hierarchy (left border-lines, background tints, no card borders/shadows/border-radius)
- Print CSS: `page-break-inside: avoid` on all logical blocks, `page-break-after: avoid` on section headers, `@page` margins 8mm/10mm

**Investor Briefing page layout (after iteration):**
- Page 1: header, metrics, skew, position in range, sparkline, hypothesis bars (expanded to 350 chars), identity table, dominant narrative, technical structure
- Page 2: evidence (all cards, 2-col grid), discriminators (all rows with currentReading), tripwires (all cards, expanded to 200 chars), verdict callout, footer
- No forced page break -- content flows naturally. Evidence coverage table removed to prevent third-page overflow.

**Bugs fixed during session:**
- `&mdash;` replaced with `&ndash;` throughout (8 instances)
- `[object Object]` rendering for `stock.narrative.priceImplication` -- added `narrText()` helper that checks for object types (tries `.text`, `.summary`, then `JSON.stringify` fallback)
- HTML entity `&#9650;` / `&#9660;` rendering as literal text in hypothesis scores -- fixed by ensuring `dirIcon()` output is injected as innerHTML not escaped text

**Known limitations:**
- Fonts not embedded as base64 in print HTML -- falls back to system fonts on machines without Inter/Source Serif 4
- No running page headers on institutional report (CSS cannot repeat elements per printed page without fixed positioning hacks)
- Briefing 2-page fit depends on truncation limits calibrated for BHP-density data; untested across all 24 tickers

### Price Drivers Workflow (`.github/workflows/price-drivers.yml`)

Rewritten to prevent wasted API spend and improve operational resilience.

**Three safeguards added:**
1. **Fail-fast on credit exhaustion:** Checks response body for "credit balance" on any 500. Sets `CREDIT_EXHAUSTED=1` and skips all remaining tickers. Proved out: 8-second run vs 1h 25m.
2. **Freshness skip:** Hits `/api/agents/drivers/{ticker}/latest` before each ticker. If `analysis_date` matches today's UTC date, skips. Prevents redundant re-processing on re-runs.
3. **502 retry:** Gateway timeouts get one retry at 600s (up from 480s) after 10s cooldown. Handles Fly.io timeout flakiness.

**Manual dispatch inputs added:**
- `tickers`: space-separated custom list (blank = all 33)
- `force_all`: boolean to bypass freshness check

**Operational note:** The workflow exit-codes `1` on credit exhaustion (so the GitHub Actions UI shows failure, alerting the operator) but distinguishes it from general failures in the log output.

**Outstanding:** 7 tickers (WAF, WDS, WIA, WOR, WOW, WTC, XRO) awaiting re-run after API credit refresh resolves. Auto-reload should be enabled on Anthropic billing to prevent future mid-run exhaustion.
