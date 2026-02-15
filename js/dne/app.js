/**
 * DYNAMIC NARRATIVE ENGINE — Application Bootstrap
 *
 * Initialises the DNE on a stock page:
 * 1. Loads stock evidence data and price rules config
 * 2. Runs initial survival recalculation
 * 3. Renders narrative UI
 * 4. Starts the 15-minute price refresh loop
 *
 * Include this script AFTER evidence.js, engine.js, price-signals.js,
 * override.js, and ui.js.
 *
 * The stock page must set window.DNE_TICKER to the ticker symbol
 * (e.g. "WOW.AX") before this script loads.
 */

/* global
  recalculateSurvival, updateNarrativeUI, renderNarrativeHistory,
  startNarrativeRefresh, evaluatePriceSignals, fetchPriceData,
  computeNarrativeWeighting
*/

(function () {
  'use strict';

  var DATA_BASE_URL = 'data/stocks/';
  var CONFIG_URL = 'data/config/price_rules.json';

  /**
   * Load a JSON file via fetch.
   *
   * @param {string} url  Relative or absolute URL
   * @returns {Object|null}
   */
  async function loadJSON(url) {
    try {
      var response = await fetch(url);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } catch (err) {
      console.error('[DNE] Failed to load ' + url + ':', err);
      return null;
    }
  }

  /**
   * Persist updated stock data back to storage.
   * In Phase 1 (static site), this is a no-op / logs to console.
   * Replace with actual persistence when a backend is available.
   */
  window.saveStockData = async function (stock) {
    // Phase 1: log to console for debugging. No server-side persistence yet.
    console.log('[DNE] Stock data updated:', stock.ticker,
      '| Dominant:', stock.dominant,
      '| Confidence:', stock.confidence,
      '| Alert:', stock.alert_state);
  };

  /**
   * Main initialisation — called on DOMContentLoaded.
   */
  async function init() {
    var ticker = window.DNE_TICKER;
    if (!ticker) {
      console.warn('[DNE] No DNE_TICKER set — skipping initialisation');
      return;
    }

    // Derive the JSON filename from ticker (strip .AX suffix)
    var baseTicker = ticker.replace('.AX', '');
    var stockUrl = DATA_BASE_URL + baseTicker + '.json';

    console.log('[DNE] Initialising for ' + ticker);

    // Load stock data and config in parallel
    var results = await Promise.all([
      loadJSON(stockUrl),
      loadJSON(CONFIG_URL)
    ]);

    var stock = results[0];
    var config = results[1];

    if (!stock) {
      console.error('[DNE] Could not load stock data for ' + ticker);
      return;
    }

    if (!config || !config.price_evidence_rules) {
      console.error('[DNE] Could not load price rules config');
      return;
    }

    var rules = config.price_evidence_rules;

    // Store globally for console debugging
    window.DNE_STOCK = stock;
    window.DNE_RULES = rules;

    // Initial recalculation with existing evidence (no price fetch yet)
    recalculateSurvival(stock);

    // Compute narrative weighting with seed price history if available
    if (stock.price_history && stock.price_history.length > 3 &&
        typeof computeNarrativeWeighting === 'function') {
      var prevTop = stock.weighting ? stock.weighting.top_narrative.top_narrative : null;
      computeNarrativeWeighting(stock, stock.price_history, prevTop);
    }

    // Render UI
    updateNarrativeUI(stock);
    renderNarrativeHistory(stock);

    // Start 15-minute refresh loop (fetches live prices)
    startNarrativeRefresh(stock, rules);

    console.log('[DNE] Ready — ' + ticker +
      ' | Dominant: ' + stock.dominant +
      ' (' + stock.hypotheses[stock.dominant].label + ')' +
      ' | Confidence: ' + stock.confidence);
  }

  // Boot on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
