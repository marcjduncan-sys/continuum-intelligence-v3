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
/** @type {{ [ticker: string]: Array }} */
const ANNOUNCEMENTS_DATA = {};
/** @type {{ [ticker: string]: object }} */
const WORKSTATION_DATA = {};

/**
 * Per-ticker extraction status metadata.
 * Keys are ticker strings. Values track extraction pipeline state.
 * @type {{ [ticker: string]: { status: string, hasPayload: boolean, lastSuccessfulAt: string|null, lastAttemptAt: string|null, lastErrorCode: string|null, lastErrorSummary: string|null, payloadGeneratedAt: string|null } }}
 */
const WORKSTATION_STATUS = {};

/**
 * Batch extraction run metadata.
 * Singleton object tracking the most recent batch run.
 * @type {{ runId: string|null, startedAt: string|null, completedAt: string|null, totalTickers: number, succeeded: number, failed: number, stale: number, missing: number, status: string }}
 */
const BATCH_STATUS = {
  runId: null,
  startedAt: null,
  completedAt: null,
  totalTickers: 0,
  succeeded: 0,
  failed: 0,
  stale: 0,
  missing: 0,
  status: 'unknown'
};

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
export const VALID_STATIC_PAGES = new Set(['home', 'deep-research', 'portfolio', 'comparator', 'personalisation', 'memory', 'pm', 'ops', 'about']);

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

/** Get workstation data for a ticker */
export function getWorkstation(ticker) {
  return WORKSTATION_DATA[ticker];
}

/** Set workstation data for a ticker */
export function setWorkstation(ticker, data) {
  WORKSTATION_DATA[ticker] = data;
}

/** Get all workstation tickers */
export function getAllWorkstationTickers() {
  return Object.keys(WORKSTATION_DATA);
}

/** Clear workstation data for a specific ticker */
export function clearWorkstation(ticker) {
  delete WORKSTATION_DATA[ticker];
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

/** Merge per-ticker announcement arrays into ANNOUNCEMENTS_DATA */
export function initAnnouncementsData(data) {
  Object.assign(ANNOUNCEMENTS_DATA, data);
}

/** Merge data into WORKSTATION_DATA */
export function initWorkstationData(data) {
  Object.assign(WORKSTATION_DATA, data);
}

/** Get workstation status for a ticker */
export function getWorkstationStatus(ticker) {
  return WORKSTATION_STATUS[ticker];
}

/** Set workstation status for a ticker */
export function setWorkstationStatus(ticker, status) {
  WORKSTATION_STATUS[ticker] = status;
}

/** Get the current batch status */
export function getBatchStatus() {
  return BATCH_STATUS;
}

/** Update batch status (merge) */
export function updateBatchStatus(patch) {
  Object.assign(BATCH_STATUS, patch);
}

/** Initialise workstation status for multiple tickers */
export function initWorkstationStatus(data) {
  Object.assign(WORKSTATION_STATUS, data);
}

/** Reset batch status to defaults */
export function resetBatchStatus() {
  Object.assign(BATCH_STATUS, {
    runId: null, startedAt: null, completedAt: null,
    totalTickers: 0, succeeded: 0, failed: 0, stale: 0, missing: 0,
    status: 'unknown'
  });
}

// --- Export raw objects for backward compatibility ---
export {
  STOCK_DATA,
  FRESHNESS_DATA,
  REFERENCE_DATA,
  SNAPSHOT_DATA,
  COVERAGE_DATA,
  TC_DATA,
  ANNOUNCEMENTS_DATA,
  WORKSTATION_DATA,
  WORKSTATION_STATUS,
  BATCH_STATUS
};
// Note: FEATURED_ORDER, SNAPSHOT_ORDER, and COMING_SOON are exported inline above.
