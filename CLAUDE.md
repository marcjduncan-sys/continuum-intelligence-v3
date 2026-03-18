# Continuum Intelligence v3 — CLAUDE.md

## Operating Context

You are a senior engineer maintaining a production equity research platform used daily by fund managers. Mistakes ship to GitHub Pages and break live sessions with no rollback beyond a manual revert commit. The default posture is conservative: understand before changing, smallest possible diff, test before marking done. Experimental approaches require explicit instruction.

---

## Commands

```bash
npm run dev          # Dev server on port 5000, proxies /api → localhost:8000
npm run build        # Vite build → dist/; copies data/ → dist/data/
npm run test         # Jest suite (tests/, src/**/*.test.js) — 61 tests
npm run test:unit    # Vitest suite — what CI runs; must pass before pushing — 195 tests
npm run test:all     # Jest + Vitest combined — 256 tests total
npm run lint         # ESLint over scripts/, src/, and public/js/
npm run validate     # lint + test:all — run before any push
```

**Never run** `npm run test:e2e` without a local server running (Playwright requires a live page).
**Never change** `base` in [vite.config.js](vite.config.js). The deploy workflow hard-checks for `base: '/continuum-intelligence-v3/'` and fails the build if it is absent or altered.
**Deploy** is automatic on push to `main` via [.github/workflows/deploy.yml](.github/workflows/deploy.yml). Do not trigger it manually except to rerun a failed build.
**Railway** redeploys automatically when `api/` changes are pushed to `main`. No manual command is needed. Confirm success: `curl https://imaginative-vision-production-16cb.up.railway.app/api/health`. If the health check fails, check Railway dashboard logs. Required environment variables are set in the Railway dashboard, not in code -- read [api/config.py](api/config.py) to see what is required before touching the dashboard.

---

## Architecture Constraints

- **`index.html` is owned by GitHub Actions.** The `continuum-update`, `update-daily`, `update-intraday`, and `live-prices` workflows all commit directly to `main`. Never edit `index.html` from a local copy that has not been pulled. One stale push caused commit `58b2c99`, which simultaneously broke the analyst panel, portfolio DOM, dark mode, and comparator.
- **`public/js/personalisation.js` and the DNE engine scripts load before `src/main.js`.** They are classic `<script>` tags, not ES modules. They write `window.renderPersonalisationPage`, `window.initPersonalisationDemo`, `window.pnBuildSystemPrompt`, and `window.TC_DATA`. If `src/main.js` is loaded before them, those globals will be undefined and `initChat()`, `initRouter()`, and `initThesisPage()` will silently fail.
- **Never replace the `STOCK_DATA`, `REFERENCE_DATA`, `FRESHNESS_DATA`, or `SNAPSHOT_DATA` object references.** They are exported by reference from `src/lib/state.js` and aliased to `window.*`. Replace the reference and every module holding the old pointer will silently diverge. Use `initStockData()`, `setStockData()`, `patchStock()`, or `Object.assign()` instead.
- **`FEATURED_ORDER` and `SNAPSHOT_ORDER` are Proxy objects** backed by live `Object.keys(STOCK_DATA)`. Do not destructure them into a plain array at module load time; they will become stale immediately. Call `.forEach()`, `.map()`, etc. at render time, not at import time.
- **`src/lib/state.js` owns all global state.** No module may declare its own copy of stock, freshness, reference, or snapshot data. The only exceptions are local caches invalidated within the same render cycle.
- **`api/` is the Railway backend (FastAPI/Python), not part of the GitHub Pages build.** Changes to `api/` require a Railway redeploy, not `npm run build`. The frontend connects to `https://imaginative-vision-production-16cb.up.railway.app` when on GitHub Pages, and to `localhost:8000` (via Vite proxy) in dev.
- **`Documents/continuum-v3/` is a dead git worktree.** It contains its own `node_modules`, test files, and stale source. Never edit files there. The active codebase is at the repo root.
- **Do not touch `data/research/_index.json` manually.** It is the canonical stock list and the authoritative source for stock count (currently 25 tickers). Editing it locally will conflict with the next automated commit. When adding a new ticker, update `_index.json` and `data/reference.json` -- do not rely on `REFERENCE_DATA` in `index.html`, which is a known defect covering fewer tickers than `_index.json`. Note: `reference.json` currently has 25 entries (RMC corrected 2026-03-07).
- **`public/js/personalisation.js` is now linted by ESLint** (Task C4). `npm run lint` covers `scripts/`, `src/`, and `public/js/`. Zero errors; warnings only (no-var, prefer-const, etc.).
- **`window.CI_API_KEY` injection is undocumented.** It is not set in `index.html`; Claude Code configured the injection mechanism. Do not modify anything related to `CI_API_KEY` without first grepping the entire repo for all references and tracing the injection point. If it is broken, check (in order): Railway environment variables, GitHub Secrets, any `<script>` tag in `index.html` setting the global.
- **GitHub Actions secrets are not documented in the repo.** Do not rename or delete secrets without checking every workflow file for references first. To diagnose a failing workflow: open the workflow YAML, find which secret it references, then verify that secret exists at GitHub repo Settings > Secrets and variables > Actions.
- **`js/personalisation.js` (root-level) was deleted 2026-03-08.** The canonical file is `public/js/personalisation.js`, which Vite copies verbatim to `dist/js/personalisation.js` via `publicDir: 'public'`. The root-level `js/` directory still exists for `js/dne/` (the DNE engine). Do not recreate `js/personalisation.js` at the repo root -- it is never served in production and creates a shadow copy problem where fixes appear to apply but have no effect.

---

## Current State — 2026-03-18

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
- [x] Phase 4 COMPLETE -- commit `627f74d`: `api/gold_agent.py` (7-query NLM runner + Claude synthesis); `GET /api/agents/gold/{ticker}` endpoint in `api/main.py`; `notebooklm-py>=0.3.3` added to `requirements.txt`; `NOTEBOOKLM_GOLD_NOTEBOOK_ID` + `NOTEBOOKLM_AUTH_JSON` env vars added to `api/config.py`. 129/129 tests pass; Railway healthy.
- [x] **Phase 4 LIVE (2026-03-10)**: Railway env vars set. Live test against NST returned full CI v3 JSON (skew 52, 10 evidence items, 6 gaps) in ~90 seconds. Endpoint confirmed operational.
- **NOTE**: NOTEBOOKLM_AUTH_JSON credentials expire every 1-2 weeks. When the endpoint returns 503, re-run Get NotebookLM Auth.bat from Desktop, copy NOTEBOOKLM_AUTH_JSON.txt content, and update the Railway variable.

**Session work (2026-03-12) -- Phase 8: Batch Analysis:**
- [x] Phase 8 COMPLETE -- commit `d70b6ae`: `api/migrations/008_batch_analysis.sql` (two tables: `memory_batch_runs`, `memory_consolidation_events`); `api/batch_analysis.py` (union-find clustering, Haiku contradiction detection, per-user consolidation); `BATCH_SECRET` added to `api/config.py`; `POST /api/batch/run` endpoint added to `api/main.py` (X-Batch-Secret auth guard); `.github/workflows/batch-analysis.yml` (cron 0 16 * * * = 02:00 AEDT). 218/218 tests passing.
- [x] Endpoint live and auth-guarded: returns 401 on wrong secret; returns batch summary on valid secret.
- [x] **8E DONE (user)**: `BATCH_SECRET` added to Railway env vars and GitHub Secrets.
- [x] **8G DONE**: `batch-analysis` workflow_dispatch triggered; Railway logs confirmed `POST /api/batch/run HTTP/1.1' 200 OK`.

**Session work (2026-03-12) -- Phase 9: Proactive Insights:**
- [x] Phase 9 COMPLETE -- commit `7ec36e1`: `api/migrations/009_notifications.sql` (notifications table + 3 indices); `api/insights.py` (Haiku classifier, 7-day re-notification guard, `scan_ticker`, `run_insight_scan`, `get_notifications`, `dismiss_notification`); `api/main.py` (`GET /api/notifications`, `PATCH /api/notifications/{id}/dismiss`, `POST /api/insights/scan` with X-Insights-Secret auth); `api/config.py` (`INSIGHTS_SECRET`); `src/features/notifications.js` (badge + panel surface, 5-min poll, dynamic CSS injection); `src/main.js` (`initNotifications` wired between Auth and Chat); `.github/workflows/insights-scan.yml` (cron `0 17 * * 1-5` = 03:00 AEDT Mon-Fri). 157/157 Vitest tests passing. Railway healthy; `GET /api/notifications?guest_id=test` returns `[]`.
- [x] **9D DONE (user)**: `INSIGHTS_SECRET` added to Railway env vars and GitHub Secrets.
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
- [x] 157/157 Vitest passing. Build succeeds. Railway healthy (29 tickers). Pre-existing Jest data-integrity failures (EVN scaffold missing hypotheses in `_index.json`) unrelated.

**Session work (2026-03-16) -- Gold Agent Mapping Persistency:**
- [x] Commit `749e46c`: Persisted `NOTEBOOKLM_TICKER_NOTEBOOKS` mapping in the repo. Created `data/config/notebooklm-notebooks.json` as primary source; `config.py` now merges this with env var overrides. This removes the need for manual Railway env var edits when adding new gold stocks.
- [x] Verified syntax and mapping integrity locally.

**Session work (2026-03-13 session 3) -- Home page tile data audit:**
- [x] Commit `f362d11`: Populated `reference.json` for ASB, WAF, NST, EVN (sharesOutstanding, EPS, divPerShare, analyst targets). Fixed RMC `sharesOutstanding` from 396000000 (raw) to 396 (millions convention) -- was producing nonsensical "A$372,240B" market cap. Replaced "Div Yield: N/A" with "Analyst Target" for ASB/WAF (non-dividend payers).
- [x] Commit `3ae5b9c`: Patched `_index.json` for EVN and NST -- missing `featuredMetrics`, `featuredRationale`, `hypotheses`, `skew` fields caused literal "undefined" text on home page cards. Root cause: scaffold process wrote full research JSON but did not copy card fields to `_index.json`.
- [x] 157/157 Vitest passing. Railway healthy (29 tickers).

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
- [x] 157/157 Vitest passing. Build succeeds. Railway healthy (32 tickers).

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

**Recent commits (last six):**
- `4ae62e7` feat: C1 bundle CDN deps via Vite + C2 voice rules JSON + C3 structured errors + C4 lint scope + C5 package v3
- `47372f1` feat: voice rules as build-time static JSON (Task C2)
- `b16e3fc` feat(api): add conversation history token budget (Task B4)
- `f88eb1c` feat(api): pre-compute passage embeddings at ingestion (Task B1)
- `cac218e` feat: B2 hybrid retrieval with RRF + B3 BM25 index caching
- `76ab244` feat: A1 staleness warning injection + A5 chat debounce guard

**Do not fix without instruction:**
- `previousSkew` is empty string on the first Railway refresh after a fresh deploy. This is expected; momentum arrows are suppressed when empty.
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
- **If Railway returns 5xx on `/api/refresh/TICKER`:** do not retry automatically. The job may already be running. Check `/api/refresh/TICKER/status` first.
- **When uncertain about environment:** `window.location.hostname.includes('github.io')` is the canonical environment check used throughout the codebase.

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
3. **502 retry:** Gateway timeouts get one retry at 600s (up from 480s) after 10s cooldown. Handles Railway timeout flakiness.

**Manual dispatch inputs added:**
- `tickers`: space-separated custom list (blank = all 33)
- `force_all`: boolean to bypass freshness check

**Operational note:** The workflow exit-codes `1` on credit exhaustion (so the GitHub Actions UI shows failure, alerting the operator) but distinguishes it from general failures in the log output.

**Outstanding:** 7 tickers (WAF, WDS, WIA, WOR, WOW, WTC, XRO) awaiting re-run after API credit refresh resolves. Auto-reload should be enabled on Anthropic billing to prevent future mid-run exhaustion.
