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

// Tickers to monitor (from central registry, ASX codes, no .AX suffix)
const { getActiveTickers } = require('./lib/registry');
const TICKERS = getActiveTickers();

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
  // NOTE: The ASX public announcements API (asx.com.au/asx/1/company/{code}/announcements)
  // was retired in 2024/2025 and returns 404 for all requests.
  // Primary source is now Yahoo Finance search news — see fetchYahooNews().
  return [];
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

// Primary source: Yahoo Finance RSS headline feed — company-specific news.
// Endpoint: feeds.finance.yahoo.com/rss/2.0/headline?s={TICKER}.AX
// Returns only news tagged to that specific ticker, unlike the search endpoint
// which returns general market articles shared across many tickers.
function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const get = (tag) => {
      // Handle both plain text and CDATA-wrapped content
      const plain = block.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>'));
      if (!plain) return '';
      const inner = plain[1].trim();
      const cdata = inner.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
      return cdata ? cdata[1].trim() : inner;
    };
    const title = get('title');
    if (!title) continue;
    items.push({ guid: get('guid'), title, link: get('link'), pubDate: get('pubDate') });
  }
  return items;
}

async function fetchYahooNews(ticker) {
  const yahooTicker = ticker + '.AX';

  // Primary: RSS feed — ticker-specific
  const rssUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${yahooTicker}&region=AU&lang=en-AU`;
  try {
    const raw = await fetchURL(rssUrl);
    const items = parseRSS(raw);
    if (items.length > 0) {
      return items.slice(0, ANNOUNCEMENTS_PER_TICKER).map(n => ({
        id:        n.guid || null,
        date:      n.pubDate ? new Date(n.pubDate).toISOString() : null,
        headline:  n.title,
        type:      categoriseAnnouncement(n.title),
        sensitive: false,
        pages:     null,
        url:       n.link || null,
        publisher: null
      }));
    }
  } catch (e) {
    // Fall through to search fallback
  }

  // Fallback: JSON search endpoint — less reliable, filter by company name
  const searchUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${yahooTicker}&lang=en-AU&region=AU&quotesCount=1&newsCount=${ANNOUNCEMENTS_PER_TICKER}&enableFuzzyQuery=false`;
  try {
    const raw = await fetchURL(searchUrl);
    const data = JSON.parse(raw);
    const quotes = (data && Array.isArray(data.quotes)) ? data.quotes : [];
    const companyName = quotes.length > 0 ? (quotes[0].longname || quotes[0].shortname || '') : '';
    const tickerLower = ticker.toLowerCase();
    const companyWords = companyName.toLowerCase().split(/\s+/).filter(w => w.length > 3);

    const items = (data && Array.isArray(data.news)) ? data.news : [];
    if (items.length === 0) { console.error(`  [WARN] No news found for ${ticker}`); return []; }

    // Filter to articles that mention the ticker or company name — rejects generic market noise
    const relevant = items.filter(n => {
      if (!n.title) return false;
      const t = n.title.toLowerCase();
      return t.includes(tickerLower) || companyWords.some(w => t.includes(w));
    });
    const source = relevant.length > 0 ? relevant : [];
    if (source.length === 0) { console.warn(`  [WARN] ${ticker}: all search results were generic market noise — skipping`); return []; }

    return source.filter(n => n.title).slice(0, ANNOUNCEMENTS_PER_TICKER).map(n => ({
      id:        n.uuid || null,
      date:      n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : null,
      headline:  n.title,
      type:      categoriseAnnouncement(n.title),
      sensitive: false,
      pages:     null,
      url:       n.link || null,
      publisher: n.publisher || null
    }));
  } catch (e) {
    console.error(`  [WARN] Yahoo fetch failed for ${ticker}: ${e.message}`);
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
    source: 'Yahoo Finance',
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
