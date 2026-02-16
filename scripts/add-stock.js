#!/usr/bin/env node
/**
 * add-stock.js — Scalable Stock Addition for Continuum Intelligence
 *
 * Adds a new stock to the coverage universe. Three files are modified:
 *   1. data/config/tickers.json  — central registry (single source of truth)
 *   2. data/stocks/TICKER.json   — per-stock hypothesis framework
 *   3. index.html                — FRESHNESS_DATA + REFERENCE_DATA + STOCK_DATA skeleton
 *
 * All other registrations (script TICKERS arrays, SNAPSHOT_ORDER, FEATURED_ORDER,
 * tc-stock-cards, page-report divs, TC_DATA) are handled dynamically at runtime.
 *
 * Usage:
 *   node scripts/add-stock.js --ticker BHP --company "BHP Group" --sector Materials
 *   node scripts/add-stock.js --ticker BHP --company "BHP Group" --sector Materials --sector-sub "Iron Ore Mining"
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const REGISTRY_PATH = path.join(ROOT, 'data', 'config', 'tickers.json');
const STOCKS_DIR = path.join(ROOT, 'data', 'stocks');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ============================================================
// PARSE INPUTS
// ============================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ticker' && args[i + 1]) parsed.ticker = args[++i].toUpperCase();
    if (args[i] === '--company' && args[i + 1]) parsed.company = args[++i];
    if (args[i] === '--sector' && args[i + 1]) parsed.sector = args[++i];
    if (args[i] === '--sector-sub' && args[i + 1]) parsed.sectorSub = args[++i];
  }
  return {
    ticker: parsed.ticker || process.env.STOCK_TICKER?.toUpperCase(),
    company: parsed.company || process.env.STOCK_COMPANY,
    sector: parsed.sector || process.env.STOCK_SECTOR || 'Unknown',
    sectorSub: parsed.sectorSub || process.env.STOCK_SECTOR_SUB || '',
  };
}

// ============================================================
// YAHOO FINANCE DATA FETCHING
// ============================================================

function httpGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/json,*/*', ...options.headers },
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
  const consentRes = await httpGet('https://fc.yahoo.com/', { headers: { 'Accept': 'text/html' } });
  const setCookies = consentRes.headers['set-cookie'];
  if (!setCookies) throw new Error('No cookies from Yahoo Finance');
  const cookies = (Array.isArray(setCookies) ? setCookies : [setCookies]).map(c => c.split(';')[0]).join('; ');
  const crumbRes = await httpGet('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers: { 'Cookie': cookies, 'Accept': 'text/plain' } });
  if (crumbRes.statusCode !== 200) throw new Error(`Crumb request failed: HTTP ${crumbRes.statusCode}`);
  const crumb = crumbRes.body.trim();
  return { cookies, crumb };
}

function fetchJSON(url, session) {
  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': USER_AGENT, 'Accept': 'application/json' };
    if (session) headers['Cookie'] = session.cookies;
    const req = https.get(url, { headers, timeout: 15000 }, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); res.resume(); return; }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Invalid JSON')); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function fetchMarketData(ticker, session) {
  const yahooTicker = ticker + '.AX';
  const crumbParam = session ? `&crumb=${encodeURIComponent(session.crumb)}` : '';

  // Fetch 5-day data for current price + previous close
  console.log(`  Fetching 5-day data for ${yahooTicker}...`);
  const shortUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?range=5d&interval=1d&includePrePost=false${crumbParam}`;
  const shortJson = await fetchJSON(shortUrl, session);
  const shortResult = shortJson.chart.result[0];
  const meta = shortResult.meta;
  const quote = shortResult.indicators.quote[0];

  let currentPrice = meta.regularMarketPrice;
  for (let i = (shortResult.timestamp || []).length - 1; i >= 0; i--) {
    if (quote.close[i] != null) { currentPrice = Math.round(quote.close[i] * 100) / 100; break; }
  }
  const previousClose = meta.chartPreviousClose || meta.previousClose || currentPrice;

  // Fetch 1-year data for price history + 52-week range
  console.log(`  Fetching 1-year data for ${yahooTicker}...`);
  await new Promise(r => setTimeout(r, 300));
  const longUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?range=1y&interval=1d&includePrePost=false${crumbParam}`;
  const longJson = await fetchJSON(longUrl, session);
  const longResult = longJson.chart.result[0];
  const longQuote = longResult.indicators.quote[0];

  const closes = (longQuote.close || []).filter(c => c != null).map(c => Math.round(c * 100) / 100);
  const yearHigh = closes.length > 0 ? Math.max(...closes) : currentPrice;
  const yearLow = closes.length > 0 ? Math.min(...closes) : currentPrice;

  // Get shares outstanding from quote summary
  let sharesOutstanding = null;
  try {
    await new Promise(r => setTimeout(r, 300));
    const summaryUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${yahooTicker}?modules=defaultKeyStatistics,financialData,summaryDetail${crumbParam}`;
    const summaryJson = await fetchJSON(summaryUrl, session);
    const stats = summaryJson.quoteSummary?.result?.[0];
    sharesOutstanding = stats?.defaultKeyStatistics?.sharesOutstanding?.raw || null;
  } catch (e) {
    console.log('  [WARN] Could not fetch quote summary, using defaults');
  }

  return {
    currentPrice,
    previousClose,
    priceHistory: closes.length > 0 ? closes : [currentPrice],
    yearHigh,
    yearLow,
    volume: meta.regularMarketVolume || 0,
    currency: meta.currency === 'AUD' ? 'A$' : (meta.currency || 'A$'),
    sharesOutstanding,
  };
}

// ============================================================
// REGISTRY UPDATE
// ============================================================

function updateRegistry(ticker, company, sector, sectorSub, marketData) {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));

  if (registry.tickers[ticker]) {
    console.log(`  [WARN] ${ticker} already exists in registry — updating`);
  }

  registry.tickers[ticker] = {
    company,
    sector,
    sectorSub: sectorSub || sector,
    exchange: 'ASX',
    currency: marketData.currency,
    added: new Date().toISOString().slice(0, 10),
    status: 'active',
    featured: true,
    analysisConfig: {
      peakPrice: marketData.yearHigh,
      low52Week: marketData.yearLow,
      high52Week: marketData.yearHigh,
      baseWeights: { T1: 50, T2: 35, T3: 30, T4: 35 },
      characteristics: { highMultiple: false, growthStock: false, hasAIExposure: false },
      hypothesisNames: {
        T1: 'Growth/Recovery',
        T2: 'Base Case/Compression',
        T3: 'Risk/Downside',
        T4: 'Disruption/Catalyst'
      }
    }
  };

  registry._updated = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  console.log(`  [OK] Registry updated: ${ticker}`);
}

// ============================================================
// STOCK JSON FILE
// ============================================================

function createStockJSON(ticker, company, sector, marketData) {
  const stockFile = path.join(STOCKS_DIR, `${ticker}.json`);
  if (fs.existsSync(stockFile)) {
    console.log(`  [SKIP] ${stockFile} already exists`);
    return;
  }

  const stockData = {
    ticker: ticker + '.AX',
    company,
    sector,
    market_cap: marketData.sharesOutstanding
      ? (marketData.sharesOutstanding * marketData.currentPrice / 1e9).toFixed(1) + 'B'
      : null,
    hypotheses: {
      T1: {
        label: 'Growth/Recovery',
        description: `${company} executes on growth strategy; earnings accelerate`,
        plain_english: `This is the bull case — ${company} delivers on its key initiatives and the market rewards it.`,
        what_to_watch: 'Next earnings result and forward guidance.',
        upside: 'Material re-rating if execution surprises to the upside.',
        risk_plain: 'If growth disappoints, this narrative weakens.',
        survival_score: 0.50,
        status: 'MODERATE',
        weighted_inconsistency: 3.0,
        last_updated: new Date().toISOString()
      },
      T2: {
        label: 'Base Case/Managed',
        description: `${company} delivers steady-state results; valuation holds`,
        plain_english: 'The company continues on its current trajectory — neither surprising positively nor negatively.',
        what_to_watch: 'Margin trends and competitive dynamics.',
        upside: null,
        risk_plain: 'If the base case is already priced in, limited upside from here.',
        survival_score: 0.60,
        status: 'MODERATE',
        weighted_inconsistency: 2.0,
        last_updated: new Date().toISOString()
      },
      T3: {
        label: 'Risk/Downside',
        description: `${company} faces headwinds; earnings or multiples compress`,
        plain_english: 'This is the bear case — something goes wrong and the stock de-rates.',
        what_to_watch: 'Cost pressures, competitive threats, or macro headwinds.',
        upside: null,
        risk_plain: 'Material downside if multiple risks crystallise simultaneously.',
        survival_score: 0.30,
        status: 'LOW',
        weighted_inconsistency: 4.0,
        last_updated: new Date().toISOString()
      },
      T4: {
        label: 'Disruption/Catalyst',
        description: `A structural shift changes the investment case for ${company}`,
        plain_english: 'An external force — technology, regulation, or competition — fundamentally alters the business.',
        what_to_watch: 'Industry disruption signals and regulatory changes.',
        upside: null,
        risk_plain: 'If disruption materialises, prior assumptions become invalid.',
        survival_score: 0.15,
        status: 'LOW',
        weighted_inconsistency: 5.0,
        last_updated: new Date().toISOString()
      }
    },
    dominant: 'T2',
    confidence: 'LOW',
    alert_state: 'NORMAL',
    current_price: marketData.currentPrice,
    big_picture: `${company} (ASX: ${ticker}) — coverage initiated. Full analysis pending.`,
    last_flip: null,
    narrative_history: [],
    evidence_items: [],
    price_signals: [],
    editorial_override: null,
    price_history: marketData.priceHistory.slice(-60),
    weighting: null
  };

  if (!fs.existsSync(STOCKS_DIR)) fs.mkdirSync(STOCKS_DIR, { recursive: true });
  fs.writeFileSync(stockFile, JSON.stringify(stockData, null, 2) + '\n', 'utf8');
  console.log(`  [OK] Created ${stockFile}`);
}

// ============================================================
// INDEX.HTML INJECTION (3 points only)
// ============================================================

function injectIntoIndexHTML(ticker, company, sector, sectorSub, marketData) {
  let html = fs.readFileSync(INDEX_PATH, 'utf8');
  const short = ticker;
  const price = marketData.currentPrice;
  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

  // Check if already exists
  if (html.includes(`STOCK_DATA.${short} =`)) {
    console.log(`  [SKIP] STOCK_DATA.${short} already exists in index.html`);
    return;
  }

  // --- 1. FRESHNESS_DATA entry ---
  const freshnessEntry = `  "${short}": {
    "reviewDate": "${new Date().toISOString()}",
    "daysSinceReview": 0,
    "priceAtReview": ${price},
    "pricePctChange": 0,
    "nearestCatalyst": null,
    "nearestCatalystDate": null,
    "nearestCatalystDays": null,
    "urgency": 0,
    "status": "OK",
    "badge": "ok"
  }`;

  const freshnessMarker = '// === END FRESHNESS_DATA ===';
  const freshnessIdx = html.indexOf(freshnessMarker);
  if (freshnessIdx === -1) {
    console.error('  [ERROR] Could not find FRESHNESS_DATA marker');
  } else {
    // Insert before the closing }; and marker
    const closingBrace = html.lastIndexOf('};', freshnessIdx);
    html = html.substring(0, closingBrace) + '},\n' + freshnessEntry + '\n};\n' + freshnessMarker + html.substring(freshnessIdx + freshnessMarker.length);
    console.log(`  [OK] FRESHNESS_DATA.${short} injected`);
  }

  // --- 2. REFERENCE_DATA entry ---
  const sharesM = marketData.sharesOutstanding ? Math.round(marketData.sharesOutstanding / 1e6) : null;
  const marketCapStr = sharesM ? (sharesM * price / 1000).toFixed(1) + 'B' : null;
  const referenceEntry = `  ${short}: {
    sharesOutstanding: ${sharesM || 'null'},
    analystTarget: null,
    analystBuys: null,
    analystHolds: null,
    analystSells: null,
    analystCount: null,
    epsTrailing: null,
    epsForward: null,
    divPerShare: null,
    reportingCurrency: '${marketData.currency}',
    revenue: null,
    _anchors: { price: ${price}, marketCapStr: ${marketCapStr ? "'" + marketCapStr + "'" : 'null'}, pe: null, divYield: null }
  }`;

  const refMarker = '// === END REFERENCE_DATA ===';
  const refIdx = html.indexOf(refMarker);
  if (refIdx === -1) {
    console.error('  [ERROR] Could not find REFERENCE_DATA marker');
  } else {
    const refClosingBrace = html.lastIndexOf('};', refIdx);
    html = html.substring(0, refClosingBrace) + '},\n' + referenceEntry + '\n};\n' + refMarker + html.substring(refIdx + refMarker.length);
    console.log(`  [OK] REFERENCE_DATA.${short} injected`);
  }

  // --- 3. STOCK_DATA skeleton ---
  const historyStr = marketData.priceHistory.slice(-60).join(', ');
  const drawdown = marketData.yearHigh > 0 ? ((1 - price / marketData.yearHigh) * 100).toFixed(1) : '0.0';

  const stockDataBlock = `
STOCK_DATA.${short} = {
  // Meta
  ticker: '${short}',
  tickerFull: '${short}.AX',
  exchange: 'ASX',
  company: '${company.replace(/'/g, "\\'")}',
  sector: '${sector}',
  sectorSub: '${(sectorSub || sector).replace(/'/g, "\\'")}',
  price: ${price},
  currency: '${marketData.currency}',
  date: '${today}',
  reportId: '${short}-2026-001',

  // Hero
  heroDescription: '${(sectorSub || sector).replace(/'/g, "\\'")} &bull; ASX-Listed',
  heroCompanyDescription: '${company.replace(/'/g, "\\'")} (ASX: ${short}) &mdash; coverage initiated. Full analysis pending.',
  heroMetrics: [
    { label: 'Price', value: '${marketData.currency}${price}', colorClass: '' },
    { label: '52w High', value: '${marketData.currency}${marketData.yearHigh}', colorClass: '' },
    { label: '52w Low', value: '${marketData.currency}${marketData.yearLow}', colorClass: '' },
    { label: 'Drawdown', value: '-${drawdown}%', colorClass: ${parseFloat(drawdown) > 20 ? "'negative'" : "''"} }
  ],

  // Skew
  skew: { direction: 'neutral', rationale: 'Pending full analysis' },

  // Featured
  featuredMetrics: [
    { label: 'Price', value: '${marketData.currency}${price}', colorClass: '' },
    { label: 'Drawdown', value: '-${drawdown}%', colorClass: ${parseFloat(drawdown) > 20 ? "'negative'" : "''"} }
  ],
  featuredPriceColor: '',
  featuredRationale: 'Auto-added to coverage. Full analysis pending.',

  // Verdict
  verdict: {
    label: 'PENDING',
    description: 'Full hypothesis framework under construction.',
    subLabel: 'Coverage initiated',
    color: 'var(--accent-yellow)',
    emoji: '',
    scores: { t1: 50, t2: 50, t3: 50, t4: 50 },
    confidence: { level: 'LOW', color: 'var(--accent-yellow)', description: 'Pending analysis' },
    keyDrivers: ['Coverage recently initiated', 'Full evidence assessment pending']
  },

  // Identity
  identity: {
    oneLiner: '${company.replace(/'/g, "\\'")} (ASX: ${short})',
    sector: '${sector}',
    sectorSub: '${(sectorSub || sector).replace(/'/g, "\\'")}',
    marketCap: '${marketCapStr || "N/A"}',
    peRatio: 'N/A',
    divYield: 'N/A'
  },

  // Hypotheses
  hypotheses: [
    { tier: 'T1', direction: 'upside', title: 'T1: Growth/Recovery', score: 50, statusClass: 'status-moderate', confidence: 'LOW', summary: 'Pending analysis', evidence: [], watchItems: [] },
    { tier: 'T2', direction: 'base', title: 'T2: Base Case', score: 50, statusClass: 'status-moderate', confidence: 'LOW', summary: 'Pending analysis', evidence: [], watchItems: [] },
    { tier: 'T3', direction: 'downside', title: 'T3: Risk/Downside', score: 50, statusClass: 'status-moderate', confidence: 'LOW', summary: 'Pending analysis', evidence: [], watchItems: [] },
    { tier: 'T4', direction: 'disruption', title: 'T4: Disruption/Catalyst', score: 50, statusClass: 'status-moderate', confidence: 'LOW', summary: 'Pending analysis', evidence: [], watchItems: [] }
  ],

  // Narrative
  narrative: [],

  // Evidence
  evidenceMatrix: [],

  // Discriminators
  discriminators: [],

  // Tripwires
  tripwires: [],

  // Price History
  priceHistory: [${historyStr}],

  // Questions
  questions: ['Full analysis pending — what are the key risks and catalysts for ${short}?'],

  // Footer
  footerDisclaimer: 'This report does not constitute personal financial advice. Continuum Intelligence synthesises cross-domain evidence using ACH methodology. All data sourced from ASX filings and publicly available data.',
  footerMeta: [
    { label: 'ID: ${short}-2026-001' },
    { label: 'MODE: Coverage Initiated' },
    { label: 'NEXT: Pending' }
  ],

  // Gaps
  gaps: {
    coverageRows: [],
    couldntAssess: ['Full evidence assessment pending.'],
    analyticalLimitations: 'This stock was auto-added to coverage. Hypothesis scores, evidence, and narrative require manual research.'
  },

  // Footer
  footer: {
    disclaimer: 'This report does not constitute personal financial advice.',
    domainCount: '0 of 10',
    hypothesesCount: '4 Pending'
  }
};
`;

  // Insert before the auto-populate SNAPSHOT_DATA IIFE
  // Search for the IIFE pattern that auto-populates SNAPSHOT_DATA
  const snapshotIdx = html.search(/\(function\(\)\s*\{\s*\n\s*for\s*\(var i = 0; i < SNAPSHOT_ORDER/);
  if (snapshotIdx === -1) {
    // Fallback: insert before the last closing }; of the previous STOCK_DATA block
    const lastStockData = html.lastIndexOf('STOCK_DATA.');
    const fallbackIdx = html.indexOf('};', lastStockData);
    if (fallbackIdx !== -1) {
      html = html.substring(0, fallbackIdx + 2) + '\n' + stockDataBlock + html.substring(fallbackIdx + 2);
      console.log(`  [OK] STOCK_DATA.${short} skeleton injected (fallback)`);
    } else {
      console.error('  [ERROR] Could not find insertion point for STOCK_DATA');
    }
  } else {
    html = html.substring(0, snapshotIdx) + stockDataBlock + '\n' + html.substring(snapshotIdx);
    console.log(`  [OK] STOCK_DATA.${short} skeleton injected`);
  }

  // --- 4. Remove from COMING_SOON if present ---
  const comingSoonRegex = new RegExp(`\\s*\\{\\s*ticker:\\s*'${short}'[^}]+\\},?`, 'g');
  if (comingSoonRegex.test(html)) {
    html = html.replace(comingSoonRegex, '');
    console.log(`  [OK] Removed ${short} from COMING_SOON`);
  }

  fs.writeFileSync(INDEX_PATH, html, 'utf8');
  console.log(`  [OK] index.html updated`);
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('=== Continuum Intelligence — Add Stock ===\n');

  const { ticker, company, sector, sectorSub } = parseArgs();
  if (!ticker || !company) {
    console.error('Usage: node scripts/add-stock.js --ticker BHP --company "BHP Group" --sector Materials');
    process.exit(1);
  }

  console.log(`Ticker:  ${ticker}`);
  console.log(`Company: ${company}`);
  console.log(`Sector:  ${sector}${sectorSub ? ' / ' + sectorSub : ''}\n`);

  // 1. Fetch market data
  console.log('Step 1: Fetching market data from Yahoo Finance...');
  let session = null;
  try {
    session = await getYahooSession();
    console.log('  Session established');
  } catch (e) {
    console.log(`  [WARN] No Yahoo session: ${e.message} — trying without auth`);
  }

  const marketData = await fetchMarketData(ticker, session);
  console.log(`  Price: ${marketData.currency}${marketData.currentPrice}`);
  console.log(`  52w Range: ${marketData.currency}${marketData.yearLow} - ${marketData.currency}${marketData.yearHigh}`);
  console.log(`  History: ${marketData.priceHistory.length} data points\n`);

  // 2. Update registry
  console.log('Step 2: Updating central registry...');
  updateRegistry(ticker, company, sector, sectorSub, marketData);

  // 3. Create stock JSON
  console.log('\nStep 3: Creating stock data file...');
  createStockJSON(ticker, company, sector, marketData);

  // 4. Inject into index.html
  console.log('\nStep 4: Injecting into index.html...');
  injectIntoIndexHTML(ticker, company, sector, sectorSub, marketData);

  // 5. Summary
  console.log('\n=== Summary ===');
  console.log(`  Registry:  data/config/tickers.json  [UPDATED]`);
  console.log(`  Stock JSON: data/stocks/${ticker}.json [CREATED]`);
  console.log(`  index.html: FRESHNESS_DATA + REFERENCE_DATA + STOCK_DATA [INJECTED]`);
  console.log(`\nThe following are handled dynamically at runtime:`);
  console.log(`  - Stock card in thesis comparator grid`);
  console.log(`  - SNAPSHOT_ORDER & FEATURED_ORDER`);
  console.log(`  - page-report-${ticker} and page-snapshot-${ticker} divs`);
  console.log(`  - Price fetching (all scripts read from registry)`);
  console.log(`\nNext steps:`);
  console.log(`  1. Review and commit changes`);
  console.log(`  2. Push to trigger automated deploy`);
  console.log(`  3. Populate data/stocks/${ticker}.json with proper hypothesis analysis`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
