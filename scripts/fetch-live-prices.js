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
 * Yahoo Finance v8 API requires cookie + crumb authentication.
 * This script obtains a session cookie and crumb before fetching prices.
 *
 * Usage: node scripts/fetch-live-prices.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_PATH = path.join(DATA_DIR, 'live-prices.json');

// All tickers to fetch (Yahoo Finance symbols)
const TICKERS = [
  'XRO.AX', 'CSL.AX', 'WOW.AX', 'GMG.AX', 'MQG.AX', 'WTC.AX',
  'PME.AX', 'SIG.AX', 'DRO.AX', 'FMG.AX', 'WDS.AX', 'GYG.AX'
];

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

  // Extract Set-Cookie headers (may be an array or single string)
  const setCookies = consentRes.headers['set-cookie'];
  if (!setCookies) {
    throw new Error('No cookies received from Yahoo Finance');
  }

  // Parse cookie names and values
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

async function fetchTickerPrice(ticker, session) {
  // Use 1d range with 1m interval for intraday data during market hours
  // Falls back to 2d range with 1d interval for after-hours/weekend
  const crumbParam = session ? `&crumb=${encodeURIComponent(session.crumb)}` : '';
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1d&interval=1m&includePrePost=false${crumbParam}`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?range=2d&interval=1d&includePrePost=false${crumbParam}`
  ];

  for (const url of urls) {
    try {
      const json = await fetchJSON(url, session);
      const result = json.chart.result[0];
      const meta = result.meta;

      const price = meta.regularMarketPrice;
      const prevClose = meta.chartPreviousClose || meta.previousClose;
      const change = prevClose ? Math.round((price - prevClose) * 100) / 100 : 0;
      const changePct = prevClose ? Math.round(((price - prevClose) / prevClose) * 10000) / 100 : 0;

      // Determine market state from meta
      const marketState = meta.currentTradingPeriod
        ? (meta.currentTradingPeriod.regular
          ? 'regular' : 'closed')
        : 'unknown';

      return {
        t: ticker.replace('.AX', ''),       // short ticker
        p: Math.round(price * 100) / 100,   // current price
        pc: prevClose ? Math.round(prevClose * 100) / 100 : null, // previous close
        c: change,                           // change ($)
        cp: changePct,                       // change (%)
        v: meta.regularMarketVolume || 0,    // volume
        ms: marketState,                     // market state
        cur: meta.currency === 'AUD' ? 'A$' : meta.currency + ' '
      };
    } catch (e) {
      // Try next URL
      continue;
    }
  }
  return null;
}

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

  // Obtain Yahoo Finance session (cookie + crumb)
  let session = null;
  try {
    session = await getYahooSession();
  } catch (e) {
    console.error(`  [WARN] Could not obtain Yahoo session: ${e.message}`);
    console.log('  Attempting without authentication...');
  }

  const prices = {};
  let successCount = 0;
  let failCount = 0;

  for (const ticker of TICKERS) {
    // Stagger requests to avoid rate limiting
    if (successCount + failCount > 0) {
      await new Promise(r => setTimeout(r, 200));
    }

    const data = await fetchTickerPrice(ticker, session);
    if (data) {
      prices[data.t] = data;
      successCount++;
      console.log(`  [OK] ${data.t}: ${data.cur}${data.p} (${data.c >= 0 ? '+' : ''}${data.cp}%)`);
    } else {
      failCount++;
      console.log(`  [FAIL] ${ticker.replace('.AX', '')}`);
    }
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
