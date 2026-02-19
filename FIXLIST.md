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
- All active committing workflows already have `concurrency:` groups:
  `update-daily.yml`, `monthly-calibration.yml`, `continuum-update.yml`, `deploy.yml`, `update-intraday.yml`
- Remaining workflows (`event-monitor.yml`, `live-prices.yml`, `narrative-analysis.yml`,
  `research-update.yml`, `update-prices.yml`) are all marked DISABLED/Legacy with
  `workflow_dispatch` only — no scheduled triggers, no race risk

## 4. Fix announcements scraper
**Status**: DONE
- Root cause: ASX public API (`asx.com.au/asx/1/company/{code}/announcements`) was retired
  in 2024/2025 — returns HTTP 404 for all tickers
- Fix: replaced dead ASX API with Yahoo Finance search endpoint
  (`/v1/finance/search?q={TICKER}.AX&newsCount=5`)
- Verified: 21/21 tickers return 5 news items each (105 total), correct schema preserved
- `publisher` field added to each item (new, non-breaking)

## 5. Make STOCK_CONFIG data-driven
**Status**: DONE (already completed before this audit)
- `run-automated-analysis.js` imports `getAnalysisConfig()` from `scripts/lib/registry.js`
- Registry reads from `data/config/tickers.json` — fully data-driven
- No hardcoded stock config in the script
