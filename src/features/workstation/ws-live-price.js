/**
 * ws-live-price.js -- Live price patching for the workstation page.
 *
 * Hooks into MarketFeed's polling cycle to patch the spot price cell and
 * EWP-vs-spot percentage in the decision strip when the workstation page
 * is the active page.
 *
 * No-op when the workstation page is not visible.
 * Creates no parallel polling mechanism -- piggybacks on MarketFeed only.
 */

import { MarketFeed } from '../../services/market-feed.js';
import { computeEWPvSpot } from './ws-computed.js';
import { formatPriceWithCurrency, formatSignedPercent } from '../../lib/format.js';
import { getWorkstation } from '../../lib/state.js';

let _currentListener = null;
let _currentTicker = null;

/**
 * Check whether the workstation page for the given ticker is currently active.
 * @param {string} ticker
 * @returns {boolean}
 */
function _isWorkstationActive(ticker) {
  const page = document.getElementById('page-workstation-' + ticker);
  return !!(page && page.classList.contains('active'));
}

/**
 * Patch the workstation DOM with a new spot price.
 * Updates [data-ws-spot] textContent and recalculates EWP-vs-spot percentage.
 *
 * @param {string} ticker
 * @param {number} newSpotPrice
 */
function _patchWorkstationPrice(ticker, newSpotPrice) {
  if (!_isWorkstationActive(ticker)) return;

  const data = getWorkstation(ticker);
  if (!data) return;

  const page = document.getElementById('page-workstation-' + ticker);
  if (!page) return;

  // Patch spot price display
  const spotEl = page.querySelector('[data-ws-spot]');
  if (spotEl) {
    const currency = (data.decision_strip && data.decision_strip.spot_price && data.decision_strip.spot_price.currency) || 'A$';
    spotEl.textContent = formatPriceWithCurrency(newSpotPrice, currency);
  }

  // Recalculate EWP vs spot (EWP itself is scenario-derived, not price-derived)
  const ewpPctEl = page.querySelector('[data-ws-ewp-pct]');
  if (ewpPctEl && data.scenarios) {
    let ewp = 0;
    for (let i = 0; i < data.scenarios.length; i++) {
      const s = data.scenarios[i];
      if (s.target_price === null || s.target_price === undefined) { ewp = null; break; }
      ewp += s.probability * s.target_price;
    }
    if (ewp !== null) {
      const pct = computeEWPvSpot(ewp, newSpotPrice);
      if (pct !== null) {
        ewpPctEl.textContent = formatSignedPercent(pct) + ' vs spot';
        ewpPctEl.dataset.wsEwpPct = pct;
      }
    }
  }
}

/**
 * Initialise live price patching for a specific workstation ticker.
 * Removes any previously registered listener first.
 * No-op if MarketFeed is not available.
 *
 * @param {string} ticker - Uppercase ticker symbol
 */
export function initWorkstationLivePrice(ticker) {
  destroyWorkstationLivePrice();

  _currentTicker = ticker;
  _currentListener = function(updatedTicker, newPrice) {
    if (updatedTicker !== ticker) return;
    _patchWorkstationPrice(ticker, newPrice);
  };

  MarketFeed.addPriceListener(_currentListener);
}

/**
 * Remove the currently registered price listener.
 * Call when navigating away from the workstation page.
 */
export function destroyWorkstationLivePrice() {
  if (_currentListener) {
    MarketFeed.removePriceListener(_currentListener);
  }
  _currentListener = null;
  _currentTicker = null;
}

/**
 * Exposed for testing: trigger a price update on the current listener.
 * Only available in test environments.
 * @param {string} ticker
 * @param {number} price
 */
export function _testTriggerPriceUpdate(ticker, price) {
  if (_currentListener) {
    _currentListener(ticker, price);
  }
}
