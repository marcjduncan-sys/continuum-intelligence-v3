# api/ — Fly.io Backend

This directory is a FastAPI application deployed to Fly.io. It is **not** part of the Cloudflare Pages build. Changes here trigger a Fly.io redeploy automatically via `.github/workflows/fly-deploy.yml` on push to `main`.

---

## Constraints

- **Never write to disk expecting data to persist.** Fly.io has an ephemeral filesystem. Anything written to `dist/data/research/` survives only until the next redeploy. The git repository is the source of truth for research data.
- **Never import from `src/` or `js/`.** Those are frontend ES modules. The backend is a separate Python process with no access to the JavaScript bundle.
- **Never hardcode API keys.** All secrets are read from environment variables via `config.py`. If a key is missing, `config.py` defaults to an empty string and the relevant API call will raise a `RuntimeError` at call time, not at startup (except `ANTHROPIC_API_KEY`, which raises at startup).
- **Never add a pip dependency without testing the Fly.io build.** Fly.io installs from `requirements.txt` during deploy. An unresolvable dependency will break the deployment silently (Fly.io will roll back to the previous deploy).
- **Do not modify in-memory job tracking to use a database without a migration plan.** `refresh_jobs` and `batch_jobs` in `refresh.py` are plain dicts. They are intentionally in-memory for simplicity -- the POC does not need durability. Adding persistence requires a Fly.io volume or external store.
- **`_data_dir()` resolves to `dist/data/research/`.** This path is relative to `config.INDEX_HTML_PATH`. If the build does not produce `dist/`, all file reads and writes will fail with `FileNotFoundError`.
- **The API does not serve frontend files.** Frontend is on Cloudflare Pages. The API only serves `/data/` research JSON files and API endpoints.

---

## Environment variables (all set in Fly.io dashboard)

| Variable | Required | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | -- |
| `GEMINI_API_KEY` | Yes | -- |
| `DATABASE_URL` | Yes | -- |
| `JWT_SECRET` | Yes | -- |
| `RESEND_API_KEY` | Yes | -- |
| `EMAIL_FROM` | Yes | -- |
| `CI_API_KEY` | No | `""` (auth disabled) |
| `ANTHROPIC_MODEL` | No | `claude-sonnet-4-6` |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` |
| `ALLOWED_ORIGINS` | No | Cloudflare Pages + localhost |
| `PORT` | Fly.io-injected | 8000 |
| `INDEX_HTML_PATH` | No | `../dist/index.html` |
| `NOTEBOOKLM_TICKER_NOTEBOOKS` | No (merged) | Reads `data/config/notebooklm-notebooks.json` |
| `BATCH_SECRET` | Yes | -- |
| `INSIGHTS_SECRET` | Yes | -- |

---

## Refresh pipeline (4 stages)

1. **Data gathering** (`web_search.py`): Yahoo Finance, ASX announcements, news search
2. **Specialist analysis** (`gemini_client.py`): Gemini extracts structured evidence updates
3. **Hypothesis synthesis** (Anthropic Claude): re-weights T1-T4 hypotheses, rewrites narrative
4. **Write results**: merges into research JSON, updates `_index.json` summary

For scaffold mode (new tickers with no evidence), Stage 2 creates evidence cards from scratch and Stage 3 runs full coverage initiation instead of hypothesis synthesis.

---

## Decision rules

- If a bug is in `validate_research.py`, fix it -- it runs on every save and bad data will corrupt a refresh.
- If a bug is in `gemini_client.py`, fix it -- it blocks all Stage 2 processing.
- If a bug is in `refresh.py` Stage 4 (`_merge_updates`), confirm the fix against a dry-run before deploying. Stage 4 writes to disk and the result is served directly to the client.
- Before changing `_data_dir()` or `config.INDEX_HTML_PATH` handling: confirm the Fly.io build produces `dist/` at the expected path.
