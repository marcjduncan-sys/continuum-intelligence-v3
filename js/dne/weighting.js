/**
 * DYNAMIC NARRATIVE ENGINE — Narrative Weighting Architecture
 *
 * Determines the Top Narrative (T1) via price-correlation analysis,
 * detects narrative inflection points, and quantifies dislocation
 * between consensus positioning and price-implied valuation.
 *
 * Work Stream 3: Narrative Weighting Architecture
 *
 * Depends on: evidence.js
 */

/* global HYPOTHESIS_IDS */

// ─── Price Correlation Windows ───────────────────────────────────────────────

var CORRELATION_WINDOWS = [5, 10, 20]; // trading days

/**
 * Calculate Pearson correlation between two arrays.
 *
 * @param {number[]} x
 * @param {number[]} y
 * @returns {number} Correlation coefficient in [-1, 1]
 */
function pearsonCorrelation(x, y) {
  var n = Math.min(x.length, y.length);
  if (n < 3) return 0;

  var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (var i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  var denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (denominator === 0) return 0;

  return (n * sumXY - sumX * sumY) / denominator;
}

/**
 * Compute daily returns from a price series.
 *
 * @param {number[]} prices  Array of closing prices (oldest first)
 * @returns {number[]} Daily returns
 */
function dailyReturns(prices) {
  var returns = [];
  for (var i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return returns;
}

/**
 * Generate a synthetic hypothesis-implied return series.
 *
 * Each hypothesis implies a direction:
 * - T1 (Growth): positive returns expected
 * - T2 (Base):   flat/slightly positive returns expected
 * - T3 (Risk):   negative returns expected
 * - T4 (Disruption): strongly negative returns expected
 *
 * The implied series is built from the hypothesis's survival score trajectory
 * and its directional bias, producing a series that correlates with price
 * when the hypothesis is playing out correctly.
 *
 * @param {string} hId        Hypothesis ID
 * @param {number} score      Current survival score [0,1]
 * @param {number[]} returns  Actual daily returns for the window
 * @returns {number[]} Implied return expectations
 */
function hypothesisImpliedReturns(hId, score, returns) {
  // Directional bias for each hypothesis tier
  var directionMap = { T1: 1.0, T2: 0.3, T3: -0.7, T4: -1.0 };
  var direction = directionMap[hId] || 0;

  // The implied series is: for each actual return, the hypothesis "predicts"
  // a return of (direction * score * magnitude). We compare this with actual.
  var implied = [];
  for (var i = 0; i < returns.length; i++) {
    var magnitude = Math.abs(returns[i]) || 0.005; // floor at 50bps
    implied.push(direction * score * magnitude);
  }
  return implied;
}

/**
 * Calculate price correlation for each hypothesis across all lookback windows.
 *
 * Returns an object per hypothesis with:
 * - correlation per window (5d, 10d, 20d)
 * - dominant window (which lookback has strongest |correlation|)
 * - composite signal strength (weighted average favouring dominant window)
 *
 * @param {Object}   stock       Stock evidence data object
 * @param {number[]} priceHistory Array of recent closing prices (oldest first, >=21 entries)
 * @returns {Object} Correlation analysis keyed by hypothesis ID
 */
function calculatePriceCorrelations(stock, priceHistory) {
  var returns = dailyReturns(priceHistory);
  var ids = HYPOTHESIS_IDS || ['T1', 'T2', 'T3', 'T4'];
  var result = {};

  for (var h = 0; h < ids.length; h++) {
    var hId = ids[h];
    var hyp = stock.hypotheses[hId];
    var correlations = {};
    var dominantWindow = 5;
    var maxAbsCorr = 0;

    for (var w = 0; w < CORRELATION_WINDOWS.length; w++) {
      var window = CORRELATION_WINDOWS[w];
      var windowReturns = returns.slice(-window);

      if (windowReturns.length < 3) {
        correlations[window] = 0;
        continue;
      }

      var implied = hypothesisImpliedReturns(hId, hyp.survival_score, windowReturns);
      var corr = pearsonCorrelation(windowReturns, implied);
      correlations[window] = Math.round(corr * 1000) / 1000;

      if (Math.abs(corr) > maxAbsCorr) {
        maxAbsCorr = Math.abs(corr);
        dominantWindow = window;
      }
    }

    // Composite: weight dominant window 2x, others 1x
    var weightedSum = 0;
    var totalWeight = 0;
    for (var w2 = 0; w2 < CORRELATION_WINDOWS.length; w2++) {
      var win = CORRELATION_WINDOWS[w2];
      var weight = (win === dominantWindow) ? 2.0 : 1.0;
      weightedSum += (correlations[win] || 0) * weight;
      totalWeight += weight;
    }

    var composite = totalWeight > 0 ? weightedSum / totalWeight : 0;

    result[hId] = {
      correlations: correlations,
      dominant_window: dominantWindow,
      composite_signal: Math.round(composite * 1000) / 1000,
      signal_strength_pct: Math.round(Math.max(0, composite) * 100)
    };
  }

  return result;
}

/**
 * Determine the Top Narrative (T1) — the hypothesis with the largest
 * recent price correlation.
 *
 * @param {Object} correlationData  Output from calculatePriceCorrelations
 * @returns {Object} { top_narrative, previous_top, inflection, signal_strength }
 */
function determineTopNarrative(correlationData, previousTopNarrative) {
  var ids = Object.keys(correlationData);
  var bestId = ids[0];
  var bestSignal = correlationData[ids[0]].composite_signal;

  for (var i = 1; i < ids.length; i++) {
    if (correlationData[ids[i]].composite_signal > bestSignal) {
      bestSignal = correlationData[ids[i]].composite_signal;
      bestId = ids[i];
    }
  }

  var inflection = previousTopNarrative && previousTopNarrative !== bestId;

  return {
    top_narrative: bestId,
    previous_top: previousTopNarrative || bestId,
    inflection: inflection,
    signal_strength: correlationData[bestId].signal_strength_pct,
    dominant_window: correlationData[bestId].dominant_window
  };
}

// ─── Dislocation Quantification ──────────────────────────────────────────────

/**
 * Quantify narrative dislocation: how far current price-implied positioning
 * diverges from the survival-score-implied consensus.
 *
 * Dislocation = difference between price-implied narrative weighting
 * (from correlation analysis) and evidence-based survival scores.
 *
 * A large dislocation means the market is pricing a different narrative
 * than the evidence matrix supports.
 *
 * @param {Object} stock            Stock evidence data object
 * @param {Object} correlationData  Output from calculatePriceCorrelations
 * @returns {Object} Dislocation metrics
 */
function quantifyDislocation(stock, correlationData) {
  var ids = HYPOTHESIS_IDS || ['T1', 'T2', 'T3', 'T4'];

  // Normalise survival scores to sum to 1 (evidence-implied weights)
  var totalSurvival = 0;
  for (var i = 0; i < ids.length; i++) {
    totalSurvival += stock.hypotheses[ids[i]].survival_score;
  }

  // Normalise signal strengths to sum to 1 (price-implied weights)
  var totalSignal = 0;
  for (var j = 0; j < ids.length; j++) {
    var signalRaw = Math.max(0, correlationData[ids[j]].composite_signal);
    totalSignal += signalRaw;
  }

  var maxDislocationBps = 0;
  var maxDislocationHypothesis = null;
  var dislocationDirection = 'neutral';
  var perHypothesis = {};

  for (var k = 0; k < ids.length; k++) {
    var hId = ids[k];
    var evidenceWeight = totalSurvival > 0
      ? stock.hypotheses[hId].survival_score / totalSurvival
      : 0.25;
    var priceWeight = totalSignal > 0
      ? Math.max(0, correlationData[hId].composite_signal) / totalSignal
      : 0.25;

    // Dislocation in basis points (1 pct = 100 bps)
    var dislocationPct = (priceWeight - evidenceWeight) * 100;
    var dislocationBps = Math.round(dislocationPct * 100);

    perHypothesis[hId] = {
      evidence_weight_pct: Math.round(evidenceWeight * 100),
      price_weight_pct: Math.round(priceWeight * 100),
      dislocation_bps: dislocationBps
    };

    if (Math.abs(dislocationBps) > Math.abs(maxDislocationBps)) {
      maxDislocationBps = dislocationBps;
      maxDislocationHypothesis = hId;
    }
  }

  // Direction: positive = price is more optimistic than evidence,
  //            negative = price is more pessimistic than evidence
  if (maxDislocationHypothesis) {
    if (maxDislocationHypothesis === 'T1' || maxDislocationHypothesis === 'T2') {
      dislocationDirection = maxDislocationBps > 0 ? 'positive' : 'negative';
    } else {
      dislocationDirection = maxDislocationBps > 0 ? 'negative' : 'positive';
    }
  }

  return {
    max_dislocation_bps: maxDislocationBps,
    max_dislocation_hypothesis: maxDislocationHypothesis,
    direction: dislocationDirection,
    per_hypothesis: perHypothesis,
    is_material: Math.abs(maxDislocationBps) > 500 // >5% = material
  };
}

/**
 * Run the full narrative weighting analysis.
 *
 * This is the main entry point — call after recalculateSurvival
 * when price history is available.
 *
 * @param {Object}   stock              Stock evidence data object
 * @param {number[]} priceHistory       Recent closing prices (oldest first)
 * @param {string}   previousTopNarrative Previous T1 hypothesis ID (for inflection detection)
 * @returns {Object} Full weighting analysis result, also stored on stock.weighting
 */
function computeNarrativeWeighting(stock, priceHistory, previousTopNarrative) {
  var correlations = calculatePriceCorrelations(stock, priceHistory);
  var topNarrative = determineTopNarrative(correlations, previousTopNarrative);
  var dislocation = quantifyDislocation(stock, correlations);

  var ids = HYPOTHESIS_IDS || ['T1', 'T2', 'T3', 'T4'];

  // Compute normalised narrative weights (evidence_weight + signal_weight blended)
  var totalSurvival = 0;
  for (var i = 0; i < ids.length; i++) {
    totalSurvival += stock.hypotheses[ids[i]].survival_score;
  }

  var narrativeWeights = {};
  for (var j = 0; j < ids.length; j++) {
    var hId = ids[j];
    var evidenceWeight = totalSurvival > 0
      ? stock.hypotheses[hId].survival_score / totalSurvival
      : 0.25;

    narrativeWeights[hId] = {
      signal_strength_pct: correlations[hId].signal_strength_pct,
      narrative_weight_pct: Math.round(evidenceWeight * 100),
      dominant_window: correlations[hId].dominant_window,
      correlations: correlations[hId].correlations
    };
  }

  var result = {
    top_narrative: topNarrative,
    dislocation: dislocation,
    hypothesis_weights: narrativeWeights,
    computed_at: new Date().toISOString()
  };

  // Store on the stock object for UI access
  stock.weighting = result;

  return result;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CORRELATION_WINDOWS: CORRELATION_WINDOWS,
    pearsonCorrelation: pearsonCorrelation,
    dailyReturns: dailyReturns,
    calculatePriceCorrelations: calculatePriceCorrelations,
    determineTopNarrative: determineTopNarrative,
    quantifyDislocation: quantifyDislocation,
    computeNarrativeWeighting: computeNarrativeWeighting
  };
}
