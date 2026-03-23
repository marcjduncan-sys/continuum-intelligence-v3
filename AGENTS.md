# AGENTS.md

## Mission

Deliver production-safe changes to Continuum Intelligence v3 with zero regressions. Every push goes directly to production (Cloudflare Pages frontend, Fly.io backend). There is no staging environment and no rollback beyond a manual revert commit.

## Product context

- **Core user types:** Fund managers, equity analysts, portfolio managers (DH Capital internal and select external users)
- **Primary workflows:** ACH-based equity research (Analyst panel), portfolio management and allocation (PM panel), stock onboarding, gold agent analysis, price driver scanning, PDF report generation
- **Commercial priorities:** Platform reliability for daily use by fund managers; research quality (Goldman Sachs-grade output); PM decision discipline (Constitution-governed recommendations)
- **Reliability priorities:** Zero regressions on push-to-main; data integrity across 32 ASX-listed tickers; automated pipeline stability (5x daily via GitHub Actions)

## Stack

- **Frontend:** Vanilla JS (ES modules in `src/`, classic scripts in `public/js/` and `js/`), Vite build, HTML/CSS
- **Backend:** Python 3.12+ (FastAPI/uvicorn), PostgreSQL (Fly.io managed), asyncpg
- **Hosting:** Cloudflare Pages (frontend), Fly.io (backend API)
- **Test frameworks:** Vitest (unit, `src/`), Jest (data integrity, `tests/`), Pytest (backend, `api/tests/`), Playwright (E2E)
- **Lint:** ESLint (`scripts/`, `src/`, `public/js/`)
- **Build commands:**
  - `npm run build` -- Vite production build to `dist/`
  - `npm run validate` -- lint + test:all (run before any push)
- **Test commands:**
  - `npm run test:unit` -- Vitest (206 tests, what CI runs)
  - `npm run test` -- Jest (61 tests, data integrity)
  - `npm run test:all` -- Jest + Vitest combined (267 tests)
  - `cd api && python -m pytest` -- Python backend (394 tests)
  - `npm run test:e2e` -- Playwright (requires local server)
- **Local run commands:**
  - `npm run dev` -- dev server on port 5000, proxies /api to localhost:8000
  - `cd api && uvicorn main:app --reload --port 8000` -- backend dev server

## Non-negotiable rules

1. Do not change architecture without first updating PLAN.md and DECISIONS.md.
2. Do not mark work complete if tests are failing or missing.
3. Do not add placeholder abstractions or TODOs unless explicitly approved.
4. Do not change dependencies without stating why and recording the impact.
5. Keep changes bounded to the current bead/task packet.
6. Re-read AGENTS.md after compaction or long context drift.
7. Do not edit `index.html` without `git pull origin main` first. GitHub Actions owns this file.
8. Do not replace `STOCK_DATA`, `REFERENCE_DATA`, `FRESHNESS_DATA`, or `SNAPSHOT_DATA` object references. Use `initStockData()`, `setStockData()`, `patchStock()`, or `Object.assign()`.
9. Do not create `.env` files or hardcode secrets. Secrets live in Fly.io dashboard or GitHub Secrets only.
10. Do not push without running `npm run validate` first. Every push goes to production.
11. Do not touch `normaliseScores()` (three locations), `VALID_STATIC_PAGES`, or `public/js/personalisation.js` without explicit instruction.
12. Australian English throughout. No em-dashes.

## Done definition

- [ ] Acceptance criteria met
- [ ] Unit / integration / E2E tests added or updated
- [ ] Reviewer sign-off obtained (fresh context)
- [ ] Relevant docs updated (AGENTS.md, PLAN.md, DECISIONS.md, CLAUDE.md as applicable)
- [ ] Logging / observability updated where relevant
- [ ] Rollback path understood and documented
- [ ] `npm run validate` passes (lint + Vitest + Jest)
- [ ] `cd api && python -m pytest` passes (394+ tests)
- [ ] No regressions in existing functionality

## Review checklist

- What could break silently?
- What edge cases were covered?
- Does this create hidden coupling?
- What should be monitored after merge?
- Were all three display contexts checked (snapshot card, research tile, report page) if scoring/skew logic was touched?
- Was `index.html` pulled fresh before editing?
- Were secrets kept out of the codebase?
