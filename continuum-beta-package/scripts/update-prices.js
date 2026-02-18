#!/usr/bin/env node
/**
 * update-prices.js
 * Fetches latest daily close prices from Yahoo Finance for all tickers
 * in index.html and updates the price field + appends to priceHistory.
 *
 * Designed to run server-side via GitHub Actions (no CORS issues).
 * Usage: node scripts/update-prices.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const INDEX_PATH = path.join(__dirname, '..', 'index.html');

// All tickers to update (Yahoo Finance symbols)
const TICKERS = [
  'XRO.AX', 'CSL.AX', 'WOW.AX', 'GMG.AX', 'MQG.AX', 'WTC.AX',
  'PME.AX', 'SIG.AX', 'DRO.AX', 'FMG.AX', 'WDS.AX', 'GYG.AX'
];

// Max priceHistory length (keep last 252 trading days = ~1 year)
const MAX_HISTORY = 252;

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }, (res) => {
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
    }).on('error', reject);
  });
}

async function fetchYahoo(ticker) {
  // Fetch last 5 trading days to get the most recent close
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=5d&interval=1d&includePrePost=false`;
  try {
    const json = await fetchJSON(url);
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

function updateStockData(html, ticker, priceData) {
  if (!priceData) return html;

  const short = priceData.shortTicker;
  const price = priceData.currentPrice;

  // --- 1. Update the price field in STOCK_DATA ---
  // Match: STOCK_DATA.XXX = { ... price: 123.45, ... }
  // We need to find the price field within this stock's block

  // For compact (single-line) stocks like GMG
  const compactRegex = new RegExp(
    `(STOCK_DATA\\.${short}\\s*=\\s*\\{[^}]*?price:\\s*)([\\d.]+)(,)`,
    'g'
  );

  // For multi-line stocks
  const multilineRegex = new RegExp(
    `(STOCK_DATA\\.${short}\\s*=\\s*\\{[\\s\\S]*?^\\s*price:\\s*)([\\d.]+)(,)`,
    'gm'
  );

  let updated = false;

  // Try compact first (GMG)
  if (compactRegex.test(html)) {
    compactRegex.lastIndex = 0;
    html = html.replace(compactRegex, `$1${price}$3`);
    updated = true;
  }

  if (!updated) {
    // Multi-line: find the STOCK_DATA block start, then the price within it
    const blockStart = html.indexOf(`STOCK_DATA.${short}`);
    if (blockStart === -1) return html;

    // Find price: within the next 500 chars (it's near the top of each block)
    const searchWindow = html.substring(blockStart, blockStart + 500);
    const priceMatch = searchWindow.match(/(\bprice:\s*)([\d.]+)/);
    if (priceMatch) {
      const priceIdx = blockStart + searchWindow.indexOf(priceMatch[0]);
      html = html.substring(0, priceIdx) +
        priceMatch[0].replace(priceMatch[2], String(price)) +
        html.substring(priceIdx + priceMatch[0].length);
      updated = true;
    }
  }

  if (!updated) {
    console.error(`  [WARN] Could not find price field for ${short}`);
    return html;
  }

  // --- 2. Update priceHistory (append latest close, trim to MAX_HISTORY) ---
  const histRegex = new RegExp(
    `(STOCK_DATA\\.${short}[\\s\\S]*?priceHistory:\\s*\\[)([^\\]]+)(\\])`,
    'm'
  );
  const histMatch = html.match(histRegex);
  if (histMatch) {
    let prices = histMatch[2].split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
    const lastInHistory = prices[prices.length - 1];

    // Only append if the new price is different from the last entry
    if (Math.abs(lastInHistory - price) > 0.005) {
      prices.push(price);
    }

    // Trim to max length (keep most recent)
    if (prices.length > MAX_HISTORY) {
      prices = prices.slice(prices.length - MAX_HISTORY);
    }

    const newHistStr = prices.map(p => p.toFixed ? p : String(p)).join(', ');
    html = html.replace(histRegex, `$1${newHistStr}$3`);
  }

  // --- 3. Update SNAPSHOT_DATA price if it exists ---
  const snapRegex = new RegExp(
    `(SNAPSHOT_DATA\\.${short}\\s*=\\s*\\{[\\s\\S]*?\\bprice:\\s*)([\\.\\d]+)`,
    'm'
  );
  if (snapRegex.test(html)) {
    html = html.replace(snapRegex, `$1${price}`);
  }

  // --- 4. Update technicalAnalysis.price.current if it exists ---
  const taBlock = html.indexOf(`STOCK_DATA.${short}`);
  if (taBlock !== -1) {
    // Find technicalAnalysis within this block (search up to next STOCK_DATA)
    const nextBlock = html.indexOf('STOCK_DATA.', taBlock + 1);
    const blockEnd = nextBlock === -1 ? html.length : nextBlock;
    const blockStr = html.substring(taBlock, blockEnd);

    const taPriceMatch = blockStr.match(/(price:\s*\{\s*current:\s*)([\d.]+)/);
    if (taPriceMatch) {
      const idx = taBlock + blockStr.indexOf(taPriceMatch[0]);
      html = html.substring(0, idx) +
        taPriceMatch[0].replace(taPriceMatch[2], String(price)) +
        html.substring(idx + taPriceMatch[0].length);
    }
  }

  console.log(`  [OK] ${short}: ${price}`);
  return html;
}

async function main() {
  console.log('=== Continuum Intelligence — Price Update ===');
  console.log(`Fetching prices for ${TICKERS.length} tickers...\n`);

  let html = fs.readFileSync(INDEX_PATH, 'utf8');
  let updatedCount = 0;
  let failedCount = 0;

  for (const ticker of TICKERS) {
    // Stagger requests slightly to avoid rate limiting
    if (updatedCount > 0) await new Promise(r => setTimeout(r, 300));

    const data = await fetchYahoo(ticker);
    if (data) {
      html = updateStockData(html, ticker, data);
      updatedCount++;
    } else {
      failedCount++;
    }
  }

  if (updatedCount > 0) {
    fs.writeFileSync(INDEX_PATH, html, 'utf8');
    console.log(`\nDone: ${updatedCount} updated, ${failedCount} failed.`);
  } else {
    console.log('\nNo prices were fetched. File not modified.');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
