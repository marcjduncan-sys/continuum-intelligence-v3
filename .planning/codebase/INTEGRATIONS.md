# External Integrations

**Analysis Date:** 2026-02-19

## APIs & External Services

**LLM / AI:**
- Claude API (Anthropic) — Core AI service for research narrative generation and chat
  - SDK: `@anthropic-ai/sdk` (Node.js) in `scripts/refresh-content.js`
  - SDK: `anthropic` (Python) in `api/main.py`
  - Auth: `ANTHROPIC_API_KEY` environment variable (format: `sk-ant-*`)
  - Models used:
    - `claude-haiku-4-5-20251001` — Fast evidence item generation in `scripts/refresh-content.js`
    - `claude-sonnet-4-6` — Detailed narrative and research updates in `scripts/refresh-content.js`
    - `claude-sonnet-4-5-20250929` — Research chat API default in `api/config.py`

**Market Data:**
- Yahoo Finance API (v8) — Intraday stock prices and historical data
  - Endpoint: `https://query1.finance.yahoo.com/v8/finance/chart/{ticker}.AX`
  - Used in: `scripts/fetch-live-prices.js`, `scripts/event-scraper.js`
  - Authentication: Cookie + crumb token extraction for session access
  - Data fetched: Current price, 52-week range, volume, historical returns
  - No official SDK; uses HTTPS GET with custom User-Agent headers

- ASX Company Announcements API — Official ASX announcements for covered stocks
  - Endpoint: `https://www.asx.com.au/asx/1/company/{code}/announcements`
  - Used in: `scripts/fetch-announcements.js`
  - Data fetched: Latest 5 announcements per ticker with timestamps
  - No authentication required; public API

## Data Storage

**Databases:**
- None — Application uses file-based JSON storage exclusively
- No SQL database, no document database, no cloud data service

**File Storage:**
- Local filesystem only — all data in `data/` directory tree
  - Structure: `data/stocks/`, `data/research/`, `data/config/`, etc.
  - Managed via Node.js `fs` module and Python file operations
  - Committed to Git for version control

**Caching:**
- None — No Redis, Memcached, or other caching layer
- Research data read fresh from JSON files on each API request
- Live prices cached in-memory during API request lifecycle only

## Authentication & Identity

**Auth Provider:**
- Custom — No external auth provider (no Auth0, Okta, Firebase Auth)
- API authentication: CORS-based origin validation only
  - Configured via `ALLOWED_ORIGINS` environment variable in `api/config.py`
  - No user authentication; public API with CORS restrictions

**API Key Management:**
- Anthropic API key stored in environment variables
- `.env` file loaded by `api/config.py` via `python-dotenv`
- `.env.example` template at `api/.env.example` (example values only)
- No key rotation or expiration tracking in code

## Monitoring & Observability

**Error Tracking:**
- None — No Sentry, Rollbar, or equivalent integration
- Errors logged to stdout/stderr via standard Python logging

**Logs:**
- Python logging module configured in `api/main.py` with `logging.basicConfig(level=logging.INFO)`
- Logs output to console; no centralized logging service
- Application logs ingestion details and passage counts on startup
- No persistent log storage; logs discarded after process exit (unless captured by orchestration)

**Metrics:**
- None — No Prometheus, DataDog, or application performance monitoring

## CI/CD & Deployment

**Hosting:**
- Railway.app — Platform-as-a-Service container deployment
- Configuration: `railway.json` with Dockerfile path and health checks
- Deployment: Git-triggered automated builds from repository

**CI Pipeline:**
- GitHub Actions — Inferred from script structure (scripts designed for scheduled automation)
- Environment: Can run Node.js and Python scripts on schedule
- Common workflows (inferred from script structure):
  - Intraday price fetching: `scripts/fetch-live-prices.js` (runs every 10-15 minutes during ASX hours)
  - Daily data pipeline: `scripts/fetch-announcements.js`, event scraping, narrative generation
  - Validation: `npm run validate` chains `npm run lint && npm test`

**Deployment Flow:**
1. Git commit triggers Railway.app build
2. `api/Dockerfile` builds Python image
3. Image includes `api/`, `index.html`, and `data/` from repository
4. Uvicorn starts on configurable PORT
5. Health check validates `/api/health` endpoint

## Environment Configuration

**Required env vars:**
- `ANTHROPIC_API_KEY` — Claude API authentication key (format: `sk-ant-*`)
  - Used by: `scripts/refresh-content.js`, `api/main.py`
  - Validation in `api/config.py` checks for `sk-ant-` prefix

- `ALLOWED_ORIGINS` — CORS origins (comma-separated URLs, default: `http://localhost:3000`)
  - Used by: `api/main.py` CORS middleware
  - Example: `https://yourdomain.com,http://localhost:3000`

- `PORT` — API server port (default: 8000)
  - Used by: Uvicorn in Docker container
  - Railway.app can override via environment

- `INDEX_HTML_PATH` — Path to frontend HTML file (default: `../index.html` relative to `api/`)
  - Used by: `api/config.py` to locate research data

**Secrets location:**
- Environment variables injected at runtime
- Local development: `.env` file (not committed; see `.gitignore`)
- Production (Railway.app): Secrets stored in platform dashboard
- GitHub Actions: Would use repository secrets (configuration not visible in repo)

## Webhooks & Callbacks

**Incoming:**
- None — No webhook endpoints defined

**Outgoing:**
- None — Application does not make outbound API calls to external services
- All external integrations are inbound: fetching data from Yahoo Finance, ASX, Anthropic APIs

## Data Flow

**Inbound:**
1. Yahoo Finance API → Current stock prices, historical data
2. ASX Announcements API → Latest company announcements
3. Anthropic Claude API → LLM responses for narrative generation and chat

**Outbound:**
- API responses to connected clients (frontend via CORS)
- No external API calls except to services above

**Within Application:**
1. Scripts fetch external data → Write to `data/` JSON files
2. `index.html` or API reads from `data/` JSON files
3. API optionally calls Claude for chat responses
4. Frontend polls `data/live-prices.json` for near-real-time updates

---

*Integration audit: 2026-02-19*
