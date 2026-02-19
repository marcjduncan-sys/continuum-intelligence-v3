/**
 * DataService — API-ready data abstraction layer
 *
 * Currently reads from embedded window.STOCK_DATA / window.FRESHNESS_DATA
 * and static JSON files. When window.CI_API_URL is set and the backend
 * responds to /api/health, automatically switches to API mode.
 *
 * This is the only file that needs to change when the new backend goes live.
 * Every other module reads data through DataService.
 *
 * API endpoints expected (when CI_API_URL is set):
 *   GET /api/stock/{ticker}      → full stock evidence object
 *   GET /api/stocks              → { [ticker]: stockObject } map
 *   GET /api/prices              → { [ticker]: { price, timestamp } }
 *   GET /api/freshness           → FRESHNESS_DATA-shaped object
 *   GET /api/config/price-rules  → { price_evidence_rules: [...] }
 *   GET /api/health              → { status: "ok" }
 */

/* global STOCK_DATA, FRESHNESS_DATA */

var DataService = (function () {
  'use strict';

  var _apiUrl = null;
  var _apiMode = false;
  var _apiChecked = false;

  // ─── Internal helpers ───────────────────────────────────────────────────────

  function getApiUrl() {
    if (_apiUrl === null) {
      _apiUrl = (typeof window !== 'undefined' && window.CI_API_URL) || null;
    }
    return _apiUrl;
  }

  async function apiFetch(path) {
    var base = getApiUrl();
    if (!base) return null;
    try {
      var response = await fetch(base.replace(/\/$/, '') + path);
      if (!response.ok) return null;
      return await response.json();
    } catch (_e) {
      return null;
    }
  }

  async function fileFetch(path) {
    try {
      var response = await fetch(path + '?t=' + Date.now());
      if (!response.ok) return null;
      return await response.json();
    } catch (_e) {
      return null;
    }
  }

  /**
   * Probe the API once to determine availability. Result is cached for the
   * lifetime of the page. When the backend is not reachable, falls back
   * silently to static files / embedded globals.
   */
  async function checkApiAvailability() {
    if (_apiChecked) return _apiMode;
    _apiChecked = true;
    if (!getApiUrl()) { _apiMode = false; return false; }
    var health = await apiFetch('/api/health');
    _apiMode = health !== null;
    console.log('[DataService] mode=' + (_apiMode ? 'api' : 'embedded') +
      ' | url=' + getApiUrl());
    return _apiMode;
  }

  // ─── Public interface ───────────────────────────────────────────────────────

  /**
   * Get full stock evidence object for a ticker.
   * Resolution order: API → static JSON file → embedded STOCK_DATA
   *
   * @param {string} ticker  e.g. "WOW" or "WOW.AX"
   * @returns {Object|null}
   */
  async function getStock(ticker) {
    var base = ticker.replace('.AX', '');

    if (await checkApiAvailability()) {
      var apiData = await apiFetch('/api/stock/' + encodeURIComponent(base));
      if (apiData) return apiData;
    }

    var fileData = await fileFetch('data/stocks/' + base + '.json');
    if (fileData) return fileData;

    if (typeof STOCK_DATA !== 'undefined' && STOCK_DATA && STOCK_DATA[base]) {
      return STOCK_DATA[base];
    }

    return null;
  }

  /**
   * Get all stock summaries for portfolio overlay and index views.
   * Resolution order: API → embedded STOCK_DATA
   *
   * @returns {{ [ticker]: Object }}
   */
  async function getAllStocks() {
    if (await checkApiAvailability()) {
      var apiAll = await apiFetch('/api/stocks');
      if (apiAll) return apiAll;
    }

    return (typeof STOCK_DATA !== 'undefined' && STOCK_DATA) ? STOCK_DATA : {};
  }

  /**
   * Get current price entry for a ticker.
   * Returns { price, timestamp } or null.
   *
   * @param {string} ticker
   * @returns {{ price: number, timestamp: Date|null }|null}
   */
  async function getPrice(ticker) {
    var base = ticker.replace('.AX', '');

    if (await checkApiAvailability()) {
      var prices = await apiFetch('/api/prices');
      if (prices) {
        var entry = prices[base] || prices[ticker];
        if (entry) return entry;
      }
    }

    // Fall back to last in-memory value from price-signals.js
    if (typeof window !== 'undefined' && window.DNE_STOCK &&
        window.DNE_STOCK.current_price) {
      return {
        price: window.DNE_STOCK.current_price,
        timestamp: window.DNE_LAST_PRICE_FETCH || null
      };
    }

    return null;
  }

  /**
   * Get research freshness metadata for a ticker.
   * Resolution order: API → embedded FRESHNESS_DATA
   *
   * @param {string} ticker
   * @returns {Object|null}
   */
  async function getFreshness(ticker) {
    var base = ticker.replace('.AX', '');

    if (await checkApiAvailability()) {
      var fd = await apiFetch('/api/freshness');
      if (fd) {
        var entry = fd[base] || fd[ticker];
        if (entry) return entry;
      }
    }

    if (typeof FRESHNESS_DATA !== 'undefined' && FRESHNESS_DATA) {
      return FRESHNESS_DATA[base] || FRESHNESS_DATA[ticker] || null;
    }

    return null;
  }

  /**
   * Get price evidence rules configuration.
   * Resolution order: API → static config file
   *
   * @returns {Object|null}  Full config object with price_evidence_rules array
   */
  async function getConfig() {
    if (await checkApiAvailability()) {
      var apiConfig = await apiFetch('/api/config/price-rules');
      if (apiConfig) return apiConfig;
    }

    return await fileFetch('data/config/price_rules.json');
  }

  // ─── Exports ────────────────────────────────────────────────────────────────

  return {
    getStock: getStock,
    getAllStocks: getAllStocks,
    getPrice: getPrice,
    getFreshness: getFreshness,
    getConfig: getConfig,
    /** Read-only config accessors */
    config: {
      get mode() { return _apiMode ? 'api' : 'embedded'; },
      get apiUrl() { return getApiUrl(); }
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DataService: DataService };
}
