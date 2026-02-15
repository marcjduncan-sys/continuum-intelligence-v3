#!/usr/bin/env node
/**
 * fetch-announcements.js
 *
 * Continuum Intelligence — ASX Announcements Fetcher
 *
 * Fetches latest ASX company announcements for all covered tickers.
 * Designed to run 1-2 times daily (pre-market and post-close) via
 * GitHub Actions.
 *
 * Data source: ASX public company announcements API
 *   https://www.asx.com.au/asx/1/company/{code}/announcements
 *
 * Output: data/announcements.json
 *
 * Usage: node scripts/fetch-announcements.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_PATH = path.join(DATA_DIR, 'announcements.json');

// Tickers to monitor (ASX codes, no .AX suffix)
const TICKERS = [
  'XRO', 'CSL', 'WOW', 'GMG', 'MQG', 'WTC',
  'PME', 'SIG', 'DRO', 'FMG', 'WDS', 'GYG'
];

// Number of announcements to fetch per ticker
const ANNOUNCEMENTS_PER_TICKER = 5;

function fetchURL(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      timeout: 15000
    }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchURL(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function fetchASXAnnouncements(ticker) {
  // ASX public announcements API
  const url = `https://www.asx.com.au/asx/1/company/${ticker}/announcements?count=${ANNOUNCEMENTS_PER_TICKER}&market_sensitive=false`;

  try {
    const raw = await fetchURL(url);
    const data = JSON.parse(raw);

    if (!data.data || !Array.isArray(data.data)) {
      return [];
    }

    return data.data.map(ann => ({
      id: ann.id || null,
      date: ann.document_date || ann.document_release_date || null,
      headline: ann.header || ann.title || '',
      type: categoriseAnnouncement(ann.header || ''),
      sensitive: ann.market_sensitive || false,
      pages: ann.number_of_pages || null,
      url: ann.url ? `https://www.asx.com.au${ann.url}` : null
    }));
  } catch (e) {
    console.error(`  [WARN] Failed to fetch ${ticker}: ${e.message}`);
    return [];
  }
}

function categoriseAnnouncement(headline) {
  const h = headline.toLowerCase();
  if (/\bresult|earnings|profit|revenue|half.?year|full.?year|quarterly|interim/i.test(h)) return 'Results';
  if (/\bagm|annual general/i.test(h)) return 'AGM';
  if (/\bdividend|distribution/i.test(h)) return 'Dividend';
  if (/\bacquisition|merger|takeover|bid/i.test(h)) return 'M&A';
  if (/\bguidance|outlook|forecast/i.test(h)) return 'Guidance';
  if (/\bdirector|appointment|resignation|ceo|cfo/i.test(h)) return 'Board';
  if (/\bcapital raise|placement|rights issue|spp|entitlement/i.test(h)) return 'Capital';
  if (/\bbuyback|buy.?back/i.test(h)) return 'Buyback';
  if (/\bcontract|agreement|partner/i.test(h)) return 'Contract';
  if (/\basx.*listing|admission/i.test(h)) return 'Listing';
  if (/\btrading halt|voluntary suspension/i.test(h)) return 'Halt';
  if (/\bappendix\s*(4[cde]|3[by])/i.test(h)) return 'Appendix';
  if (/\bchange.*director.*interest|substantial/i.test(h)) return 'Disclosure';
  return 'Announcement';
}

// Fallback: Try Yahoo Finance for recent news if ASX API fails
async function fetchYahooNews(ticker) {
  const yahooTicker = ticker + '.AX';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?range=1d&interval=1d`;

  try {
    const raw = await fetchURL(url);
    const data = JSON.parse(raw);
    // Yahoo chart endpoint doesn't include news, but confirms the ticker is valid
    return [];
  } catch (e) {
    return [];
  }
}

async function main() {
  console.log('=== Continuum Intelligence — Announcements Fetch ===');
  console.log(`Time: ${new Date().toISOString()}`);

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const announcements = {};
  let totalAnn = 0;
  let successTickers = 0;
  let failedTickers = 0;

  for (const ticker of TICKERS) {
    // Stagger requests
    if (successTickers + failedTickers > 0) {
      await new Promise(r => setTimeout(r, 500));
    }

    const anns = await fetchASXAnnouncements(ticker);
    if (anns.length > 0) {
      announcements[ticker] = anns;
      totalAnn += anns.length;
      successTickers++;
      console.log(`  [OK] ${ticker}: ${anns.length} announcements`);
    } else {
      // Try fallback
      const fallback = await fetchYahooNews(ticker);
      if (fallback.length > 0) {
        announcements[ticker] = fallback;
        totalAnn += fallback.length;
        successTickers++;
        console.log(`  [OK] ${ticker}: ${fallback.length} (fallback)`);
      } else {
        failedTickers++;
        console.log(`  [SKIP] ${ticker}: No announcements found`);
      }
    }
  }

  // Load existing announcements to preserve any we missed
  let existing = {};
  try {
    const raw = fs.readFileSync(OUTPUT_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.announcements) {
      existing = parsed.announcements;
    }
  } catch (e) {
    // No existing file
  }

  // Merge: new announcements take priority, but keep old ones for tickers that failed
  const merged = Object.assign({}, existing, announcements);

  const output = {
    updated: new Date().toISOString(),
    source: 'ASX',
    tickerCount: Object.keys(merged).length,
    totalAnnouncements: Object.values(merged).reduce((sum, arr) => sum + arr.length, 0),
    announcements: merged
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\nWrote ${OUTPUT_PATH}: ${totalAnn} new announcements across ${successTickers} tickers (${failedTickers} skipped)`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
