#!/usr/bin/env node
/**
 * add-stock.js
 *
 * Automated stock addition to Continuum Intelligence coverage universe.
 * Fetches market data from Yahoo Finance and injects a new ticker into
 * all required files: scripts, data/stocks, and index.html.
 *
 * Usage:
 *   node scripts/add-stock.js --ticker DXS --company "Dexus" --sector "Real Estate"
 *
 * Or via environment variables (for GitHub Actions):
 *   STOCK_TICKER=DXS STOCK_COMPANY="Dexus" STOCK_SECTOR="Real Estate" node scripts/add-stock.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ============================================================
// CONFIGURATION
// ============================================================

const ROOT = path.join(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const SCRIPTS = {
  updatePrices:     path.join(ROOT, 'scripts', 'update-prices.js'),
  fetchLivePrices:  path.join(ROOT, 'scripts', 'fetch-live-prices.js'),
  fetchAnnouncements: path.join(ROOT, 'scripts', 'fetch-announcements.js'),
  eventScraper:     path.join(ROOT, 'scripts', 'event-scraper.js'),
  runAnalysis:      path.join(ROOT, 'scripts', 'run-automated-analysis.js'),
};
const STOCK_DATA_DIR = path.join(ROOT, 'data', 'stocks');

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
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/json,*/*',
        ...options.headers
      },
      timeout: 15000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location, options).then(resolve).catch(reject);
      }
      let data = '';
      const cookies = res.headers['set-cookie'] || [];
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ body: data, cookies, statusCode: res.statusCode }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function getYahooCrumb() {
  const res1 = await httpGet('https://fc.yahoo.com/curveball');
  const cookieStr = (res1.cookies || []).map(c => c.split(';')[0]).join('; ');
  const res2 = await httpGet('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { Cookie: cookieStr }
  });
  return { crumb: res2.body, cookie: cookieStr };
}

async function fetchQuote(tickerAX) {
  try {
    const { crumb, cookie } = await getYahooCrumb();
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(tickerAX)}?modules=price,defaultKeyStatistics,financialData,summaryDetail&crumb=${encodeURIComponent(crumb)}`;
    const res = await httpGet(url, { headers: { Cookie: cookie } });
    const json = JSON.parse(res.body);
    const result = json.quoteSummary?.result?.[0];
    if (!result) throw new Error('No quote data returned');
    return result;
  } catch (e) {
    console.warn(`  ⚠ Yahoo Finance fetch failed: ${e.message}`);
    return null;
  }
}

async function fetchPriceHistory(tickerAX) {
  try {
    const { crumb, cookie } = await getYahooCrumb();
    const now = Math.floor(Date.now() / 1000);
    const oneYearAgo = now - 365 * 24 * 60 * 60;
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(tickerAX)}?period1=${oneYearAgo}&period2=${now}&interval=1d&crumb=${encodeURIComponent(crumb)}`;
    const res = await httpGet(url, { headers: { Cookie: cookie } });
    const json = JSON.parse(res.body);
    const closes = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    if (!closes) return [];
    return closes.filter(p => p != null).map(p => Math.round(p * 100) / 100);
  } catch (e) {
    console.warn(`  ⚠ Price history fetch failed: ${e.message}`);
    return [];
  }
}

function extractQuoteData(quote) {
  const price = quote?.price;
  const stats = quote?.defaultKeyStatistics;
  const financial = quote?.financialData;
  const summary = quote?.summaryDetail;

  const currentPrice = price?.regularMarketPrice?.raw || 0;
  const sharesOut = stats?.sharesOutstanding?.raw || price?.marketCap?.raw / currentPrice || 0;
  const sharesMillions = Math.round(sharesOut / 1e6);
  const marketCap = price?.marketCap?.raw || 0;
  const eps = stats?.trailingEps?.raw || summary?.trailingPE?.raw ? currentPrice / summary?.trailingPE?.raw : null;
  const divPerShare = summary?.dividendRate?.raw || 0;
  const divYield = summary?.dividendYield?.raw ? (summary.dividendYield.raw * 100) : 0;
  const pe = summary?.trailingPE?.raw || null;
  const high52 = summary?.fiftyTwoWeekHigh?.raw || currentPrice;
  const low52 = summary?.fiftyTwoWeekLow?.raw || currentPrice;
  const targetPrice = financial?.targetMeanPrice?.raw || null;
  const analystCount = financial?.numberOfAnalystOpinions?.raw || null;
  const beta = summary?.beta?.raw || null;

  function fmtCap(val) {
    if (val >= 1e12) return (val / 1e12).toFixed(1) + 'T';
    if (val >= 1e9) return (val / 1e9).toFixed(1) + 'B';
    if (val >= 1e6) return (val / 1e6).toFixed(0) + 'M';
    return val.toString();
  }

  return {
    currentPrice: Math.round(currentPrice * 100) / 100,
    sharesMillions,
    marketCapStr: fmtCap(marketCap),
    marketCapRaw: marketCap,
    eps: eps ? Math.round(eps * 1000) / 1000 : null,
    pe: pe ? Math.round(pe * 10) / 10 : null,
    divPerShare: Math.round(divPerShare * 100) / 100,
    divYield: Math.round(divYield * 10) / 10,
    high52: Math.round(high52 * 100) / 100,
    low52: Math.round(low52 * 100) / 100,
    targetPrice: targetPrice ? Math.round(targetPrice * 100) / 100 : null,
    analystCount,
    beta,
    currency: price?.currency === 'AUD' ? 'A$' : price?.currency || 'A$',
    shortName: price?.shortName || '',
    longName: price?.longName || '',
  };
}

// ============================================================
// FILE INJECTION FUNCTIONS
// ============================================================

function addToTickerArray(filePath, ticker, suffix, varPattern) {
  let content = fs.readFileSync(filePath, 'utf8');
  const tickerStr = suffix ? `'${ticker}${suffix}'` : `'${ticker}'`;

  // Check if already present
  if (content.includes(tickerStr)) {
    console.log(`  ✓ ${path.basename(filePath)}: already has ${tickerStr}`);
    return false;
  }

  // Find the array and add the ticker before the closing bracket
  // Match patterns like: 'GYG.AX'\n]; or 'GYG'\n];
  const lastTickerRegex = suffix
    ? new RegExp(`('\\w+\\${suffix}'\\s*\\n\\];)`)
    : new RegExp(`('\\w+'\\s*\\n\\];)`);

  // More robust: find the last line of the array
  const lines = content.split('\n');
  let injected = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Look for the variable declaration pattern
    if (line.includes(varPattern)) {
      // Find the closing ];
      for (let j = i; j < lines.length; j++) {
        if (lines[j].trim() === '];') {
          // Previous line has the last ticker — add a comma and new entry
          const prevLine = lines[j - 1];
          const indent = prevLine.match(/^(\s*)/)[1];
          // Ensure previous line ends with comma
          if (!prevLine.trimEnd().endsWith(',')) {
            lines[j - 1] = prevLine.trimEnd() + ',';
          }
          lines.splice(j, 0, `${indent}${tickerStr}`);
          injected = true;
          break;
        }
      }
      break;
    }
  }

  if (injected) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    console.log(`  ✓ ${path.basename(filePath)}: added ${tickerStr}`);
    return true;
  }

  console.warn(`  ⚠ ${path.basename(filePath)}: could not find injection point for ${varPattern}`);
  return false;
}

function addToStockConfig(filePath, ticker, data, sector) {
  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes(`  ${ticker}: {`)) {
    console.log(`  ✓ ${path.basename(filePath)}: already has ${ticker} config`);
    return false;
  }

  // Generate sector-appropriate hypotheses
  const hypotheses = generateHypothesisNames(sector);

  const configBlock = `  ${ticker}: {
    peakPrice: ${data.high52},
    low52Week: ${data.low52},
    high52Week: ${data.high52},
    baseWeights: { T1: 50, T2: 35, T3: 30, T4: 35 },
    characteristics: { highMultiple: ${data.pe && data.pe > 30 ? 'true' : 'false'}, growthStock: false, hasAIExposure: false },
    hypothesisNames: {
      T1: '${hypotheses.T1}',
      T2: '${hypotheses.T2}',
      T3: '${hypotheses.T3}',
      T4: '${hypotheses.T4}'
    }
  }`;

  // Insert before the closing };
  const closingIndex = content.lastIndexOf('};');
  if (closingIndex === -1) {
    console.warn(`  ⚠ ${path.basename(filePath)}: could not find closing };`);
    return false;
  }

  // Find the end of the last entry (look for the line with just "  }")
  const before = content.substring(0, closingIndex);
  content = before + `,\n${configBlock}\n` + content.substring(closingIndex);

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`  ✓ ${path.basename(filePath)}: added ${ticker} config`);
  return true;
}

function generateHypothesisNames(sector) {
  const sectorLower = (sector || '').toLowerCase();

  if (sectorLower.includes('real estate') || sectorLower.includes('reit') || sectorLower.includes('property')) {
    return { T1: 'Market Recovery', T2: 'Valuation Risk', T3: 'Structural Headwinds', T4: 'Interest Rate Risk' };
  }
  if (sectorLower.includes('tech') || sectorLower.includes('software') || sectorLower.includes('information')) {
    return { T1: 'Platform Growth', T2: 'Valuation Compression', T3: 'Competitive Disruption', T4: 'AI Transformation' };
  }
  if (sectorLower.includes('health') || sectorLower.includes('pharma') || sectorLower.includes('biotech')) {
    return { T1: 'Pipeline Delivery', T2: 'Multiple Compression', T3: 'Competitive Threat', T4: 'Regulatory Risk' };
  }
  if (sectorLower.includes('material') || sectorLower.includes('mining') || sectorLower.includes('resource')) {
    return { T1: 'Volume & Price', T2: 'Commodity Cycle Risk', T3: 'Cost Inflation', T4: 'ESG Transition Risk' };
  }
  if (sectorLower.includes('energy') || sectorLower.includes('oil') || sectorLower.includes('gas')) {
    return { T1: 'Production Growth', T2: 'Commodity Price Risk', T3: 'Energy Transition', T4: 'Capital Allocation' };
  }
  if (sectorLower.includes('financial') || sectorLower.includes('bank') || sectorLower.includes('insurance')) {
    return { T1: 'Earnings Growth', T2: 'Margin Compression', T3: 'Credit Risk', T4: 'Regulatory Tightening' };
  }
  if (sectorLower.includes('consumer') || sectorLower.includes('retail') || sectorLower.includes('food')) {
    return { T1: 'Revenue Growth', T2: 'Margin Erosion', T3: 'Competitive Pressure', T4: 'Consumer Weakness' };
  }
  if (sectorLower.includes('industrial') || sectorLower.includes('defence') || sectorLower.includes('defense')) {
    return { T1: 'Contract Pipeline', T2: 'Execution Risk', T3: 'Competition Intensifies', T4: 'Supply Chain Risk' };
  }

  // Default
  return { T1: 'Growth Thesis', T2: 'Valuation Risk', T3: 'Competitive Pressure', T4: 'Macro Headwinds' };
}

function createStockDataJson(ticker, data, sector, priceHistory) {
  const filePath = path.join(STOCK_DATA_DIR, `${ticker}.json`);

  if (fs.existsSync(filePath)) {
    console.log(`  ✓ ${ticker}.json: already exists`);
    return false;
  }

  const hypotheses = generateHypothesisNames(sector);
  const now = new Date().toISOString();

  const stockData = {
    ticker: `${ticker}.AX`,
    company: data.longName || data.shortName || ticker,
    sector: sector,
    market_cap: data.marketCapStr,
    hypotheses: {
      T1: {
        label: 'Growth/Recovery',
        description: hypotheses.T1,
        plain_english: `Placeholder — requires analyst research to populate.`,
        what_to_watch: 'Upcoming earnings results and key operational metrics.',
        upside: null,
        risk_plain: null,
        survival_score: 0.40,
        status: 'MODERATE',
        weighted_inconsistency: 3.0,
        last_updated: now,
      },
      T2: {
        label: 'Managed/Base Case',
        description: hypotheses.T2,
        plain_english: `Placeholder — requires analyst research to populate.`,
        what_to_watch: 'Earnings guidance and consensus estimates.',
        upside: null,
        risk_plain: null,
        survival_score: 0.55,
        status: 'MODERATE',
        weighted_inconsistency: 2.0,
        last_updated: now,
      },
      T3: {
        label: 'Risk/Downside',
        description: hypotheses.T3,
        plain_english: `Placeholder — requires analyst research to populate.`,
        what_to_watch: 'Competitive dynamics and industry trends.',
        upside: null,
        risk_plain: null,
        survival_score: 0.30,
        status: 'LOW',
        weighted_inconsistency: 4.5,
        last_updated: now,
      },
      T4: {
        label: 'Disruption',
        description: hypotheses.T4,
        plain_english: `Placeholder — requires analyst research to populate.`,
        what_to_watch: 'Macro conditions and regulatory developments.',
        upside: null,
        risk_plain: null,
        survival_score: 0.20,
        status: 'VERY_LOW',
        weighted_inconsistency: 6.0,
        last_updated: now,
      },
    },
    dominant: 'T2',
    confidence: 'LOW',
    alert_state: 'NORMAL',
    alert_started: null,
    current_price: data.currentPrice,
    big_picture: `${data.longName || data.shortName || ticker} (ASX: ${ticker}) — auto-added to coverage. Narrative analysis pending.`,
    last_flip: null,
    narrative_history: [],
    evidence_items: [],
    price_signals: [],
    editorial_override: null,
    price_history: priceHistory.length > 0 ? priceHistory : [data.currentPrice],
    weighting: null,
  };

  fs.mkdirSync(STOCK_DATA_DIR, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(stockData, null, 2) + '\n', 'utf8');
  console.log(`  ✓ ${ticker}.json: created`);
  return true;
}

function addToIndexHtml(ticker, company, sector, sectorSub, data, priceHistory) {
  let html = fs.readFileSync(INDEX_PATH, 'utf8');

  if (html.includes(`STOCK_DATA.${ticker}`)) {
    console.log(`  ✓ index.html: already has STOCK_DATA.${ticker}`);
    return false;
  }

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  const isoDate = today.toISOString().split('T')[0];
  const hypotheses = generateHypothesisNames(sector);

  // 1. FRESHNESS_DATA — inject before the closing };  // === END FRESHNESS_DATA ===
  const freshnessEntry = `  "${ticker}": {
    "reviewDate": "${dateStr}",
    "daysSinceReview": 0,
    "priceAtReview": ${data.currentPrice},
    "pricePctChange": 0,
    "nearestCatalyst": null,
    "nearestCatalystDate": null,
    "nearestCatalystDays": null,
    "urgency": 0,
    "status": "OK",
    "badge": "ok"
  }`;

  // Use function callbacks to avoid $' and $& special patterns in replacement strings
  html = html.replace(
    /(\n\};?\s*\n\/\/ === END FRESHNESS_DATA ===)/,
    function() { return `,\n${freshnessEntry}\n};\n// === END FRESHNESS_DATA ===`; }
  );

  // 2. REFERENCE_DATA — inject before the closing };  // === END REFERENCE_DATA ===
  const fmtPE = data.pe ? `${data.pe}` : 'null';
  const referenceEntry = `  ${ticker}: {
    sharesOutstanding: ${data.sharesMillions},${' '.repeat(Math.max(0, 6 - String(data.sharesMillions).length))}// millions
    analystTarget: ${data.targetPrice || 'null'},
    analystBuys: null, analystHolds: null, analystSells: null,
    analystCount: ${data.analystCount || 'null'},
    epsTrailing: ${data.eps || 'null'},
    epsForward: null,
    divPerShare: ${data.divPerShare},
    reportingCurrency: '${data.currency}',
    revenue: null,
    _anchors: { price: ${data.currentPrice}, marketCapStr: '${data.marketCapStr}', pe: ${fmtPE}, divYield: ${data.divYield} }
  }`;

  html = html.replace(
    /(\n\};?\s*\n\/\/ === END REFERENCE_DATA ===)/,
    function() { return `,\n${referenceEntry}\n};\n// === END REFERENCE_DATA ===`; }
  );

  // 3. SNAPSHOT_ORDER — append ticker
  html = html.replace(
    /const SNAPSHOT_ORDER = \[([^\]]+)\];/,
    (match, inner) => {
      if (inner.includes(`'${ticker}'`)) return match;
      return `const SNAPSHOT_ORDER = [${inner.trim()}, '${ticker}'];`;
    }
  );

  // 4. Stock selection grid — add card before closing </div>
  const cardHtml = `                    <div class="tc-stock-card" data-ticker="${ticker}" onclick="tcSelectStock('${ticker}')"><div class="tc-stock-ticker">${ticker}</div><div class="tc-stock-name">${company}</div></div>`;

  html = html.replace(
    /(<div class="tc-stock-card" data-ticker="\w+" onclick="tcSelectStock\('\w+'\)"><div class="tc-stock-ticker">\w+<\/div><div class="tc-stock-name">[^<]+<\/div><\/div>\s*\n)(\s*<\/div>\s*\n\s*<\/div>\s*\n\s*<div class="tc-input-step")/,
    `$1${cardHtml}\n$2`
  );

  // 5. STOCK_DATA entry — inject before the auto-populate SNAPSHOT_DATA block
  const peStr = data.pe ? `'~${Math.round(data.pe)}x'` : `'N/A'`;
  const peColor = data.pe && data.pe > 30 ? 'premium' : (data.pe && data.pe < 15 ? 'positive' : '');
  const divYieldStr = data.divYield > 0 ? `'${data.divYield}%'` : `'N/A'`;
  const divColor = data.divYield > 4 ? 'positive' : '';
  const priceHistoryStr = priceHistory.length > 0
    ? priceHistory.map(p => p.toString()).join(', ')
    : data.currentPrice.toString();

  const drawdownPct = data.high52 > 0
    ? Math.round((1 - data.currentPrice / data.high52) * 100)
    : 0;
  const priceColor = drawdownPct > 15 ? 'var(--signal-red)' : (drawdownPct > 5 ? 'var(--signal-amber)' : '');

  const stockDataEntry = `
// ============================================================
// ${ticker} — ${company}
// ============================================================

STOCK_DATA.${ticker} = {
  // Meta
  ticker: '${ticker}',
  tickerFull: '${ticker}.AX',
  exchange: 'ASX',
  company: '${company}',
  sector: '${sector}',
  sectorSub: '${sectorSub || sector}',
  price: ${data.currentPrice},
  currency: '${data.currency}',
  date: '${dateStr}',
  reportId: '${ticker}-2026-001',
  priceHistory: [${priceHistoryStr}],

  // Hero - right side metrics
  heroDescription: '${sector} &bull; ASX-Listed',
  heroCompanyDescription: '${company} (ASX: ${ticker}) — auto-added to Continuum Intelligence coverage. Full narrative analysis pending.',
  heroMetrics: [
    { label: 'Mkt Cap', value: '${data.currency}${data.marketCapStr}', colorClass: '' },
    { label: 'P/E', value: ${peStr}, colorClass: '${peColor}' },
    { label: 'Div Yield', value: ${divYieldStr}, colorClass: '${divColor}' }
  ],

  // Skew
  skew: { direction: 'neutral', rationale: 'Auto-added stock. Narrative analysis pending. Skew assessment requires analyst research.' },

  // Verdict
  verdict: {
    text: '${company} has been added to coverage. Trading at <span class="key-stat">${data.currency}${data.currentPrice}</span>. Full narrative analysis with competing hypotheses is pending.',
    borderColor: null,
    scores: [
      { label: 'T1 ${hypotheses.T1}', score: '?', scoreColor: 'var(--text-muted)', dirArrow: '&rarr;', dirText: 'Pending', dirColor: null },
      { label: 'T2 ${hypotheses.T2}', score: '?', scoreColor: 'var(--text-muted)', dirArrow: '&rarr;', dirText: 'Pending', dirColor: null },
      { label: 'T3 ${hypotheses.T3}', score: '?', scoreColor: 'var(--text-muted)', dirArrow: '&rarr;', dirText: 'Pending', dirColor: null },
      { label: 'T4 ${hypotheses.T4}', score: '?', scoreColor: 'var(--text-muted)', dirArrow: '&rarr;', dirText: 'Pending', dirColor: null }
    ]
  },

  // Featured card metrics (for home page)
  featuredMetrics: [
    { label: 'Mkt Cap', value: '${data.currency}${data.marketCapStr}', color: '' },
    { label: 'P/E', value: ${peStr}, color: '' },
    { label: 'Div Yield', value: ${divYieldStr}, color: '${data.divYield > 4 ? 'var(--signal-green)' : ''}' }
  ],
  featuredPriceColor: '${priceColor}',
  featuredRationale: 'Auto-added to coverage. Full narrative analysis pending.',

  // Identity section
  identity: {
    rows: [
      [['Ticker', '${ticker}.AX', 'td-mono'], ['Exchange', 'ASX', 'td-mono']],
      [['Market Cap', '${data.currency}${data.marketCapStr}', 'td-mono'], ['Sector', '${sector}', 'td-mono']],
      [['Share Price', '${data.currency}${data.currentPrice}', 'td-mono'], ['52-Week Range', '${data.currency}${data.low52} &ndash; ${data.currency}${data.high52}', 'td-mono']]
    ],
    overview: '${company} (ASX: ${ticker}) — auto-added to coverage. Full company overview pending analyst research.'
  },

  // Hypotheses (placeholder — requires analyst research)
  hypotheses: [
    {
      tier: 't1', direction: 'upside',
      title: 'T1: ${hypotheses.T1}',
      statusClass: 'watching', statusText: 'Watching &mdash; Pending Analysis',
      score: '?', scoreWidth: '0%', scoreMeta: 'Pending',
      description: 'Placeholder hypothesis. Requires analyst research to populate.',
      requires: null,
      supportingLabel: 'Supporting Evidence', supporting: ['Pending analysis'],
      contradictingLabel: 'Contradicting Evidence', contradicting: ['Pending analysis']
    },
    {
      tier: 't2', direction: 'neutral',
      title: 'T2: ${hypotheses.T2}',
      statusClass: 'watching', statusText: 'Watching &mdash; Pending Analysis',
      score: '?', scoreWidth: '0%', scoreMeta: 'Pending',
      description: 'Placeholder hypothesis. Requires analyst research to populate.',
      requires: null,
      supportingLabel: 'Supporting Evidence', supporting: ['Pending analysis'],
      contradictingLabel: 'Contradicting Evidence', contradicting: ['Pending analysis']
    },
    {
      tier: 't3', direction: 'downside',
      title: 'T3: ${hypotheses.T3}',
      statusClass: 'watching', statusText: 'Watching &mdash; Pending Analysis',
      score: '?', scoreWidth: '0%', scoreMeta: 'Pending',
      description: 'Placeholder hypothesis. Requires analyst research to populate.',
      requires: null,
      supportingLabel: 'Supporting Evidence', supporting: ['Pending analysis'],
      contradictingLabel: 'Contradicting Evidence', contradicting: ['Pending analysis']
    },
    {
      tier: 't4', direction: 'downside',
      title: 'T4: ${hypotheses.T4}',
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
    theNarrative: '${company} has been auto-added to the Continuum Intelligence coverage universe. Full narrative analysis with competing hypotheses, evidence assessment, and discriminating data points is pending.',
    priceImplication: null,
    evidenceCheck: 'Pending analyst research.',
    narrativeStability: 'Not yet assessed.'
  },

  // Evidence (placeholder)
  evidence: {
    intro: 'Evidence assessment pending. Stock was auto-added to coverage on ${dateStr}.',
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
    couldntAssess: ['Full evidence assessment pending — stock was auto-added to coverage.'],
    analyticalLimitations: 'This stock was auto-added. All hypothesis scores, evidence assessments, and narrative analysis require manual research and population.'
  },

  // Footer
  footer: {
    disclaimer: 'This report does not constitute personal financial advice. Continuum Intelligence synthesises cross-domain evidence using the Analysis of Competing Hypotheses (ACH) methodology. All factual claims are sourced from ASX filings, company disclosures, broker consensus data, and publicly available information. This report does not contain buy, sell, or hold recommendations, price targets, or valuation models.',
    domainCount: '0 of 10',
    hypothesesCount: '4 Pending'
  }
};

`;

  // Use function callback to avoid $' and $& special patterns in replacement string
  // (the stockDataEntry contains 'A$' which triggers JS replace $' expansion)
  const MARKER = '// Auto-populate SNAPSHOT_DATA for all stocks in SNAPSHOT_ORDER\n// NOTE: Must run AFTER all STOCK_DATA definitions above';
  html = html.replace(MARKER, function() {
    return stockDataEntry + MARKER;
  });

  // Safety check: ensure file ends with </html> and has no duplicated content after it
  const htmlEndIndex = html.lastIndexOf('</html>');
  if (htmlEndIndex !== -1) {
    html = html.substring(0, htmlEndIndex + '</html>'.length) + '\n';
  }

  // Verify no duplicate </html> tags (indicates corrupted file)
  const htmlTagCount = (html.match(/<\/html>/g) || []).length;
  if (htmlTagCount > 1) {
    console.error(`  ✗ SAFETY CHECK FAILED: Found ${htmlTagCount} </html> tags — file is corrupted. Aborting write.`);
    process.exit(1);
  }

  fs.writeFileSync(INDEX_PATH, html, 'utf8');
  console.log(`  ✓ index.html: added FRESHNESS_DATA, REFERENCE_DATA, SNAPSHOT_ORDER, stock card, STOCK_DATA.${ticker}`);
  return true;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const { ticker, company, sector, sectorSub } = parseArgs();

  if (!ticker || !company) {
    console.error('Usage: node scripts/add-stock.js --ticker XXX --company "Company Name" --sector "Sector"');
    console.error('  or:  STOCK_TICKER=XXX STOCK_COMPANY="Company Name" STOCK_SECTOR="Sector" node scripts/add-stock.js');
    process.exit(1);
  }

  const tickerAX = `${ticker}.AX`;

  console.log('╔' + '═'.repeat(56) + '╗');
  console.log('║  CONTINUUM — Add Stock to Coverage Universe            ║');
  console.log('╚' + '═'.repeat(56) + '╝\n');
  console.log(`  Ticker:  ${tickerAX}`);
  console.log(`  Company: ${company}`);
  console.log(`  Sector:  ${sector}${sectorSub ? ' / ' + sectorSub : ''}`);
  console.log('');

  // Fetch market data
  console.log('── Fetching market data from Yahoo Finance ──');
  const [quote, priceHistory] = await Promise.all([
    fetchQuote(tickerAX),
    fetchPriceHistory(tickerAX),
  ]);

  let data;
  if (quote) {
    data = extractQuoteData(quote);
    console.log(`  ✓ Price: ${data.currency}${data.currentPrice}`);
    console.log(`  ✓ Market Cap: ${data.currency}${data.marketCapStr}`);
    console.log(`  ✓ P/E: ${data.pe || 'N/A'}`);
    console.log(`  ✓ Div Yield: ${data.divYield}%`);
    console.log(`  ✓ 52-Week: ${data.currency}${data.low52} – ${data.currency}${data.high52}`);
    console.log(`  ✓ Price History: ${priceHistory.length} data points`);
  } else {
    console.warn('  ⚠ Could not fetch quote data — using defaults');
    data = {
      currentPrice: 0,
      sharesMillions: 0,
      marketCapStr: '?',
      marketCapRaw: 0,
      eps: null,
      pe: null,
      divPerShare: 0,
      divYield: 0,
      high52: 0,
      low52: 0,
      targetPrice: null,
      analystCount: null,
      beta: null,
      currency: 'A$',
      shortName: company,
      longName: company,
    };
  }
  console.log('');

  // Inject into all files
  console.log('── Updating scripts ──');
  addToTickerArray(SCRIPTS.updatePrices, ticker, '.AX', 'const TICKERS');
  addToTickerArray(SCRIPTS.fetchLivePrices, ticker, '.AX', 'const TICKERS');
  addToTickerArray(SCRIPTS.fetchAnnouncements, ticker, '', 'const TICKERS');
  addToTickerArray(SCRIPTS.eventScraper, ticker, '', 'const COVERAGE_TICKERS');
  console.log('');

  console.log('── Updating analysis config ──');
  addToStockConfig(SCRIPTS.runAnalysis, ticker, data, sector);
  console.log('');

  console.log('── Creating stock data file ──');
  createStockDataJson(ticker, data, sector, priceHistory);
  console.log('');

  console.log('── Updating index.html ──');
  addToIndexHtml(ticker, company, sector, sectorSub, data, priceHistory);
  console.log('');

  console.log('═'.repeat(56));
  console.log(`✓ ${tickerAX} (${company}) added to coverage universe!`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Commit and push to deploy');
  console.log('  2. Populate narrative hypotheses with analyst research');
  console.log('  3. Add evidence items to data/stocks/' + ticker + '.json');
  console.log('═'.repeat(56));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
