# Continuum Intelligence V2

Independent cross-domain equity research platform covering ASX-listed stocks.
Uses the **Analysis of Competing Hypotheses (ACH)** framework with four-tier
hypothesis scoring (T1-T4) across 10 research domains.

## Quick Start

```bash
# Install dev dependencies
npm install

# Run tests
npm test

# Lint scripts
npm run lint

# Full validation (lint + test)
npm run validate
```

Open `index.html` in a browser (or serve via any static file server) to view
the research platform locally.

## Architecture

Single-page application (SPA) with hash-based routing and zero server-side
requirements. All rendering is client-side JavaScript.

```
index.html          Main SPA shell (~435 KB) — CSS, HTML templates, router, renderers
css/
  fonts.css         Self-hosted @font-face declarations (Inter, JetBrains Mono, Source Serif 4)
  personalisation.css  Personalisation module styles
  narrative.css     Narrative / commentary styles
fonts/              Latin-subset variable WOFF2 files (~200 KB total)
data/
  config/
    tickers.json    Ticker registry — company metadata, sector, analysisConfig
  research/
    _index.json     Lightweight index for home page (slim hypotheses, hero metrics)
    {TICKER}.json   Full research data per ticker (hypotheses, evidence, tripwires)
  stocks/           CI/CD pipeline stock config files
scripts/            Automation & data extraction scripts (see scripts/README.md)
tests/              Jest test suite (data integrity + HTML structure)
sw.js               Service Worker (cache-first static, network-first research)
```

### Data Loading Strategy

1. **Boot** — `_index.json` is loaded synchronously to populate `STOCK_DATA`
   with lightweight summaries (sufficient for home page cards, coverage table,
   skew scoring).
2. **On-demand** — When a user navigates to a report or snapshot page,
   `loadFullResearchData(ticker)` fetches the full `{TICKER}.json` and
   hydrates `STOCK_DATA` with complete hypotheses, evidence chains, and
   narrative content.
3. **Live prices** — `fetchAndPatchLive()` fetches current prices from
   the Railway-hosted proxy and patches `STOCK_DATA` entries in-place.

### Service Worker

- **Static assets** (CSS, JS, fonts, images): cache-first
- **Research data** (`data/research/*.json`): network-first with cache fallback
- **HTML shell**: stale-while-revalidate

### Coverage

21 ASX-listed stocks across Financials, Materials, Healthcare, Technology,
Consumer Staples, Energy, and Real Estate sectors.

## Testing

```bash
npm test            # Run all tests
npm run test:ci     # Run with coverage (CI mode)
```

Test suites:
- **data-integrity** — validates tickers.json, per-ticker research files,
  hypothesis structure, index file consistency
- **html-structure** — validates CSP headers, accessibility landmarks,
  self-hosted fonts, data loader presence, critical function definitions

## Scripts

See [`scripts/README.md`](scripts/README.md) for the full automation pipeline.

Key commands:
```bash
npm run extract-data    # Re-extract STOCK_DATA from index.html to JSON files
npm run lint            # ESLint (no-var, prefer-const, no-eval)
```

## Tech Stack

- Vanilla JavaScript (no framework)
- [marked.js](https://marked.js.org/) — Markdown rendering (with SRI)
- [DOMPurify](https://github.com/cure53/DOMPurify) — HTML sanitisation (with SRI)
- [SheetJS](https://sheetjs.com/) — Excel export
- Self-hosted Google Fonts (Inter, JetBrains Mono, Source Serif 4)
- Jest + jsdom for testing
- ESLint for code quality
