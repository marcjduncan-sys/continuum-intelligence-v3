# Continuum Intelligence Infrastructure Migration -- PRD v2

**Date**: 2026-03-19
**Author**: Marc Duncan / Claude Code
**Status**: Approved for architecture planning

---

## 1. Problem Statement

Continuum Intelligence runs institutional-grade financial research on hobby-grade infrastructure. This mismatch causes production failures (blank pages from ephemeral disk writes), stale data (scheduled workflows that never fire), invisible errors (no monitoring), and user-perceptible latency (all API calls route from Sydney to US data centres). The platform cannot be demonstrated to investors or users with confidence that it will not break during the demo.

---

## 2. Business Objectives

1. **Reliability**: Eliminate the class of failures caused by ephemeral disk, silent workflow failures, and unvalidated data writes. Target: zero blank-page incidents.
2. **Performance**: Reduce API latency from ~150--200ms (Sydney to US) to <20ms (Sydney to Sydney). The analyst chat must feel responsive.
3. **Credibility**: Serve the platform from `continuumintelligence.ai`, not a `github.io` subdomain. Deploy previews available for QA before production.
4. **Observability**: Know when something breaks before users tell you. Error monitoring, health checks, failure alerts.
5. **Portability**: Decouple components so no single vendor failure takes down the platform. Database independent of backend host. Frontend independent of backend host.

---

## 3. Success Criteria

| Criterion | Measurable Target |
|-----------|-------------------|
| Zero blank-page incidents from infrastructure | 30 days post-migration with zero incidents |
| API latency (p95) | <50ms for `/api/health`, <3s for `/api/research-chat` |
| Custom domain live | `continuumintelligence.ai` serves the platform |
| Error detection time | <5 minutes from error occurrence to alert |
| Deploy preview available | Every PR gets a preview URL automatically |
| Database backup frequency | Daily automated backups |
| Rollback capability | Any phase reversible within 15 minutes |

---

## 4. Current Monthly Infrastructure Cost (Baseline)

| Service | Current Cost | Notes |
|---------|-------------|-------|
| Railway (backend + Postgres) | ~$5--10/month | Usage-based; FastAPI + managed Postgres |
| GitHub Pages (frontend) | $0 | Free for public repos |
| GitHub Actions (workflows) | $0 | Free tier (2,000 min/month) |
| Anthropic API | Variable | Not infrastructure; excluded from budget |
| Google Gemini API | Variable | Not infrastructure; excluded from budget |
| Resend (email) | $0 | Free tier (100 emails/day) |
| **Total infrastructure** | **~$5--10/month** | |

**Budget**: Maximum $25/month incremental infrastructure cost (total post-migration: ~$30--35/month).

---

## 5. Constraints

- **Budget**: Maximum $25/month incremental infrastructure cost.
- **Downtime tolerance**: Zero. Every migration phase runs old and new systems in parallel. "Zero downtime" defined as: old `github.io` URL continues serving throughout migration; new `continuumintelligence.ai` domain goes live only after validation; old URL permanently 301-redirects to new domain post-migration.
- **Timeline**: Complete within 2 weeks of starting.
- **Operator**: Single developer (Marc) with Claude Code assistance. No DevOps team.
- **Codebase changes**: Minimise application code changes. This is an infrastructure migration, not a rewrite. However, the migration surface (Section 8) documents all required code changes.

---

## 6. Out of Scope

- Application feature changes
- Database schema changes
- New API endpoints
- Frontend redesign (beyond URL/path changes required by the migration)
- NotebookLM auth expiry (persists post-migration; no infrastructure fix available)

---

## 7. Workflow-Commits-Trigger-Deploy Interaction

### Current State

5 GitHub Actions workflows commit directly to `main`:

- `continuum-update.yml` (5x daily): price data, research JSONs, narrative analysis
- `live-prices.yml` (manual dispatch, legacy)
- `update-daily.yml`, `update-intraday.yml`, `update-prices.yml`

These commits trigger a GitHub Pages rebuild. At current volume: ~14+ commits/day from automated workflows.

### Impact on Frontend Host Selection

| Host | Build Cap | Path Filtering | Interaction with 14+ daily data commits |
|------|-----------|---------------|------------------------------------------|
| Cloudflare Pages (free) | 500/month | Yes (dashboard UI, glob patterns) | **Safe with config**: exclude `data/**` from build watch paths. Data-only commits skip build entirely, do not count against 500 limit. Code-only commits (~1--5/day) well within budget. |
| Vercel (hobby) | 100/day, 6000 min/month | Yes (shell command in "Ignored Build Step") | **Safe with config**: `git diff HEAD^ HEAD --quiet -- ./src/ ./public/ ./index.html` skips data-only commits. Limited to 10-commit shallow clone diff, but sufficient for this use case. |
| GitHub Pages (current) | Unlimited | No filtering needed | Current state; no issue. |

### Decision

Either Cloudflare Pages or Vercel works, provided path filtering is configured at setup time. Cloudflare's dashboard-based glob filtering is simpler to configure and audit. Vercel's shell command is more flexible but requires maintenance if the directory structure changes.

### Critical Configuration

The path filter must exclude `data/`, `data/research/`, and any path that automated workflows write to. It must include `src/`, `public/`, `index.html`, `vite.config.js`, and `package.json`. This configuration must be set before the first automated commit hits the new host, or it will burn through the build cap in <36 hours.

---

## 8. Migration Surface Inventory (grep-verified 2026-03-19)

Every file containing a Railway URL, GitHub Pages path, CORS origin, CSP directive, or environment detection logic. **All items must be updated during migration; none may be deferred.**

### 8.1 Railway URL (`imaginative-vision-production-16cb.up.railway.app`) -- 16 locations

**`src/` modules (10 files):** All contain a local production API URL constant and `github.io` hostname detection. The architecture spec consolidates these into `src/lib/api-config.js` in Phase 0.

| # | File | Context |
|---|------|---------|
| 1 | `src/lib/router.js` | `_REFRESH_API_BASE` constant |
| 2 | `src/features/chat.js` | `PRODUCTION_API` constant |
| 3 | `src/features/auth.js` | Production API URL for OTP/JWT endpoints |
| 4 | `src/features/notifications.js` | Production API URL for notification polling |
| 5 | `src/features/add-stock.js` | Production API URL for add-stock + refresh |
| 6 | `src/features/batch-refresh.js` | Production API URL for batch refresh |
| 7 | `src/pages/thesis.js` | Production API URL (2 locations: comparator + analysis) |
| 8 | `src/pages/report-sections.js` | Production API URL for report data fetch |
| 9 | `src/pages/memory.js` | Production API URL for memory endpoints |
| 10 | `src/services/live-data.js` | Production API URL for live price/chart data |

**Non-module files (3 files):** Cannot import ES modules; must be updated individually.

| # | File | Context |
|---|------|---------|
| 11 | `public/js/personalisation.js` | `var origin = isGH ? 'https://...'` (~line 424) |
| 12 | `public/gold.html` | `const API = 'https://...'` (~line 243) |
| 13 | `index.html` | CSP `connect-src` directive (~line 22) |

**Workflow files (3 files):**

| # | File | Context |
|---|------|---------|
| 14 | `.github/workflows/price-drivers.yml` | `API_BASE` env var |
| 15 | `.github/workflows/batch-analysis.yml` | Curl target URL |
| 16 | `.github/workflows/insights-scan.yml` | Curl target URL |

### 8.2 Environment Detection (`github.io`) -- 11 locations

All 10 `src/` files listed above (items 1--10) plus `public/js/personalisation.js` (item 11) contain `hostname.includes('github.io')` or `hostname.indexOf('github.io')` detection logic. Consolidated into `src/lib/api-config.js` in Phase 0 for the `src/` files.

### 8.3 GitHub Pages Base Path (`/continuum-intelligence-v3/`)

| # | File | Context | Migration Action |
|---|------|---------|-----------------|
| 17 | `vite.config.js` | `base: '/continuum-intelligence-v3/'` | Change to `base: '/'` for custom domain |
| 18 | `.github/workflows/deploy.yml` | Hard grep validation for base path | Remove or update the base path check |

### 8.4 CORS Whitelist

| # | File | Context | Migration Action |
|---|------|---------|-----------------|
| 19 | `api/config.py` | `ALLOWED_ORIGINS` includes `github.io` and `localhost` | Add `continuumintelligence.ai`; retain `github.io` during parallel running; remove after cutover |

### 8.5 External CDN Dependencies

| # | File | Context | Migration Action |
|---|------|---------|-----------------|
| 20 | `index.html` | SheetJS CDN `data-src` attribute (lazy-loaded) | Verify CSP `script-src` permits CDN after migration |

### 8.6 Secrets and Environment Variables

| Location | Secrets | Migration Action |
|----------|---------|-----------------|
| GitHub Secrets | `CI_API_KEY`, `BATCH_SECRET`, `INSIGHTS_SECRET`, `PRICE_DRIVERS_SECRET`, `GITHUB_TOKEN` | Remain; workflow URLs update but secret names unchanged |
| Railway env vars | 15+ vars (see `api/config.py`) | All re-provisioned on Fly.io. `ALLOWED_ORIGINS` updated to include new domain |

**Total migration surface**: 20 code locations + 2 secret stores. The Phase 0 refactor (centralise API base URL into `src/lib/api-config.js`) reduces the per-phase touch-points from 16 to 7. Any missed item causes a silent failure (API calls fail CORS, workflows hit dead URLs, builds reject wrong base path).

---

## 9. Redirect Strategy (`github.io` to `continuumintelligence.ai`)

**Phase 1 (parallel running)**: Both URLs serve the platform simultaneously. `github.io` continues as-is. `continuumintelligence.ai` goes live on new host.

**Phase 2 (validation)**: Confirm all features work on `continuumintelligence.ai` for 48 hours minimum. Automated workflows target new URLs. Old URL still serves but is no longer the primary.

**Phase 3 (cutover)**: `github.io` deployment replaced with a static redirect page. All paths 301 to `https://continuumintelligence.ai/<path>`. GitHub Pages repo continues to exist (for workflow history and as a rollback target) but serves only the redirect.

**Implementation**: A minimal `index.html` with `<meta http-equiv="refresh">` and a JavaScript `window.location.replace()` fallback. No server-side redirect available on GitHub Pages; client-side redirect is the only option.

**Risk**: Search engines may take weeks to re-index. Not material for this application (no public SEO requirement; users access via direct link or bookmark).

---

## 10. Per-Phase Rollback Plans

| Phase | What Gets Reverted | How | Time |
|-------|-------------------|-----|------|
| Database decoupling | Point backend back to Railway managed Postgres | Update `DATABASE_URL` env var on Railway | <5 min |
| Frontend host migration | Re-enable GitHub Pages deployment; disable new host | Toggle GitHub Pages on in repo settings; remove/disable Cloudflare project | <10 min |
| Custom domain | Remove DNS records for `continuumintelligence.ai` | Delete A/CNAME records in DNS provider | <15 min (propagation) |
| Backend migration (Fly.io) | Revert workflow URLs and frontend constants to Railway | `git revert` migration commit + re-enable Railway service | <10 min |
| Monitoring addition | Disable Sentry DSN | Remove `SENTRY_DSN` env var from backend | <2 min |
| URL updates in codebase | `git revert` the migration commit(s) | Single revert commit; push to main | <5 min |

**Pre-condition for all rollbacks**: The old system (GitHub Pages + Railway US + Railway Postgres) must remain operational throughout migration. No resource is decommissioned until 7 days after successful cutover validation.

**Backend provider note**: The backend moves from Railway to Fly.io, not a Railway region change. Railway's ephemeral disk and OOM issues are structural to the platform, not region-specific. Fly.io provides persistent volumes, Sydney region (`syd`), and predictable resource allocation. This is a provider migration, not a region swap.

---

## Appendix A: Infrastructure Dependency Map

```
GitHub Actions (workflows)
  ├── Commits data to main → triggers frontend rebuild
  ├── Curls backend API (price-drivers, batch, insights)
  └── Uses GitHub Secrets for auth

GitHub Pages (current frontend host)
  ├── Serves dist/ built by Vite
  ├── Base path: /continuum-intelligence-v3/
  └── Triggered by push to main

Railway (current backend host)
  ├── FastAPI (Python 3.x)
  ├── Managed PostgreSQL
  ├── 15+ env vars
  └── US region (latency: ~150-200ms from Sydney)

External APIs
  ├── Anthropic Claude (LLM backbone)
  ├── Google Gemini (specialist analysis)
  ├── Google Text Embedding (passage embeddings)
  ├── Resend (OTP email via HTTPS)
  ├── NotebookLM (gold analysis, auth expires ~2 weeks)
  └── SheetJS CDN (lazy-loaded for portfolio upload)
```
