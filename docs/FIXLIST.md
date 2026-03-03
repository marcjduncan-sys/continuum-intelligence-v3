# Developer Audit Fix List

## 1. Fix narrative-analysis.yml — persist analysis results
**Status**: DONE
- Added commit/push step so `data/narrative-analysis.json` is persisted
- Fixed leading whitespace and permissions scope
- Added `git pull --rebase` race condition protection

## 2. Remove `|| true` from critical steps in all workflow files
**Status**: DONE
- Removed from `update-orchestrator.js` in update-prices.yml (main pipeline)
- Removed from `run-automated-analysis.js` in update-prices.yml and live-prices.yml (core analysis)
- Kept on external API calls (fetch-live-prices, fetch-announcements) and secondary steps

## 3. Add concurrency groups to all workflows that commit to the repo
**Status**: DONE
- Added `concurrency: group: ${{ github.workflow }}, cancel-in-progress: false`
- Applied to all 5 legacy workflows: live-prices, update-prices, narrative-analysis, research-update, event-monitor
- `continuum-update.yml` (active) already had concurrency

## 4. Fix announcements scraper
**Status**: DONE
- Root cause: `market_sensitive=false` filtered to ONLY non-market-sensitive filings,
  excluding all significant announcements (results, guidance) which are market_sensitive=true
- Fix: removed the `market_sensitive` URL parameter — now fetches all announcements
- Also made response parsing resilient to both `{ data: [...] }` and bare array responses

## 5. Make STOCK_CONFIG data-driven
**Status**: DONE (already implemented)
- `run-automated-analysis.js` line 40: `const STOCK_CONFIG = getAnalysisConfig();`
- `getAnalysisConfig()` reads from `data/config/tickers.json` via `scripts/lib/registry.js`
- All 20 active tickers have `analysisConfig` blocks (peakPrice, baseWeights, characteristics, hypothesisNames)
- No code changes required — confirmed data-driven
