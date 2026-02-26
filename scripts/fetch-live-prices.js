#!/usr/bin/env node
/**
 * fetch-live-prices.js
 *
 * Continuum Intelligence — Intraday Price Fetcher
 *
 * Lightweight script designed to run every 10-15 minutes during ASX trading
 * hours via GitHub Actions. Fetches current prices from Yahoo Finance and
 * writes a compact JSON file (data/live-prices.json) that the client-side
 * app can poll for near-real-time price updates.
 *
 * This is intentionally separate from the full update-prices.js pipeline
 * which handles priceHistory, hydration, and narrative updates daily.
 *
 * Uses yahoo-finance2 for reliable cookie/crumb handling.
 *
 * Usage: node scripts/fetch-live-prices.js
 */

const fs = require('fs');
const path = require('path');
const YahooFinance = require('yahoo-finance2').default;

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_PATH = path.join(DATA_DIR, 'live-prices.json');

// All tickers to fetch (from central registry)
const { getTickersAX } = require('./lib/registry');
const TICKERS = getTickersAX();

function getASXMarketStatus() {
  // ASX trades Mon-Fri, 10:00 AM - 4:00 PM AEDT (UTC+11) / AEST (UTC+10)
  const now = new Date();
  const day = now.getUTCDay();

  // Weekend check
  if (day === 0 || day === 6) return 'closed';

  // Convert to AEDT (UTC+11) — approximate, doesn't handle DST transition exactly
  const aestHour = (now.getUTCHours() + 11) % 24;
  const aestMin = now.getUTCMinutes();
  const aestTime = aestHour * 60 + aestMin;

  const preOpen = 9 * 60 + 50;   // 9:50 AM pre-open
  const open = 10 * 60;          // 10:00 AM
  const close = 16 * 60;         // 4:00 PM
  const postClose = 16 * 60 + 12; // 4:12 PM closing auction end

  if (aestTime < preOpen) return 'pre-market';
  if (aestTime < open) return 'pre-open';
  if (aestTime < close) return 'open';
  if (aestTime < postClose) return 'auction';
  return 'closed';
}

async function main() {
  console.log('=== Continuum Intelligence — Live Price Fetch ===');
  console.log(`Time: ${new Date().toISOString()}`);

  const marketStatus = getASXMarketStatus();
  console.log(`ASX Market Status: ${marketStatus}`);

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

  // Batch quote — single request for all tickers
  let results;
  try {
    results = await yf.quote(TICKERS);
  } catch (e) {
    console.error(`Batch quote failed: ${e.message}`);
    process.exit(1);
  }

  const prices = {};
  let successCount = 0;
  let failCount = 0;

  for (const q of results) {
    if (!q || !q.regularMarketPrice) {
      failCount++;
      console.log(`  [FAIL] ${q ? q.symbol : 'unknown'}`);
      continue;
    }

    const ticker = q.symbol.replace('.AX', '');
    const price = Math.round(q.regularMarketPrice * 100) / 100;
    const prevClose = q.regularMarketPreviousClose
      ? Math.round(q.regularMarketPreviousClose * 100) / 100
      : null;
    const change = prevClose ? Math.round((price - prevClose) * 100) / 100 : 0;
    const changePct = prevClose
      ? Math.round(((price - prevClose) / prevClose) * 10000) / 100
      : 0;

    const ms = (q.marketState || 'unknown').toLowerCase();

    const data = {
      t: ticker,
      p: price,
      pc: prevClose,
      c: change,
      cp: changePct,
      v: q.regularMarketVolume || 0,
      ms: ms === 'regular' ? 'regular' : ms === 'pre' ? 'pre-market' : ms === 'post' ? 'closed' : ms,
      cur: q.currency === 'AUD' ? 'A$' : (q.currency || '') + ' '
    };

    prices[ticker] = data;
    successCount++;
    console.log(`  [OK] ${data.t}: ${data.cur}${data.p} (${data.c >= 0 ? '+' : ''}${data.cp}%)`);
  }

  if (successCount === 0) {
    console.error('\nNo prices fetched. Exiting without writing file.');
    process.exit(1);
  }

  const output = {
    updated: new Date().toISOString(),
    market: marketStatus,
    count: successCount,
    prices: prices
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\nWrote ${OUTPUT_PATH}: ${successCount} prices (${failCount} failed)`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
