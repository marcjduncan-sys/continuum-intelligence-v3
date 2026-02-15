/**
 * DYNAMIC NARRATIVE ENGINE — Price Signal Generator
 *
 * Evaluates current price data against configurable price_evidence_rules
 * and creates/updates price signal evidence items on the stock.
 *
 * Also provides the Yahoo Finance price feed integration for ASX stocks.
 *
 * Depends on: evidence.js, engine.js
 */

/* global calculateDecayFactor, recalculateSurvival, computeNarrativeWeighting */

// ─── Price Signal Evaluation ─────────────────────────────────────────────────

/**
 * Evaluate price data against all rules and generate signals.
 *
 * Call this on each price update for each stock. It will:
 * 1. Deactivate expired signals
 * 2. Test each rule against current price data
 * 3. Create new signal evidence items for triggered rules
 * 4. Recalculate survival scores
 *
 * @param {Object} stock      Stock evidence data object (mutated in place)
 * @param {Object} priceData  Current price data (see shape below)
 * @param {Array}  rules      Price evidence rules from config
 *
 * priceData shape:
 * {
 *   current: number,
 *   previous_close: number,
 *   open: number,
 *   high_52w: number,
 *   low_52w: number,
 *   volume: number,
 *   avg_30day_volume: number,
 *   cumulative_5day_return: number,
 *   earnings_surprise: number|null
 * }
 */
function evaluatePriceSignals(stock, priceData, rules) {
  var intradayReturn = (priceData.current - priceData.previous_close) / priceData.previous_close;
  stock.current_price = priceData.current;

  var now = new Date();

  // Deactivate expired price signals
  for (var s = 0; s < stock.price_signals.length; s++) {
    var signal = stock.price_signals[s];
    if (signal.decay && signal.active !== false) {
      var decayFactor = calculateDecayFactor(signal.date, now, signal.decay);
      if (decayFactor < 0.05) {
        signal.active = false;
      }
    }
  }

  // Evaluate each rule
  for (var r = 0; r < rules.length; r++) {
    var rule = rules[r];
    var triggered = false;

    switch (rule.id) {
      case 'INTRADAY_DROP_5':
        triggered = intradayReturn <= -0.05 && intradayReturn > -0.10;
        break;
      case 'INTRADAY_DROP_10':
        triggered = intradayReturn <= -0.10;
        break;
      case 'CUMULATIVE_5DAY_DROP_8':
        triggered = priceData.cumulative_5day_return <= -0.08;
        break;
      case 'HIGH_VOLUME_DOWN':
        triggered = priceData.volume >= 3 * priceData.avg_30day_volume && intradayReturn < 0;
        break;
      case 'EARNINGS_MISS_5':
        triggered = priceData.earnings_surprise !== null && priceData.earnings_surprise <= -0.05;
        break;
      case 'EARNINGS_BEAT_5':
        triggered = priceData.earnings_surprise !== null && priceData.earnings_surprise >= 0.05;
        break;
      case 'NEW_52W_HIGH_VOLUME':
        triggered = priceData.current >= priceData.high_52w &&
                    priceData.volume >= 1.5 * priceData.avg_30day_volume;
        break;
      case 'NEW_52W_LOW':
        triggered = priceData.current <= priceData.low_52w;
        break;
      case 'INTRADAY_RALLY_5':
        triggered = intradayReturn >= 0.05 && intradayReturn < 0.10;
        break;
      case 'INTRADAY_RALLY_10':
        triggered = intradayReturn >= 0.10;
        break;
    }

    if (triggered) {
      // Check if this signal already exists for today
      var today = now.toISOString().split('T')[0];
      var alreadyExists = false;
      for (var e = 0; e < stock.price_signals.length; e++) {
        if (stock.price_signals[e].rule_id === rule.id &&
            stock.price_signals[e].date.indexOf(today) === 0) {
          alreadyExists = true;
          break;
        }
      }

      if (!alreadyExists) {
        stock.price_signals.push({
          id: rule.id + '_' + today,
          rule_id: rule.id,
          name: rule.name,
          date: now.toISOString(),
          diagnosticity: rule.diagnosticity,
          hypothesis_impact: rule.hypothesis_impact,
          decay: rule.decay,
          active: true,
          can_trigger_immediate_flip: rule.can_trigger_immediate_flip || false,
          price_at_trigger: priceData.current,
          return_at_trigger: intradayReturn
        });

        console.log('[DNE] Signal: ' + stock.ticker + ' — ' + rule.name +
                    ' (' + (intradayReturn * 100).toFixed(1) + '%)');
      }
    }
  }

  // Recalculate survival scores after processing all signals
  recalculateSurvival(stock);
}

// ─── Yahoo Finance Price Feed ────────────────────────────────────────────────

/**
 * Fetch current price data for an ASX-listed stock via Yahoo Finance.
 *
 * ASX market hours: 10:00–16:00 AEST (pre-market from 07:00).
 * Yahoo Finance ASX tickers use .AX suffix (e.g. WOW.AX, CSL.AX).
 * Data has ~15-minute delay on the free tier.
 *
 * @param {string} ticker  ASX ticker, with or without .AX suffix
 * @returns {Object|null}  Price data object or null on failure
 */
async function fetchPriceData(ticker) {
  var yahooTicker = ticker.indexOf('.AX') !== -1 ? ticker : ticker + '.AX';
  var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
            encodeURIComponent(yahooTicker) + '?interval=1d&range=5d';

  try {
    var response = await fetch(url);
    var data = await response.json();
    var result = data.chart.result[0];
    var meta = result.meta;
    var quotes = result.indicators.quote[0];

    var lastIdx = quotes.close.length - 1;

    // Calculate 5-day cumulative return
    var fiveDayStart = quotes.close[0];
    var cumulative5day = (quotes.close[lastIdx] - fiveDayStart) / fiveDayStart;

    return {
      current: meta.regularMarketPrice,
      previous_close: meta.chartPreviousClose || meta.previousClose,
      open: quotes.open[lastIdx],
      high_52w: meta.fiftyTwoWeekHigh,
      low_52w: meta.fiftyTwoWeekLow,
      volume: quotes.volume[lastIdx],
      avg_30day_volume: meta.averageDailyVolume10Day || 0,
      cumulative_5day_return: cumulative5day,
      earnings_surprise: null
    };
  } catch (error) {
    console.error('[DNE] Price fetch failed for ' + ticker + ':', error);
    return null;
  }
}

// ─── Main Update Loop ────────────────────────────────────────────────────────

/**
 * Update a single stock's narrative from live price data.
 *
 * This is the main entry point called on page load and the 15-minute interval.
 * It fetches prices, generates signals, recalculates scores, and updates UI.
 *
 * @param {Object} stock               Stock evidence data object
 * @param {Array}  priceEvidenceRules   Rules from data/config/price_rules.json
 */
async function updateStockNarrative(stock, priceEvidenceRules) {
  var priceData = await fetchPriceData(stock.ticker);
  if (!priceData) return;

  // Track price history for correlation analysis (Work Stream 3)
  if (!stock.price_history) stock.price_history = [];
  stock.price_history.push(priceData.current);
  // Keep last 25 trading days of prices (enough for 20-day window + buffer)
  if (stock.price_history.length > 25) {
    stock.price_history = stock.price_history.slice(-25);
  }

  evaluatePriceSignals(stock, priceData, priceEvidenceRules);

  // evaluatePriceSignals calls recalculateSurvival internally,
  // which calls checkNarrativeFlip. The stock object is now updated.

  // Compute narrative weighting with price correlation (Work Stream 3)
  if (stock.price_history.length > 3 && typeof computeNarrativeWeighting === 'function') {
    var prevTop = stock.weighting ? stock.weighting.top_narrative.top_narrative : null;
    computeNarrativeWeighting(stock, stock.price_history, prevTop);
  }

  // Persist updated stock data
  if (typeof saveStockData === 'function') {
    await saveStockData(stock);
  }

  // Update UI if on this stock's page
  if (typeof updateNarrativeUI === 'function') {
    updateNarrativeUI(stock);
  }
}

// ─── Refresh Scheduler ──────────────────────────────────────────────────────

var _refreshInterval = null;

/**
 * Start the 15-minute refresh loop for a stock during ASX market hours.
 *
 * @param {Object} stock              Stock evidence data object
 * @param {Array}  priceEvidenceRules  Rules from config
 * @param {number} intervalMs          Refresh interval (default 15 minutes)
 */
function startNarrativeRefresh(stock, priceEvidenceRules, intervalMs) {
  if (_refreshInterval) clearInterval(_refreshInterval);

  var interval = intervalMs || 15 * 60 * 1000; // 15 minutes

  // Run immediately
  updateStockNarrative(stock, priceEvidenceRules);

  _refreshInterval = setInterval(function () {
    // Only refresh during approximate ASX hours (AEST = UTC+11 roughly)
    var nowUTC = new Date();
    var aestHour = (nowUTC.getUTCHours() + 11) % 24;
    var dayOfWeek = nowUTC.getUTCDay();

    // Market hours: Mon–Fri, 07:00–17:00 AEST (including pre/post)
    if (dayOfWeek >= 1 && dayOfWeek <= 5 && aestHour >= 7 && aestHour < 17) {
      updateStockNarrative(stock, priceEvidenceRules);
    }
  }, interval);
}

/**
 * Stop the refresh loop.
 */
function stopNarrativeRefresh() {
  if (_refreshInterval) {
    clearInterval(_refreshInterval);
    _refreshInterval = null;
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    evaluatePriceSignals: evaluatePriceSignals,
    fetchPriceData: fetchPriceData,
    updateStockNarrative: updateStockNarrative,
    startNarrativeRefresh: startNarrativeRefresh,
    stopNarrativeRefresh: stopNarrativeRefresh
  };
}
