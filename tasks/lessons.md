# Lessons Learned

<!-- Claude: after ANY correction from the user, add the pattern here as a numbered rule. Be specific. Include the mistake, the fix, and the rule that prevents recurrence. Review this file at session start. -->

## Rules

2. **Never include literal non-printable bytes in Python source files.** When an agent writes a string containing `'\x00'` (null byte marker for injection detection), it may emit an actual zero byte into the file rather than the 4-character escape sequence. Python cannot compile a file with a null byte; Railway healthcheck times out with no useful error. Prevention: after any agent writes to a `.py` file, check `python -c "open('path','rb').read().count(b'\\x00')"` before committing. If non-zero, use `bytes([...])` replacement to fix and re-verify with `python -m py_compile`. (Learned: 2026-03-09)

3. **New operational secrets must match the existing pattern: reject when empty, import from config.py, add to check_production_secrets().** On BEAD-001, the builder created an ops endpoint with `OPS_SECRET` that allowed all requests when the env var was unset (open to the internet). The reviewer caught this. The fix was trivial; the consequence of shipping it was not. Rule: every new secret must (a) import from `config.py`, never `os.getenv()` directly, (b) reject when empty (match `BATCH_SECRET`/`INSIGHTS_SECRET` pattern), (c) be added to `check_production_secrets()` in `config.py` so Railway fails loudly if misconfigured. (Learned: 2026-03-23, BEAD-001 review)

4. **Fresh-context review is non-negotiable for anything touching auth or data exposure.** The BEAD-001 builder wrote correct aggregation logic and tests but missed a critical auth bypass. The reviewer, reading cold, found it in minutes. Rule: no merge without a separate-context review on any bead that adds endpoints, secrets, or data exposure surfaces. (Learned: 2026-03-23, BEAD-001 review)

5. **Never make the GitHub commit non-fatal in an ephemeral-filesystem backend.** Fly.io's filesystem is wiped on every redeploy. When add_stock() wrapped commit_files_to_github() in a silent try/except, any commit failure left data only in memory -- it disappeared on the next deploy without any error surfacing. The frontend (Cloudflare Pages CDN, serving from the git repo) never saw the data. Partial commits (individual file SHA conflicts from concurrent GitHub Actions runs) caused different files to be missing on different runs, making the failure pattern non-deterministic. Rule: any write to Fly.io's FS that is the sole persistence mechanism for user-initiated data must be followed by a fatal GitHub commit. Return HTTP 503 with a clear message on commit failure; unlink the written file so the client can retry without hitting a false 409. (Learned: 2026-03-28, stock-onboarding-failure debug)

6. **When adding a new onboarding route, enumerate every file the frontend expects and verify each is created.** The backend add_stock() route created 5 files but omitted data/stocks/{TICKER}.json. The frontend loader (src/data/loader.js) fetches this file via a secondary XHR to merge signal fields. The fetch failure was silent (onerror calls callback without propagating). This meant all API-added tickers silently lacked three_layer_signal, valuation_range, and price_signals. Rule: when implementing any onboarding pipeline, read the full frontend loader code to identify every data file it fetches, then ensure every file is created and committed in the backend route. (Learned: 2026-03-28, stock-onboarding-failure debug)

1. **Always identify which file Vite actually serves before editing.** Vite's `publicDir: 'public'` means only files under `public/` are copied verbatim to `dist/`. A root-level `js/` directory is NOT copied. Editing `js/personalisation.js` at the repo root has zero effect on production -- `public/js/personalisation.js` is the file that matters. Before editing any classic-script file, confirm its path resolves under `publicDir`. Rule: grep `index.html` for the `<script src="...">` tag, then trace that path through `vite.config.js` `publicDir` and plugin config to verify it lands in `dist/`. (Learned: 2026-03-08)

<!--
Example format:

1. **Never edit src/ expecting production impact.** Production runs from inline script blocks in index.html, not from src/ ES modules. Editing src/ files has zero effect on the live site. (Learned: 2026-02-xx)

2. **Always run the full test suite before marking done.** A passing lint check is not a passing test suite. Run `npm test` and confirm 145/145 pass. (Learned: 2026-02-xx)
-->
