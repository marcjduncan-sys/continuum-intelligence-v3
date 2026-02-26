#!/usr/bin/env node
/**
 * update-prices.js
 * Fetches latest daily close prices from Yahoo Finance for all tickers
 * and writes updated prices to per-ticker JSON files.
 *
 * Data targets:
 *   - data/research/{TICKER}.json  → price, priceHistory, technicalAnalysis.price.current
 *   - data/stocks/{TICKER}.json    → current_price, priceHistory
 *   - data/latest-prices.json      → {TICKER}.price
 *
 * Yahoo Finance v8 API requires cookie + crumb authentication.
 * This script obtains a session before fetching prices.
 *
 * Designed to run server-side via GitHub Actions (no CORS issues).
 * Usage: node scripts/update-prices.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'data');
const RESEARCH_DIR = path.join(DATA_DIR, 'research');
const STOCKS_DIR = path.join(DATA_DIR, 'stocks');
const LATEST_PRICES_PATH = path.join(DATA_DIR, 'latest-prices.json');

// All tickers to update (from central registry)
const { getTickersAX } = require('./lib/registry');
const TICKERS = getTickersAX();

// Max priceHistory length (keep last 252 trading days = ~1 year)
const MAX_HISTORY = 252;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// --- Yahoo Finance authentication (cookie + crumb) ---

function httpGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/json,*/*',
        ...options.headers
      },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function getYahooSession() {
  // Step 1: Hit Yahoo Finance consent endpoint to obtain session cookies
  console.log('  Obtaining Yahoo Finance session...');
  const consentRes = await httpGet('https://fc.yahoo.com/', {
    headers: { 'Accept': 'text/html' }
  });

  const setCookies = consentRes.headers['set-cookie'];
  if (!setCookies) {
    throw new Error('No cookies received from Yahoo Finance');
  }

  const cookieArray = Array.isArray(setCookies) ? setCookies : [setCookies];
  const cookies = cookieArray
    .map(c => c.split(';')[0])
    .join('; ');

  // Step 2: Get crumb using session cookies
  const crumbRes = await httpGet('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: {
      'Cookie': cookies,
      'Accept': 'text/plain'
    }
  });

  if (crumbRes.statusCode !== 200) {
    throw new Error(`Crumb request failed: HTTP ${crumbRes.statusCode}`);
  }

  const crumb = crumbRes.body.trim();
  if (!crumb || crumb.length < 5) {
    throw new Error(`Invalid crumb received: "${crumb}"`);
  }

  console.log('  Session established (crumb obtained)');
  return { cookies, crumb };
}

function fetchJSON(url, session) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json'
    };
    if (session) {
      headers['Cookie'] = session.cookies;
    }

    const req = https.get(url, { headers, timeout: 15000 }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Invalid JSON from ${url}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function fetchYahoo(ticker, session) {
  // Fetch last 5 trading days to get the most recent close
  const crumbParam = session ? `&crumb=${encodeURIComponent(session.crumb)}` : '';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=5d&interval=1d&includePrePost=false${crumbParam}`;
  try {
    const json = await fetchJSON(url, session);
    const result = json.chart.result[0];
    const meta = result.meta;
    const quote = result.indicators.quote[0];
    const timestamps = result.timestamp;

    // Find the last non-null close
    let lastClose = null;
    let lastDate = null;
    for (let i = timestamps.length - 1; i >= 0; i--) {
      if (quote.close[i] != null) {
        lastClose = Math.round(quote.close[i] * 100) / 100;
        lastDate = new Date(timestamps[i] * 1000);
        break;
      }
    }

    return {
      ticker: ticker,
      shortTicker: ticker.replace('.AX', ''),
      currentPrice: lastClose || meta.regularMarketPrice,
      previousClose: meta.chartPreviousClose,
      lastDate: lastDate
    };
  } catch (e) {
    console.error(`  [WARN] Failed to fetch ${ticker}: ${e.message}`);
    return null;
  }
}

// --- Helpers for safe JSON file I/O ---

function readJSONFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function writeJSONFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * Append price to a priceHistory array, dedup last entry, trim to MAX_HISTORY.
 * Returns the updated array (mutates nothing).
 */
function appendPriceHistory(history, price) {
  if (!Array.isArray(history)) history = [];
  const lastInHistory = history[history.length - 1];

  // Only append if the new price is different from the last entry
  if (lastInHistory == null || Math.abs(lastInHistory - price) > 0.005) {
    history = history.concat(price);
  }

  // Trim to max length (keep most recent)
  if (history.length > MAX_HISTORY) {
    history = history.slice(history.length - MAX_HISTORY);
  }

  return history;
}

// --- Core update function: writes to JSON files ---

function updateStockData(ticker, priceData) {
  if (!priceData) return false;

  const short = priceData.shortTicker;
  const price = priceData.currentPrice;

  // --- 1. Update research file: data/research/{TICKER}.json ---
  const researchPath = path.join(RESEARCH_DIR, `${short}.json`);
  const research = readJSONFile(researchPath);
  if (research) {
    // Update top-level price
    research.price = price;

    // Update priceHistory (append + trim)
    research.priceHistory = appendPriceHistory(research.priceHistory, price);

    // Update technicalAnalysis.price.current if it exists
    if (research.technicalAnalysis &&
        research.technicalAnalysis.price) {
      research.technicalAnalysis.price.current = price;
    }

    writeJSONFile(researchPath, research);
  } else {
    console.error(`  [WARN] Research file not found: ${researchPath}`);
  }

  // --- 2. Update stocks file: data/stocks/{TICKER}.json ---
  const stocksPath = path.join(STOCKS_DIR, `${short}.json`);
  const stocks = readJSONFile(stocksPath);
  if (stocks) {
    stocks.current_price = price;

    // Update priceHistory if it exists in the stocks file
    if (Array.isArray(stocks.priceHistory)) {
      stocks.priceHistory = appendPriceHistory(stocks.priceHistory, price);
    }

    writeJSONFile(stocksPath, stocks);
  } else {
    console.error(`  [WARN] Stocks file not found: ${stocksPath}`);
  }

  // --- 3. Update latest-prices.json ---
  const latestPrices = readJSONFile(LATEST_PRICES_PATH) || {};
  if (!latestPrices[short]) {
    latestPrices[short] = { ticker: short };
  }
  latestPrices[short].price = price;
  latestPrices[short].timestamp = new Date().toISOString();
  writeJSONFile(LATEST_PRICES_PATH, latestPrices);

  console.log(`  [OK] ${short}: ${price}`);
  return true;
}

async function main() {
  console.log('=== Continuum Intelligence — Price Update ===');
  console.log(`Fetching prices for ${TICKERS.length} tickers...\n`);

  // Obtain Yahoo Finance session (cookie + crumb)
  let session = null;
  try {
    session = await getYahooSession();
  } catch (e) {
    console.error(`  [WARN] Could not obtain Yahoo session: ${e.message}`);
    console.log('  Attempting without authentication...');
  }

  let updatedCount = 0;
  let failedCount = 0;

  for (const ticker of TICKERS) {
    // Stagger requests slightly to avoid rate limiting
    if (updatedCount > 0) await new Promise(r => setTimeout(r, 300));

    const data = await fetchYahoo(ticker, session);
    if (data && updateStockData(ticker, data)) {
      updatedCount++;
    } else {
      failedCount++;
    }
  }

  if (updatedCount > 0) {
    console.log(`\nDone: ${updatedCount} updated, ${failedCount} failed.`);
  } else {
    console.log('\nNo prices were fetched. No files modified.');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
