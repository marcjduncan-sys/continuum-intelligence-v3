// ============================================================
// STATE.JS -- Centralised state management
// All global data containers and config constants extracted
// from index.html. Provides accessor functions for safe access.
// ============================================================

// --- State containers ---
/** @type {{ [ticker: string]: object }} */
const STOCK_DATA = {};
/** @type {{ [ticker: string]: object }} */
const FRESHNESS_DATA = {};
/** @type {{ [ticker: string]: object }} */
const REFERENCE_DATA = {};
/** @type {{ [ticker: string]: object }} */
const SNAPSHOT_DATA = {};
/** @type {{ [ticker: string]: object }} */
const COVERAGE_DATA = {};
/** @type {{ [ticker: string]: object }} */
const TC_DATA = {};

// --- Config constants ---

// Featured card display order (dynamically derived from STOCK_DATA keys)
// In index.html: const FEATURED_ORDER = Object.keys(STOCK_DATA);
// This is evaluated lazily via a getter since STOCK_DATA is populated at runtime.
export function getFeaturedOrder() {
  return Object.keys(STOCK_DATA);
}

// Proxy-backed array that always reflects current STOCK_DATA keys.
// Modules can import FEATURED_ORDER and call .forEach(), .map(), etc.
export const FEATURED_ORDER = new Proxy([], {
  get(target, prop, receiver) {
    const keys = Object.keys(STOCK_DATA).sort();
    if (prop === 'length') return keys.length;
    if (typeof prop === 'string' && !isNaN(/** @type {any} */(prop))) return keys[Number(prop)];
    const val = keys[prop];
    if (typeof val === 'function') return val.bind(keys);
    return Reflect.get(keys, prop, receiver);
  }
});

// Coming soon stubs (empty array in current codebase)
export const COMING_SOON = [];

// Snapshot display order (dynamically derived from STOCK_DATA keys)
// In index.html: const SNAPSHOT_ORDER = Object.keys(STOCK_DATA);
export function getSnapshotOrder() {
  return Object.keys(STOCK_DATA);
}

// Proxy-backed array that always reflects current STOCK_DATA keys.
export const SNAPSHOT_ORDER = new Proxy([], {
  get(target, prop, receiver) {
    const keys = Object.keys(STOCK_DATA).sort();
    if (prop === 'length') return keys.length;
    if (typeof prop === 'string' && !isNaN(/** @type {any} */(prop))) return keys[Number(prop)];
    const val = keys[prop];
    if (typeof val === 'function') return val.bind(keys);
    return Reflect.get(keys, prop, receiver);
  }
});

// Valid static pages for route validation
export const VALID_STATIC_PAGES = new Set(['home', 'snapshots', 'portfolio', 'thesis', 'personalisation', 'about']);

// --- Accessors ---

/** Get stock data for a single ticker */
export function getStock(ticker) {
  return STOCK_DATA[ticker];
}

/** Get all ticker symbols */
export function getAllTickers() {
  return Object.keys(STOCK_DATA);
}

/** Set stock data for a ticker (full replace) */
export function setStockData(ticker, data) {
  STOCK_DATA[ticker] = data;
}

/** Patch stock data for a ticker (merge) */
export function patchStock(ticker, patch) {
  Object.assign(STOCK_DATA[ticker], patch);
}

/** Get reference data for a ticker */
export function getReference(ticker) {
  return REFERENCE_DATA[ticker];
}

/** Get freshness data for a ticker */
export function getFreshness(ticker) {
  return FRESHNESS_DATA[ticker];
}

/** Get snapshot data for a ticker */
export function getSnapshot(ticker) {
  return SNAPSHOT_DATA[ticker];
}

/** Set snapshot data for a ticker */
export function setSnapshot(ticker, data) {
  SNAPSHOT_DATA[ticker] = data;
}

/** Get coverage data for a ticker */
export function getCoverage(ticker) {
  return COVERAGE_DATA[ticker];
}

/** Get TC (Thesis Comparator) data for a ticker */
export function getTcData(ticker) {
  return TC_DATA[ticker];
}

// --- Bulk initialisation ---

/** Merge data into STOCK_DATA */
export function initStockData(data) {
  Object.assign(STOCK_DATA, data);
}

/** Merge data into REFERENCE_DATA */
export function initReferenceData(data) {
  Object.assign(REFERENCE_DATA, data);
}

/** Merge data into FRESHNESS_DATA */
export function initFreshnessData(data) {
  Object.assign(FRESHNESS_DATA, data);
}

/** Merge data into SNAPSHOT_DATA */
export function initSnapshotData(data) {
  Object.assign(SNAPSHOT_DATA, data);
}

/** Merge data into COVERAGE_DATA */
export function initCoverageData(data) {
  Object.assign(COVERAGE_DATA, data);
}

/** Merge data into TC_DATA */
export function initTcData(data) {
  Object.assign(TC_DATA, data);
}

// --- Export raw objects for backward compatibility ---
export {
  STOCK_DATA,
  FRESHNESS_DATA,
  REFERENCE_DATA,
  SNAPSHOT_DATA,
  COVERAGE_DATA,
  TC_DATA
};
// Note: FEATURED_ORDER, SNAPSHOT_ORDER, and COMING_SOON are exported inline above.
