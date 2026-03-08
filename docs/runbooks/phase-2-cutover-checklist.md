# Checklist: Phase 2 Cutover

**Phase 2 scope:** Extraction of logic from `index.html` into `src/` ES modules (migration to modular architecture). Cutover means the new `src/` implementation replaces the inline `index.html` scripts for all pages and the old inline code is removed.

**Target date:** _[date]_
**Rollback plan:** `git revert <commit-range>` and push to `main`

---

## Pre-cutover (complete before starting)

- [ ] All Vitest tests pass: `npm run test:unit`
- [ ] All Jest tests pass: `npm run test`
- [ ] `npm run build` succeeds locally with no warnings
- [ ] `git pull origin main` -- local is current with remote
- [ ] Feature branch is up to date with `main` (rebased or merged)
- [ ] Railway health check passes: `curl https://imaginative-vision-production-16cb.up.railway.app/api/health`
- [ ] Identify any GitHub Actions workflows that will run during the cutover window and confirm they will not conflict

---

## Cutover steps

- [ ] Tag the current working state: `git tag working-pre-phase2`
- [ ] _[list specific implementation steps here]_
- [ ] Commit each logical step separately (not one large commit)
- [ ] After each commit: `npm run test:unit` passes

---

## Safeguard 1: Async loading gate

All page `init*` functions must be called inside `boot()` in `src/main.js`, after `await Promise.all([...])` resolves. No page init may run before `STOCK_DATA`, `REFERENCE_DATA`, and `FRESHNESS_DATA` are populated.

**How to verify:**

1. Open `src/main.js` and locate the `boot()` function
2. Confirm `await Promise.all` fetches all three data files (`_index.json`, `reference.json`, `freshness.json`) before any `init*` call
3. Confirm every `init*` call (`initHomePage`, `initPortfolioPage`, `initReportPage`, etc.) is inside the `boot()` body, after the `await`
4. Confirm no `init*` call is at module top-level or in a `DOMContentLoaded` handler outside `boot()`

**Pass:** Every page init is gated behind the async data load. `boot()` is the sole entry point.
**Fail:** Any `init*` call runs before the `Promise.all` resolves, or is called outside `boot()`. Symptom: pages render with empty data or throw `Cannot read properties of undefined` on first load.

- [ ] PASS / FAIL (circle one)

---

## Safeguard 2: Classic scripts compatibility

The following globals must be set by the classic `<script>` tags before `src/main.js` runs. `src/main.js` is a `type="module"` script; classic scripts execute first in document order. If any global is absent when `initRouter()` is called, the personalisation page and narrative pipeline will silently fail.

Required globals:
- `window.renderPersonalisationPage` -- set by `js/personalisation.js`
- `window.initPersonalisationDemo` -- set by `js/personalisation.js`
- `window.pnBuildSystemPrompt` -- set by `js/personalisation.js` (top-level function declaration, automatically elevated to `window` by classic script rules). **Required by the analyst panel.** If absent, `src/features/chat.js:buildEffectiveSystemPrompt()` falls back to the static default prompt with no error, so the analyst panel appears to work but ignores the user's personalisation profile entirely.
- ~~`window.TC_DATA`~~ -- **eliminated in Phase 1 (commit `415095e`)**. TC_DATA is now fetched from `data/tc.json` in `boot()` and managed through `src/lib/state.js`. No classic script sets or reads this global anymore.

**How to verify:**

1. Open `index.html` and confirm the load order: all classic `<script>` tags appear before `<script type="module" src="./src/main.js">`
2. Open browser DevTools on the dev server (`npm run dev`), go to the Console, and run:
   ```js
   ['renderPersonalisationPage', 'initPersonalisationDemo', 'pnBuildSystemPrompt']
     .map(k => ({ key: k, type: typeof window[k] }))
   ```
3. All three should return `"function"` -- not `"undefined"`
4. Navigate to `#personalisation` and confirm no console errors related to undefined functions
5. Send a message in the analyst panel and confirm the system prompt includes personalisation context (check Network tab: request body `system` field should reference the fund/firm profile)

**Pass:** All three globals are defined and the personalisation page renders without errors. Analyst panel sends personalised system prompt.
**Fail:** Any global is `undefined`. Symptom: personalisation page is blank, `initRouter()` throws, or analyst panel silently uses default system prompt instead of personalised one.

- [ ] PASS / FAIL (circle one)

---

## Safeguard 3: Parity audit complete

Every page available before the cutover must be available and error-free after the cutover. No feature may be silently dropped.

**How to verify:**

For each page below, navigate to it on the dev server and confirm: (a) the page renders, (b) no unhandled JS errors appear in DevTools Console, (c) key interactive features work.

| Page | Renders | No console errors | Key feature verified | Sign-off |
|---|---|---|---|---|
| `#home` | [ ] | [ ] | Research table loads, prices display | |
| `#report-[any ticker]` | [ ] | [ ] | Analyst panel opens, returns response | |
| `#portfolio` | [ ] | [ ] | Position upload works, reweighting table displays | |
| `#deep-research` | [ ] | [ ] | Query executes, results render | |
| `#comparator` | [ ] | [ ] | Side-by-side comparison loads two tickers | |
| `#personalisation` | [ ] | [ ] | Personalisation demo runs | |
| `#about` | [ ] | [ ] | Page renders | |

Additional checks:
- [ ] "+ Add Stock" flow completes without error (or known Railway latency is documented)
- [ ] Dark mode toggle works on all pages
- [ ] `npm run build` produces a clean `dist/` with no Vite warnings

**Pass:** All pages signed off, no unhandled errors, all key features confirmed.
**Fail:** Any page throws an unhandled error, any feature is absent or broken.

- [ ] PASS / FAIL (circle one)

---

## Post-cutover verification

- [ ] `npm run build` succeeds
- [ ] `npm run test:unit` passes
- [ ] `npm run test` passes (or known Jest failures are documented)
- [ ] All three safeguards above are PASS
- [ ] Push to `main` and confirm GitHub Pages deploy succeeds (check [Actions](https://github.com/marcjduncan-sys/continuum-intelligence-v3/actions))
- [ ] Smoke-test production URL after deploy: navigate to each route listed in Safeguard 3

---

## Rollback criteria

Rollback immediately if:
- Any page throws an unhandled JS error in production
- The analyst panel is missing from the DOM
- Portfolio page fails to render positions
- `npm run test:unit` fails after merge to `main`
- Any of the three safeguards is FAIL

To rollback:
```bash
git revert <range>   # do not git reset --hard on main
git push origin main
```

---

## Notes

- **`index.html` is owned by GitHub Actions.** Pull before editing. Any stale push to `index.html` risks overwriting automated commits and breaking multiple features simultaneously (see commit `58b2c99` in git history).
- **`js/personalisation.js` is not covered by ESLint or Vitest.** Changes to that file will not surface failures in CI. Manual testing of the personalisation page is mandatory after any change.
- **Do not remove the `_stub: true` fallback** in `src/features/add-stock.js`. It prevents "Stock Not Found" errors while Railway is still scaffolding a new ticker.
