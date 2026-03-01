#!/usr/bin/env node
/**
 * backfill-price-history.js
 *
 * Continuum Intelligence — Historical Price Backfill
 *
 * Fetches up to 252 trading days (~1 year) of daily close prices from
 * Yahoo Finance for any ticker whose priceHistory has fewer than 252 entries.
 * Writes the backfilled priceHistory into data/research/{TICKER}.json.
 *
 * Run sync-index.js afterwards to propagate into _index.json.
 *
 * Usage:
 *   node scripts/backfill-price-history.js              # backfill all short tickers
 *   node scripts/backfill-price-history.js CBA RIO      # specific tickers only
 *   node scripts/backfill-price-history.js --dry-run     # preview without writing
 *   node scripts/backfill-price-history.js --force       # re-backfill even if >= 252
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RESEARCH_DIR = path.join(ROOT, 'data', 'research');
const TARGET_LENGTH = 252; // ~1 year of trading days

const { getActiveTickers, getTickersAX } = require('./lib/registry');

// --- CLI args ---
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const explicitTickers = args.filter(a => !a.startsWith('--'));

// --- Yahoo Finance historical data fetch ---

const https = require('https');
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': USER_AGENT, ...headers },
      timeout: 20000
    }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location, headers).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Get Yahoo session cookie + crumb
let _sessionCache = null;
async function getYahooSession() {
  if (_sessionCache) return _sessionCache;

  // Step 1: Get cookies from consent page
  const consentRes = await httpGet('https://fc.yahoo.com/');
  const cookies = (consentRes.headers['set-cookie'] || [])
    .map(c => c.split(';')[0])
    .join('; ');

  // Step 2: Get crumb
  const crumbRes = await httpGet('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    Cookie: cookies
  });

  if (crumbRes.statusCode !== 200) {
    throw new Error('Failed to get Yahoo crumb: HTTP ' + crumbRes.statusCode);
  }

  _sessionCache = { cookies, crumb: crumbRes.body.trim() };
  return _sessionCache;
}

/**
 * Fetch historical daily close prices from Yahoo Finance.
 * Returns array of close prices (oldest first), up to `days` entries.
 */
async function fetchHistoricalPrices(tickerAX, days) {
  const session = await getYahooSession();

  // period1 = days ago, period2 = today
  const now = Math.floor(Date.now() / 1000);
  const daysAgo = now - (days + 60) * 86400; // +60 buffer for weekends/holidays

  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(tickerAX)}` +
    `?period1=${daysAgo}&period2=${now}&interval=1d&crumb=${encodeURIComponent(session.crumb)}`;

  const res = await httpGet(url, { Cookie: session.cookies });

  if (res.statusCode !== 200) {
    throw new Error(`Yahoo returned HTTP ${res.statusCode} for ${tickerAX}`);
  }

  const json = JSON.parse(res.body);
  const result = json.chart && json.chart.result && json.chart.result[0];
  if (!result || !result.indicators || !result.indicators.quote || !result.indicators.quote[0]) {
    throw new Error(`No chart data for ${tickerAX}`);
  }

  const closes = result.indicators.quote[0].close;
  if (!closes || closes.length === 0) {
    throw new Error(`Empty close prices for ${tickerAX}`);
  }

  // Filter nulls and round to 2 decimal places
  const cleaned = closes
    .filter(p => p != null && !isNaN(p))
    .map(p => Math.round(p * 100) / 100);

  // Trim to target length (keep most recent)
  if (cleaned.length > TARGET_LENGTH) {
    return cleaned.slice(cleaned.length - TARGET_LENGTH);
  }
  return cleaned;
}

// --- Delay helper ---
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// --- Main ---

async function main() {
  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  CONTINUUM INTELLIGENCE — Price History Backfill');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  Target length:', TARGET_LENGTH, 'trading days');
  console.log('  Mode:', dryRun ? 'DRY RUN' : 'LIVE');
  if (force) console.log('  Force: re-backfill all tickers');
  console.log('');

  const allTickers = getActiveTickers();
  const tickers = explicitTickers.length > 0
    ? explicitTickers.filter(t => allTickers.includes(t))
    : allTickers;

  if (explicitTickers.length > 0) {
    const invalid = explicitTickers.filter(t => !allTickers.includes(t));
    if (invalid.length) console.log('  [WARN] Unknown tickers:', invalid.join(', '));
  }

  // Find tickers that need backfilling
  const needsBackfill = [];
  for (const ticker of tickers) {
    const researchPath = path.join(RESEARCH_DIR, `${ticker}.json`);
    if (!fs.existsSync(researchPath)) {
      console.log(`  [SKIP] ${ticker} — no research file`);
      continue;
    }
    const data = JSON.parse(fs.readFileSync(researchPath, 'utf8'));
    const currentLen = (data.priceHistory || []).length;

    if (!force && currentLen >= TARGET_LENGTH) {
      console.log(`  [OK]   ${ticker} — ${currentLen} pts (full)`);
      continue;
    }
    needsBackfill.push({ ticker, currentLen, tickerAX: ticker + '.AX' });
  }

  if (needsBackfill.length === 0) {
    console.log('\n  All tickers have full price history. Nothing to do.');
    console.log('══════════════════════════════════════════════════════════════');
    return;
  }

  console.log(`\n  Backfilling ${needsBackfill.length} tickers:\n`);

  let updated = 0;
  let failed = 0;

  for (const { ticker, currentLen, tickerAX } of needsBackfill) {
    try {
      const prices = await fetchHistoricalPrices(tickerAX, TARGET_LENGTH);
      console.log(`  [FETCH] ${ticker}: ${prices.length} daily closes retrieved (was ${currentLen})`);

      if (prices.length <= currentLen && !force) {
        console.log(`  [SKIP]  ${ticker} — Yahoo returned fewer points than existing`);
        continue;
      }

      if (!dryRun) {
        const researchPath = path.join(RESEARCH_DIR, `${ticker}.json`);
        const data = JSON.parse(fs.readFileSync(researchPath, 'utf8'));

        // Replace priceHistory with the fuller backfilled data
        data.priceHistory = prices;

        // Also update price to match the most recent close
        const latestPrice = prices[prices.length - 1];
        if (latestPrice && latestPrice > 0) {
          data.price = latestPrice;
          if (data.technicalAnalysis && data.technicalAnalysis.price) {
            data.technicalAnalysis.price.current = latestPrice;
          }
        }

        fs.writeFileSync(researchPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
        console.log(`  [WRITE] ${ticker}: priceHistory updated to ${prices.length} pts, price=${latestPrice}`);
      }

      updated++;

      // Rate limit — 500ms between Yahoo requests
      await delay(500);

    } catch (err) {
      console.error(`  [FAIL] ${ticker}: ${err.message}`);
      failed++;
      await delay(1000);
    }
  }

  console.log('');
  console.log(`  Updated: ${updated} tickers`);
  console.log(`  Failed:  ${failed} tickers`);
  if (dryRun) console.log('  (DRY RUN — no files written)');
  if (updated > 0 && !dryRun) {
    console.log('\n  Next step: run `node scripts/sync-index.js` to update _index.json');
  }
  console.log('══════════════════════════════════════════════════════════════');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
