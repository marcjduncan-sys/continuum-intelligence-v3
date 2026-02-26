// ============================================================
// CONTINUUM DYNAMICS ENGINE
// Computes derived metrics from live price + REFERENCE_DATA,
// then hydrates STOCK_DATA so all rendered text stays current.
//
// Replaces hardcoded market caps, P/E ratios, drawdowns,
// upside-to-target, and narrative text with live-computed values.
// ============================================================

import { STOCK_DATA, REFERENCE_DATA, FRESHNESS_DATA } from '../lib/state.js';
import { fmtB, fmtPrice, fmtPct, fmtPE, signPct } from '../lib/format.js';
import { computeSkewScore } from '../lib/dom.js';

// --- Core Computation ---

/**
 * @typedef {{ price: string, marketCap: string|null, trailingPE: string|null,
 *   forwardPE: string|null, divYield: string|null, drawdown: string|null,
 *   drawdownClean: string|null, upsideToTarget: string|null, high52: string|null,
 *   low52: string|null, range52: string|null, analystTarget: string|null,
 *   analystTargetWithUpside: string|null }} ComputedFmt
 *
 * @typedef {{ ticker: string, price: number, currency: string, marketCap: number|null,
 *   marketCapStr: string|null, trailingPE: number|null, forwardPE: number|null,
 *   divYield: number|null, high52: number|null, low52: number|null,
 *   drawdownFromHigh: number|null, upsideToTarget: number|null,
 *   rangePosition: number|null, fmt: ComputedFmt }} ComputedMetrics
 */

/**
 * Compute derived metrics from live price + reference data for a ticker.
 * @param {string} ticker
 * @returns {ComputedMetrics|null} Computed metrics or null if data missing
 */
export function compute(ticker) {
  var stock = STOCK_DATA[ticker];
  var ref = REFERENCE_DATA[ticker];
  if (!stock || !ref) return null;

  var price = parseFloat(stock._livePrice || stock.price) || 0;
  var currency = stock.currency || 'A$';

  // 52-week high/low from priceHistory
  var history = stock.priceHistory || [];
  var h252 = history.slice(-252);
  var high52 = h252.length > 0 ? Math.max.apply(null, h252) : null;
  var low52  = h252.length > 0 ? Math.min.apply(null, h252) : null;

  // Market cap
  var marketCap = ref.sharesOutstanding ? (price * ref.sharesOutstanding / 1000) : null;

  // P/E ratios
  var trailingPE = ref.epsTrailing ? price / ref.epsTrailing : null;
  var forwardPE  = ref.epsForward  ? price / ref.epsForward  : null;

  // Dividend yield
  var divYield = ref.divPerShare ? (ref.divPerShare / price) * 100 : null;

  // Drawdown from 52-week high
  var drawdownFromHigh = high52 ? ((price - high52) / high52) * 100 : null;

  // Upside to analyst target
  var upsideToTarget = ref.analystTarget ? ((ref.analystTarget - price) / price) * 100 : null;

  // Range position (0 = at 52w low, 100 = at 52w high)
  var rangePosition = (high52 && low52 && high52 !== low52) ?
    ((price - low52) / (high52 - low52)) * 100 : null;

  return {
    ticker: ticker,
    price: price,
    currency: currency,
    marketCap: marketCap,
    marketCapStr: marketCap ? fmtB(marketCap) : null,
    trailingPE: trailingPE,
    forwardPE: forwardPE,
    divYield: divYield,
    high52: high52,
    low52: low52,
    drawdownFromHigh: drawdownFromHigh,
    upsideToTarget: upsideToTarget,
    rangePosition: rangePosition,
    // Formatted strings
    fmt: {
      price: fmtPrice(price, currency),
      marketCap: marketCap ? currency + fmtB(marketCap) : null,
      trailingPE: fmtPE(trailingPE),
      forwardPE: fmtPE(forwardPE),
      divYield: divYield ? divYield.toFixed(1) + '%' : null,
      drawdown: drawdownFromHigh != null ? '&darr;' + fmtPct(drawdownFromHigh) : null,
      drawdownClean: drawdownFromHigh != null ? fmtPct(drawdownFromHigh) : null,
      upsideToTarget: upsideToTarget != null ? signPct(upsideToTarget) : null,
      high52: high52 ? fmtPrice(high52, currency) : null,
      low52: low52 ? fmtPrice(low52, currency) : null,
      range52: (high52 && low52) ? fmtPrice(low52, currency) + ' &ndash; ' + fmtPrice(high52, currency) : null,
      analystTarget: ref.analystTarget ? fmtPrice(ref.analystTarget, currency) : null,
      analystTargetWithUpside: (ref.analystTarget && upsideToTarget != null) ?
        fmtPrice(ref.analystTarget, currency) + ' (' + signPct(upsideToTarget) + ')' : null
    }
  };
}

// --- Hydration: Patch STOCK_DATA in place ---

/**
 * Update heroMetrics values by label
 * @param {object} stock
 * @param {object} computed
 */
export function hydrateHeroMetrics(stock, computed) {
  if (!stock.heroMetrics) return;
  for (var i = 0; i < stock.heroMetrics.length; i++) {
    var m = stock.heroMetrics[i];
    var label = m.label.toLowerCase();
    if (label === 'mkt cap' && computed.fmt.marketCap) {
      m.value = computed.fmt.marketCap;
    } else if (label === 'drawdown' && computed.fmt.drawdown) {
      m.value = computed.fmt.drawdown;
      m.colorClass = computed.drawdownFromHigh < -20 ? 'negative' : computed.drawdownFromHigh < -5 ? 'caution' : '';
    } else if (label.indexOf('analyst') >= 0 && label.indexOf('target') >= 0 && computed.fmt.analystTargetWithUpside) {
      m.value = computed.fmt.analystTargetWithUpside;
    } else if ((label === 'fwd p/e' || label === 'p/e') && computed.fmt.forwardPE) {
      m.value = computed.fmt.forwardPE;
    } else if (label === 'div yield' && computed.fmt.divYield) {
      m.value = computed.fmt.divYield;
    } else if (label === 'trailing p/e' && computed.fmt.trailingPE) {
      m.value = computed.fmt.trailingPE;
    }
  }
}

/**
 * Update featuredMetrics values by label
 * @param {object} stock
 * @param {object} computed
 */
export function hydrateFeaturedMetrics(stock, computed) {
  if (!stock.featuredMetrics) return;
  for (var i = 0; i < stock.featuredMetrics.length; i++) {
    var m = stock.featuredMetrics[i];
    var label = m.label.toLowerCase();
    if (label === 'mkt cap' && computed.fmt.marketCap) {
      m.value = computed.fmt.marketCap;
    } else if (label === 'drawdown' && computed.fmt.drawdown) {
      m.value = computed.fmt.drawdown;
    } else if (label.indexOf('analyst') >= 0 && label.indexOf('target') >= 0 && computed.fmt.analystTarget) {
      m.value = computed.fmt.analystTarget;
    } else if ((label === 'fwd p/e' || label === 'p/e') && computed.fmt.forwardPE) {
      m.value = computed.fmt.forwardPE;
    } else if (label === 'div yield' && computed.fmt.divYield) {
      m.value = computed.fmt.divYield;
    } else if (label === 'trailing p/e' && computed.fmt.trailingPE) {
      m.value = computed.fmt.trailingPE;
    }
  }
  // Update featured price colour
  if (computed.drawdownFromHigh != null) {
    stock.featuredPriceColor = computed.drawdownFromHigh < -20 ? 'var(--signal-red)' :
      computed.drawdownFromHigh < -5 ? 'var(--signal-amber)' : 'var(--signal-green)';
  }
}

/**
 * Update identity table rows by label
 * @param {object} stock
 * @param {object} computed
 */
export function hydrateIdentity(stock, computed) {
  if (!stock.identity || !stock.identity.rows) return;
  for (var r = 0; r < stock.identity.rows.length; r++) {
    for (var c = 0; c < stock.identity.rows[r].length; c++) {
      var cell = stock.identity.rows[r][c];
      var label = cell[0].toLowerCase();
      if (label === 'share price' && computed.fmt.price) {
        cell[1] = computed.fmt.price;
        cell[2] = computed.drawdownFromHigh < -20 ? 'td-mono td-red' :
                  computed.drawdownFromHigh < -5  ? 'td-mono td-amber' : 'td-mono td-green';
      } else if (label === 'market cap' && computed.fmt.marketCap) {
        cell[1] = computed.fmt.marketCap;
      } else if (label === '52-week range' && computed.fmt.range52) {
        cell[1] = computed.fmt.range52;
      } else if (label === 'trailing p/e' && computed.fmt.trailingPE) {
        cell[1] = computed.fmt.trailingPE;
      } else if (label === 'forward p/e' && computed.fmt.forwardPE) {
        cell[1] = computed.fmt.forwardPE;
      } else if ((label === 'drawdown from high' || label === 'drawdown') && computed.fmt.drawdown) {
        cell[1] = computed.fmt.drawdown;
        cell[2] = computed.drawdownFromHigh < -20 ? 'td-mono td-red' : 'td-mono td-amber';
      } else if (label === 'dividend' || label === 'div yield') {
        if (computed.fmt.divYield) {
          cell[1] = cell[1].replace(/[\d.]+%/, computed.fmt.divYield);
        }
      }
    }
  }
}

/**
 * Smart text replacement: swap old anchored values with new computed values
 * @param {string} text
 * @param {object} ref
 * @param {object} computed
 * @returns {string}
 */
export function hydrateText(text, ref, computed) {
  if (!text || typeof text !== 'string') return text;
  var anchors = ref._anchors || {};
  var currency = computed.currency || 'A$';

  // Escape currency for regex
  var esc = currency.replace('$', '\\$');

  // Replace price: "A$77.87" -> new price
  if (anchors.price && computed.price !== anchors.price) {
    var oldPrice = parseFloat(anchors.price).toFixed(2);
    var newPrice = parseFloat(computed.price).toFixed(2);
    text = text.split(currency + oldPrice).join(currency + newPrice);
  }

  // Replace market cap: "A$12.0B" -> new market cap
  if (anchors.marketCapStr && computed.marketCapStr && computed.marketCapStr !== anchors.marketCapStr) {
    text = text.split(currency + anchors.marketCapStr).join(currency + computed.marketCapStr);
  }

  // Replace drawdown %: "60%" in drawdown context
  if (anchors.drawdown != null && computed.drawdownFromHigh != null) {
    var oldDd = Math.round(Math.abs(anchors.drawdown));
    var newDd = Math.round(Math.abs(computed.drawdownFromHigh));
    if (oldDd !== newDd) {
      // Target drawdown references with context clues
      text = text.replace(new RegExp('(down |down&nbsp;|drawdown[^\\d]*|\\bdarr;|sell-off[^\\d]*|-|&darr;)' + oldDd + '%', 'gi'),
        function(match) { return match.replace(oldDd + '%', newDd + '%'); });
      // Also replace standalone references like "to -60%" or "deepens to -60%"
      text = text.replace(new RegExp('-' + oldDd + '%', 'g'), '-' + newDd + '%');
    }
  }

  // Replace upside to target: "145%" in upside context
  if (anchors.upsideToTarget != null && computed.upsideToTarget != null) {
    var oldUp = Math.round(Math.abs(anchors.upsideToTarget));
    var newUp = Math.round(Math.abs(computed.upsideToTarget));
    if (oldUp !== newUp) {
      text = text.replace(new RegExp('(\\+|upside[^\\d]*|representing |\\()' + oldUp + '%', 'gi'),
        function(match) { return match.replace(oldUp + '%', newUp + '%'); });
    }
  }

  // Replace P/E: "41x" -> new P/E
  if (anchors.pe && computed.trailingPE) {
    var oldPE = fmtPE(anchors.pe);
    var newPE = fmtPE(computed.trailingPE);
    if (oldPE && newPE && oldPE !== newPE) {
      text = text.split(oldPE).join(newPE);
    }
  }

  // Replace forward P/E
  if (anchors.fwdPE && computed.forwardPE) {
    var oldFPE = fmtPE(anchors.fwdPE);
    var newFPE = fmtPE(computed.forwardPE);
    if (oldFPE && newFPE && oldFPE !== newFPE) {
      text = text.split(oldFPE).join(newFPE);
    }
  }

  // Replace analyst target with upside: "A$191 (+145%)" -> new
  if (anchors.upsideToTarget != null && ref.analystTarget && computed.upsideToTarget != null) {
    var oldTargetStr = currency + Math.round(ref.analystTarget) + ' (+' + Math.round(Math.abs(anchors.upsideToTarget)) + '%)';
    var newTargetStr = currency + Math.round(ref.analystTarget) + ' (' + signPct(computed.upsideToTarget) + ')';
    text = text.split(oldTargetStr).join(newTargetStr);
  }

  return text;
}

/**
 * Hydrate all text fields in a stock's data recursively
 * @param {object} obj
 * @param {object} ref
 * @param {object} computed
 */
export function hydrateTextFields(obj, ref, computed) {
  if (!obj || typeof obj !== 'object') return;
  for (var key in obj) {
    if (!obj.hasOwnProperty(key)) continue;
    if (typeof obj[key] === 'string') {
      obj[key] = hydrateText(obj[key], ref, computed);
    } else if (Array.isArray(obj[key])) {
      for (var i = 0; i < obj[key].length; i++) {
        if (typeof obj[key][i] === 'string') {
          obj[key][i] = hydrateText(obj[key][i], ref, computed);
        } else if (typeof obj[key][i] === 'object') {
          hydrateTextFields(obj[key][i], ref, computed);
        }
      }
    } else if (typeof obj[key] === 'object' && key !== 'technicalAnalysis' && key !== 'priceHistory') {
      hydrateTextFields(obj[key], ref, computed);
    }
  }
}

/**
 * Update the featured rationale with dynamic context
 * @param {object} stock
 * @param {object} computed
 * @param {object} ref
 */
export function hydrateFeaturedRationale(stock, computed, ref) {
  if (!stock.featuredRationale) return;
  stock.featuredRationale = hydrateText(stock.featuredRationale, ref, computed);
}

// --- Hypothesis Score Adjustment ---

/**
 * Adjust hypothesis scores based on price dislocation from review date
 * @param {object} stock
 * @param {object} computed
 * @param {object} ref
 */
export function adjustHypothesisScores(stock, computed, ref) {
  if (!stock.hypotheses || !ref._anchors || !ref._anchors.price) return;

  var priceDelta = ((computed.price - ref._anchors.price) / ref._anchors.price) * 100;
  var absDelta = Math.abs(priceDelta);

  // Only adjust if price has moved significantly (>5%)
  if (absDelta < 5) return;

  for (var i = 0; i < stock.hypotheses.length; i++) {
    var hyp = stock.hypotheses[i];
    var currentScore = parseInt(hyp.score);
    if (isNaN(currentScore)) continue;

    var adjustment = 0;

    if (hyp.direction === 'upside') {
      // Upside thesis: price drop strengthens it (more upside), price rise weakens it
      if (priceDelta < -20) adjustment = 5;
      else if (priceDelta < -10) adjustment = 3;
      else if (priceDelta > 20) adjustment = -5;
      else if (priceDelta > 10) adjustment = -3;
    } else if (hyp.direction === 'downside') {
      // Downside thesis: price drop strengthens it (being validated), price rise weakens it
      if (priceDelta < -20) adjustment = 5;
      else if (priceDelta < -10) adjustment = 3;
      else if (priceDelta > 20) adjustment = -5;
      else if (priceDelta > 10) adjustment = -3;
    }

    if (adjustment !== 0) {
      var newScore = Math.max(5, Math.min(95, currentScore + adjustment));
      hyp.score = newScore + '%';
      hyp.scoreWidth = newScore + '%';
      // Update score meta to indicate dynamic adjustment
      if (adjustment > 0) {
        hyp.scoreMeta = hyp.scoreMeta + ' <span class="dynamic-adj">(+' + adjustment + ' price move)</span>';
      } else {
        hyp.scoreMeta = hyp.scoreMeta + ' <span class="dynamic-adj">(' + adjustment + ' price move)</span>';
      }
    }
  }
}

// --- Master Hydration ---

/**
 * Hydrate a single stock: compute metrics and patch STOCK_DATA in place
 * @param {string} ticker
 * @returns {object|null} Computed metrics or null
 */
export function hydrate(ticker) {
  var stock = STOCK_DATA[ticker];
  var ref = REFERENCE_DATA[ticker];
  if (!stock || !ref) return null;

  var computed = compute(ticker);
  if (!computed) return null;

  // Store computed data on the stock for rendering access
  stock._computed = computed;

  // 1. Structured fields
  hydrateHeroMetrics(stock, computed);
  hydrateFeaturedMetrics(stock, computed);
  hydrateIdentity(stock, computed);

  // 2. Hypothesis scores
  adjustHypothesisScores(stock, computed, ref);

  // 2b. Cache canonical skew score (single source of truth for all renderers)
  stock._skew = computeSkewScore(stock);

  // 3. All text fields (narrative, descriptions, rationale, evidence)
  // Skip fields that shouldn't be text-replaced
  var textTargets = [
    'heroDescription', 'heroCompanyDescription',
    'featuredRationale'
  ];
  for (var i = 0; i < textTargets.length; i++) {
    if (stock[textTargets[i]]) {
      stock[textTargets[i]] = hydrateText(stock[textTargets[i]], ref, computed);
    }
  }

  // Deep hydrate complex objects
  if (stock.hero) hydrateTextFields(stock.hero, ref, computed);
  if (stock.skew) hydrateTextFields(stock.skew, ref, computed);
  if (stock.verdict) hydrateTextFields(stock.verdict, ref, computed);
  if (stock.narrative) hydrateTextFields(stock.narrative, ref, computed);
  if (stock.evidence) hydrateTextFields(stock.evidence, ref, computed);
  if (stock.hypotheses) hydrateTextFields({ h: stock.hypotheses }, ref, computed);
  if (stock.identity && stock.identity.overview) {
    stock.identity.overview = hydrateText(stock.identity.overview, ref, computed);
  }

  // 4. Update the FRESHNESS_DATA for this ticker
  if (typeof FRESHNESS_DATA !== 'undefined' && FRESHNESS_DATA[ticker]) {
    FRESHNESS_DATA[ticker].pricePctChange =
      Math.round(((computed.price - (FRESHNESS_DATA[ticker].priceAtReview || ref._anchors.price)) /
      (FRESHNESS_DATA[ticker].priceAtReview || ref._anchors.price)) * 1000) / 10;
  }

  return computed;
}

/**
 * Hydrate all stocks that have reference data
 * @returns {object} Map of ticker -> computed results
 */
export function hydrateAll() {
  var tickers = Object.keys(STOCK_DATA);
  var results = {};
  for (var i = 0; i < tickers.length; i++) {
    var t = tickers[i];
    if (REFERENCE_DATA[t]) {
      results[t] = hydrate(t);
    }
  }
  console.log('[ContinuumDynamics] Hydrated ' + Object.keys(results).length + ' stocks');
  return results;
}

/**
 * Re-hydrate after live price update (called from updateLiveUI)
 * @param {string} ticker
 * @param {number} newPrice
 * @returns {object|null}
 */
export function onPriceUpdate(ticker, newPrice) {
  var stock = STOCK_DATA[ticker];
  if (!stock) return;
  stock._livePrice = newPrice;
  return hydrate(ticker);
}

// --- Default export for backward compatibility ---
// Mirrors the original ContinuumDynamics IIFE return value
const ContinuumDynamics = {
  compute: compute,
  hydrate: hydrate,
  hydrateAll: hydrateAll,
  onPriceUpdate: onPriceUpdate,
  fmtB: fmtB,
  fmtPrice: fmtPrice,
  fmtPE: fmtPE
};

export default ContinuumDynamics;
