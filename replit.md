# Continuum Intelligence v2

An ACH-based equity research platform for ASX stocks, featuring a Vite frontend and a FastAPI backend with RAG-powered research chat.

## Project Architecture

### Frontend
- **Framework**: Vite (vanilla JS/HTML)
- **Entry point**: `index.html` (root)
- **Dev port**: 5000 (0.0.0.0)
- **Workflow**: "Start application" — `npm run dev`
- **API proxy**: `/api` routes proxied to `http://localhost:8000` in dev

### Backend
- **Framework**: FastAPI (Python)
- **Location**: `api/` directory
- **Dev port**: 8000 (0.0.0.0)
- **Workflow**: "Backend API" — `cd api && uvicorn main:app --host 0.0.0.0 --port 8000 --reload`
- **Entry**: `api/main.py`

### Key Features
- RAG-powered research chat backed by structured equity research data (21 ASX tickers)
- BM25 retrieval over research passages ingested from `data/research/*.json`
- LLM responses via Anthropic Claude (requires `ANTHROPIC_API_KEY`)
- Optional Gemini integration for specialist analysis (requires `GEMINI_API_KEY`)

## Environment Variables
Required in `api/.env` or as Replit secrets:
- `ANTHROPIC_API_KEY` — Anthropic API key (required for chat)
- `GEMINI_API_KEY` — Google Gemini API key (optional, for refresh)
- `GEMINI_MODEL` — Gemini model name (default: `gemini-2.5-flash`)
- `ALLOWED_ORIGINS` — Comma-separated CORS origins

## Data
- Research data: `data/research/*.json` (21 ASX tickers)
- Events data: `data/events/`
- Config: `data/config/`

## Deployment
- Target: autoscale
- Build: `npm run build` (Vite bundles to `dist/`)
- Run: `cd api && uvicorn main:app --host 0.0.0.0 --port 5000`
- The backend serves the built frontend from `dist/`

## Development Notes
- Node.js 20+ required (Vite 7 requirement)
- Python 3.12 used for backend
- The `vite.config.js` sets `base: '/'` for local dev (was originally `/continuum-intelligence-v3/` for GitHub Pages)
