# Infrastructure Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Continuum Intelligence from GitHub Pages + Railway (US) to Cloudflare Pages + Fly.io Sydney, with custom domain `continuumintelligence.ai`, monitoring, and daily database backups.

**Architecture:** Database-first migration (Approach A). Phase 0 centralises the API base URL into a single module, reducing per-phase touch-points from 16 files to 7. Phases 1--6 are infrastructure operations executed sequentially with per-phase validation gates.

**Tech Stack:** Fly.io (backend + Postgres, Sydney `syd` region), Cloudflare Pages (frontend), Cloudflare DNS, Sentry (error monitoring), GitHub Actions (CI/CD + backups).

**Specs:**
- PRD: `docs/superpowers/specs/2026-03-19-infrastructure-migration-prd.md`
- Architecture: `docs/superpowers/specs/2026-03-19-infrastructure-migration-architecture.md`

---

## File Structure

### New Files

| File | Purpose |
|------|---------|
| `src/lib/api-config.js` | Centralised API base URL and environment detection (Phase 0) |
| `src/lib/api-config.test.js` | Vitest unit tests for api-config.js (Phase 0) |
| `Dockerfile` | Container image for Fly.io backend (Phase 2) |
| `fly.toml` | Fly.io app configuration (Phase 2) |
| `.dockerignore` | Exclude unnecessary files from Docker build (Phase 2) |
| `.github/workflows/fly-deploy.yml` | Auto-deploy backend to Fly.io on push (Phase 2) |
| `.github/workflows/db-backup.yml` | Daily pg_dump backup (Phase 5) |

### Modified Files (Phase 0 only)

| File | Change |
|------|--------|
| `src/lib/router.js` | Remove local API URL constant; import from `api-config.js` |
| `src/features/chat.js` | Remove local API URL constants; import from `api-config.js` |
| `src/features/auth.js` | Remove local API URL constants; import from `api-config.js` |
| `src/features/notifications.js` | Remove local API URL constants; import from `api-config.js` |
| `src/features/add-stock.js` | Remove local API URL constant; import from `api-config.js` |
| `src/features/batch-refresh.js` | Remove local API URL constant; import from `api-config.js` |
| `src/pages/thesis.js` | Remove 2 local API URL blocks; import from `api-config.js` |
| `src/pages/report-sections.js` | Remove local API URL block; import from `api-config.js` |
| `src/pages/memory.js` | Remove local API URL constants; import from `api-config.js` |
| `src/services/live-data.js` | Remove local API URL constant; import from `api-config.js` |

### Not Modified in Phase 0 (updated individually in later phases)

| File | Reason |
|------|--------|
| `public/js/personalisation.js` | Classic `<script>`, cannot import ES modules |
| `public/gold.html` | Standalone page with inline `<script>` |
| `index.html` | CSP `connect-src` directive (HTML attribute) |
| `.github/workflows/price-drivers.yml` | YAML, not JS |
| `.github/workflows/batch-analysis.yml` | YAML, not JS |
| `.github/workflows/insights-scan.yml` | YAML, not JS |

---

## Task 0: Pull Latest and Verify Clean State

- [ ] **Step 1: Pull latest from main**

```bash
git pull origin main
```

- [ ] **Step 2: Verify clean working tree**

```bash
git status
```
Expected: No uncommitted changes in `src/`, `api/`, or `public/`.

- [ ] **Step 3: Run existing tests to confirm baseline**

Run: `npm run validate`
Expected: All tests pass. This is the baseline before any changes.

---

## Task 1: Create `api-config.js` Module with Tests

**Files:**
- Create: `src/lib/api-config.js`
- Create: `src/lib/api-config.test.js`

- [ ] **Step 1: Write the test file**

```javascript
// src/lib/api-config.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('api-config', () => {
  let originalHostname;
  let originalProtocol;
  let originalChatApiUrl;

  beforeEach(() => {
    originalHostname = window.location.hostname;
    originalProtocol = window.location.protocol;
    originalChatApiUrl = window.CHAT_API_URL;
  });

  afterEach(() => {
    delete window.CHAT_API_URL;
    // Reset module cache so next import re-evaluates
    vi.resetModules();
  });

  it('returns production URL when hostname is not localhost', async () => {
    // jsdom default hostname is 'localhost', so we need to mock
    // We test the logic function instead
    const { _resolveApiBase } = await import('./api-config.js');
    expect(_resolveApiBase('continuumintelligence.ai', 'https:')).toBe(
      'https://imaginative-vision-production-16cb.up.railway.app'
    );
  });

  it('returns empty string for localhost', async () => {
    const { _resolveApiBase } = await import('./api-config.js');
    expect(_resolveApiBase('localhost', 'https:')).toBe('');
  });

  it('returns empty string for 127.0.0.1', async () => {
    const { _resolveApiBase } = await import('./api-config.js');
    expect(_resolveApiBase('127.0.0.1', 'https:')).toBe('');
  });

  it('returns empty string for file:// protocol', async () => {
    const { _resolveApiBase } = await import('./api-config.js');
    expect(_resolveApiBase('', 'file:')).toBe('');
  });

  it('returns production URL for github.io', async () => {
    const { _resolveApiBase } = await import('./api-config.js');
    expect(_resolveApiBase('marcjduncan-sys.github.io', 'https:')).toBe(
      'https://imaginative-vision-production-16cb.up.railway.app'
    );
  });

  it('returns production URL for pages.dev', async () => {
    const { _resolveApiBase } = await import('./api-config.js');
    expect(_resolveApiBase('ci-app.pages.dev', 'https:')).toBe(
      'https://imaginative-vision-production-16cb.up.railway.app'
    );
  });

  it('respects window.CHAT_API_URL override', async () => {
    const { _resolveApiBase } = await import('./api-config.js');
    expect(_resolveApiBase('localhost', 'https:', 'https://custom-api.example.com')).toBe(
      'https://custom-api.example.com'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/api-config.test.js`
Expected: FAIL -- module `./api-config.js` not found.

- [ ] **Step 3: Write the module**

```javascript
// src/lib/api-config.js
//
// Centralised API base URL for all src/ modules.
// Single source of truth for production URL and environment detection.
// During migration, only this file changes (plus non-module files
// that cannot import ES modules).

const PRODUCTION_URL = 'https://imaginative-vision-production-16cb.up.railway.app';

/**
 * Resolve the API base URL given hostname, protocol, and optional override.
 * Exported for testing; consumers should use API_BASE directly.
 */
export function _resolveApiBase(hostname, protocol, chatApiUrlOverride) {
  if (chatApiUrlOverride) return chatApiUrlOverride;
  if (protocol === 'file:') return '';
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '') return '';
  return PRODUCTION_URL;
}

export const API_BASE = _resolveApiBase(
  window.location.hostname,
  window.location.protocol,
  window.CHAT_API_URL
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/api-config.test.js`
Expected: 7 tests PASS.

- [ ] **Step 5: Run full test suite to verify no regressions**

Run: `npm run test:unit`
Expected: 195+ tests PASS (existing + 7 new).

- [ ] **Step 6: Commit**

```bash
git add src/lib/api-config.js src/lib/api-config.test.js
git commit -m "feat: add centralised API base URL module (Phase 0 migration prep)"
```

---

## Task 2: Migrate `router.js` to Use `api-config.js`

**Files:**
- Modify: `src/lib/router.js` (lines ~15--19)

**Current code (lines 15--19):**
```javascript

// Railway API base (same pattern as batch-refresh.js)
var _REFRESH_API_BASE = window.location.hostname.includes('github.io')
  ? 'https://imaginative-vision-production-16cb.up.railway.app'
  : '';
```

- [ ] **Step 1: Add import and replace constant**

Add at top of file (after existing imports):
```javascript
import { API_BASE } from './api-config.js';
```

Replace lines 16--19 with:
```javascript
// Railway API base (centralised in api-config.js)
var _REFRESH_API_BASE = API_BASE;
```

- [ ] **Step 2: Run tests**

Run: `npm run test:unit`
Expected: All tests PASS. No behavioural change; same URL resolved.

- [ ] **Step 3: Commit**

```bash
git add src/lib/router.js
git commit -m "refactor: router.js uses centralised API base URL"
```

---

## Task 3: Migrate `chat.js` to Use `api-config.js`

**Files:**
- Modify: `src/features/chat.js` (lines ~23--31)

**Current code (lines 23--31):**
```javascript
var PRODUCTION_API = 'https://imaginative-vision-production-16cb.up.railway.app';
var isLocal       = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
var isFile        = window.location.protocol === 'file:';
var isGitHubPages = window.location.hostname.indexOf('github.io') !== -1;
var apiOrigin     = window.CHAT_API_URL
    || (isFile        ? ''
        : isGitHubPages ? PRODUCTION_API
        : '');
var CHAT_API_BASE = apiOrigin + '/api/research-chat';
var CI_API_KEY    = window.CI_API_KEY || '';
```

- [ ] **Step 1: Add import and replace config block**

Add after the existing imports (after `import { ... } from './thesis-capture.js';`):
```javascript
import { API_BASE } from '../lib/api-config.js';
```

Replace lines 23--31 with:
```javascript
var isFile        = window.location.protocol === 'file:';
var apiOrigin     = API_BASE;
var CHAT_API_BASE = apiOrigin + '/api/research-chat';
var CI_API_KEY    = window.CI_API_KEY || '';
```

**Why `isFile` and `apiOrigin` are preserved:** `isFile` is used downstream at lines ~91, ~129, ~420, ~604 for feature gating (disabling features in file:// context). `apiOrigin` is used at lines ~99, ~120, ~136, ~611 for non-chat API calls. Removing them would break those references. `PRODUCTION_API`, `isLocal`, and `isGitHubPages` are safe to remove (only used in the config block).

- [ ] **Step 2: Verify no remaining references to removed variables**

Run: `grep -n 'PRODUCTION_API\|isLocal\|isGitHubPages' src/features/chat.js`
Expected: Zero results (these three were only used in the config block).

- [ ] **Step 3: Run tests**

Run: `npm run test:unit`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/chat.js
git commit -m "refactor: chat.js uses centralised API base URL"
```

---

## Task 4: Migrate `auth.js` to Use `api-config.js`

**Files:**
- Modify: `src/features/auth.js` (lines ~14--17)

**Current code (lines 14--17):**
```javascript
const PRODUCTION_API = 'https://imaginative-vision-production-16cb.up.railway.app';
const _authIsGHP = window.location.hostname.indexOf('github.io') !== -1;
const _authApiOrigin = window.CHAT_API_URL || (_authIsGHP ? PRODUCTION_API : '');
const AUTH_API_BASE = _authApiOrigin + '/api/auth';
```

- [ ] **Step 1: Add import and replace config block**

Add after the `// CONFIG` comment:
```javascript
import { API_BASE } from '../lib/api-config.js';
```

Replace lines 14--17 with:
```javascript
const AUTH_API_BASE = API_BASE + '/api/auth';
```

- [ ] **Step 2: Run tests**

Run: `npm run test:unit`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/auth.js
git commit -m "refactor: auth.js uses centralised API base URL"
```

---

## Task 5: Migrate `notifications.js` to Use `api-config.js`

**Files:**
- Modify: `src/features/notifications.js` (lines ~13--15)

**Current code (lines 13--15):**
```javascript
var _PRODUCTION_API = 'https://imaginative-vision-production-16cb.up.railway.app';
var _isGitHubPages = window.location.hostname.indexOf('github.io') !== -1;
var _NOTIF_BASE = (_isGitHubPages ? _PRODUCTION_API : '') + '/api/notifications';
```

- [ ] **Step 1: Add import and replace config block**

Add after the comment header:
```javascript
import { API_BASE } from '../lib/api-config.js';
```

Replace lines 13--15 with:
```javascript
var _NOTIF_BASE = API_BASE + '/api/notifications';
```

- [ ] **Step 2: Run tests**

Run: `npm run test:unit`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/notifications.js
git commit -m "refactor: notifications.js uses centralised API base URL"
```

---

## Task 6: Migrate `add-stock.js` to Use `api-config.js`

**Files:**
- Modify: `src/features/add-stock.js` (lines ~24--26)

**Current code (lines 24--26):**
```javascript
var REFRESH_API_BASE = window.location.hostname.includes('github.io')
    ? 'https://imaginative-vision-production-16cb.up.railway.app'
    : '';
```

- [ ] **Step 1: Add import and replace constant**

Add after existing imports:
```javascript
import { API_BASE } from '../lib/api-config.js';
```

Replace lines 24--26 with:
```javascript
var REFRESH_API_BASE = API_BASE;
```

- [ ] **Step 2: Run tests**

Run: `npm run test:unit`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/add-stock.js
git commit -m "refactor: add-stock.js uses centralised API base URL"
```

---

## Task 7: Migrate `batch-refresh.js` to Use `api-config.js`

**Files:**
- Modify: `src/features/batch-refresh.js` (lines ~21--23)

**Current code (lines 21--23):**
```javascript
var REFRESH_API_BASE = window.location.hostname.includes('github.io')
    ? 'https://imaginative-vision-production-16cb.up.railway.app'
    : '';  // Same origin (Vite proxy in dev, Railway in prod)
```

- [ ] **Step 1: Add import and replace constant**

Add after existing imports:
```javascript
import { API_BASE } from '../lib/api-config.js';
```

Replace lines 21--23 with:
```javascript
var REFRESH_API_BASE = API_BASE;
```

- [ ] **Step 2: Run tests**

Run: `npm run test:unit`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/batch-refresh.js
git commit -m "refactor: batch-refresh.js uses centralised API base URL"
```

---

## Task 8: Migrate `thesis.js` to Use `api-config.js`

**Files:**
- Modify: `src/pages/thesis.js` (2 locations: lines ~52--54 and ~308--315)

**Current code -- location 1 (lines 52--54):**
```javascript
  var apiBase = (window.location.hostname.indexOf('github.io') !== -1)
    ? 'https://imaginative-vision-production-16cb.up.railway.app'
    : '';
```

**Current code -- location 2 (lines 308--315):**
```javascript
var PRODUCTION_API = 'https://imaginative-vision-production-16cb.up.railway.app';
var isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
var isGitHubPages = window.location.hostname.indexOf('github.io') !== -1;
var apiOrigin = window.CHAT_API_URL
  || (isLocal ? ''
      : isGitHubPages ? PRODUCTION_API
      : '');
var API_BASE = apiOrigin + '/api/research-chat';
```

- [ ] **Step 1: Add import**

Add after existing imports at top of file:
```javascript
import { API_BASE as _API_BASE } from '../lib/api-config.js';
```

Note: Named as `_API_BASE` because the file already has a local `var API_BASE` at line ~315 which is `apiOrigin + '/api/research-chat'`.

- [ ] **Step 2: Replace location 1 (lines 52--54)**

Replace:
```javascript
  var apiBase = (window.location.hostname.indexOf('github.io') !== -1)
    ? 'https://imaginative-vision-production-16cb.up.railway.app'
    : '';
```
With:
```javascript
  var apiBase = _API_BASE;
```

- [ ] **Step 3: Replace location 2 (lines 308--315)**

Replace:
```javascript
var PRODUCTION_API = 'https://imaginative-vision-production-16cb.up.railway.app';
var isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
var isGitHubPages = window.location.hostname.indexOf('github.io') !== -1;
var apiOrigin = window.CHAT_API_URL
  || (isLocal ? ''
      : isGitHubPages ? PRODUCTION_API
      : '');
var API_BASE = apiOrigin + '/api/research-chat';
```
With:
```javascript
var API_BASE = _API_BASE + '/api/research-chat';
```

- [ ] **Step 4: Run tests**

Run: `npm run test:unit`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/thesis.js
git commit -m "refactor: thesis.js uses centralised API base URL"
```

---

## Task 9: Migrate `report-sections.js` to Use `api-config.js`

**Files:**
- Modify: `src/pages/report-sections.js` (lines ~2535--2538)

**Current code (lines 2535--2538):**
```javascript
  var isGHPages = window.location.hostname.includes('github.io');
  var baseUrl = isGHPages
    ? 'https://imaginative-vision-production-16cb.up.railway.app'
    : '';
  var apiKey = window.CI_API_KEY || '';
```

- [ ] **Step 1: Add import**

Add after existing imports at top of file:
```javascript
import { API_BASE } from '../lib/api-config.js';
```

- [ ] **Step 2: Replace the config block**

Replace:
```javascript
  var isGHPages = window.location.hostname.includes('github.io');
  var baseUrl = isGHPages
    ? 'https://imaginative-vision-production-16cb.up.railway.app'
    : '';
  var apiKey = window.CI_API_KEY || '';
```
With:
```javascript
  var baseUrl = API_BASE;
  var apiKey = window.CI_API_KEY || '';
```

- [ ] **Step 3: Run tests**

Run: `npm run test:unit`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/report-sections.js
git commit -m "refactor: report-sections.js uses centralised API base URL"
```

---

## Task 10: Migrate `memory.js` to Use `api-config.js`

**Files:**
- Modify: `src/pages/memory.js` (lines ~11--18)

**Current code (lines 11--18):**
```javascript
var PRODUCTION_API = 'https://imaginative-vision-production-16cb.up.railway.app';
var isLocal       = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
var isFile        = window.location.protocol === 'file:';
var isGitHubPages = window.location.hostname.indexOf('github.io') !== -1;
var apiOrigin     = window.CHAT_API_URL
    || (isFile        ? ''
        : isGitHubPages ? PRODUCTION_API
        : '');
```

- [ ] **Step 1: Add import and replace config block**

Add after existing imports:
```javascript
import { API_BASE } from '../lib/api-config.js';
```

Replace lines 11--18 with:
```javascript
var apiOrigin = API_BASE;
```

Note: Downstream code uses `apiOrigin`, so we keep that variable name.

- [ ] **Step 2: Verify `apiOrigin` usage downstream**

Run: `grep -n 'apiOrigin' src/pages/memory.js`
Confirm all references work with the new value (should be identical behaviour).

- [ ] **Step 3: Run tests**

Run: `npm run test:unit`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/memory.js
git commit -m "refactor: memory.js uses centralised API base URL"
```

---

## Task 11: Migrate `live-data.js` to Use `api-config.js`

**Files:**
- Modify: `src/services/live-data.js` (lines ~35--37)

**Current code (lines 35--37):**
```javascript
var _CHART_API_BASE = window.location.hostname.includes('github.io')
    ? 'https://imaginative-vision-production-16cb.up.railway.app'
    : '';
```

- [ ] **Step 1: Add import and replace constant**

Add after existing imports:
```javascript
import { API_BASE } from '../lib/api-config.js';
```

Replace lines 35--37 with:
```javascript
var _CHART_API_BASE = API_BASE;
```

- [ ] **Step 2: Run tests**

Run: `npm run test:unit`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/services/live-data.js
git commit -m "refactor: live-data.js uses centralised API base URL"
```

---

## Task 12: Full Validation and Phase 0 Completion

**Files:** None (validation only)

- [ ] **Step 1: Run full validation suite**

Run: `npm run validate`
Expected: ESLint passes (0 errors), all Vitest tests PASS (195+ tests), all Jest tests PASS (61 tests).

- [ ] **Step 2: Verify no remaining Railway URL in src/**

Run: `grep -r "imaginative-vision-production" src/`
Expected: **Zero results.** All Railway URLs are now centralised in `src/lib/api-config.js`.

- [ ] **Step 3: Verify remaining Railway URL locations (expected)**

Run: `grep -r "imaginative-vision-production" --include="*.js" --include="*.html" --include="*.yml" . | grep -v node_modules | grep -v dist/ | grep -v docs/ | grep -v CLAUDE.md | grep -v .claude/`
Expected: Exactly these files remain (cannot import ES modules):
- `src/lib/api-config.js` (the single source of truth)
- `public/js/personalisation.js`
- `public/gold.html`
- `index.html` (CSP directive)
- `.github/workflows/price-drivers.yml`
- `.github/workflows/batch-analysis.yml`
- `.github/workflows/insights-scan.yml`

That is 7 locations total (1 canonical + 6 non-module). Down from 16.

- [ ] **Step 4: Build succeeds**

Run: `npm run build`
Expected: Vite build completes without errors. `dist/` directory created.

- [ ] **Step 5: Push to main**

```bash
git push origin main
```
Expected: GitHub Actions deploy workflow triggers, Vitest passes, GitHub Pages deploys.

- [ ] **Step 6: Verify on live site**

Open `https://marcjduncan-sys.github.io/continuum-intelligence-v3/` and test:
- [ ] Home page loads with stock cards
- [ ] Click a stock card -- research page loads
- [ ] Analyst chat panel opens and sends a message
- [ ] Add Stock modal opens (do not submit)
- [ ] Thesis Comparator page loads
- [ ] Memory/Journal page loads
- [ ] Personalisation wizard loads
- [ ] PDF export generates a document
- [ ] Notifications badge appears (or empty state)
- [ ] Sign in button is visible and responsive

**Phase 0 is complete when all 10 features work on the live site.**

---

## Task 13: Phase 1 -- Database Migration to Fly.io Sydney

**Pre-requisites:** `flyctl` CLI installed. Fly.io account created with credit card on file.

- [ ] **Step 1: Install flyctl**

Run: `curl -L https://fly.io/install.sh | sh` (or `brew install flyctl` on macOS)
Then: `fly auth login`

- [ ] **Step 2: Provision Fly.io Postgres**

```bash
fly postgres create --name ci-db --region syd \
  --vm-size shared-cpu-1x --vm-ram 256 \
  --initial-cluster-size 1 --volume-size 1
```

Record the connection credentials printed by the command. Save them securely.

- [ ] **Step 3: Enable public access**

```bash
fly ips allocate-v4 --app ci-db
fly config save --app ci-db
```

Edit the saved `fly.toml` for ci-db. Add under `[services]`:
```toml
[[services]]
  internal_port = 5432
  protocol = "tcp"
  [[services.ports]]
    handlers = ["pg_tls"]
    port = 5432
```

Deploy the config change:
```bash
fly deploy --app ci-db
```

- [ ] **Step 4: Get Railway connection string**

From Railway dashboard, copy the Postgres connection string (postgresql://...).

- [ ] **Step 5: Export Railway database**

```bash
pg_dump --no-owner --no-tablespaces -Fc \
  "postgresql://USER:PASS@HOST:PORT/DBNAME" \
  > ci_backup.dump
```

- [ ] **Step 6: Import to Fly.io Postgres**

```bash
pg_restore --no-owner --no-tablespaces -d \
  "postgresql://USER:PASS@ci-db.fly.dev:5432/DBNAME?sslmode=require" \
  ci_backup.dump
```

- [ ] **Step 7: Verify row counts**

Connect to Fly.io Postgres and count rows in all 12 tables:
```bash
fly postgres connect --app ci-db
```
```sql
SELECT 'users' AS t, count(*) FROM users
UNION ALL SELECT 'otp_tokens', count(*) FROM otp_tokens
UNION ALL SELECT 'conversations', count(*) FROM conversations
UNION ALL SELECT 'messages', count(*) FROM messages
UNION ALL SELECT 'profiles', count(*) FROM profiles
UNION ALL SELECT 'memories', count(*) FROM memories
UNION ALL SELECT 'memory_embeddings', count(*) FROM memory_embeddings
UNION ALL SELECT 'memory_batch_runs', count(*) FROM memory_batch_runs
UNION ALL SELECT 'memory_consolidation_events', count(*) FROM memory_consolidation_events
UNION ALL SELECT 'notifications', count(*) FROM notifications
UNION ALL SELECT 'price_drivers', count(*) FROM price_drivers
UNION ALL SELECT 'llm_calls', count(*) FROM llm_calls;
```

Compare against Railway row counts (run the same query against Railway).

- [ ] **Step 8: Update Railway DATABASE_URL**

In Railway dashboard, update `DATABASE_URL` to the Fly.io **public** connection string:
```
postgresql://USER:PASS@ci-db.fly.dev:5432/DBNAME?sslmode=require
```

- [ ] **Step 9: Verify live site**

```bash
curl https://imaginative-vision-production-16cb.up.railway.app/api/health
```
Expected: 200 OK. The Railway backend now connects to Fly.io Postgres cross-provider.

Test on the live site: send a chat message, verify it persists.

**Phase 1 is complete when the live site works with Fly.io Postgres.**

---

## Task 14: Phase 2 -- Backend Migration to Fly.io Sydney

- [ ] **Step 1: Create Dockerfile at repo root**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY api/requirements.txt ./api/
RUN pip install --no-cache-dir -r api/requirements.txt
COPY api/ ./api/
COPY data/ ./data/
ENV PROJECT_ROOT=/app
WORKDIR /app/api
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

**Critical note:** The API codebase uses bare imports (`import db`, `from errors import ...`), not package-relative imports. There is no `api/__init__.py`. The `WORKDIR` must be `/app/api` so `uvicorn main:app` resolves `import db` correctly. `PROJECT_ROOT=/app` is set so `config.py` can find `../data/` (resolves to `/app/data/`).

- [ ] **Step 2: Create .dockerignore at repo root**

```
node_modules/
dist/
docs/
tests/
src/
public/
js/
.github/
*.md
.git/
```

- [ ] **Step 3: Create fly.toml at repo root**

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

- [ ] **Step 4: Create Fly.io app and set secrets**

```bash
fly launch --name ci-api --region syd --no-deploy
```

Set all secrets (copy values from Railway dashboard):
```bash
fly secrets set \
  ANTHROPIC_API_KEY="..." \
  DATABASE_URL="postgres://...@ci-db.internal:5432/DBNAME" \
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

Note: `DATABASE_URL` uses `ci-db.internal` (private network).

- [ ] **Step 5: Deploy and verify health**

```bash
fly deploy --app ci-api
```

```bash
curl https://ci-api.fly.dev/api/health
```
Expected: 200 OK.

- [ ] **Step 6: Update API base URL in api-config.js**

Change `PRODUCTION_URL` in `src/lib/api-config.js`:
```javascript
var PRODUCTION_URL = 'https://ci-api.fly.dev';
```

- [ ] **Step 7: Update non-module files**

Update `public/js/personalisation.js` (~line 424):
```javascript
var origin = isGH ? 'https://ci-api.fly.dev'
```

Update `public/gold.html` (~line 243):
```javascript
const API = 'https://ci-api.fly.dev';
```

Update `index.html` CSP `connect-src`: add `https://ci-api.fly.dev` (keep Railway URL temporarily).

Update `.github/workflows/price-drivers.yml`:
```yaml
API_BASE: https://ci-api.fly.dev
```

Update `.github/workflows/batch-analysis.yml`: curl target to `https://ci-api.fly.dev/api/batch/run`.

Update `.github/workflows/insights-scan.yml`: curl target to `https://ci-api.fly.dev/api/insights/scan`.

- [ ] **Step 8: Update ALLOWED_ORIGINS**

In `api/config.py`, add to `ALLOWED_ORIGINS`:
- `https://continuumintelligence.ai`
- Any `.pages.dev` pattern needed

- [ ] **Step 9: Create fly-deploy.yml**

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

- [ ] **Step 10: Add FLY_API_TOKEN to GitHub Secrets**

Generate token: `fly tokens create deploy -x 999999h --app ci-api`
Add to GitHub repo Settings > Secrets > `FLY_API_TOKEN`.

- [ ] **Step 11: Run tests, push, verify**

```bash
npm run validate
git add Dockerfile .dockerignore fly.toml .github/workflows/fly-deploy.yml src/lib/api-config.js public/js/personalisation.js public/gold.html index.html api/config.py .github/workflows/price-drivers.yml .github/workflows/batch-analysis.yml .github/workflows/insights-scan.yml
git commit -m "feat: migrate backend to Fly.io Sydney (Phase 2)"
git push origin main
```

Verify end-to-end on live site: chat, add-stock, notifications, auth, thesis, memory, live data, PDF, personalisation, gold page. All 10 features.

**Phase 2 is complete when all features work through the Fly.io backend.**

---

## Task 15: Phase 3 -- Frontend Migration to Cloudflare Pages

- [ ] **Step 1: Disable GitHub Pages deploy workflow**

In `.github/workflows/deploy.yml`, add `if: false` to the deploy job:
```yaml
jobs:
  deploy:
    if: false
    runs-on: ubuntu-latest
```

Commit and push this change FIRST, before any other Phase 3 changes. This freezes the GitHub Pages site at its current working state.

- [ ] **Step 2: Create Cloudflare Pages project**

In Cloudflare dashboard:
- Pages > Create a project > Connect to Git
- Select `marcjduncan-sys/continuum-intelligence-v3`
- Build command: `npm run build`
- Build output directory: `dist`
- Environment variable: `NODE_VERSION` = `20`

- [ ] **Step 3: Configure build watch paths**

In Cloudflare Pages project settings > Build > Build watch paths:
- Include: `src/`, `public/`, `index.html`, `vite.config.js`, `package.json`, `package-lock.json`
- Exclude: `data/`, `api/`, `docs/`, `tests/`, `.github/`, `scripts/`

- [ ] **Step 4: Update vite.config.js**

```javascript
// Was: base: '/continuum-intelligence-v3/'
base: '/'
```

- [ ] **Step 5: Remove base path validation from deploy.yml**

Remove the `grep` validation step (no longer needed; workflow is disabled anyway).

- [ ] **Step 5a: Update personalisation.js environment detection**

In `public/js/personalisation.js` (~line 422), replace:
```javascript
var isGH = window.location.hostname.indexOf('github.io') !== -1;
```
With:
```javascript
var isGH = window.location.hostname.indexOf('localhost') === -1;
```

Without this, `personalisation.js` will fail to reach the API on `*.pages.dev` (the `github.io` check evaluates false on the new domain).

- [ ] **Step 5b: Verify SheetJS CDN CSP**

Check `index.html` CSP `script-src` directive still permits the SheetJS CDN origin (`cdn.sheetjs.com` or whichever CDN is referenced in the `data-src` attribute). No change expected, but verify.

- [ ] **Step 6: Push and verify Cloudflare Pages build**

```bash
git add vite.config.js .github/workflows/deploy.yml
git commit -m "feat: migrate frontend to Cloudflare Pages (Phase 3)"
git push origin main
```

Wait for Cloudflare Pages build to complete. Note the preview URL: `<project>.pages.dev`.

- [ ] **Step 7: Verify on Cloudflare Pages URL**

Open `https://<project>.pages.dev/` and test all 10 features.

- [ ] **Step 8: Test preview deployment**

Push a change to a non-main branch. Verify Cloudflare generates a preview URL.

**Phase 3 is complete when all features work on the `.pages.dev` URL.**

---

## Task 16: Phase 4 -- Custom Domain

- [ ] **Step 1: Document registrar details**

Fill in the architecture spec Phase 4 pre-requisite fields:
- Registrar: _______________
- Nameserver management URL: _______________
- Current nameservers: _______________

- [ ] **Step 2: Add domain to Cloudflare**

Cloudflare dashboard > Add a Site > `continuumintelligence.ai`.
Update nameservers at registrar to Cloudflare-assigned nameservers.
Wait for propagation (check: `dig NS continuumintelligence.ai`).

- [ ] **Step 3: Add custom domain to Cloudflare Pages**

Pages dashboard > Custom domains > Add `continuumintelligence.ai`.

- [ ] **Step 4: Add API subdomain to Fly.io**

```bash
fly certs add api.continuumintelligence.ai --app ci-api
```

Create CNAME in Cloudflare DNS: `api` -> `ci-api.fly.dev` (DNS only, grey cloud).

- [ ] **Step 5: Update to final URLs**

In `src/lib/api-config.js`:
```javascript
var PRODUCTION_URL = 'https://api.continuumintelligence.ai';
```

Update `personalisation.js`, `gold.html`, `index.html` CSP, and all 3 workflow files to `https://api.continuumintelligence.ai`.

- [ ] **Step 6: Push and verify**

```bash
git add src/lib/api-config.js public/js/personalisation.js public/gold.html index.html api/config.py .github/workflows/price-drivers.yml .github/workflows/batch-analysis.yml .github/workflows/insights-scan.yml
git commit -m "feat: wire custom domain continuumintelligence.ai (Phase 4)"
git push origin main
```

Verify: `https://continuumintelligence.ai` serves the platform. All 10 features work.

**Phase 4 is complete when `continuumintelligence.ai` serves the platform.**

---

## Task 17: Phase 5 -- Monitoring and Backups

- [ ] **Step 1: Add Sentry**

Add `sentry-sdk[fastapi]>=2.0.0` to `api/requirements.txt`.

Add to `api/main.py` before `app = FastAPI(...)`:
```python
import sentry_sdk
if os.environ.get("SENTRY_DSN"):
    sentry_sdk.init(dsn=os.environ["SENTRY_DSN"], traces_sample_rate=0.1)
```

- [ ] **Step 2: Set Sentry secret**

```bash
fly secrets set SENTRY_DSN="https://...@sentry.io/..." --app ci-api
```

- [ ] **Step 3: Create db-backup.yml**

Create `.github/workflows/db-backup.yml` per the architecture spec (Phase 5C section).

- [ ] **Step 4: Add GitHub Secrets**

Add `FLYIO_DATABASE_URL` (Fly.io Postgres public connection string) to GitHub Secrets.
Optionally add `BACKUP_PASSPHRASE` for encrypted backups.

- [ ] **Step 5: Configure Cloudflare health check**

Cloudflare dashboard > Notifications > Create > Health Check:
- URL: `https://api.continuumintelligence.ai/api/health`
- Interval: 1 minute
- Alert: email on 3 consecutive failures

- [ ] **Step 6: Push, deploy, verify**

```bash
git add api/requirements.txt api/main.py .github/workflows/db-backup.yml
git commit -m "feat: add Sentry monitoring and daily database backups (Phase 5)"
git push origin main
```

Trigger a manual backup: Actions > Database Backup > Run workflow.
Verify: artifact appears with `.dump` file.

**Phase 5 is complete when Sentry receives events and the backup workflow succeeds.**

---

## Task 18: Phase 6 -- Cutover and Decommission

**Pre-condition:** Phases 1--5 validated for 48+ hours with zero incidents on `continuumintelligence.ai`.

- [ ] **Step 1: Deploy redirect on GitHub Pages**

Re-enable the `deploy.yml` workflow (remove `if: false`). Modify it to deploy a single redirect `index.html` per the architecture spec (Phase 6 section).

- [ ] **Step 2: Clean up CORS and CSP**

Remove `github.io` from `ALLOWED_ORIGINS` in `api/config.py`.
Remove old Railway URL and `ci-api.fly.dev` from CSP `connect-src` in `index.html`.

- [ ] **Step 3: Push**

```bash
git add .github/workflows/deploy.yml api/config.py index.html
git commit -m "feat: cutover to continuumintelligence.ai, redirect github.io (Phase 6)"
git push origin main
```

- [ ] **Step 4: Wait 7 days, then decommission Railway**

Stop Railway service. Delete after 7 days.

- [ ] **Step 5: Consider removing Fly.io Postgres public IP**

```bash
fly ips release <ipv4> --app ci-db
```

Update backup workflow to use `fly proxy` if public IP is removed.

**Phase 6 is complete when Railway is decommissioned and `github.io` redirects to `continuumintelligence.ai`.**

---

## Summary

| Task | Phase | Duration | Key Risk |
|------|-------|----------|----------|
| 1--12 | 0 (API centralisation) | 2--3 hours | Regression in any of 10 features |
| 13 | 1 (Database) | 1--2 hours | Data loss during migration |
| 14 | 2 (Backend) | 2--3 hours | Missing env var breaks endpoint |
| 15 | 3 (Frontend) | 1--2 hours | Build watch paths misconfigured |
| 16 | 4 (Domain) | 1 hour + DNS | DNS propagation delay |
| 17 | 5 (Monitoring) | 1--2 hours | Low risk |
| 18 | 6 (Cutover) | 30 min | Premature Railway decommission |
