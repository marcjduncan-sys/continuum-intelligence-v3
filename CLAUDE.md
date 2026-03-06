# Continuum Intelligence v3 — CLAUDE.md

## Operating Context

You are a senior engineer maintaining a production equity research platform used daily by fund managers. Mistakes ship to GitHub Pages and break live sessions with no rollback beyond a manual revert commit. The default posture is conservative: understand before changing, smallest possible diff, test before marking done. Experimental approaches require explicit instruction.

---

## Commands

```bash
npm run dev          # Dev server on port 5000, proxies /api → localhost:8000
npm run build        # Vite build → dist/; copies data/ → dist/data/
npm run test         # Jest suite (tests/, src/**/*.test.js)
npm run test:unit    # Vitest suite — what CI runs; must pass before pushing
npm run test:all     # Jest + Vitest combined
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
- **`js/personalisation.js` and the DNE engine scripts load before `src/main.js`.** They are classic `<script>` tags, not ES modules. They write `window.renderPersonalisationPage`, `window.initPersonalisationDemo`, `window.pnBuildSystemPrompt`, and `window.TC_DATA`. If `src/main.js` is loaded before them, those globals will be undefined and `initChat()`, `initRouter()`, and `initThesisPage()` will silently fail.
- **Never replace the `STOCK_DATA`, `REFERENCE_DATA`, `FRESHNESS_DATA`, or `SNAPSHOT_DATA` object references.** They are exported by reference from `src/lib/state.js` and aliased to `window.*`. Replace the reference and every module holding the old pointer will silently diverge. Use `initStockData()`, `setStockData()`, `patchStock()`, or `Object.assign()` instead.
- **`FEATURED_ORDER` and `SNAPSHOT_ORDER` are Proxy objects** backed by live `Object.keys(STOCK_DATA)`. Do not destructure them into a plain array at module load time; they will become stale immediately. Call `.forEach()`, `.map()`, etc. at render time, not at import time.
- **`src/lib/state.js` owns all global state.** No module may declare its own copy of stock, freshness, reference, or snapshot data. The only exceptions are local caches invalidated within the same render cycle.
- **`api/` is the Railway backend (FastAPI/Python), not part of the GitHub Pages build.** Changes to `api/` require a Railway redeploy, not `npm run build`. The frontend connects to `https://imaginative-vision-production-16cb.up.railway.app` when on GitHub Pages, and to `localhost:8000` (via Vite proxy) in dev.
- **`Documents/continuum-v3/` is a dead git worktree.** It contains its own `node_modules`, test files, and stale source. Never edit files there. The active codebase is at the repo root.
- **Do not touch `data/research/_index.json` manually.** It is the canonical stock list and the authoritative source for stock count (currently 28 tickers, growing). Editing it locally will conflict with the next automated commit. When adding a new ticker, update `_index.json` and `data/reference.json` -- do not rely on `REFERENCE_DATA` in `index.html`, which is a known defect covering fewer tickers than `_index.json`.
- **`js/personalisation.js` is NOT linted by ESLint** (`npm run lint` covers `scripts/` and `src/` only). Bugs there will not surface in CI.
- **`window.CI_API_KEY` injection is undocumented.** It is not set in `index.html`; Claude Code configured the injection mechanism. Do not modify anything related to `CI_API_KEY` without first grepping the entire repo for all references and tracing the injection point. If it is broken, check (in order): Railway environment variables, GitHub Secrets, any `<script>` tag in `index.html` setting the global.
- **GitHub Actions secrets are not documented in the repo.** Do not rename or delete secrets without checking every workflow file for references first. To diagnose a failing workflow: open the workflow YAML, find which secret it references, then verify that secret exists at GitHub repo Settings > Secrets and variables > Actions.

---

## Current State — 2026-03-07

No active migrations. The extraction of logic from `index.html` into `src/` modules is complete.

**Recent bug history (last six commits):**
- `d02f65c` Fixed downside-skew stocks never showing Buy action in the Evidence-Aligned Reweighting table ([src/pages/portfolio.js](src/pages/portfolio.js) around line 589). Do not refactor the skew-gate block without re-verifying all three branches (upside/balanced/downside) against the rules in MEMORY.md.
- `5cb85f2` Restored analyst panel and portfolio HTML after `58b2c99` wiped them. If the analyst panel ever disappears from the DOM, check whether a stale `index.html` was pushed.
- `6485b04` Fixed modal-added stocks disappearing from Research tab. The fix is the `else` branch at [src/main.js:207](src/main.js#L207). If this branch is removed, all stocks added via "+ Add Stock" will vanish on reload.
- `4b84b7c` Fixed "Stock Not Found" on Add Stock when Railway scaffold is still generating. Fix lives in [src/features/add-stock.js](src/features/add-stock.js) as the `_stub: true` fallback. Do not remove it.

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
- **If a bug is in `js/personalisation.js`:** stop and flag it. That file is ~1,300 lines, untested by CI, and owns the personalisation pipeline. Changes have outsized blast radius.
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
