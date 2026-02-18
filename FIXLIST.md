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
**Status**: PENDING
- Prevents race conditions when multiple workflows run simultaneously
- All committing workflows need `concurrency:` with cancel-in-progress

## 4. Fix announcements scraper
**Status**: PENDING
- `fetch-announcements.js` returns zero results
- Diagnose root cause locally, then fix

## 5. Make STOCK_CONFIG data-driven
**Status**: PENDING
- `run-automated-analysis.js` hardcodes stock config (base weights, characteristics)
- Extract to a JSON config file so adding/removing stocks doesn't require code changes
