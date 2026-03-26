# Continuum Intelligence v3 -- CLAUDE.md

## Operating Context

You are a senior engineer maintaining a production equity research platform used daily by fund managers. Mistakes ship to Cloudflare Pages (frontend) and Fly.io (backend) and break live sessions with no rollback beyond a manual revert commit. The default posture is conservative: understand before changing, smallest possible diff, test before marking done. Experimental approaches require explicit instruction.

---

## Commands

```bash
npm run dev          # Dev server on port 5000, proxies /api -> localhost:8000
npm run build        # Vite build -> dist/; copies data/ -> dist/data/
npm run test         # Jest suite (tests/, src/**/*.test.js) -- 61 tests
npm run test:unit    # Vitest suite -- what CI runs; must pass before pushing -- 234 tests
# Python tests: 427 sync passing + 28 async (require pytest-asyncio, not installed locally)
npm run test:all     # Jest + Vitest combined -- 263 tests total
npm run lint         # ESLint over scripts/, src/, and public/js/
npm run validate     # lint + test:all -- run before any push
```

**Never run** `npm run test:e2e` without a local server running (Playwright requires a live page).
**Frontend** deploys automatically to Cloudflare Pages on push to `main`. The GitHub Pages deploy workflow (`.github/workflows/deploy.yml`) is disabled (`if: false`). Cloudflare Pages builds are configured in the Cloudflare dashboard (build command: `npm run build`, output: `dist/`).
**Backend** deploys automatically to Fly.io on push to `main` when `api/`, `data/`, `Dockerfile`, or `fly.toml` change (`.github/workflows/fly-deploy.yml`). Confirm success: `curl https://ci-api.fly.dev/api/health`. Required environment variables are set in the Fly.io dashboard, not in code -- read [api/config.py](api/config.py) to see what is required.

---

## Architecture Constraints

- **`index.html` is owned by GitHub Actions.** The `continuum-update`, `update-daily`, `update-intraday`, and `live-prices` workflows all commit directly to `main`. Never edit `index.html` from a local copy that has not been pulled. One stale push (commit `58b2c99`) simultaneously broke the analyst panel, portfolio DOM, dark mode, and comparator.
- **`public/js/personalisation.js` and the DNE engine scripts load before `src/main.js`.** They are classic `<script>` tags, not ES modules. They write `window.renderPersonalisationPage`, `window.initPersonalisationDemo`, `window.pnBuildSystemPrompt`, and `window.TC_DATA`. If `src/main.js` is loaded before them, those globals will be undefined and `initChat()`, `initRouter()`, and `initThesisPage()` will silently fail.
- **Never replace the `STOCK_DATA`, `REFERENCE_DATA`, `FRESHNESS_DATA`, or `SNAPSHOT_DATA` object references.** They are exported by reference from `src/lib/state.js` and aliased to `window.*`. Replace the reference and every module holding the old pointer will silently diverge. Use `initStockData()`, `setStockData()`, `patchStock()`, or `Object.assign()` instead.
- **`FEATURED_ORDER` and `SNAPSHOT_ORDER` are Proxy objects** backed by live `Object.keys(STOCK_DATA)`. Do not destructure them into a plain array at module load time; they will become stale immediately. Call `.forEach()`, `.map()`, etc. at render time, not at import time.
- **`src/lib/state.js` owns all global state.** No module may declare its own copy of stock, freshness, reference, or snapshot data. The only exceptions are local caches invalidated within the same render cycle.
- **`api/` is the Fly.io backend (FastAPI/Python), not part of the Cloudflare Pages build.** Changes to `api/` trigger a Fly.io redeploy, not `npm run build`. The frontend connects to `https://api.continuumintelligence.ai` (Fly.io) in production and to `localhost:8000` (via Vite proxy) in dev. The API no longer serves static frontend files; Cloudflare Pages handles all frontend hosting.
- **`Documents/continuum-v3/` is a dead git worktree.** Never edit files there. The active codebase is at the repo root.
- **Do not touch `data/research/_index.json` manually.** It is the canonical stock list (currently 25 tickers). Editing it locally will conflict with the next automated commit.
- **`window.CI_API_KEY` injection is undocumented.** It is not set in `index.html`. Do not modify anything related to `CI_API_KEY` without first grepping the entire repo for all references and tracing the injection point.
- **GitHub Actions secrets are not documented in the repo.** Do not rename or delete secrets without checking every workflow file for references first.
- **Canonical personalisation file is `public/js/personalisation.js`** (~1,800 lines, untested by CI). The root-level `js/personalisation.js` was deleted 2026-03-08. Do not recreate it.

### Portfolio system frozen design decisions

These were set during Phase B and must not be changed without explicit instruction:

1. **Long-only v1.** The schema (`013_portfolios.sql`) enforces positive quantity, price, and market_value. Short positions are not supported. If long/short is needed later, relax constraints via a new migration, not a patch.
2. **Derived weights are the source of truth.** `portfolio_db.compute_weights()` divides each holding's market_value by snapshot total_value. No user-supplied or stored weight column exists.
3. **Validation tolerance for market_value.** `portfolio_validation.validate_snapshot()` allows market_value to deviate from qty * price by up to 1% or $0.01, whichever is greater.

---

## Current State -- 2026-03-27

| Area | Status | Key detail |
|------|--------|------------|
| Phase 0 (ES module extraction) | COMPLETE | `computeSkewScore` canonicalised (commit `4493e8c`) |
| Phase 1 (feature extraction) | COMPLETE | Add Stock, Deep Research, Portfolio, TC_DATA externalised |
| Phase 2 (auth + persistence) | COMPLETE | OTP email via Resend API, JWT HS256, conversation DB |
| Phase 3 (sign-in + summarisation) | COMPLETE | Rolling summarisation, sign-in button |
| Gold Agent (Phase 4) | LIVE | 7-query NLM runner + Claude synthesis. Auth expires every 1-2 weeks. |
| Batch Analysis (Phase 8) | LIVE | Cron 02:00 AEDT daily |
| Proactive Insights (Phase 9) | LIVE | Cron 03:00 AEDT Mon-Fri |
| PM Chat (Phases A-F) | CANARY | Shell, portfolio DB, analytics, constitution, personalisation, memory, handoff |
| PM Go-Live Gates 2-6 | VERIFIED | 600 total tests (394 pytest + 206 Vitest) at gate verification |
| PDF Reports | COMPLETE | Goldman Sachs-standard layout, institutional + briefing |
| Price Drivers | LIVE | Per-ticker workflow with freshness skip and credit exhaustion guard |
| Infrastructure | Cloudflare Pages (frontend) + Fly.io (backend) | GitHub Pages disabled |

**Test counts (as of last sweep):** 234 Vitest, 427 sync pytest, 28 async pytest.

**NOTEBOOKLM_AUTH_JSON** credentials expire every 1-2 weeks. When gold endpoint returns 503, re-run `Get NotebookLM Auth.bat` from Desktop and update the Fly.io variable.

**SNX NotebookLM notebook** (`c5470e1a`) currently contains RMS documents. Must be repopulated with SNX-specific source material before re-running the gold agent.

**Do not fix without instruction:**
- `previousSkew` is empty string on first Fly.io refresh after fresh deploy. Expected; momentum arrows suppressed when empty.
- `window.CI_API_KEY` is not set in `index.html`. The fallback `window.CI_API_KEY || ''` disables auth in dev mode. Do not add a hardcoded key.

**Session logs:** historical session detail archived to `docs/session-logs/CLAUDE-session-logs-archive.md`. For implementation specifics, consult git history.

---

## Gotchas

- **Two test frameworks with a defined ownership boundary.** Vitest owns unit tests for `src/` modules. Jest owns data integrity and integration tests (`tests/*.test.js`). `npm run test:unit` runs Vitest only -- what CI runs. Jest tests can fail without blocking deployment.
- **`loadFullResearchData()` has a localStorage fast-path.** If `ci_research_TICKER` exists in localStorage with a `_lastRefreshed` field, the function returns cached data without fetching. Stale localStorage will mask file changes during debugging.
- **`ContinuumDynamics.hydrateAll()` runs at boot before pages initialise.** Calling it again after `initHomePage()` will silently overwrite manual test values.
- **`git log --all` throws mmap errors** on this path due to OneDrive file locking. Use `git log` without `--all`.
- **`npm run build` copies `data/` via a Vite plugin, not `publicDir`.** Verify new data files land in `dist/data/` after build.
- **SheetJS is lazy-loaded on portfolio upload interaction only** from a CDN URL in a `data-src` attribute.
- **`marked` and `DOMPurify` are bundled npm dependencies.** `chat.js` imports them as ES modules. CDN script tags and regex fallback parser were removed.

---

## Decision Rules

- **Before editing `index.html`:** run `git pull origin main` and confirm you are at the latest commit. No exceptions.
- **Before touching skew-gate logic in `src/pages/portfolio.js`:** re-read the three-branch rules in MEMORY.md. The logic has been broken twice.
- **If a bug is in `public/js/personalisation.js`:** stop and flag it. That file is ~1,800 lines, untested by CI, and owns the personalisation pipeline. Changes have outsized blast radius.
- **If a fix touches more than two files:** enter Plan Mode. Present the diff surface before writing code.
- **If a Jest test fails but Vitest passes:** report it rather than patching to silence it. Do not block the task on a Jest-only failure.
- **If you find a bug unrelated to the current task:** record it in a note and raise it. Do not fix it inline.
- **If Fly.io returns 5xx on `/api/refresh/TICKER`:** do not retry automatically. Check `/api/refresh/TICKER/status` first.
- **When uncertain about environment:** `src/lib/api-config.js` is the canonical source. It returns `https://api.continuumintelligence.ai` for any non-localhost hostname.

---

## Style

- Australian English throughout. No em-dashes. En-dashes or restructured sentences only.
- Commit messages: imperative mood, present tense, referencing the specific file or feature. Match the pattern in `git log`.
- Variable declarations in classic scripts (`js/`, `scripts/`): use `var`. In `src/`: `const`/`let` per existing file convention.
- Do not add JSDoc to functions you did not write. Do not remove existing JSDoc.
