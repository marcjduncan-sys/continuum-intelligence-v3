# Continuum Intelligence v3 — CLAUDE.md

## Operating Context

You are a senior engineer maintaining a production equity research platform used daily by fund managers. Mistakes ship to GitHub Pages and break live sessions with no rollback beyond a manual revert commit. The default posture is conservative: understand before changing, smallest possible diff, test before marking done. Experimental approaches require explicit instruction.

---

## Commands

```bash
npm run dev          # Dev server on port 5000, proxies /api → localhost:8000
npm run build        # Vite build → dist/; copies data/ → dist/data/
npm run test         # Jest suite (tests/, src/**/*.test.js) — 61 tests
npm run test:unit    # Vitest suite — what CI runs; must pass before pushing — 124 tests
npm run test:all     # Jest + Vitest combined — 185 tests total
npm run lint         # ESLint over scripts/ and src/ only (not js/)
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
- **`public/js/personalisation.js` is NOT linted by ESLint** (`npm run lint` covers `scripts/` and `src/` only). Bugs there will not surface in CI.
- **`window.CI_API_KEY` injection is undocumented.** It is not set in `index.html`; Claude Code configured the injection mechanism. Do not modify anything related to `CI_API_KEY` without first grepping the entire repo for all references and tracing the injection point. If it is broken, check (in order): Railway environment variables, GitHub Secrets, any `<script>` tag in `index.html` setting the global.
- **GitHub Actions secrets are not documented in the repo.** Do not rename or delete secrets without checking every workflow file for references first. To diagnose a failing workflow: open the workflow YAML, find which secret it references, then verify that secret exists at GitHub repo Settings > Secrets and variables > Actions.
- **`js/personalisation.js` (root-level) was deleted 2026-03-08.** The canonical file is `public/js/personalisation.js`, which Vite copies verbatim to `dist/js/personalisation.js` via `publicDir: 'public'`. The root-level `js/` directory still exists for `js/dne/` (the DNE engine). Do not recreate `js/personalisation.js` at the repo root -- it is never served in production and creates a shadow copy problem where fixes appear to apply but have no effect.

---

## Current State — 2026-03-09

**Phase 0 COMPLETE (2026-03-07).** The extraction of logic from `index.html` into `src/` modules is complete. `computeSkewScore` canonicalised to zero-contribution convention (commit `4493e8c`; see `docs/decisions/003-computeskewscore-neutral-convention.md`). `VALID_STATIC_PAGES` confirmed correct: `home`, `deep-research`, `portfolio`, `comparator`, `personalisation`, `about`.

**Phase 1 COMPLETE (2026-03-07).**
- [x] Add Stock modal (`src/features/add-stock.js`) -- already fully implemented, no changes needed.
- [x] Deep Research page (`src/pages/deep-research.js`) -- already fully implemented; fixed hardcoded `DEEP_RESEARCH_TICKERS`, replaced with `_deepResearch` flag (commit `ddada42`).
- [x] Portfolio extraction -- already complete; fixed `renderChangeAlerts`, replaced fake demo data with real `_overcorrection`, freshness, and skew signals (commit `3d9591d`). 15 Vitest tests added.
- [x] TC_DATA externalised to `data/tc.json` -- follows `reference.json` pattern, `initTcData()` wired in `boot()` (commit `415095e`).

**Session work (2026-03-08):**
- [x] Shadow copy elimination complete (commit `f309fef`): deleted root-level `js/personalisation.js`, reconciled 57 divergent lines into `public/js/personalisation.js`, updated all references in CLAUDE.md and `src/features/chat.js`.
- [x] Thesis Comparator rebuilt with LLM pipeline (commit `bebcb9c`): `tcAnalyze()` now POSTs to `/api/research-chat` with a structured ACH system prompt; `renderComparatorResult()` parses the ALIGNMENT line, populates hypothesis map from `tc.json`, and renders supporting/contradicting evidence. Loading animation, error state, and contrarian banner CSS added. Enter key wired. Verified end-to-end against WOW with real Railway responses on preview server.
- [x] Analyst chat consistency and voice rules unified (commit `236bfee`): extracted `VOICE_RULES` constant from `src/features/chat.js` (16 rules, single source of truth); bridged to `window.CI_VOICE_RULES` in `src/main.js`; `pnBuildSystemPrompt()` now appends `window.CI_VOICE_RULES` instead of its own abbreviated copy; em-dash on line 700 of `public/js/personalisation.js` fixed; ~189 lines of dead Step 5 centre-panel chat code removed (`pnGetSharedConvo`, `renderChatMessages`, `showChatTyping`, `hideChatTyping`, `appendChatError`, `renderChatHeader`, `pnSendChat`); `bindStep5Inputs` and `pnOnRouteEnter` simplified; `window._continuumChat` fully eliminated. 185/185 tests passing.

**Phase 2 CODE COMPLETE (2026-03-09). Pending: DATABASE_URL in Railway.**
- [x] Track A (auth backend): OTP email flow, JWT HS256, `api/auth.py`, `api/email_service.py`, `api/config.py`, `api/migrations/002_auth.sql` -- commit `566e945`.
- [x] Track B (conversation persistence): `api/conversations.py`, `api/db.py` helpers, `POST /api/conversations`, `GET /api/conversations/{ticker}` -- commit `566e945`.
- [x] Track C (frontend): `src/features/auth.js` (guest UUID, JWT storage, two-step OTP modal), surgical edits to `src/features/chat.js` (`_ensureConversation`, `_persistMessage`, `_restoreFromDB`), `initAuth()` wired in `src/main.js` before `initChat()` -- commit `566e945`.
- [x] Railway 502 fix: `asyncio.wait_for(asyncpg.create_pool(...), timeout=15.0)` in `api/db.py`; removed lifespan pre-warm from `api/main.py` -- commit `9a8dad7`.
- [ ] **ACTION REQUIRED**: Provision PostgreSQL in Railway dashboard and confirm `DATABASE_URL` is injected into the Continuum service. After provisioning, `run_migrations()` runs automatically on first DB request and applies `001_initial.sql` + `002_auth.sql`.
- [ ] **ACTION REQUIRED**: Add SMTP env vars (`EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`) to Railway dashboard for live OTP email delivery. Until set, OTP codes are logged server-side only.
- [ ] **ACTION REQUIRED**: Add `JWT_SECRET` (32-char hex) to Railway dashboard. Current fallback `dev-insecure-secret` is not safe for production.

**Session work (2026-03-09 session 2):**
- [x] Diagnosed Railway 502: `asyncpg.create_pool(timeout=10.0)` controls `pool.acquire()` timeout, not TCP connect. Initial connections hung indefinitely during rolling deploys.
- [x] Fixed with `asyncio.wait_for()` (15s hard deadline) + removed lifespan pre-warm (commit `9a8dad7`). Confirmed healthy: `curl /api/health` returns 25 tickers, 851 passages.
- [x] Smoke-tested Phase 2 endpoints: DB endpoints return 503 (DATABASE_URL not set -- user action required). OTP endpoint returns 200 (silent no-op when DB unavailable -- correct behaviour).
- [x] Confirmed Track C fully implemented in prior session. 185/185 tests passing.

**Session work (2026-03-09 session 1):**
- [x] Session audit: scraped 78 Claude sessions across 6 projects, categorised usage patterns into skills/plugins/agents/CLAUDE.md recommendations
- [x] Built 3 new CI skills: `ci:bug-repro` (autonomous bug reproducer), `ci:stock-integrity` (data integrity audit), `ci:add-ticker` (stock onboarding workflow)
- [x] Confirmed 5 pre-existing CI skills functional: `ci:session-close`, `ci:session-debrief`, `ci:push-safe`, `ci:deploy-check`, `ci:verify-deploy`
- [x] Railway monitor MCP evaluated and skipped (redundant; covered by existing skills)

**Recent bug history (last six commits):**
- `9a8dad7` Fixed Railway 502: `asyncio.wait_for(asyncpg.create_pool(...), timeout=15.0)` in `db.py`. Removed pre-warm `await db.get_pool()` from `main.py` lifespan. Pool now initialises lazily on first DB request.
- `566e945` Phase 2: auth + conversation persistence. OTP/JWT backend (`auth.py`, `email_service.py`), conversation CRUD (`conversations.py`, `db.py`), migration `002_auth.sql`, frontend `auth.js` and `chat.js` DB wiring.
- `236bfee` Unified analyst chat voice rules; removed dead personalisation chat code. `VOICE_RULES` is now the single source of truth in `src/features/chat.js`, bridged to `window.CI_VOICE_RULES`. `pnBuildSystemPrompt()` appends it instead of its own abbreviated copy. Step 5 chat UI dead code (~189 lines) removed.
- `7165776` Bumped service worker cache to `v3.1.0` to evict stale JS bundles after shadow copy fix.
- `bebcb9c` Replaced regex-based Thesis Comparator wireframe with LLM-powered pipeline. `tcAnalyze()` calls `/api/research-chat`; response parsed into ACH alignment banner, hypothesis map, and evidence columns. Enter key submits thesis.
- `f309fef` Eliminated root-level `js/personalisation.js` shadow copy. The production file is `public/js/personalisation.js` (served via Vite `publicDir: 'public'`). The root-level copy was never served in production -- fixes applied to it had no effect. 57 divergent lines reconciled into `public/js/`, root copy deleted. The `js/dne/` directory is retained.

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
- **SheetJS is lazy-loaded on portfolio upload interaction only.** It loads from a CDN URL stored in a `data-src` attribute on a placeholder element in `index.html`. If the element is missing, `loadSheetJS()` fails silently with no user-visible error.
- **`marked` and `DOMPurify` are CDN-loaded globals.** `chat.js` calls them as `window.marked` and `window.DOMPurify`. If the CDN fails, the analyst panel throws on first message send, not on load.

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
