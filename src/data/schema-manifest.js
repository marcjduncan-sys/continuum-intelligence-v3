/**
 * Schema Manifest -- canonical contract between backend and frontend data layers.
 *
 * BEAD-003 (Bug Family 4: Frontend/Backend Schema Mismatches).
 *
 * This file is the single source of truth for:
 *   1. Which data files the frontend expects (per-ticker and global)
 *   2. Which pages/features consume each file
 *   3. Which fields are required for each file
 *   4. Whether a missing file is critical (breaks page) or optional (degrades gracefully)
 *   5. Who generates each file (backend endpoint, GitHub Actions, or script)
 *
 * When the backend onboards a new ticker, it MUST create every file listed in
 * PER_TICKER_FILES. The frontend MUST log an explicit error (not swallow silently)
 * when any file fetch fails.
 */

// ============================================================
// PER-TICKER FILES
// ============================================================

/**
 * Files expected per ticker. critical=true means the report page will be
 * visually broken without this file.
 */
export const PER_TICKER_FILES = [
  {
    name: 'research',
    pathTemplate: 'data/research/{TICKER}.json',
    critical: true,
    generatedBy: 'api/main.py add_stock() + api/refresh.py _save_research()',
    description: 'Full research report: hypotheses, evidence, narrative, verdict, hero, tripwires',
    consumers: ['report-page', 'home-featured', 'home-coverage', 'snapshot'],
  },
  {
    name: 'stocks',
    pathTemplate: 'data/stocks/{TICKER}.json',
    critical: false,
    generatedBy: 'api/main.py add_stock() build_stocks_entry()',
    description: 'Signal fields: three_layer_signal, valuation_range, price_signals',
    consumers: ['report-page-signals', 'home-featured-signal'],
  },
  {
    name: 'stocks-history',
    pathTemplate: 'data/stocks/{TICKER}-history.json',
    critical: false,
    generatedBy: 'scripts/backfill-history.js (GitHub Actions)',
    description: 'Narrative timeline: 60-day price + hypothesis score history for Chart.js',
    consumers: ['report-page-timeline'],
  },
];

// ============================================================
// GLOBAL FILES -- loaded at boot
// ============================================================

/**
 * Global data files loaded by boot() in src/main.js via Promise.all().
 * Order matches the fetch array in main.js:206-211.
 */
export const BOOT_FILES = [
  {
    name: 'index',
    path: 'data/research/_index.json',
    critical: true,
    generatedBy: 'api/main.py add_stock() + api/refresh.py _update_index()',
    description: 'Ticker index: lightweight summary per stock for home page rendering',
    consumers: ['home-featured', 'home-coverage', 'sidebar', 'router'],
    errorImpact: 'STOCK_DATA empty; home page shows no tickers',
  },
  {
    name: 'reference',
    path: 'data/reference.json',
    critical: true,
    generatedBy: 'api/main.py add_stock()',
    description: 'Company metadata: archetype, sharesOutstanding, EPS, divPerShare, analystTarget, anchors',
    consumers: ['report-page-metrics', 'home-archetype', 'dynamics-hydration'],
    errorImpact: 'All price-derived metrics (P/E, market cap, dividend yield) render as null',
  },
  {
    name: 'freshness',
    path: 'data/freshness.json',
    critical: false,
    generatedBy: 'api/main.py add_stock()',
    description: 'Per-ticker timestamps: priceAtReview, last_refresh_completed',
    consumers: ['home-freshness-badges', 'report-price-change'],
    errorImpact: 'Freshness badges not shown; no visual break',
  },
  {
    name: 'tc',
    path: 'data/tc.json',
    critical: false,
    generatedBy: 'Unknown (thesis comparator data)',
    description: 'Thesis comparator data per ticker',
    consumers: ['thesis-page'],
    errorImpact: 'Thesis comparator unavailable; no visual break',
  },
  {
    name: 'announcements',
    path: 'data/announcements.json',
    critical: false,
    generatedBy: 'scripts/fetch-announcements.js (GitHub Actions continuum-update.yml)',
    description: 'ASX announcements per ticker: headline, type, date, sensitivity',
    consumers: ['announcements-panel', 'market-feed'],
    errorImpact: 'Announcements panel hidden; no visual break',
  },
];

// ============================================================
// POLLING FILES -- fetched periodically after boot
// ============================================================

export const POLLING_FILES = [
  {
    name: 'live-prices',
    path: 'data/live-prices.json',
    critical: false,
    generatedBy: 'scripts/fetch-live-prices.js (GitHub Actions update-intraday.yml, every 15min)',
    description: 'Per-ticker live price: p, pc, c, cp, v, ms, cur',
    consumers: ['market-feed', 'home-price-ticker', 'report-hero-price'],
    pollInterval: '60s during market hours, 15min when closed',
    errorImpact: 'Static prices shown; app fully functional',
  },
];

// ============================================================
// COMBINED GLOBAL FILES (boot + polling)
// ============================================================

/** All global files the frontend expects, regardless of load timing. */
export const GLOBAL_FILES = [...BOOT_FILES, ...POLLING_FILES];

// ============================================================
// REQUIRED FIELDS PER FILE TYPE
// ============================================================

/** Required fields in data/research/{TICKER}.json for a valid report render. */
export const REQUIRED_RESEARCH_FIELDS = [
  'company',
  'ticker',
  'hypotheses',
  'hero',
];

/** Required fields in data/stocks/{TICKER}.json. */
export const REQUIRED_STOCKS_FIELDS = [
  'three_layer_signal',
  'valuation_range',
  'price_signals',
];

/** Required fields in data/research/_index.json per-ticker entry. */
export const REQUIRED_INDEX_FIELDS = [
  'ticker',
  'company',
  'sector',
];

/** Required fields in data/reference.json per-ticker entry. */
export const REQUIRED_REFERENCE_FIELDS = [
  'ticker',
  'company',
  'sector',
];

/** Required fields in data/live-prices.json.prices per-ticker entry. */
export const REQUIRED_PRICE_FIELDS = [
  'p',   // price
  'pc',  // previous close
];

// ============================================================
// PAGE -> FILE DEPENDENCY MAP
// ============================================================

/**
 * Which files each page/feature requires.
 * Use this to determine degraded-state rendering when files are missing.
 */
export const PAGE_DEPENDENCIES = {
  'home': {
    required: ['index', 'reference'],
    optional: ['freshness', 'live-prices', 'announcements'],
  },
  'report': {
    required: ['research'],
    optional: ['stocks', 'stocks-history', 'reference', 'live-prices'],
  },
  'thesis': {
    required: ['index'],
    optional: ['tc'],
  },
  'portfolio': {
    required: ['index'],
    optional: ['reference', 'live-prices'],
  },
  'chat': {
    required: ['index'],
    optional: ['reference'],
  },
};

// ============================================================
// HELPERS
// ============================================================

/**
 * Build the expected file path for a given ticker and manifest entry.
 * @param {string} ticker
 * @param {{ pathTemplate: string }} entry
 * @returns {string}
 */
export function buildTickerPath(ticker, entry) {
  return entry.pathTemplate.replace('{TICKER}', ticker);
}

/**
 * Validate that a research JSON object contains all required fields.
 * Returns an array of missing field names (empty = valid).
 * @param {object} data
 * @returns {string[]}
 */
export function validateResearchFields(data) {
  if (!data || typeof data !== 'object') return REQUIRED_RESEARCH_FIELDS.slice();
  return REQUIRED_RESEARCH_FIELDS.filter(function(f) { return !(f in data); });
}

/**
 * Validate that a reference entry contains all required fields.
 * @param {object} data
 * @returns {string[]}
 */
export function validateReferenceFields(data) {
  if (!data || typeof data !== 'object') return REQUIRED_REFERENCE_FIELDS.slice();
  return REQUIRED_REFERENCE_FIELDS.filter(function(f) { return !(f in data); });
}
