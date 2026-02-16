/**
 * find-latest-prices.js
 *
 * Shared utility that finds the most recent price data from any available
 * source: `latest-prices.json` (event-scraper) or `live-prices.json`
 * (intraday fetcher). Returns a normalised format so downstream scripts
 * (narrative-generator, update-html, run-automated-analysis) never crash
 * when one source is missing.
 *
 * Usage as module:
 *   const { findLatestPrices } = require('./find-latest-prices');
 *   const data = findLatestPrices();          // auto-pick newest
 *   const data = findLatestPrices('live');     // prefer live-prices.json
 *
 * Usage from CLI:
 *   node scripts/find-latest-prices.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

const SOURCES = [
  {
    name: 'latest-prices.json',
    path: path.join(DATA_DIR, 'latest-prices.json'),
    // event-scraper output: { TICKER: { ticker, price, previousClose, change, changePercent, yearHigh, yearLow, drawdown, marketCap, volume, timestamp } }
    parse(raw) {
      const data = JSON.parse(raw);
      const firstEntry = Object.values(data)[0];
      return {
        source: 'event-scraper',
        updated: firstEntry?.timestamp || null,
        prices: data
      };
    }
  },
  {
    name: 'live-prices.json',
    path: path.join(DATA_DIR, 'live-prices.json'),
    // fetch-live-prices output: { updated, market, count, prices: { TICKER: { t, p, pc, c, cp, v, ms, cur } } }
    parse(raw) {
      const data = JSON.parse(raw);
      const prices = {};
      for (const [ticker, compact] of Object.entries(data.prices || {})) {
        prices[ticker] = {
          ticker: compact.t,
          price: compact.p,
          previousClose: compact.pc,
          change: compact.c,
          changePercent: compact.cp,
          volume: compact.v,
          marketState: compact.ms,
          currency: compact.cur
        };
      }
      return {
        source: 'live-prices',
        updated: data.updated || null,
        market: data.market,
        prices
      };
    }
  }
];

/**
 * Find and return the most recently updated price data.
 *
 * @param {'newest'|'latest'|'live'} [prefer='newest']
 *   - 'newest'  — return whichever file was updated more recently
 *   - 'latest'  — prefer latest-prices.json (event-scraper)
 *   - 'live'    — prefer live-prices.json (intraday fetcher)
 *
 * @returns {{ source: string, updated: string, prices: Object }|null}
 *   Normalised price map: ticker → { ticker, price, previousClose, change, changePercent, volume, ... }
 */
function findLatestPrices(prefer) {
  prefer = prefer || 'newest';
  const available = [];

  for (const src of SOURCES) {
    if (!fs.existsSync(src.path)) continue;
    try {
      const raw = fs.readFileSync(src.path, 'utf8');
      const stat = fs.statSync(src.path);
      const parsed = src.parse(raw);
      parsed.mtime = stat.mtime;
      parsed.file = src.name;
      available.push(parsed);
    } catch (e) {
      console.warn(`[find-latest-prices] Skipping ${src.name}: ${e.message}`);
    }
  }

  if (available.length === 0) return null;

  if (prefer === 'latest') {
    return available.find(a => a.file === 'latest-prices.json') || available[0];
  }
  if (prefer === 'live') {
    return available.find(a => a.file === 'live-prices.json') || available[0];
  }

  // Default: newest by updated timestamp, then by mtime
  available.sort((a, b) => {
    const aTime = a.updated ? new Date(a.updated).getTime() : a.mtime.getTime();
    const bTime = b.updated ? new Date(b.updated).getTime() : b.mtime.getTime();
    return bTime - aTime;
  });

  return available[0];
}

module.exports = { findLatestPrices };

// CLI mode: print a summary
if (require.main === module) {
  const result = findLatestPrices();
  if (result) {
    console.log(`Source: ${result.source} (${result.file})`);
    console.log(`Updated: ${result.updated}`);
    console.log(`Tickers: ${Object.keys(result.prices).length}`);
    for (const [ticker, data] of Object.entries(result.prices)) {
      const cp = typeof data.changePercent === 'number' ? data.changePercent.toFixed(2) : '?';
      console.log(`  ${ticker}: $${data.price} (${data.changePercent >= 0 ? '+' : ''}${cp}%)`);
    }
  } else {
    console.error('No price data found in data/ directory.');
    process.exit(1);
  }
}
