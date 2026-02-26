# Continuum Scripts

Automation and data-management scripts for the Continuum Intelligence research platform.

## Core Pipeline

| Script | Purpose | Trigger |
|--------|---------|---------|
| `event-scraper.js` | Fetches prices from Yahoo Finance and ASX announcements | 2x daily (GitHub Actions) |
| `narrative-generator.js` | Generates narrative text updates from detected events | After scraper |
| `update-html.js` | Applies pending updates to `index.html` | After narrative generator |
| `update-orchestrator.js` | Coordinates the full scraper-narrative-update pipeline | CI entrypoint |

## Data Extraction & Validation

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `extract-stock-data.js` | Extracts inline STOCK_DATA from index.html to per-ticker JSON files | After editing research data in index.html |
| `refactor-stock-data.js` | Removes inline STOCK_DATA blocks and wires up JSON loader | One-time migration (already applied) |
| `snapshot-generator.js` | Generates SNAPSHOT_DATA entries from STOCK_DATA | Build step |
| `validate-coverage.js` | Checks consistency between tickers.json and research files | CI validation |

## Price & Market Data

| Script | Purpose |
|--------|---------|
| `fetch-live-prices.js` | Fetches current prices from Yahoo Finance API |
| `fetch-announcements.js` | Fetches ASX company announcements |
| `find-latest-prices.js` | Locates most recent price data in local files |
| `update-prices.js` | Patches price data into research files |

## Content & Analysis

| Script | Purpose |
|--------|---------|
| `hydrate-content.js` | Runs ContinuumDynamics hydration on research data |
| `price-narrative-engine.js` | Generates price-movement narrative commentary |
| `narrative-framework-integration.js` | Integrates narrative framework into research output |
| `institutional-commentary-engine.js` | Generates institutional-grade commentary |
| `run-automated-analysis.js` | Runs full automated analysis pipeline |
| `research-monitor.js` | Monitors research data for staleness |

## Utilities

| Script | Purpose |
|--------|---------|
| `add-stock.js` | Scaffolds a new stock entry (tickers.json + research template) |
| `apply-narrative-updates.js` | Applies queued narrative updates |
| `pme-case-study.js` | PME case study generator |
| `pme-institutional-demo.js` | PME institutional demo data |
| `test-institutional.js` | Tests institutional commentary output |

## NPM Commands

```bash
npm run extract-data   # Run extract-stock-data.js
npm run lint           # ESLint check on scripts/
npm run lint:fix       # ESLint auto-fix
npm run validate       # Lint + test suite
```

## Data Flow

1. **Scraper** fetches live prices and announcements
2. **Narrative generator** analyses events and produces commentary
3. **Updater** patches index.html with new narratives
4. **Extractor** (manual) re-exports inline data to per-ticker JSON files
5. **Validator** checks structural consistency across all data files

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success, no updates needed |
| 100 | Success, updates generated |
| 1 | Error |
