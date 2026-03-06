# ADR 002: Railway Backend with Ephemeral Storage

**Status:** Active
**Date:** 2025-Q4
**Deciders:** Marc Duncan

---

## Context

The platform needs an LLM-powered backend for:
1. On-demand per-ticker research refreshes (user-triggered from the UI)
2. Grounded research chat (analyst panel)

The backend must run Python (FastAPI), access Anthropic and Gemini APIs, and serve the same `data/research/*.json` files that the static frontend reads from GitHub Pages.

Railway was chosen over alternatives (Vercel functions, Lambda, self-hosted) for simplicity of deployment from a monorepo and zero cold-start configuration overhead.

## Decision

Run a FastAPI backend on Railway (`api/`). Railway auto-deploys on push to `main`.

**Storage model:**
Railway has an ephemeral filesystem. Files written during a refresh (`dist/data/research/TICKER.json`) persist only until the next Railway redeploy. They are **not** committed back to the git repository by the Railway process.

**Data flow for on-demand refresh:**
1. User triggers refresh from the UI.
2. Frontend POSTs to Railway `/api/refresh/TICKER`.
3. Railway runs the 4-stage pipeline (data gather → evidence → hypothesis → write).
4. Railway writes updated JSON to `dist/data/research/TICKER.json` on its local (ephemeral) disk.
5. Railway returns the updated JSON in the API response.
6. Frontend stores the response in `localStorage` as `ci_research_TICKER`.
7. On next page load, `src/main.js` restores from localStorage -- the refreshed data is available even though the file on Railway disk will be reset on next deploy.

**Data flow for automated batch updates (GitHub Actions):**
GitHub Actions workflows (`.github/workflows/continuum-update.yml` etc.) run the same pipeline server-side and **commit updated `data/research/*.json` files directly to the git repo**. These commits update GitHub Pages on the next deploy workflow run and also seed Railway's `dist/data/research/` on the next Railway redeploy.

## Consequences

- **Railway disk is not the source of truth for research data.** The git repository is. A Railway redeploy will reset research files to whatever was last committed by GitHub Actions.
- **In-memory job tracking.** `refresh_jobs` and `batch_jobs` dicts in `api/refresh.py` are lost on restart. A job that was in-flight during a Railway restart will have no status record. The frontend poller will time out and show an error.
- **`config.INDEX_HTML_PATH`** defaults to `dist/index.html` relative to the `api/` directory. This resolves to `dist/data/research/` for file reads/writes. If Railway's build step does not produce a `dist/` directory, all file operations will fail.
- **Environment variables required at Railway (see `api/config.py`):**
  - `ANTHROPIC_API_KEY` -- required; app will not start without it
  - `ANTHROPIC_MODEL` -- optional; defaults to `claude-sonnet-4-6`
  - `GEMINI_API_KEY` -- required for specialist analysis stage
  - `GEMINI_MODEL` -- optional; defaults to `gemini-2.5-flash`
  - `CI_API_KEY` -- optional; if empty, authentication is disabled (dev mode)
  - `ALLOWED_ORIGINS` -- optional; defaults include GitHub Pages and localhost
  - `PORT` -- set automatically by Railway; do not override

## Alternatives Considered

- **Vercel Serverless Functions:** Python support is limited; file system access is more restricted. Not viable for a 4-stage pipeline with 60-300 second execution time per ticker.
- **Commit results back to git from Railway:** Possible via GitHub API but adds complexity (token management, merge conflicts with concurrent GitHub Actions runs). Deferred.
