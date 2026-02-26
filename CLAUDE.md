# Continuum Intelligence v3 — CLAUDE.md

> Operational playbook for AI agents working on this codebase.
> Read this FIRST, in full, before touching anything.

---

## 1. Project Identity

21-stock ASX equity research SPA. Vanilla HTML/JS/CSS frontend on GitHub Pages, Python/FastAPI backend on Railway. Single-page application with hash-based routing. All research data stored as per-ticker JSON files in `data/research/`.

- **Frontend:** GitHub Pages (marcjduncan-sys/continuum-intelligence-v3)
- **Backend:** `https://imaginative-vision-production-16cb.up.railway.app`
- **Frontend sets `REFRESH_API_BASE`** to Railway URL when running on GitHub Pages
- **21 Tickers:** BHP, CBA, CSL, DRO, DXS, FMG, GMG, GYG, HRZ, MQG, NAB, OCL, PME, RFG, RIO, SIG, WDS, WOR, WOW, WTC, XRO

---

## 2. Architecture

### Frontend (index.html, ~13,700 lines)
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

## 3. Hard-Won Rules (Violations Caused Production Failures)

These are not suggestions. Each rule exists because ignoring it caused data loss, OOM crashes, or hours of wasted work.

### 3.1 Railway Is Ephemeral
Railway restarts wipe BOTH in-memory state AND disk writes. Never rely on server-side persistence for anything that matters. All durable state must flow through the frontend to localStorage. This is the single most important architectural constraint.

### 3.2 Always Cache Incrementally
Never design a batch operation that only persists results on full completion. Cache each unit of work the moment it completes. The batch refresh uses `_fetchAndCacheSingleTicker()` to cache each ticker to localStorage as it finishes, tracked via `_batchCachedTickers`. This pattern survived three consecutive Railway OOM restarts and preserved all completed work across retries. Apply this pattern to any new batch operation.

### 3.3 Concurrency Budget on Railway
Railway has ~512MB memory. Firing 21 `gather_all_data()` calls simultaneously caused OOM. Current limits: gather semaphore = 3, LLM semaphore = 2. Do not increase without load testing on Railway. If adding new concurrent operations, audit total memory footprint first.

### 3.4 Server Restart Detection
Frontend polling detects 404 from `/api/refresh-all/status` and shows "Server restarted. N tickers cached." On retry, only uncached tickers are sent via `{"tickers": [...]}`. `_batchCachedTickers` is preserved across retries (never reset). Any new polling mechanism must handle mid-operation server restarts gracefully.

### 3.5 localStorage Key Format
Research data uses `ci_research_` prefix (e.g., `ci_research_BHP`). NOT `continuum_research_`. Verify before reading or writing.

### 3.6 Git: Always Rebase Before Push
`git pull --rebase origin main` before every push. The remote has automated market update commits that land frequently. Pushing without rebase will fail.

### 3.7 Currency Normalisation on Data Merge
When merging refreshed data into STOCK_DATA, currency must be normalised: `AUD` to `A$`, `USD` to `US$`, `GBP` to pound sign, `EUR` to euro sign. `_fetchAndCacheSingleTicker()` handles this. Any new data merge path must do the same or prices display incorrectly.

---

## 4. File Coupling (Read Before Editing)

### 4.1 Never Modify Without Full Impact Analysis
- `computeSkewScore()` — 5+ callers across home, reports, snapshots, portfolio
- `prepareHypotheses()` — remaps N1-N4 labels across evidence, discriminators, tripwires, gaps, verdict, alignment table
- `route()` — master router, controls all page activation
- `loadFullResearchData()` — feeds all report/snapshot renders
- `data-ticker-card` attribute — queried by live price updater
- `.fc-price` class — queried by live price updater

### 4.2 CSS Scoping Rule
Never edit shared CSS classes (`.hero`, `.site-footer`, `.section-header`, `.skew-badge`) directly. Always scope with page ID: `#page-home .hero-title { ... }`

### 4.3 Independence Matrix (from MODULE_MAP.md)
- **Fully isolated (safe):** Personalisation (Unit 7), API Backend (Unit 8), About page
- **Low risk:** Thesis Comparator (Unit 6), Portfolio (Unit 5), Snapshots (Unit 3)
- **High risk:** Stock Reports (Unit 4, many live-data coupling points), Data Loader (Unit 9, feeds everything), Routing (Unit 10, controls everything)

---

## 5. AI Agent Operating Principles

### 5.1 Think Before Acting
Before writing any code, answer three questions: (a) what exactly is the desired end state, (b) what is the minimal change to get there, (c) what could break. If you cannot answer (c), read more code first. The 13,700-line index.html has deep coupling chains that are not obvious from reading a single function.

### 5.2 Scope Discipline
Do the thing you were asked to do. Do not "improve" adjacent code, refactor for style, or add features that were not requested. Every additional change is a risk surface. If you notice something worth fixing, note it in the response, don't fix it silently.

### 5.3 Verify After Every Change
After making a change, verify it works. Do not declare success based on "the code looks right." Run the relevant check: load the page, trigger the function, check the API response, inspect localStorage. If running in a browser, take a screenshot and actually read it.

### 5.4 Never Assume, Always Check
- Do not assume a variable name, key prefix, or function signature from memory. Grep or read the file.
- Do not assume a feature works from reading one code path. Check error paths, edge cases, and what happens on server restart.
- Do not assume the remote is in sync. Check with `git log --oneline -5` and `git status`.
- Do not assume Railway has the same environment as local. It has ~512MB RAM, ephemeral disk, and restarts under load.

### 5.5 Edit Precision
In a 13,700-line file, surgical edits are mandatory. When using Edit tool or equivalent:
- Include enough surrounding context to make the match unique
- Never use find-and-replace patterns that could match in multiple locations
- After editing, verify the edit landed where intended (read the file back at the target lines)
- Prefer editing existing code over rewriting large blocks

### 5.6 Error Handling Is Not Optional
Every async operation (fetch, localStorage write, DOM query) can fail. Handle the failure case. In this codebase specifically:
- `fetch()` to Railway can return 404 (server restarted), 409 (conflict), 500 (OOM), or network error
- `localStorage.setItem()` can throw quota exceeded
- `document.getElementById()` can return null if the page hasn't rendered yet
- `JSON.parse()` can throw on malformed data

### 5.7 Commit Messages
Be specific about what changed and why. "Fix bug" is useless. "Fix batch refresh: cache each ticker incrementally to survive Railway restarts" tells the next person what happened and why.

---

## 6. AI-Specific Anti-Patterns (Observed Failures)

### 6.1 "It Should Work" Without Testing
Never claim a change works without observing it work. This includes: "I've updated the function, it should now correctly..." followed by no verification. The word "should" in a completion message is a red flag.

### 6.2 Optimistic Concurrency
Do not fire N parallel operations and hope the server handles it. Always ask: what is the memory and CPU cost of each operation? What happens if they all run simultaneously? The answer in this codebase was OOM. Use semaphores or sequential execution.

### 6.3 All-or-Nothing Persistence
Never design a system where partial progress is lost on failure. Cache incrementally. Checkpoint. Make operations resumable. This applies to batch refreshes, data migrations, file processing, anything with >1 unit of work.

### 6.4 Ignoring Platform Constraints
Railway's ephemeral filesystem was documented. The OOM threshold was observable. Both were ignored in the initial batch implementation. Before building anything, enumerate the platform's actual constraints: memory, disk persistence, request timeouts, concurrent connection limits.

### 6.5 Scope Creep During Implementation
When fixing a bug, fix that bug. Do not simultaneously refactor the surrounding code, add logging, rename variables, or "clean up" the file. Each additional change multiplies the risk of introducing a new bug and makes the diff harder to review.

### 6.6 Stale Context
In long sessions, earlier assumptions may no longer hold. The server may have restarted. The git remote may have new commits. The localStorage may have been cleared. Re-check state before acting on assumptions from earlier in the conversation.

---

## 7. Code Quality Standards

### 7.1 JavaScript (Frontend)
- No ES6+ syntax that breaks older browsers without transpilation (this is vanilla JS, no build step)
- Use `var` not `let`/`const` for consistency with existing codebase (legacy decision, maintained for consistency)
- All DOM queries must null-check before use
- All fetch calls must handle non-200 responses
- Console.log with `[Module]` prefix for debuggability (e.g., `[BatchRefresh]`, `[MarketFeed]`)

### 7.2 Python (Backend)
- Type hints on all function signatures
- Structured logging with `logger.info/warning/error`, not `print()`
- All async operations must have timeout handling
- Semaphores for any concurrent external API calls
- Pydantic models for request/response validation

### 7.3 Data Integrity
- Research JSON schema must be consistent across all 21 tickers
- When merging new data into existing research JSON, preserve fields not being updated
- When patching STOCK_DATA in memory, preserve `_livePrice` and `priceHistory` (injected by MarketFeed, not part of research JSON)
- Index file (`_index.json`) must stay in sync with individual ticker JSONs

---

## 8. Deployment

### Frontend
Push to `main` branch. GitHub Pages auto-deploys.

### Backend
Push to `main`. Railway auto-deploys from `api/` directory via `railway.json` and `Procfile`.

### Pre-Push Checklist
1. `git status` — no unintended files staged
2. `git diff` — review what's actually changing
3. `git pull --rebase origin main` — sync with automated commits
4. `git push origin main`
5. After push: verify Railway deploy succeeds (check `/api/health` endpoint)

---

## 9. Common Operations

### Running Locally
```bash
cd api && pip install -r requirements.txt
# Set ANTHROPIC_API_KEY, GEMINI_API_KEY env vars
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Adding a New Ticker
1. Create `data/research/{TICKER}.json` with full research schema
2. Update `data/research/_index.json`
3. Ticker auto-appears in coverage table and batch refresh

### Triggering Batch Refresh
- Full: `POST /api/refresh-all` with empty body
- Partial retry: `POST /api/refresh-all` with `{"tickers": ["WOR", "WOW"]}`
- Frontend handles this via "Refresh All Research" button with automatic retry logic

---

## 10. Known Issues
- `personalisation.js` has a SyntaxError (`Unexpected identifier 'PRODUCTION_API'`) affecting the Personalisation tab
- Service worker returns 404 (non-critical)
- Coverage table "UPDATED" column may show stale dates after refresh (pipeline may not update the `date` field, or table reads from static data rather than localStorage cache)
- Dead code: `_fetchAndMergeBatchResults()` still exists in index.html but is no longer called

---

## 11. LLM Integration Patterns

### 11.1 Model Selection
- **Gemini (gemini-2.5-flash):** Used for Stage 2 specialist analysis. Fast, cheap, good at structured extraction.
- **Claude (claude-sonnet-4-5-20250929):** Used for Stage 3 hypothesis synthesis and RAG chat. Better reasoning, used at temperature=0 for deterministic outputs.
- **Rule:** Use the cheapest model that meets quality requirements. Gemini for extraction/classification. Claude for reasoning/synthesis.

### 11.2 Prompt Architecture
- System prompts are defined as constants, not constructed dynamically from user input
- Research context is injected via `<research_context>` XML tags in user messages
- Conversation history is truncated to `MAX_CONVERSATION_TURNS * 2` messages
- Custom system prompts (personalisation) override the default but never modify the safety constraints

### 11.3 API Error Handling
- Anthropic API errors return 502 to frontend with error detail
- Gemini failures should fall back to Claude-only path (not crash the pipeline)
- Rate limits: implement exponential backoff, not immediate retry
- Token limits: truncate context before hitting model limits, do not let the API return a truncation error

### 11.4 Structured Output
When asking an LLM to produce structured data (JSON, scores, classifications):
- Provide the exact schema in the prompt
- Validate the output against the schema before using it
- Handle malformed responses (the LLM will occasionally return invalid JSON)
- Log the raw response before parsing for debugging

### 11.5 Temperature Settings
- temperature=0 for anything that feeds into data (hypothesis scores, evidence extraction, structured outputs)
- temperature=0.7 for conversational chat responses
- Never use temperature>0 for operations where consistency matters across runs

---

## 12. Testing Mental Model

There is no test suite. Verification is manual. When making changes:

1. **API changes:** Hit the endpoint with curl or browser dev tools. Check the response shape and status code.
2. **Frontend data changes:** Open browser console, inspect `STOCK_DATA[ticker]` and `localStorage.getItem('ci_research_TICKER')`.
3. **UI changes:** Load the page, navigate to the affected view, visually confirm.
4. **Batch operations:** Trigger the operation, watch the progress modal, verify localStorage after completion.
5. **Resilience:** Kill the server mid-operation and verify the frontend recovers gracefully.

---

## 13. Session Continuity Notes

When resuming from a previous session or context compaction:
- Re-read this CLAUDE.md first
- Check `git log --oneline -10` for what's changed since last session
- Check Railway health: `curl https://imaginative-vision-production-16cb.up.railway.app/api/health`
- Do not assume any in-memory state from prior sessions. Railway may have restarted. Browser may have been closed. localStorage is the only durable store.
