#!/usr/bin/env node
// backfill-2yr-history.js
// Fetches 2-year daily close data from Yahoo Finance and updates priceHistory
// in each data/research/*.json file. Non-destructive: skips on fetch failure.
// Run after migrate-t-to-d.js. Usage: node scripts/backfill-2yr-history.js

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const RESEARCH_DIR = path.join(__dirname, '..', 'data', 'research');
const MIN_POINTS = 400; // require at least ~400 trading days to call it "2-year"
const DELAY_MS = 1500;  // polite delay between requests

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ContinuumIntelligence/1.0)',
        'Accept': 'application/json',
      },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

async function fetchCloses(yahooTicker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?range=2y&interval=1d`;
  const data = await fetchJson(url);
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error('No chart result');
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!closes || !Array.isArray(closes)) throw new Error('No close array');
  // filter out null/NaN values
  return closes.filter(v => v != null && !isNaN(v));
}

async function processFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);

  // Determine the Yahoo Finance ticker symbol
  const yahooTicker = data.tickerFull || (data.ticker + '.AX');

  let closes;
  try {
    closes = await fetchCloses(yahooTicker);
  } catch (e) {
    // Try .ASX suffix as fallback if the primary fails
    if (!data.tickerFull || !data.tickerFull.endsWith('.ASX')) {
      try {
        const fallback = data.ticker + '.AX'; // already tried above if tickerFull is .AX
        if (yahooTicker !== fallback) {
          closes = await fetchCloses(fallback);
        } else {
          throw e;
        }
      } catch {
        throw e;
      }
    } else {
      throw e;
    }
  }

  if (closes.length < MIN_POINTS) {
    console.log(`  SKIP ${data.ticker}: only ${closes.length} points (need ${MIN_POINTS})`);
    return false;
  }

  data.priceHistory = closes;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`  OK   ${data.ticker}: ${closes.length} data points written`);
  return true;
}

async function main() {
  const files = fs.readdirSync(RESEARCH_DIR)
    .filter(f => f.endsWith('.json') && f !== '_index.json')
    .map(f => path.join(RESEARCH_DIR, f));

  console.log(`Backfilling 2-year price history for ${files.length} research files...\n`);

  let ok = 0, skipped = 0, failed = 0;

  for (const filePath of files) {
    const name = path.basename(filePath);
    try {
      const updated = await processFile(filePath);
      if (updated) ok++;
      else skipped++;
    } catch (e) {
      console.log(`  FAIL ${name}: ${e.message}`);
      failed++;
    }
    await sleep(DELAY_MS);
  }

  console.log(`\nDone: ${ok} updated, ${skipped} skipped (insufficient data), ${failed} failed`);
}

main().catch(e => { console.error(e); process.exit(1); });
