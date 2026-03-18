# Continuum Intelligence Infrastructure Migration -- Architecture Spec

**Date**: 2026-03-19
**Author**: Marc Duncan / Claude Code
**Status**: Approved (rev 2 -- post spec review)
**PRD**: [2026-03-19-infrastructure-migration-prd.md](./2026-03-19-infrastructure-migration-prd.md)

---

## Target Architecture

```
User (Sydney)
  |
  +-- continuumintelligence.ai (Cloudflare DNS)
  |     |
  |     +-- Static assets --> Cloudflare Pages (global CDN)
  |     |     Build: npm run build --> dist/
  |     |     Watch paths: src/, public/, index.html, vite.config.js, package.json
  |     |     Excludes: data/**, api/**
  |     |
  |     +-- api.continuumintelligence.ai --> Fly.io Sydney (syd)
  |           FastAPI + uvicorn
  |           shared-cpu-1x, 1GB RAM
  |           |
  |           +-- Fly.io Postgres Sydney (syd)
  |                 Unmanaged (fly pg), co-located, <1ms latency
  |                 1GB persistent volume
  |                 Daily pg_dump via GitHub Action
  |
  +-- GitHub Actions (unchanged host)
        +-- Data workflows --> commit to main (data/ only, skips Cloudflare build)
        +-- API workflows --> curl api.continuumintelligence.ai
        +-- Backup workflow --> pg_dump to GitHub artifact
        +-- Deploy workflow --> retired (Cloudflare Pages replaces it)
```

---

## Technology Decisions

| Component | Current | Target | Rationale |
|-----------|---------|--------|-----------|
| Frontend host | GitHub Pages | Cloudflare Pages (free) | Custom domain, preview deploys, build watch paths, unlimited bandwidth |
| Backend host | Railway (US) | Fly.io Sydney (`syd`) | Sydney region (<1ms to DB), persistent volumes, no ephemeral disk issues, predictable resource allocation |
| Database | Railway managed Postgres | Fly.io Postgres (`syd`, unmanaged) | Co-located with backend (<1ms), standard Postgres (no PgBouncer, asyncpg works natively), public access via `pg_tls` for backups and migration |
| DNS | GitHub Pages default | Cloudflare (nameservers) | Required for apex domain on Cloudflare Pages; free; fast propagation |
| Monitoring | None | Sentry (free tier) + Cloudflare health check | Error detection <5 min; 5k events/month on free tier |
| Backups | None | Daily `pg_dump` via GitHub Action | 90-day retention as GitHub Actions artifact |

### VM Sizing: 1GB RAM

The Fly.io VM is provisioned at `shared-cpu-1x` with **1GB RAM**, not 512MB. The backend has a history of OOM kills on Railway under load (research refresh, price driver analysis, memory extraction). 1GB provides headroom for concurrent LLM API calls that buffer large responses in memory. Cost difference is ~$2/month. If 1GB proves insufficient, the VM can be resized to 2GB ($4/month more) without redeployment.

### Why Fly.io Unmanaged Postgres (not Managed/MPG)

Fly.io offers two Postgres products:

- **Unmanaged (`fly pg`)**: Standard Postgres running as a Fly app. Supports public access via `fly ips allocate-v4` + `pg_tls` handler (3 CLI commands, no workarounds). No PgBouncer; asyncpg works without `statement_cache_size` hacks.
- **Managed (MPG)**: Fully managed, no public access without deploying a proxy container. Adds operational complexity.

Unmanaged is the right choice. Public access is needed for `pg_dump` backups (from GitHub Actions) and for the Phase 1 cross-provider migration. The trade-off (you manage Postgres upgrades) is acceptable at this scale. Explicit memory: **256MB for the Postgres VM** (sufficient for the conversation/memory store at current scale; upgradeable via `fly scale memory`).

### Why Cloudflare Pages (not Vercel)

Both work. Cloudflare Pages is preferred because:

- Build watch paths are configured via dashboard UI (glob patterns), not a shell command
- Unlimited bandwidth on free tier (Vercel: 100GB/month)
- Apex domain support when DNS is on Cloudflare (required for `continuumintelligence.ai`)
- Simpler operational model (no "Ignored Build Step" script to maintain)

---

## Pre-Migration Refactor: Centralise API Base URL

**This step is mandatory before any phase begins.**

The Railway URL (`imaginative-vision-production-16cb.up.railway.app`) and the `github.io` environment detection logic are duplicated across **13 source files** and **3 workflow files**. Updating each independently is error-prone and has already been identified as the highest-risk aspect of this migration.

### Full Inventory (grep-verified)

**Railway URL appears in 13 source files:**

| # | File | Line | Pattern |
|---|------|------|---------|
| 1 | `src/lib/router.js` | ~17 | `_REFRESH_API_BASE` constant |
| 2 | `src/features/chat.js` | ~23 | `PRODUCTION_API` constant |
| 3 | `src/features/auth.js` | -- | Production API URL |
| 4 | `src/features/notifications.js` | -- | Production API URL |
| 5 | `src/features/add-stock.js` | -- | Production API URL |
| 6 | `src/features/batch-refresh.js` | -- | Production API URL |
| 7 | `src/pages/thesis.js` | -- | Production API URL (2 locations) |
| 8 | `src/pages/report-sections.js` | -- | Production API URL |
| 9 | `src/pages/memory.js` | -- | Production API URL |
| 10 | `src/services/live-data.js` | -- | Production API URL |
| 11 | `public/js/personalisation.js` | ~424 | `var origin = isGH ? 'https://...'` |
| 12 | `public/gold.html` | ~243 | `const API = 'https://...'` |
| 13 | `index.html` | ~22 | CSP `connect-src` directive |

**`github.io` environment detection appears in 10 source files:**

All `src/` files listed above (1--10) plus `public/js/personalisation.js` (~422: `window.location.hostname.indexOf('github.io')`).

**Railway URL appears in 3 workflow files:**

| # | File | Context |
|---|------|---------|
| 14 | `.github/workflows/price-drivers.yml` | `API_BASE` env var |
| 15 | `.github/workflows/batch-analysis.yml` | Curl target URL |
| 16 | `.github/workflows/insights-scan.yml` | Curl target URL |

### Refactor: `src/lib/api-config.js`

Create a single module that exports the API base URL:

```javascript
// src/lib/api-config.js
const isProduction = !window.location.hostname.includes('localhost');
export const API_BASE = isProduction
  ? 'https://imaginative-vision-production-16cb.up.railway.app'
  : '';
```

All 10 `src/` files import `API_BASE` from this module instead of computing it locally. During migration, only this one file changes (plus `personalisation.js`, `gold.html`, `index.html` CSP, and the 3 workflows, which cannot import ES modules).

**Reduces the migration surface from 16 touch-points to 7**: `api-config.js`, `personalisation.js`, `gold.html`, `index.html` CSP, and 3 workflow files.

This refactor is a code-only change with no infrastructure dependency. It should be committed and deployed on the current GitHub Pages + Railway stack before any migration phase begins. Tests must pass before proceeding.

---

## Phase Sequence

| Phase | What | Duration | Depends On | Rollback |
|-------|------|----------|-----------|----------|
| **0** | Centralise API base URL | 1--2 hours | Nothing | `git revert` |
| **1** | Database migration | 1--2 hours | Phase 0 | Revert `DATABASE_URL` on Railway |
| **2** | Backend migration | 2--3 hours | Phase 1 | Revert URLs to Railway |
| **3** | Frontend migration | 1--2 hours | Phase 2 | Re-enable GitHub Pages |
| **4** | Custom domain | 1 hour + DNS | Phase 3 | Remove DNS records |
| **5** | Monitoring + backups | 1--2 hours | Phase 2 | Remove Sentry DSN |
| **6** | Cutover + decommission | 30 min | 48h validation | Re-enable Railway |

**Total estimated effort**: 8--13 hours across 1--2 weeks.

---

## Phase 0: Centralise API Base URL (Pre-Migration)

**Goal**: Reduce the Railway URL migration surface from 16 files to 7 by extracting a shared constant.

### Steps

1. Create `src/lib/api-config.js` as described above
2. Update all 10 `src/` files to import `API_BASE` from `api-config.js`, removing local Railway URL constants and `github.io` detection logic
3. `public/js/personalisation.js`: cannot import ES modules; leave the local `isGH` + Railway URL pattern in place (3 touch-points remaining: personalisation.js, gold.html, index.html CSP)
4. Run `npm run validate` (lint + all tests)
5. Push to main
6. Verify on live site: all features work (chat, add-stock, notifications, auth, thesis comparator, memory page, live data, batch refresh, report generation, PDF export)

### What This Does NOT Change

- Workflow files (not JS; still hardcode the URL)
- `public/js/personalisation.js` (classic script, cannot import ES modules)
- `public/gold.html` (standalone page with inline script)
- `index.html` CSP directive (HTML attribute, not JS)

These 6 remaining touch-points (3 workflows + personalisation.js + gold.html + index.html CSP) must be updated individually in Phase 2.

---

## Phase 1: Database Migration

**Goal**: Provision Fly.io Postgres in Sydney. Migrate data from Railway Postgres. Railway backend connects to Fly.io Postgres cross-provider.

### Steps

1. Install `flyctl` CLI and authenticate
2. Provision Postgres:
   ```bash
   fly postgres create --name ci-db --region syd \
     --vm-size shared-cpu-1x --vm-ram 256 \
     --initial-cluster-size 1 --volume-size 1
   ```
3. Enable public access for cross-provider and backup connections:
   ```bash
   fly ips allocate-v4 --app ci-db
   fly config save --app ci-db
   ```
   Edit `fly.toml` to add `pg_tls` handler on port 5432, then:
   ```bash
   fly deploy --app ci-db
   ```
4. Export from Railway:
   ```bash
   pg_dump --no-owner --no-tablespaces -Fc \
     "postgresql://user:pass@railway-host:port/dbname" \
     > ci_backup.dump
   ```
5. Import to Fly.io:
   ```bash
   pg_restore --no-owner --no-tablespaces -d \
     "postgresql://user:pass@ci-db.fly.dev:5432/dbname?sslmode=require" \
     ci_backup.dump
   ```
6. Verify row counts across all 12 tables:
   - `users`, `otp_tokens`, `conversations`, `messages`
   - `profiles`, `memories`, `memory_embeddings`
   - `memory_batch_runs`, `memory_consolidation_events`
   - `notifications`, `price_drivers`, `llm_calls`
7. Update `DATABASE_URL` in Railway env vars to Fly.io public connection string
8. Verify: `curl /api/health` returns 200. Test chat, memory recall, notifications on live site.

### Temporary State

During Phase 1, the Railway backend connects to Fly.io Postgres over the public internet (US to Sydney, ~150ms). This is temporarily worse for DB queries but the same order of magnitude as the current client-to-backend latency. It lasts only until Phase 2 completes.

### `asyncpg` Compatibility

Fly.io unmanaged Postgres is standard Postgres with no PgBouncer. No changes to `asyncpg` connection configuration. The existing `asyncio.wait_for(asyncpg.create_pool(...), timeout=15.0)` in `api/db.py` works as-is. The only change is the connection string.

### Security Note

The Fly.io Postgres public IP is protected by connection string credentials and TLS (`pg_tls` handler). No IP allowlisting is available. Use a strong, unique password generated at provision time. Consider restricting public access after migration (Phase 2) by removing the IPv4 allocation once all connections route through the Fly.io private network. Re-allocate temporarily for backup operations if needed, or use `fly proxy` for `pg_dump` instead.

### Rollback

Revert `DATABASE_URL` on Railway to the original Railway Postgres connection string. Railway Postgres is not decommissioned; it remains available as a fallback.

---

## Phase 2: Backend Migration

**Goal**: FastAPI runs on Fly.io Sydney. All API traffic routes to Fly.io. Railway backend kept alive but idle.

### New Files

**`Dockerfile`** (repo root, not `api/`):
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY api/ ./api/
COPY data/ ./data/
ENV PROJECT_ROOT=/app
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

Note: The Dockerfile is at the repo root, not inside `api/`. This is because the backend reads `data/research/*.json` at runtime via `PROJECT_ROOT`. The `COPY data/ ./data/` line ensures research JSONs are included in the container. `PROJECT_ROOT` is set to `/app` so `config.py` resolves `data/` correctly.

**`fly.toml`** (repo root):
```toml
app = "ci-api"
primary_region = "syd"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "8080"
  PROJECT_ROOT = "/app"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

[[http_service.checks]]
  grace_period = "15s"
  interval = "30s"
  method = "GET"
  path = "/api/health"
  timeout = "5s"

[[vm]]
  size = "shared-cpu-1x"
  memory = "1gb"
```

### Steps

1. Create Fly.io app:
   ```bash
   fly launch --name ci-api --region syd --no-deploy
   ```
2. Set secrets (all 15+ env vars from Railway):
   ```bash
   fly secrets set \
     ANTHROPIC_API_KEY="..." \
     DATABASE_URL="postgres://...@ci-db.internal:5432/dbname" \
     JWT_SECRET="..." \
     BATCH_SECRET="..." \
     INSIGHTS_SECRET="..." \
     PRICE_DRIVERS_SECRET="..." \
     CI_API_KEY="..." \
     GEMINI_API_KEY="..." \
     RESEND_API_KEY="..." \
     EMAIL_FROM="..." \
     NOTEBOOKLM_AUTH_JSON="..." \
     NOTEBOOKLM_GOLD_NOTEBOOK_ID="..."
   ```
   Note: `DATABASE_URL` uses `ci-db.internal` (Fly.io private network, <1ms). The public connection string is only for external access (backups, migration).
3. Deploy:
   ```bash
   fly deploy --app ci-api
   ```
4. Verify health: `curl https://ci-api.fly.dev/api/health`
5. Update `src/lib/api-config.js` (single file, thanks to Phase 0):
   ```javascript
   export const API_BASE = isProduction
     ? 'https://ci-api.fly.dev'
     : '';
   ```
6. Update remaining non-module files:

   | # | File | Change |
   |---|------|--------|
   | 1 | `public/js/personalisation.js` | Update Railway URL to `https://ci-api.fly.dev` |
   | 2 | `public/gold.html` | Update `const API` to `https://ci-api.fly.dev` |
   | 3 | `index.html` | CSP `connect-src`: add `ci-api.fly.dev`; keep Railway URL temporarily |
   | 4 | `.github/workflows/price-drivers.yml` | `API_BASE` = `https://ci-api.fly.dev` |
   | 5 | `.github/workflows/batch-analysis.yml` | Curl target = `https://ci-api.fly.dev/api/batch/run` |
   | 6 | `.github/workflows/insights-scan.yml` | Curl target = `https://ci-api.fly.dev/api/insights/scan` |

7. Update `api/config.py` `ALLOWED_ORIGINS`: add `continuumintelligence.ai` and `.pages.dev` (in preparation for Phases 3--4); keep `github.io` and `localhost`
8. Run `npm run validate`
9. Push to main
10. Verify end-to-end: chat, add-stock, price-drivers workflow, batch-analysis workflow, insights-scan workflow, PDF export, portfolio upload, notifications, auth/login, thesis comparator, memory page, live data, personalisation wizard, gold analysis page

### `data/research/*.json` Files

These are included in the container image via `COPY data/ ./data/` in the Dockerfile. GitHub Actions workflows commit updated JSONs to the repo. When `data/` changes are pushed to main, the `fly-deploy.yml` workflow (below) redeploys the container with the new data. This mirrors the current Railway behaviour (Railway also rebuilds from the repo on each push).

The persistent volume is not needed for research JSONs. It is provisioned on the Postgres VM only (for database storage).

### Auto-deploy from GitHub

**`.github/workflows/fly-deploy.yml`**:
```yaml
name: Deploy to Fly.io
on:
  push:
    branches: [main]
    paths:
      - 'api/**'
      - 'data/**'
      - 'Dockerfile'
      - 'fly.toml'
concurrency:
  group: fly-deploy
  cancel-in-progress: true
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only --app ci-api
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

Note: `working-directory` is omitted; the Dockerfile and fly.toml are at the repo root. The workflow triggers on `api/`, `data/`, `Dockerfile`, and `fly.toml` changes.

### Rollback

Revert all URL changes (`git revert`), push to main. Railway is still running and will immediately receive traffic again.

---

## Phase 3: Frontend Migration

**Goal**: Cloudflare Pages serves the frontend. GitHub Pages enters stale/redirect state.

### Zero-Downtime Approach

The PRD requires zero downtime. Changing `vite.config.js` to `base: '/'` will break the GitHub Pages version (assets resolve to wrong paths). To honour the zero-downtime constraint:

1. **Before** pushing `base: '/'`, disable the GitHub Pages deploy workflow (`deploy.yml`) by adding `if: false` to the deploy job. This freezes the GitHub Pages site at its current (working) state.
2. Push `base: '/'` and all other Phase 3 changes. Cloudflare Pages builds and deploys.
3. The GitHub Pages site remains frozen but functional (serving the last good build). Users on the old URL see stale but working content.
4. Phase 6 replaces the frozen GitHub Pages content with a redirect.

This means the `github.io` URL serves stale content (not broken content) during Phases 3--6. Acceptable because the new Cloudflare Pages URL is the primary from Phase 3 onwards.

### Steps

1. Create Cloudflare Pages project:
   - Connect to `marcjduncan-sys/continuum-intelligence-v3` GitHub repo
   - Framework preset: None (or Vite)
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Node.js version: 20
2. Configure build watch paths (Settings > Build > Build watch paths):
   - **Include**: `src/`, `public/`, `index.html`, `vite.config.js`, `package.json`, `package-lock.json`
   - **Exclude**: `data/`, `api/`, `docs/`, `tests/`, `.github/`, `scripts/`
3. **Disable GitHub Pages deploy workflow** before the next push:
   - Add `if: false` to the deploy job in `.github/workflows/deploy.yml`
4. Update `vite.config.js`:
   ```javascript
   // Was: base: '/continuum-intelligence-v3/'
   base: '/'
   ```
5. Remove the base-path grep validation from `.github/workflows/deploy.yml` (it is now disabled, but clean it up for when it is eventually deleted)
6. Update `src/lib/api-config.js` environment detection:
   ```javascript
   // Production = not localhost (works for continuumintelligence.ai, .pages.dev, github.io)
   const isProduction = !window.location.hostname.includes('localhost');
   ```
7. Update `public/js/personalisation.js` environment detection:
   ```javascript
   // Was: var isGH = window.location.hostname.indexOf('github.io') !== -1;
   var isGH = window.location.hostname.indexOf('localhost') === -1;
   ```
8. Run `npm run validate`
9. Push to main
10. Verify on `<project>.pages.dev`: all pages load, chat works, portfolio upload works, PDF export works, personalisation wizard works, gold analysis page works
11. Test a preview deployment: push to a non-main branch, verify preview URL is generated

### `data/` in the Cloudflare Pages Build

The Vite build plugin copies `data/` into `dist/data/` at build time. This happens regardless of the build watch path configuration. Build watch paths only control *when* a build triggers, not *what* the build includes. The frontend fetches `data/research/TICKER.json` via relative URLs from the frontend host. These files will be present in the Cloudflare Pages deployment even though `data/` changes do not trigger a rebuild.

**Caveat**: When a data workflow commits updated JSONs, the Cloudflare Pages build does NOT trigger (by design, to stay within the 500 build/month cap). The frontend will serve stale research JSONs until the next code push triggers a rebuild. This is the same behaviour as the current GitHub Pages setup during periods between code pushes. If fresher data is needed, a manual build can be triggered from the Cloudflare Pages dashboard, or the frontend can be changed to fetch research JSONs from the API instead of the frontend host. This is an acceptable trade-off for the migration; it can be optimised later.

### Rollback

Re-enable GitHub Pages: remove `if: false` from the deploy job, restore `base: '/continuum-intelligence-v3/'` in `vite.config.js`, restore the deploy workflow validation, push. GitHub Pages rebuilds within minutes.

---

## Phase 4: Custom Domain

**Goal**: `continuumintelligence.ai` serves the frontend. `api.continuumintelligence.ai` routes to Fly.io.

### Pre-requisite

The domain `continuumintelligence.ai` must have its nameservers pointed to Cloudflare. This is required for apex domain support on Cloudflare Pages. If the domain is registered elsewhere, update nameservers at the registrar.

**Action required before starting Phase 4**: Confirm the registrar for `continuumintelligence.ai`, verify the operator has login credentials, and locate the nameserver management page. Document these in this section before proceeding.

- **Registrar**: _______________ (fill in before execution)
- **Nameserver management URL**: _______________ (fill in before execution)
- **Current nameservers**: _______________ (fill in before execution)

### Steps

1. Add domain to Cloudflare (if not already):
   - Cloudflare dashboard > Add a Site > `continuumintelligence.ai`
   - Update nameservers at registrar to Cloudflare-assigned nameservers
   - Wait for DNS propagation (typically <4 hours; can be up to 48 hours)
2. Add custom domain to Cloudflare Pages project:
   - Pages dashboard > Custom domains > Add `continuumintelligence.ai`
   - Cloudflare auto-creates the DNS record
3. Add API subdomain to Fly.io:
   ```bash
   fly certs add api.continuumintelligence.ai --app ci-api
   ```
4. Create DNS record in Cloudflare:
   - Type: CNAME
   - Name: `api`
   - Target: `ci-api.fly.dev`
   - Proxy: DNS only (grey cloud) -- Fly.io handles TLS via Let's Encrypt
5. Update `src/lib/api-config.js` to final URL:
   ```javascript
   export const API_BASE = isProduction
     ? 'https://api.continuumintelligence.ai'
     : '';
   ```
6. Update remaining non-module files to final URL:

   | # | File | Change |
   |---|------|--------|
   | 1 | `public/js/personalisation.js` | Update to `https://api.continuumintelligence.ai` |
   | 2 | `public/gold.html` | Update `const API` to `https://api.continuumintelligence.ai` |
   | 3 | `index.html` | CSP `connect-src`: replace `ci-api.fly.dev` with `api.continuumintelligence.ai` |
   | 4--6 | Workflow files | Update API_BASE / curl targets to `https://api.continuumintelligence.ai` |

7. Update `api/config.py` `ALLOWED_ORIGINS`: ensure `https://continuumintelligence.ai` is present
8. Run `npm run validate`
9. Push to main
10. Verify: full platform works on `https://continuumintelligence.ai`

### Rollback

Remove DNS records for `continuumintelligence.ai` in Cloudflare dashboard. The `<project>.pages.dev` URL continues to work. Revert `api-config.js` URL if needed.

---

## Phase 5: Monitoring and Backups

**Goal**: Errors detected within 5 minutes. Database backed up daily.

### 5A: Sentry Error Monitoring

1. Add to `requirements.txt`:
   ```
   sentry-sdk[fastapi]>=2.0.0
   ```
2. Add to `api/main.py` (before `app = FastAPI(...)`):
   ```python
   import sentry_sdk
   if os.environ.get("SENTRY_DSN"):
       sentry_sdk.init(
           dsn=os.environ["SENTRY_DSN"],
           traces_sample_rate=0.1,
       )
   ```
3. Set secret:
   ```bash
   fly secrets set SENTRY_DSN="https://...@sentry.io/..." --app ci-api
   ```
4. Configure Sentry alerts: email on first occurrence of any unhandled exception

### 5B: Uptime Health Check

Cloudflare-native health check (free, requires domain on Cloudflare):
- URL: `https://api.continuumintelligence.ai/api/health`
- Interval: 1 minute
- Alert: email on 3 consecutive failures

### 5C: Daily Database Backup

**`.github/workflows/db-backup.yml`**:
```yaml
name: Database Backup
on:
  schedule:
    - cron: '0 18 * * *'  # 04:00 AEDT
  workflow_dispatch:
jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Install PostgreSQL client
        run: sudo apt-get install -y postgresql-client
      - name: Run pg_dump
        run: |
          pg_dump --no-owner --no-tablespaces -Fc \
            "${{ secrets.FLYIO_DATABASE_URL }}" \
            > ci_backup_$(date +%Y%m%d).dump
      - name: Upload backup artifact
        uses: actions/upload-artifact@v4
        with:
          name: db-backup-${{ github.run_id }}
          path: ci_backup_*.dump
          retention-days: 90
```

Requires new GitHub Secret: `FLYIO_DATABASE_URL` (the Fly.io Postgres public connection string).

**Security note**: GitHub Actions artifacts are accessible to anyone with repo read access. The backup dump is not encrypted. For a production financial research platform, consider adding an encryption step:
```yaml
      - name: Encrypt backup
        run: gpg --batch --symmetric --passphrase "${{ secrets.BACKUP_PASSPHRASE }}" ci_backup_*.dump
```
This requires an additional GitHub Secret: `BACKUP_PASSPHRASE`.

### Rollback

Remove `SENTRY_DSN` from Fly.io secrets. Disable backup and health check workflows. No application code changes needed (Sentry init is guarded by `if os.environ.get("SENTRY_DSN")`).

---

## Phase 6: Cutover and Decommission

**Pre-conditions**: All phases validated for 48+ hours. No incidents on `continuumintelligence.ai`.

### Steps

1. Replace GitHub Pages content with redirect:
   Re-enable the `deploy.yml` workflow (remove `if: false`) and modify it to deploy a single redirect page instead of the Vite build:
   ```html
   <!DOCTYPE html>
   <html><head>
     <meta charset="utf-8">
     <meta http-equiv="refresh" content="0;url=https://continuumintelligence.ai">
     <script>
       window.location.replace(
         'https://continuumintelligence.ai' + window.location.pathname
       );
     </script>
   </head>
   <body>Redirecting to <a href="https://continuumintelligence.ai">continuumintelligence.ai</a>...</body>
   </html>
   ```
2. Remove `github.io` from `ALLOWED_ORIGINS` in `api/config.py`
3. Remove old Railway URL from CSP `connect-src` in `index.html`
4. Remove `ci-api.fly.dev` from CSP `connect-src` (only `api.continuumintelligence.ai` remains)
5. Push to main
6. **Wait 7 days**
7. Decommission Railway: stop the service, then delete
8. Consider removing Fly.io Postgres public IP (no longer needed once Railway is gone and backups use `fly proxy`):
   ```bash
   fly ips release <ipv4-address> --app ci-db
   ```
   If removed, update the backup workflow to use `fly proxy` instead of the public connection string.
9. Clean up unused GitHub Secrets if any were Railway-specific

### Rollback

Re-enable Railway service from the existing (idle) deployment. Revert URL changes. Re-enable GitHub Pages deploy workflow.

---

## Cost Projection

| Service | Monthly Cost | Notes |
|---------|-------------|-------|
| Fly.io VM (shared-cpu-1x, 1GB) | ~$5.50 | Continuous running |
| Fly.io Postgres (shared-cpu-1x, 256MB, 1GB vol) | ~$2.15 | VM + volume |
| Fly.io custom domain cert | $0.10 | |
| Fly.io bandwidth (APAC) | ~$1--2 | Estimated |
| Cloudflare Pages | $0 | Free tier |
| Cloudflare DNS | $0 | Free |
| Sentry | $0 | Free tier (5k events/month) |
| **Total** | **~$9--10/month** | |

Current Railway spend: ~$5--10/month. Net change: approximately flat. Well within the $25/month incremental budget ($15--16/month headroom). If 1GB RAM proves insufficient, upgrading to 2GB adds ~$4/month (total ~$14/month, still within budget).

---

## Migration Surface Checklist

Each item updated in the phase indicated. Items marked with (P0) are consolidated by the Phase 0 refactor.

| # | Item | Updated In |
|---|------|-----------|
| 1 | `src/lib/api-config.js` (centralised API URL) | Phase 0 (create), Phase 2 (Fly.io URL), Phase 4 (final URL) |
| 2 | `src/lib/router.js` Railway URL (P0) | Phase 0 (import api-config) |
| 3 | `src/features/chat.js` Railway URL (P0) | Phase 0 (import api-config) |
| 4 | `src/features/auth.js` Railway URL (P0) | Phase 0 (import api-config) |
| 5 | `src/features/notifications.js` Railway URL (P0) | Phase 0 (import api-config) |
| 6 | `src/features/add-stock.js` Railway URL (P0) | Phase 0 (import api-config) |
| 7 | `src/features/batch-refresh.js` Railway URL (P0) | Phase 0 (import api-config) |
| 8 | `src/pages/thesis.js` Railway URL (P0) | Phase 0 (import api-config) |
| 9 | `src/pages/report-sections.js` Railway URL (P0) | Phase 0 (import api-config) |
| 10 | `src/pages/memory.js` Railway URL (P0) | Phase 0 (import api-config) |
| 11 | `src/services/live-data.js` Railway URL (P0) | Phase 0 (import api-config) |
| 12 | `public/js/personalisation.js` Railway URL + detection | Phase 2 (Fly.io URL), Phase 3 (detection), Phase 4 (final URL) |
| 13 | `public/gold.html` Railway URL | Phase 2 (Fly.io URL), Phase 4 (final URL) |
| 14 | `index.html` CSP `connect-src` | Phase 2 (add Fly.io), Phase 4 (final), Phase 6 (clean up) |
| 15 | `vite.config.js` base path | Phase 3 |
| 16 | `.github/workflows/deploy.yml` base path validation | Phase 3 (disable), Phase 6 (redirect) |
| 17 | `.github/workflows/price-drivers.yml` API_BASE | Phase 2 (Fly.io URL), Phase 4 (final URL) |
| 18 | `.github/workflows/batch-analysis.yml` curl target | Phase 2 (Fly.io URL), Phase 4 (final URL) |
| 19 | `.github/workflows/insights-scan.yml` curl target | Phase 2 (Fly.io URL), Phase 4 (final URL) |
| 20 | `api/config.py` ALLOWED_ORIGINS | Phase 2 (add new), Phase 6 (remove old) |
| 21 | `index.html` SheetJS CDN CSP | Phase 3 (verify unchanged) |

---

## Appendix: New Files Created by Migration

| File | Phase | Purpose |
|------|-------|---------|
| `src/lib/api-config.js` | 0 | Centralised API base URL constant |
| `Dockerfile` | 2 | Container image definition for Fly.io (repo root) |
| `fly.toml` | 2 | Fly.io app configuration (repo root) |
| `.github/workflows/fly-deploy.yml` | 2 | Auto-deploy backend on push to main |
| `.github/workflows/db-backup.yml` | 5 | Daily pg_dump backup |

No existing files are deleted during migration. The GitHub Pages deploy workflow (`deploy.yml`) is disabled in Phase 3 and repurposed as a redirect deployer in Phase 6.

---

## Appendix: New Secrets Required

| Secret | Location | Phase | Purpose |
|--------|----------|-------|---------|
| `FLY_API_TOKEN` | GitHub Secrets | 2 | Fly.io deploy from GitHub Actions |
| `FLYIO_DATABASE_URL` | GitHub Secrets | 5 | pg_dump backup from GitHub Actions |
| `SENTRY_DSN` | Fly.io secrets | 5 | Error monitoring |
| `BACKUP_PASSPHRASE` | GitHub Secrets | 5 | (Optional) Encrypt backup artifacts |
| All existing Railway env vars | Fly.io secrets | 2 | Migrated from Railway dashboard |
