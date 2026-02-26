#!/usr/bin/env node
/**
 * add-stock.js — Scalable Stock Addition for Continuum Intelligence
 *
 * Adds a new stock to the coverage universe. Files modified:
 *   1. data/config/tickers.json  — central registry (single source of truth)
 *   2. data/stocks/TICKER.json   — per-stock hypothesis framework
 *   3. data/research/TICKER.json — full research/presentation JSON
 *   4. data/freshness.json       — freshness entry for the new stock
 *   5. data/reference.json       — reference data entry for the new stock
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
const REGISTRY_PATH = path.join(ROOT, 'data', 'config', 'tickers.json');
const STOCKS_DIR = path.join(ROOT, 'data', 'stocks');
const RESEARCH_DIR = path.join(ROOT, 'data', 'research');
const FRESHNESS_PATH = path.join(ROOT, 'data', 'freshness.json');
const REFERENCE_PATH = path.join(ROOT, 'data', 'reference.json');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// --- JSON helpers ---

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (e) { return null; }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

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
    console.log(`  [WARN] ${ticker} already exists in registry -- updating`);
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
      baseWeights: { N1: 50, N2: 35, N3: 30, N4: 35 },
      characteristics: { highMultiple: false, growthStock: false, hasAIExposure: false },
      hypothesisNames: {
        N1: 'Growth/Recovery',
        N2: 'Base Case/Compression',
        N3: 'Risk/Downside',
        N4: 'Disruption/Catalyst'
      }
    }
  };

  registry._updated = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  console.log(`  [OK] Registry updated: ${ticker}`);
}

// ============================================================
// STOCK JSON FILE (data/stocks/)
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
      N1: {
        label: 'Growth/Recovery',
        description: `${company} executes on growth strategy; earnings accelerate`,
        plain_english: `This is the bull case -- ${company} delivers on its key initiatives and the market rewards it.`,
        what_to_watch: 'Next earnings result and forward guidance.',
        upside: 'Material re-rating if execution surprises to the upside.',
        risk_plain: 'If growth disappoints, this narrative weakens.',
        survival_score: 0.50,
        status: 'MODERATE',
        weighted_inconsistency: 3.0,
        last_updated: new Date().toISOString()
      },
      N2: {
        label: 'Base Case/Managed',
        description: `${company} delivers steady-state results; valuation holds`,
        plain_english: 'The company continues on its current trajectory -- neither surprising positively nor negatively.',
        what_to_watch: 'Margin trends and competitive dynamics.',
        upside: null,
        risk_plain: 'If the base case is already priced in, limited upside from here.',
        survival_score: 0.60,
        status: 'MODERATE',
        weighted_inconsistency: 2.0,
        last_updated: new Date().toISOString()
      },
      N3: {
        label: 'Risk/Downside',
        description: `${company} faces headwinds; earnings or multiples compress`,
        plain_english: 'This is the bear case -- something goes wrong and the stock de-rates.',
        what_to_watch: 'Cost pressures, competitive threats, or macro headwinds.',
        upside: null,
        risk_plain: 'Material downside if multiple risks crystallise simultaneously.',
        survival_score: 0.30,
        status: 'LOW',
        weighted_inconsistency: 4.0,
        last_updated: new Date().toISOString()
      },
      N4: {
        label: 'Disruption/Catalyst',
        description: `A structural shift changes the investment case for ${company}`,
        plain_english: 'An external force -- technology, regulation, or competition -- fundamentally alters the business.',
        what_to_watch: 'Industry disruption signals and regulatory changes.',
        upside: null,
        risk_plain: 'If disruption materialises, prior assumptions become invalid.',
        survival_score: 0.15,
        status: 'LOW',
        weighted_inconsistency: 5.0,
        last_updated: new Date().toISOString()
      }
    },
    dominant: 'N2',
    confidence: 'LOW',
    alert_state: 'NORMAL',
    current_price: marketData.currentPrice,
    big_picture: `${company} (ASX: ${ticker}) -- coverage initiated. Full analysis pending.`,
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
// RESEARCH JSON FILE (data/research/)
// ============================================================

function createResearchJSON(ticker, company, sector, sectorSub, marketData) {
  const researchFile = path.join(RESEARCH_DIR, `${ticker}.json`);
  if (fs.existsSync(researchFile)) {
    console.log(`  [SKIP] data/research/${ticker}.json already exists`);
    return;
  }

  const short = ticker;
  const price = marketData.currentPrice;
  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  const marketCapStr = marketData.sharesOutstanding
    ? (marketData.sharesOutstanding * price / 1e9).toFixed(1) + 'B'
    : null;
  const drawdown = marketData.yearHigh > 0 ? ((1 - price / marketData.yearHigh) * 100).toFixed(1) : '0.0';

  const researchData = {
    ticker: short,
    tickerFull: short + '.AX',
    exchange: 'ASX',
    company: company,
    sector: sector,
    sectorSub: sectorSub || sector,
    price: price,
    currency: marketData.currency,
    date: today,
    reportId: `${short}-2026-001`,
    priceHistory: marketData.priceHistory.slice(-60),

    // Hero - right side metrics
    heroDescription: `${sectorSub || sector} &bull; ASX-Listed`,
    heroCompanyDescription: `${company} (ASX: ${short}) &mdash; coverage initiated. Full analysis pending.`,
    heroMetrics: [
      { label: 'Mkt Cap', value: marketCapStr ? marketData.currency + marketCapStr : 'N/A', colorClass: '' },
      { label: '52w High', value: marketData.currency + String(marketData.yearHigh), colorClass: '' },
      { label: '52w Low', value: marketData.currency + String(marketData.yearLow), colorClass: '' }
    ],

    // Skew
    skew: { direction: 'neutral', rationale: 'Auto-added stock. Narrative analysis pending. Skew assessment requires analyst research.' },

    // Verdict
    verdict: {
      text: `${company} has been added to coverage. Trading at <span class="key-stat">${marketData.currency}${price}</span>. Full narrative analysis with competing hypotheses is pending.`,
      borderColor: null,
      scores: [
        { label: 'N1 Growth/Recovery', score: '?', scoreColor: 'var(--text-muted)', dirArrow: '&rarr;', dirText: 'Pending', dirColor: null },
        { label: 'N2 Base Case', score: '?', scoreColor: 'var(--text-muted)', dirArrow: '&rarr;', dirText: 'Pending', dirColor: null },
        { label: 'N3 Risk/Downside', score: '?', scoreColor: 'var(--text-muted)', dirArrow: '&rarr;', dirText: 'Pending', dirColor: null },
        { label: 'N4 Disruption/Catalyst', score: '?', scoreColor: 'var(--text-muted)', dirArrow: '&rarr;', dirText: 'Pending', dirColor: null }
      ]
    },

    // Featured card metrics (for home page)
    featuredMetrics: [
      { label: 'Mkt Cap', value: marketCapStr ? marketData.currency + marketCapStr : 'N/A', color: '' },
      { label: '52w Range', value: `${marketData.currency}${marketData.yearLow}&ndash;${marketData.yearHigh}`, color: '' },
      { label: 'Drawdown', value: `-${drawdown}%`, color: '' }
    ],
    featuredPriceColor: '',
    featuredRationale: 'Auto-added to coverage. Full narrative analysis pending.',

    // Identity section
    identity: {
      rows: [
        [[`Ticker`, `${short}.AX`, 'td-mono'], ['Exchange', 'ASX', 'td-mono']],
        [['Market Cap', marketCapStr ? marketData.currency + marketCapStr : 'N/A', 'td-mono'], ['Sector', `${sector}${sectorSub && sectorSub !== sector ? ' / ' + sectorSub : ''}`, 'td-mono']],
        [['Share Price', `${marketData.currency}${price}`, 'td-mono'], ['52-Week Range', `${marketData.currency}${marketData.yearLow} &ndash; ${marketData.currency}${marketData.yearHigh}`, 'td-mono']]
      ],
      overview: `${company} (ASX: ${short}) &mdash; auto-added to coverage. Full company overview pending analyst research.`
    },

    // Hypotheses (placeholder)
    hypotheses: [
      {
        tier: 'n1', direction: 'upside',
        title: 'N1: Growth/Recovery',
        statusClass: 'watching', statusText: 'Watching &mdash; Pending Analysis',
        score: '?', scoreWidth: '0%', scoreMeta: 'Pending',
        description: 'Placeholder hypothesis. Requires analyst research to populate.',
        requires: null,
        supportingLabel: 'Supporting Evidence', supporting: ['Pending analysis'],
        contradictingLabel: 'Contradicting Evidence', contradicting: ['Pending analysis']
      },
      {
        tier: 'n2', direction: 'neutral',
        title: 'N2: Base Case',
        statusClass: 'watching', statusText: 'Watching &mdash; Pending Analysis',
        score: '?', scoreWidth: '0%', scoreMeta: 'Pending',
        description: 'Placeholder hypothesis. Requires analyst research to populate.',
        requires: null,
        supportingLabel: 'Supporting Evidence', supporting: ['Pending analysis'],
        contradictingLabel: 'Contradicting Evidence', contradicting: ['Pending analysis']
      },
      {
        tier: 'n3', direction: 'downside',
        title: 'N3: Risk/Downside',
        statusClass: 'watching', statusText: 'Watching &mdash; Pending Analysis',
        score: '?', scoreWidth: '0%', scoreMeta: 'Pending',
        description: 'Placeholder hypothesis. Requires analyst research to populate.',
        requires: null,
        supportingLabel: 'Supporting Evidence', supporting: ['Pending analysis'],
        contradictingLabel: 'Contradicting Evidence', contradicting: ['Pending analysis']
      },
      {
        tier: 'n4', direction: 'downside',
        title: 'N4: Disruption/Catalyst',
        statusClass: 'watching', statusText: 'Watching &mdash; Pending Analysis',
        score: '?', scoreWidth: '0%', scoreMeta: 'Pending',
        description: 'Placeholder hypothesis. Requires analyst research to populate.',
        requires: null,
        supportingLabel: 'Supporting Evidence', supporting: ['Pending analysis'],
        contradictingLabel: 'Contradicting Evidence', contradicting: ['Pending analysis']
      }
    ],

    // Narrative (placeholder)
    narrative: {
      theNarrative: `${company} has been auto-added to the Continuum Intelligence coverage universe. Full narrative analysis with competing hypotheses, evidence assessment, and discriminating data points is pending.`,
      priceImplication: {
        label: `Coverage Initiated &mdash; ${short}`,
        content: 'Full price implication analysis pending. Hypothesis framework requires analyst research before embedded assumptions can be identified.'
      },
      evidenceCheck: 'Pending analyst research.',
      narrativeStability: 'Not yet assessed.'
    },

    // Evidence (placeholder)
    evidence: {
      intro: `Evidence assessment pending. Stock was auto-added to coverage on ${today}.`,
      cards: [],
      alignmentSummary: null
    },

    // Discriminators (placeholder)
    discriminators: {
      intro: 'Discriminating evidence pending analyst research.',
      rows: [],
      nonDiscriminating: null
    },

    // Tripwires (placeholder)
    tripwires: {
      intro: 'Tripwires pending analyst research.',
      cards: []
    },

    // Gaps
    gaps: {
      coverageRows: [],
      couldntAssess: ['Full evidence assessment pending &mdash; stock was auto-added to coverage.'],
      analyticalLimitations: 'This stock was auto-added. All hypothesis scores, evidence assessments, and narrative analysis require manual research and population.'
    },

    // Footer
    footer: {
      disclaimer: 'This report does not constitute personal financial advice. Continuum Intelligence synthesises cross-domain evidence using the Analysis of Competing Hypotheses (ACH) methodology. All factual claims are sourced from ASX filings, company disclosures, broker consensus data, and publicly available information.',
      domainCount: '0 of 10',
      hypothesesCount: '4 Pending'
    }
  };

  if (!fs.existsSync(RESEARCH_DIR)) fs.mkdirSync(RESEARCH_DIR, { recursive: true });
  writeJson(researchFile, researchData);
  console.log(`  [OK] Created data/research/${ticker}.json`);
}

// ============================================================
// FRESHNESS JSON UPDATE (data/freshness.json)
// ============================================================

function addFreshnessEntry(ticker, price) {
  const freshness = readJson(FRESHNESS_PATH) || {};

  if (freshness[ticker]) {
    console.log(`  [WARN] ${ticker} already exists in freshness.json -- updating`);
  }

  freshness[ticker] = {
    reviewDate: new Date().toISOString(),
    daysSinceReview: 0,
    priceAtReview: price,
    pricePctChange: 0,
    nearestCatalyst: null,
    nearestCatalystDate: null,
    nearestCatalystDays: null,
    urgency: 0,
    status: 'OK',
    badge: 'ok'
  };

  try {
    writeJson(FRESHNESS_PATH, freshness);
    console.log(`  [OK] freshness.json updated: ${ticker}`);
  } catch (e) {
    console.error(`  [ERROR] Failed to write freshness.json: ${e.message}`);
  }
}

// ============================================================
// REFERENCE JSON UPDATE (data/reference.json)
// ============================================================

function addReferenceEntry(ticker, marketData) {
  const reference = readJson(REFERENCE_PATH) || {};
  const price = marketData.currentPrice;

  if (reference[ticker]) {
    console.log(`  [WARN] ${ticker} already exists in reference.json -- updating`);
  }

  const sharesM = marketData.sharesOutstanding ? Math.round(marketData.sharesOutstanding / 1e6) : null;
  const marketCapStr = sharesM ? (sharesM * price / 1000).toFixed(1) + 'B' : null;

  reference[ticker] = {
    sharesOutstanding: sharesM || null,
    analystTarget: null,
    analystBuys: null,
    analystHolds: null,
    analystSells: null,
    analystCount: null,
    epsTrailing: null,
    epsForward: null,
    divPerShare: null,
    reportingCurrency: marketData.currency,
    revenue: null,
    _anchors: {
      price: price,
      marketCapStr: marketCapStr || null,
      pe: null,
      divYield: null
    }
  };

  try {
    writeJson(REFERENCE_PATH, reference);
    console.log(`  [OK] reference.json updated: ${ticker}`);
  } catch (e) {
    console.error(`  [ERROR] Failed to write reference.json: ${e.message}`);
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('=== Continuum Intelligence -- Add Stock ===\n');

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
    console.log(`  [WARN] No Yahoo session: ${e.message} -- trying without auth`);
  }

  const marketData = await fetchMarketData(ticker, session);
  console.log(`  Price: ${marketData.currency}${marketData.currentPrice}`);
  console.log(`  52w Range: ${marketData.currency}${marketData.yearLow} - ${marketData.currency}${marketData.yearHigh}`);
  console.log(`  History: ${marketData.priceHistory.length} data points\n`);

  // 2. Update registry
  console.log('Step 2: Updating central registry...');
  updateRegistry(ticker, company, sector, sectorSub, marketData);

  // 3. Create stock JSON (data/stocks/)
  console.log('\nStep 3: Creating stock data file...');
  createStockJSON(ticker, company, sector, marketData);

  // 4. Create research JSON (data/research/)
  console.log('\nStep 4: Creating research data file...');
  createResearchJSON(ticker, company, sector, sectorSub, marketData);

  // 5. Add freshness entry (data/freshness.json)
  console.log('\nStep 5: Adding freshness entry...');
  addFreshnessEntry(ticker, marketData.currentPrice);

  // 6. Add reference entry (data/reference.json)
  console.log('\nStep 6: Adding reference entry...');
  addReferenceEntry(ticker, marketData);

  // 7. Summary
  console.log('\n=== Summary ===');
  console.log(`  Registry:    data/config/tickers.json    [UPDATED]`);
  console.log(`  Stock JSON:  data/stocks/${ticker}.json   [CREATED]`);
  console.log(`  Research:    data/research/${ticker}.json  [CREATED]`);
  console.log(`  Freshness:   data/freshness.json          [UPDATED]`);
  console.log(`  Reference:   data/reference.json           [UPDATED]`);
  console.log(`\nThe following are handled dynamically at runtime:`);
  console.log(`  - Stock card in thesis comparator grid`);
  console.log(`  - SNAPSHOT_ORDER & FEATURED_ORDER`);
  console.log(`  - page-report-${ticker} and page-snapshot-${ticker} divs`);
  console.log(`  - Price fetching (all scripts read from registry)`);
  console.log(`\nNext steps:`);
  console.log(`  1. Review and commit changes`);
  console.log(`  2. Push to trigger automated deploy`);
  console.log(`  3. Populate data/research/${ticker}.json with proper hypothesis analysis`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
