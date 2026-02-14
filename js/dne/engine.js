/**
 * DYNAMIC NARRATIVE ENGINE — Core Scoring Engine
 *
 * Recalculates hypothesis survival scores for a stock based on all
 * active evidence items (editorial + price signals) with time-decay weighting.
 *
 * SCORING LOGIC:
 * - Each evidence item has a rating per hypothesis: CONSISTENT / INCONSISTENT / NEUTRAL
 * - Each evidence item has a diagnosticity weight: CRITICAL=3, HIGH=2, MEDIUM=1, LOW=0.5
 * - Each evidence item decays over time based on its decay parameters
 * - Survival score = inverse of weighted inconsistency count, normalised to [0, 1]
 * - The hypothesis with the HIGHEST survival score (fewest weighted inconsistencies) leads
 *
 * Depends on: evidence.js (shared constants and decay utilities)
 */

/* global DIAGNOSTICITY_WEIGHTS, HYPOTHESIS_IDS, calculateDecayFactor, categoriseSurvival, gatherActiveEvidence, countTradingDays */

// ─── Survival Score Recalculation ────────────────────────────────────────────

/**
 * Recalculate survival scores for every hypothesis on a stock.
 *
 * @param {Object} stock  Stock evidence data object (mutated in place)
 */
function recalculateSurvival(stock) {
  const now = new Date();
  const allEvidence = gatherActiveEvidence(stock);

  if (allEvidence.length === 0) return; // No evidence — keep current scores

  // Maximum possible weighted inconsistency (for normalisation).
  // This is the sum of every evidence item's decayed weight — the theoretical
  // worst case where every item is INCONSISTENT with a given hypothesis.
  const maxPossibleWeight = allEvidence.reduce(function (sum, e) {
    const diagWeight = DIAGNOSTICITY_WEIGHTS[e.diagnosticity] || 1.0;
    const decay = e.decay ? calculateDecayFactor(e.date, now, e.decay) : 1.0;
    return sum + (diagWeight * decay);
  }, 0);

  if (maxPossibleWeight === 0) return;

  for (var i = 0; i < HYPOTHESIS_IDS.length; i++) {
    var hId = HYPOTHESIS_IDS[i];
    var weightedInconsistency = 0;

    for (var j = 0; j < allEvidence.length; j++) {
      var evidence = allEvidence[j];
      var rating = (evidence.hypothesis_impact && evidence.hypothesis_impact[hId]) ||
                   (evidence.ratings && evidence.ratings[hId]);

      if (rating === 'INCONSISTENT') {
        var diagWeight = DIAGNOSTICITY_WEIGHTS[evidence.diagnosticity] || 1.0;
        var decay = evidence.decay
          ? calculateDecayFactor(evidence.date, now, evidence.decay)
          : 1.0;
        weightedInconsistency += diagWeight * decay;
      }
    }

    // Survival = 1 - (weighted inconsistency / max possible)
    // Higher survival = fewer inconsistencies = stronger hypothesis
    var survival = 1.0 - (weightedInconsistency / maxPossibleWeight);

    stock.hypotheses[hId].weighted_inconsistency = weightedInconsistency;
    stock.hypotheses[hId].survival_score = Math.round(survival * 100) / 100;
    stock.hypotheses[hId].status = categoriseSurvival(survival);
    stock.hypotheses[hId].last_updated = now.toISOString();
  }

  // After recalculating all scores, check for narrative flip
  checkNarrativeFlip(stock);
}

// ─── Narrative Flip Logic ────────────────────────────────────────────────────
//
// Three states: NORMAL → ALERT → FLIP
//
// ALERT triggers when:
//   - Current dominant hypothesis survival degrades to MODERATE or below
//   - AND another hypothesis reaches HIGH
//
// FLIP triggers when:
//   - Current dominant falls to LOW or VERY_LOW
//   - AND alternative sustains HIGH for >= 2 trading days
//   - OR immediately on critical event with confirming conditions
//
// EDITORIAL OVERRIDE:
//   - Analyst can lock narrative for up to 48 hours with published rationale
//   - Override is logged and visible to users

/**
 * Check whether the dominant narrative should enter ALERT or FLIP.
 *
 * @param {Object} stock  Stock evidence data object (mutated in place)
 */
function checkNarrativeFlip(stock) {
  // Respect editorial override
  if (stock.editorial_override) {
    var overrideExpiry = new Date(stock.editorial_override.until);
    if (new Date() < overrideExpiry) {
      return; // Override still active
    }
    stock.editorial_override = null; // Override expired
  }

  var currentDominant = stock.dominant;
  var currentStatus = stock.hypotheses[currentDominant].status;

  // Find the strongest alternative hypothesis
  var alternatives = Object.keys(stock.hypotheses)
    .filter(function (id) { return id !== currentDominant; })
    .map(function (id) { return { id: id, data: stock.hypotheses[id] }; })
    .sort(function (a, b) { return b.data.survival_score - a.data.survival_score; });

  var bestAlt = alternatives[0];

  // CHECK FOR IMMEDIATE FLIP (critical event)
  var latestCritical = (stock.price_signals || []).find(function (ps) {
    return ps.can_trigger_immediate_flip && ps.active !== false;
  });

  if (latestCritical && currentStatus !== 'HIGH' && bestAlt.data.status === 'HIGH') {
    executeFlip(stock, currentDominant, bestAlt.id, latestCritical.name);
    return;
  }

  // CHECK FOR ALERT STATE
  if (currentStatus === 'MODERATE' && bestAlt.data.status === 'HIGH') {
    if (stock.alert_state !== 'ALERT') {
      stock.alert_state = 'ALERT';
      stock.alert_started = new Date().toISOString();
      console.log('[DNE] ALERT: ' + stock.ticker + ' — ' + currentDominant +
                  ' under pressure from ' + bestAlt.id);
    }
    return;
  }

  // CHECK FOR FLIP (sustained degradation)
  if ((currentStatus === 'LOW' || currentStatus === 'VERY_LOW') &&
      bestAlt.data.status === 'HIGH') {
    if (stock.alert_state === 'ALERT') {
      var alertStart = new Date(stock.alert_started);
      var tradingDaysSinceAlert = countTradingDays(alertStart, new Date());

      if (tradingDaysSinceAlert >= 2) {
        executeFlip(stock, currentDominant, bestAlt.id,
          'Sustained survival degradation over ' + tradingDaysSinceAlert + ' trading days');
        return;
      }
    } else {
      // First time seeing this condition — enter alert first
      stock.alert_state = 'ALERT';
      stock.alert_started = new Date().toISOString();
    }
    return;
  }

  // RESET ALERT if conditions no longer met
  if (currentStatus === 'HIGH') {
    stock.alert_state = 'NORMAL';
    stock.alert_started = null;
  }
}

/**
 * Execute a narrative flip: update dominant hypothesis, log history.
 *
 * @param {Object} stock     Stock evidence data object (mutated in place)
 * @param {string} fromH     Hypothesis ID being replaced (e.g. 'T1')
 * @param {string} toH       Hypothesis ID becoming dominant (e.g. 'T3')
 * @param {string} trigger   Human-readable trigger description
 */
function executeFlip(stock, fromH, toH, trigger) {
  var flipRecord = {
    date: new Date().toISOString().split('T')[0],
    from: fromH,
    to: toH,
    trigger: trigger,
    price_at_flip: stock.current_price || null,
    from_survival: stock.hypotheses[fromH].survival_score,
    to_survival: stock.hypotheses[toH].survival_score
  };

  // Archive current flip to history
  if (stock.last_flip) {
    if (!stock.narrative_history) stock.narrative_history = [];
    stock.narrative_history.unshift(stock.last_flip);
  }

  stock.last_flip = flipRecord;
  stock.dominant = toH;
  stock.confidence = stock.hypotheses[toH].status;
  stock.alert_state = 'NORMAL';
  stock.alert_started = null;

  console.log('[DNE] FLIP: ' + stock.ticker + ' — ' + fromH + ' → ' + toH +
              ' | Trigger: ' + trigger);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    recalculateSurvival: recalculateSurvival,
    checkNarrativeFlip: checkNarrativeFlip,
    executeFlip: executeFlip
  };
}
