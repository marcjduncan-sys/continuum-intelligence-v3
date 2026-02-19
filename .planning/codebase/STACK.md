# Technology Stack

**Analysis Date:** 2026-02-19

## Languages

**Primary:**
- JavaScript (Node.js) — CLI scripts and build tools in `scripts/` directory
- Python 3.12 — FastAPI backend API in `api/` directory
- HTML/CSS — Client-side web application in `index.html` and frontend code

**Secondary:**
- JSON — Data configuration and research data storage in `data/` directory
- Shell/Bash — Docker entrypoint and GitHub Actions workflows

## Runtime

**Environment:**
- Node.js >= 18.0.0 (specified in `package.json` engines field)
- Python 3.12-slim (Docker image `python:3.12-slim` in `api/Dockerfile`)

**Package Managers:**
- npm (JavaScript) — lockfile present at `package-lock.json`
- pip (Python) — requirements file at `api/requirements.txt`

## Frameworks

**Core:**
- FastAPI 0.115.6 — RESTful API framework for research chat backend in `api/main.py`
- Uvicorn 0.34.0 — ASGI server for FastAPI in `api/` directory

**Testing:**
- Jest 29.7.0 — JavaScript test runner (configured in `jest.config.js`)
- jest-environment-jsdom 29.7.0 — DOM environment for browser-like testing

**Build/Dev:**
- ESLint 8.56.0 — JavaScript linting in `scripts/` (configured with `.eslintrc`)
- npm scripts — Custom task runners in `package.json` scripts section

## Key Dependencies

**Critical:**
- @anthropic-ai/sdk 0.39.0 — Official Anthropic Claude API client for Node.js (used in `scripts/refresh-content.js`)
- anthropic 0.43.0 — Official Anthropic Claude API client for Python (used in `api/main.py`)
- These enable LLM-powered content generation and research chat features

**Infrastructure:**
- Pydantic 2.10.4 — Data validation for Python API models in `api/config.py`
- rank-bm25 0.2.2 — BM25 ranking algorithm for search/retrieval in `api/retriever.py`
- python-dotenv 1.0.1 — Environment variable loading for API configuration
- Pydantic FastAPI — CORS middleware and HTTP request/response handling

**HTTP & Network:**
- Built-in Node.js `https` module — Used throughout scripts for HTTP requests to Yahoo Finance and ASX APIs
- Node.js `fs` and `path` modules — File system operations for JSON data handling

## Configuration

**Environment:**
- `.env.example` template at `api/.env.example` defines required variables:
  - `ANTHROPIC_API_KEY` — Claude API authentication (sk-ant-* format expected)
  - `ALLOWED_ORIGINS` — CORS configuration (comma-separated URLs)
  - `PORT` — API server port (default 8000)

**Build:**
- `jest.config.js` — Test configuration with coverage collection from `scripts/` directory
- `api/config.py` — Python configuration loader using `python-dotenv`
- `railway.json` — Railway.app deployment configuration with Docker path and health checks

## Platform Requirements

**Development:**
- Node.js 18+ (for CLI scripts and npm)
- Python 3.12 (for API backend)
- Git (for version control and GitHub Actions)
- Standard UNIX utilities (find, grep, etc.)

**Production:**
- Docker 20+ — Container runtime (Dockerfile in `api/Dockerfile` targets Python 3.12-slim)
- Railway.app — PaaS deployment platform (configured via `railway.json`)
- Environment variable injection via platform (PORT, ANTHROPIC_API_KEY, ALLOWED_ORIGINS)

## Data Storage

**File-based:**
- All data persisted as JSON files in `data/` directory structure:
  - `data/stocks/*.json` — Individual stock research data
  - `data/research/*.json` — Research analysis files
  - `data/config/*.json` — Configuration files (tickers, price rules, technical analysis settings)
  - `data/*.json` — Live prices, announcements, macro factors, sector signals
- No external database — all state stored in Git-tracked or generated JSON

**Static Assets:**
- `index.html` — Monolithic frontend application with embedded STOCK_DATA JavaScript objects
- `api/` directory — Python source code for API backend

## Deployment Architecture

**Container:**
- Dockerfile at `api/Dockerfile` builds multi-stage image:
  - Base: `python:3.12-slim`
  - Installs `api/requirements.txt` dependencies
  - Copies `api/`, `index.html`, and `data/` directories
  - Runs Uvicorn on configurable PORT (default 8000)
  - Health check endpoint at `/api/health`

**Orchestration:**
- Railway.app deployment via `railway.json`:
  - Restart policy: ON_FAILURE with max 3 retries
  - Health check path: `/api/health`
  - Environment variables managed by Railway platform

---

*Stack analysis: 2026-02-19*
