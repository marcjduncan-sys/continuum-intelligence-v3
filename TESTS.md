# TESTS.md

## Local commands

| Command | Framework | Scope | Count | Notes |
|---------|-----------|-------|-------|-------|
| `npm run test:unit` | Vitest | `src/` unit tests | 206 | **What CI runs.** Must pass before pushing. |
| `npm run test` | Jest | `tests/` data integrity | 61 | jsdom environment. Can fail without blocking deploy. |
| `npm run test:all` | Jest + Vitest | Combined | 267 | Full local validation. |
| `npm run lint` | ESLint | `scripts/`, `src/`, `public/js/` | -- | Zero errors required. |
| `npm run validate` | lint + test:all | Full pre-push gate | -- | **Run before every push.** |
| `cd api && python -m pytest` | Pytest | `api/tests/` backend | 394 | Covers portfolio, analytics, alignment, PM memory, handoffs. |
| `npm run test:e2e` | Playwright | E2E flows | -- | Requires local server running (`npm run dev`). |

## CI commands

| Trigger | Workflow | What it runs |
|---------|----------|-------------|
| Push to main | Cloudflare Pages | `npm run build` (frontend deploy) |
| Push to main (api/ changes) | `.github/workflows/fly-deploy.yml` | Fly.io Docker build + deploy |
| Cron (5x daily) | `continuum-update`, `update-daily`, `update-intraday`, `live-prices` | Data pipeline updates, commit to main |
| Cron (daily 02:00 AEDT) | `batch-analysis.yml` | `POST /api/batch/run` |
| Cron (Mon-Fri 03:00 AEDT) | `insights-scan.yml` | `POST /api/insights/scan` |

## Smoke tests after merge

1. `curl https://ci-api.fly.dev/api/health` -- backend returns 200
2. Load `https://app.continuumintelligence.ai` -- home page renders, stock cards visible
3. Click any stock card -- research page loads with hypothesis bars, evidence, narrative
4. Open Analyst panel -- chat responds with research-grounded output
5. Open PM panel -- mode switch works, PM responds with portfolio context
6. Check GitHub Actions -- no failed runs after push

## Known brittle tests

| Test | File | Why brittle | Mitigation |
|------|------|-------------|------------|
| Jest data-integrity tests | `tests/data-integrity.test.js` | Depend on exact scaffold structure; some tickers (EVN) have incomplete `_index.json` entries | Report failures; do not block deployment on Jest-only failures |
| Playwright E2E | `tests/e2e/` | Require local dev server running; flaky on CI without headed browser | Run manually; not in CI gate |
