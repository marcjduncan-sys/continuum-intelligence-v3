#!/usr/bin/env node
/**
 * Continuum Intelligence — V2 Price Evidence Engine
 *
 * TA-informed scoring engine that makes hypothesis survival scores
 * respond to daily price action, volume signals, technical levels,
 * and overcorrection detection.
 *
 * Layers (applied in order):
 *   1. Evidence decay (preserved from existing logic)
 *   2. Price classification + directional adjustment
 *   3. Volume confirmation multiplier
 *   4. Cumulative move amplifier
 *   5. Technical level integration
 *   6. TA agent signals (feature-flagged)
 *   7. Overcorrection detection/resolution
 *   8. Earnings event amplifier
 *   9. Score normalisation (floor/ceiling/sum)
 *
 * Usage:
 *   As library:  const { processStock } = require('./price-evidence-engine');
 *   Standalone:  node scripts/price-evidence-engine.js [--dry-run] [--ticker WOW]
 */

const fs = require('fs');
const path = require('path');

const STOCKS_DIR = path.join(__dirname, '..', 'data', 'stocks');
const TA_CONFIG_PATH = path.join(__dirname, '..', 'data', 'config', 'ta-config.json');
const TA_SIGNALS_DIR = path.join(__dirname, '..', 'data', 'ta-signals');

// ══════════════════════════════════════════════════════════════════════
// DIRECTION MAPPING
// ══════════════════════════════════════════════════════════════════════

/**
 * Build a map of hypothesis tier -> direction ("upside"/"downside"/"neutral").
 *
 * Primary source: presentation.hypotheses[].direction (reliable, per-stock).
 * Fallback: label-based heuristics (for stocks without presentation data).
 *
 * @param {Object} stock  Stock JSON data
 * @returns {Object} e.g. { T1: "upside", T2: "neutral", T3: "downside", T4: "downside" }
 */
function buildDirectionMap(stock) {
  const map = {};

  // Primary: presentation.hypotheses[].direction
  if (stock.presentation && stock.presentation.hypotheses) {
    for (const ph of stock.presentation.hypotheses) {
      if (!ph.tier) continue;
      const tier = ph.tier.toUpperCase(); // "t1" -> "T1"
      if (ph.direction) {
        map[tier] = ph.direction.toLowerCase(); // "upside", "downside", "neutral"
      }
    }
  }

  // Fallback: label-based heuristics
  if (stock.hypotheses) {
    for (const key of Object.keys(stock.hypotheses)) {
      if (map[key]) continue; // already set from presentation
      const label = (stock.hypotheses[key].label || '').toLowerCase();
      if (label.includes('growth') || label.includes('recovery') ||
          label.includes('turnaround') || label.includes('expansion') ||
          label.includes('upside') || label.includes('amplif')) {
        map[key] = 'upside';
      } else if (label.includes('risk') || label.includes('downside') ||
                 label.includes('compression') || label.includes('erosion') ||
                 label.includes('decline') || label.includes('squeeze') ||
                 label.includes('disruption') || label.includes('bubble')) {
        map[key] = 'downside';
      } else {
        map[key] = 'neutral';
      }
    }
  }

  return map;
}

// ══════════════════════════════════════════════════════════════════════
// LAYER 1: EVIDENCE DECAY
// ══════════════════════════════════════════════════════════════════════

/**
 * Compute evidence-decay-based score adjustments.
 * Preserves the existing logic from update-research.js.
 *
 * @param {Object} stock  Stock JSON data
 * @returns {Object} Per-hypothesis adjustment on 0-100 scale, e.g. { T1: 2.1, T2: -0.5, ... }
 */
function computeEvidenceDecay(stock) {
  const now = new Date();
  const adjustments = {};

  for (const key of Object.keys(stock.hypotheses || {})) {
    let boost = 0;
    const hyp = stock.hypotheses[key];

    // Staleness decay: lose ~5% confidence per week after 14 days
    if (hyp.last_updated) {
      const lastUpdated = new Date(hyp.last_updated);
      const daysSinceUpdate = Math.max(0, (now - lastUpdated) / (1000 * 60 * 60 * 24));
      if (daysSinceUpdate > 14) {
        const weeksStale = (daysSinceUpdate - 14) / 7;
        const penalty = weeksStale * 5; // 5% per week
        boost -= Math.min(penalty, 25); // cap at 25 points
      }
    }

    // Evidence item impact
    if (stock.evidence_items && stock.evidence_items.length > 0) {
      for (const ev of stock.evidence_items) {
        if (ev.active === false || !ev.hypothesis_impact) continue;
        const impact = ev.hypothesis_impact[key];
        if (!impact) continue;

        // Calculate evidence weight based on age
        const evDate = new Date(ev.date);
        const evAgeDays = Math.max(0, (now - evDate) / (1000 * 60 * 60 * 24));
        const fullWeightDays = (ev.decay && ev.decay.full_weight_days) || 90;
        const halfLifeDays = (ev.decay && ev.decay.half_life_days) || 120;

        let weight = 1.0;
        if (evAgeDays > fullWeightDays && halfLifeDays > 0) {
          const decayDays = evAgeDays - fullWeightDays;
          weight = Math.pow(0.5, decayDays / halfLifeDays);
        }

        // Diagnosticity multiplier
        const diagMult = ev.diagnosticity === 'CRITICAL' ? 3.0 :
                         ev.diagnosticity === 'HIGH' ? 1.5 :
                         ev.diagnosticity === 'MEDIUM' ? 1.0 : 0.5;

        if (impact === 'CONSISTENT') boost += 2 * weight * diagMult;
        else if (impact === 'INCONSISTENT') boost -= 2 * weight * diagMult;
      }
    }

    adjustments[key] = boost;
  }

  return adjustments;
}

// ══════════════════════════════════════════════════════════════════════
// LAYER 2: PRICE CLASSIFICATION
// ══════════════════════════════════════════════════════════════════════

/**
 * Classify a daily price move.
 *
 * @param {number} pctChange  Signed percentage change (e.g. -7.5 for 7.5% decline)
 * @param {Object} config     ta-config.json
 * @returns {{ category: string, points: number, mandatoryReview: boolean }}
 */
function classifyDailyMove(pctChange, config) {
  const abs = Math.abs(pctChange);
  const c = config.price_classification;

  if (abs >= c.significant_threshold_pct) {
    return { category: 'MATERIAL', points: c.material_points, mandatoryReview: true };
  }
  if (abs >= c.notable_threshold_pct) {
    return { category: 'SIGNIFICANT', points: c.significant_points, mandatoryReview: false };
  }
  if (abs >= c.noise_threshold_pct) {
    return { category: 'NOTABLE', points: c.notable_points, mandatoryReview: false };
  }
  return { category: 'NOISE', points: 0, mandatoryReview: false };
}

/**
 * Apply directional score adjustments based on price move and hypothesis direction.
 *
 * Positive move: boost upside hyps, penalise downside.
 * Negative move: boost downside hyps, penalise upside.
 * Neutral hyps: unaffected unless MATERIAL (half adjustment).
 *
 * @param {Object} directionMap  { T1: "upside", T2: "downside", ... }
 * @param {number} pctChange     Signed percentage change
 * @param {Object} classification  From classifyDailyMove()
 * @returns {Object} Per-hypothesis point adjustments, e.g. { T1: 5, T2: -5, ... }
 */
function applyDirectionalAdjustment(directionMap, pctChange, classification) {
  const adjustments = {};
  const points = classification.points;
  if (points === 0) {
    for (const tier of Object.keys(directionMap)) adjustments[tier] = 0;
    return adjustments;
  }

  const isPositive = pctChange > 0;

  for (const [tier, direction] of Object.entries(directionMap)) {
    if (direction === 'upside') {
      adjustments[tier] = isPositive ? points : -points;
    } else if (direction === 'downside') {
      adjustments[tier] = isPositive ? -points : points;
    } else {
      // neutral: only affected if MATERIAL, at half adjustment
      if (classification.category === 'MATERIAL') {
        adjustments[tier] = isPositive ? Math.round(points / 2) : -Math.round(points / 2);
      } else {
        adjustments[tier] = 0;
      }
    }
  }

  return adjustments;
}

// ══════════════════════════════════════════════════════════════════════
// LAYER 3: VOLUME CONFIRMATION
// ══════════════════════════════════════════════════════════════════════

/**
 * Get the volume ratio for a stock (today's volume vs 20-day average).
 *
 * Sources (in priority order):
 *   1. priceData.volume / estimated 20-day avg from TA data
 *   2. presentation.technicalAnalysis.volume.latestVs20DayAvg (static from TA date)
 *   3. Default 1.0
 *
 * @param {Object} stock     Stock JSON data
 * @param {Object} priceData Normalised price data from find-latest-prices.js
 * @returns {number} Volume ratio (e.g. 1.5 means 150% of average)
 */
function getVolumeRatio(stock, priceData) {
  const ta = stock.presentation && stock.presentation.technicalAnalysis;

  // If we have today's volume and the TA ratio, we can estimate avg then compute
  if (priceData && priceData.volume && ta && ta.volume && ta.volume.latestVs20DayAvg) {
    // Use the TA ratio as a proxy — it is the best we have without volume history
    return ta.volume.latestVs20DayAvg;
  }

  // Fallback: TA static ratio
  if (ta && ta.volume && ta.volume.latestVs20DayAvg) {
    return ta.volume.latestVs20DayAvg;
  }

  return 1.0; // Default: normal volume
}

/**
 * Look up the volume multiplier from config.
 *
 * @param {number} volumeRatio  Volume vs 20-day average (e.g. 1.7 = 170%)
 * @param {Object} config       ta-config.json
 * @returns {number} Multiplier to apply to score adjustments
 */
function getVolumeMultiplier(volumeRatio, config) {
  const c = config.volume_multipliers;
  if (volumeRatio >= c.very_high_threshold) return c.very_high_multiplier;
  if (volumeRatio >= c.high_threshold) return c.high_multiplier;
  if (volumeRatio >= c.normal_low) return c.normal_multiplier;
  if (volumeRatio >= c.low_threshold) return c.low_multiplier;
  return c.very_low_multiplier;
}

// ══════════════════════════════════════════════════════════════════════
// LAYER 4: CUMULATIVE MOVES
// ══════════════════════════════════════════════════════════════════════

/**
 * Detect cumulative moves across rolling windows.
 *
 * priceHistory is oldest-first, no timestamps. We index from the end.
 *
 * @param {number[]} priceHistory  Array of closing prices (252 max)
 * @param {Object}   config        ta-config.json
 * @returns {Object} { fiveDay, twentyDay, sixtyDay } with pctChange, triggered, amplifier/flag
 */
function detectCumulativeMoves(priceHistory, config) {
  const len = priceHistory.length;
  const c = config.cumulative_moves;
  const result = {};

  // 5-day: need at least 6 entries (5 days of change + start)
  if (len >= 6) {
    const start = priceHistory[len - 6];
    const end = priceHistory[len - 1];
    const pct = start > 0 ? ((end - start) / start) * 100 : 0;
    result.fiveDay = {
      pctChange: Math.round(pct * 10) / 10,
      triggered: Math.abs(pct) >= c.five_day_threshold_pct,
      amplifier: Math.abs(pct) >= c.five_day_threshold_pct ? c.five_day_amplifier : 1.0
    };
  } else {
    result.fiveDay = { pctChange: 0, triggered: false, amplifier: 1.0 };
  }

  // 20-day
  if (len >= 21) {
    const start = priceHistory[len - 21];
    const end = priceHistory[len - 1];
    const pct = start > 0 ? ((end - start) / start) * 100 : 0;
    result.twentyDay = {
      pctChange: Math.round(pct * 10) / 10,
      triggered: Math.abs(pct) >= c.twenty_day_threshold_pct,
      flag: Math.abs(pct) >= c.twenty_day_threshold_pct ? c.twenty_day_flag : null
    };
  } else {
    result.twentyDay = { pctChange: 0, triggered: false, flag: null };
  }

  // 60-day
  if (len >= 61) {
    const start = priceHistory[len - 61];
    const end = priceHistory[len - 1];
    const pct = start > 0 ? ((end - start) / start) * 100 : 0;
    result.sixtyDay = {
      pctChange: Math.round(pct * 10) / 10,
      triggered: Math.abs(pct) >= c.sixty_day_threshold_pct,
      flag: Math.abs(pct) >= c.sixty_day_threshold_pct ? c.sixty_day_flag : null
    };
  } else {
    result.sixtyDay = { pctChange: 0, triggered: false, flag: null };
  }

  return result;
}

// ══════════════════════════════════════════════════════════════════════
// LAYER 5: TECHNICAL LEVEL INTEGRATION
// ══════════════════════════════════════════════════════════════════════

/**
 * Evaluate technical levels for signal generation.
 *
 * Reads from presentation.technicalAnalysis: keyLevels (support/resistance),
 * movingAverages (ma50, ma200, crossover, priceVsMa200).
 *
 * @param {number} currentPrice   Current price
 * @param {number} previousPrice  Previous close
 * @param {Object} ta             presentation.technicalAnalysis object
 * @param {Object} config         ta-config.json
 * @returns {Array} Signal objects with type, level, direction
 */
function evaluateTechnicalLevels(currentPrice, previousPrice, ta, config) {
  if (!ta) return [];
  const signals = [];
  const kl = ta.keyLevels || {};
  const ma = ta.movingAverages || {};
  const c = config.technical_levels;

  // ── Support breaks / holds ─────────────────────────────────────
  if (kl.support && kl.support.price) {
    const supportPrice = kl.support.price;
    if (currentPrice < supportPrice && previousPrice >= supportPrice) {
      signals.push({
        type: 'SUPPORT_BREAK',
        level: supportPrice,
        method: kl.support.method || 'defined support',
        direction: 'bearish',
        description: `Price broke below A$${supportPrice} support (${kl.support.method || 'key level'})`
      });
    } else if (currentPrice >= supportPrice * 0.99 && currentPrice <= supportPrice * 1.01 &&
               previousPrice < supportPrice) {
      // Price recovered to support level from below — support hold
      signals.push({
        type: 'SUPPORT_HOLD',
        level: supportPrice,
        method: kl.support.method || 'defined support',
        direction: 'bullish',
        description: `Price held at A$${supportPrice} support after test`
      });
    }
  }

  // ── Resistance breaks / rejections ─────────────────────────────
  if (kl.resistance && kl.resistance.price) {
    const resistancePrice = kl.resistance.price;
    if (currentPrice > resistancePrice && previousPrice <= resistancePrice) {
      signals.push({
        type: 'RESISTANCE_BREAK',
        level: resistancePrice,
        method: kl.resistance.method || 'defined resistance',
        direction: 'bullish',
        description: `Price broke above A$${resistancePrice} resistance (${kl.resistance.method || 'key level'})`
      });
    } else if (currentPrice <= resistancePrice && previousPrice > resistancePrice) {
      signals.push({
        type: 'RESISTANCE_REJECT',
        level: resistancePrice,
        method: kl.resistance.method || 'defined resistance',
        direction: 'bearish',
        description: `Price rejected at A$${resistancePrice} resistance`
      });
    }
  }

  // ── Price vs 50-day MA crossover ───────────────────────────────
  if (ma.ma50 && ma.ma50.value) {
    const ma50 = ma.ma50.value;
    if (currentPrice > ma50 && previousPrice <= ma50) {
      signals.push({
        type: 'PRICE_CROSS_MA50_UP',
        level: ma50,
        direction: 'bullish',
        description: `Price crossed above 50-day MA (A$${ma50})`
      });
    } else if (currentPrice < ma50 && previousPrice >= ma50) {
      signals.push({
        type: 'PRICE_CROSS_MA50_DOWN',
        level: ma50,
        direction: 'bearish',
        description: `Price crossed below 50-day MA (A$${ma50})`
      });
    }
  }

  // ── Death cross / Golden cross (from existing TA data) ────────
  // Only emit if crossover data exists. The client-side engine uses
  // these as static indicators; we incorporate them as evidence.
  // Note: we do NOT re-emit every day. The processStock function
  // checks for duplicates before adding evidence.

  // ── Oversold / Overbought flags ────────────────────────────────
  if (ma.priceVsMa200 !== undefined && ma.priceVsMa200 !== null) {
    const distFromMa200 = ma.priceVsMa200;
    if (distFromMa200 > c.oversold_overbought_threshold_pct) {
      signals.push({
        type: 'OVERBOUGHT_MA200',
        distance: distFromMa200,
        direction: 'bearish',
        description: `Price ${distFromMa200.toFixed(1)}% above 200-day MA — overbought territory`
      });
    } else if (distFromMa200 < -c.oversold_overbought_threshold_pct) {
      signals.push({
        type: 'OVERSOLD_MA200',
        distance: Math.abs(distFromMa200),
        direction: 'bullish',
        description: `Price ${Math.abs(distFromMa200).toFixed(1)}% below 200-day MA — oversold territory`
      });
    }
  }

  return signals;
}

/**
 * Convert technical signals into per-hypothesis score adjustments.
 *
 * @param {Array}  signals       From evaluateTechnicalLevels()
 * @param {Object} directionMap  { T1: "upside", T2: "downside", ... }
 * @param {Object} config        ta-config.json
 * @returns {Object} Per-hypothesis adjustments, e.g. { T1: 4, T2: -3, ... }
 */
function techSignalToScoreAdjustments(signals, directionMap, config) {
  const adjustments = {};
  const c = config.technical_levels;

  for (const tier of Object.keys(directionMap)) {
    adjustments[tier] = 0;
  }

  for (const signal of signals) {
    for (const [tier, direction] of Object.entries(directionMap)) {
      const isBullish = direction === 'upside';
      const isBearish = direction === 'downside';

      switch (signal.type) {
        case 'SUPPORT_BREAK':
          if (isBearish) adjustments[tier] += c.support_break_boost_bearish;
          if (isBullish) adjustments[tier] -= c.support_break_penalise_bullish;
          break;
        case 'SUPPORT_HOLD':
          if (isBullish) adjustments[tier] += c.support_hold_boost_bullish;
          if (isBearish) adjustments[tier] -= c.support_hold_penalise_bearish;
          break;
        case 'RESISTANCE_BREAK':
          if (isBullish) adjustments[tier] += c.resistance_break_boost_bullish;
          if (isBearish) adjustments[tier] -= c.resistance_break_penalise_bearish;
          break;
        case 'RESISTANCE_REJECT':
          if (isBearish) adjustments[tier] += c.resistance_reject_boost_bearish;
          if (isBullish) adjustments[tier] -= c.resistance_reject_penalise_bullish;
          break;
        case 'PRICE_CROSS_MA50_UP':
          if (isBullish) adjustments[tier] += c.ma50_cross_points;
          if (isBearish) adjustments[tier] -= c.ma50_cross_penalise;
          break;
        case 'PRICE_CROSS_MA50_DOWN':
          if (isBearish) adjustments[tier] += c.ma50_cross_points;
          if (isBullish) adjustments[tier] -= c.ma50_cross_penalise;
          break;
        case 'OVERSOLD_MA200':
          // Mean-reversion signal: mildly bullish
          if (isBullish) adjustments[tier] += 2;
          if (isBearish) adjustments[tier] -= 1;
          break;
        case 'OVERBOUGHT_MA200':
          // Mean-reversion signal: mildly bearish
          if (isBearish) adjustments[tier] += 2;
          if (isBullish) adjustments[tier] -= 1;
          break;
      }
    }
  }

  return adjustments;
}

// ══════════════════════════════════════════════════════════════════════
// LAYER 6: TA AGENT SIGNALS
// ══════════════════════════════════════════════════════════════════════

/**
 * Load TA agent signals for a ticker from data/ta-signals/TICKER.json.
 *
 * @param {string} ticker  Short ticker (e.g. "WOW")
 * @returns {Object|null} Parsed signal file or null if not found
 */
function loadTAAgentSignals(ticker) {
  const signalPath = path.join(TA_SIGNALS_DIR, `${ticker}.json`);
  if (!fs.existsSync(signalPath)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(signalPath, 'utf8'));
    // Validate schema version
    if (!data.signals || !Array.isArray(data.signals)) return null;
    return data;
  } catch (err) {
    console.warn(`  [TA-Agent] Failed to load signals for ${ticker}: ${err.message}`);
    return null;
  }
}

/**
 * Apply TA agent signals to base scores.
 *
 * @param {Object} baseScores    Per-hypothesis scores on 0-100 scale (mutated)
 * @param {Object} agentData     Parsed TA agent signal file
 * @param {Object} directionMap  { T1: "upside", ... }
 * @param {Object} config        ta-config.json
 */
function applyTAAgentSignals(baseScores, agentData, directionMap, config) {
  const maxImpact = config.ta_agent.max_impact_per_signal;

  for (const signal of agentData.signals) {
    if (!signal.sentiment || !signal.suggested_score_impact) continue;

    // If the signal provides per-hypothesis impacts, use those (capped)
    if (typeof signal.suggested_score_impact === 'object') {
      for (const [tier, impact] of Object.entries(signal.suggested_score_impact)) {
        if (baseScores[tier] !== undefined) {
          const capped = Math.max(-maxImpact, Math.min(maxImpact, impact));
          baseScores[tier] += capped * (signal.confidence || 0.5);
        }
      }
    } else {
      // Scalar impact — apply based on sentiment and direction map
      const rawImpact = Math.max(-maxImpact, Math.min(maxImpact, signal.suggested_score_impact));
      const scaledImpact = rawImpact * (signal.confidence || 0.5);
      const sentiment = signal.sentiment.toLowerCase();

      for (const [tier, direction] of Object.entries(directionMap)) {
        if (direction === 'upside' && sentiment === 'bullish') {
          baseScores[tier] += scaledImpact;
        } else if (direction === 'downside' && sentiment === 'bearish') {
          baseScores[tier] += scaledImpact;
        } else if (direction === 'upside' && sentiment === 'bearish') {
          baseScores[tier] -= scaledImpact;
        } else if (direction === 'downside' && sentiment === 'bullish') {
          baseScores[tier] -= scaledImpact;
        }
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// LAYER 7: OVERCORRECTION DETECTION
// ══════════════════════════════════════════════════════════════════════

/**
 * Add N trading days to a date (skip weekends).
 *
 * @param {Date}   date  Start date
 * @param {number} days  Trading days to add
 * @returns {Date} Resulting date
 */
function addTradingDays(date, days) {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}

/**
 * Detect overcorrection conditions.
 *
 * Triggers:
 *   - Single-day move >10%
 *   - 5-day cumulative move >15%
 *
 * @param {Object}   stock           Stock JSON data
 * @param {number[]} priceHistory    Array of closing prices
 * @param {number}   currentPrice    Current price
 * @param {number}   dailyPctChange  Today's percentage change
 * @param {Object}   cumulativeMoves From detectCumulativeMoves()
 * @param {Object}   config          ta-config.json
 * @returns {Object|null} Overcorrection record or null
 */
function detectOvercorrection(stock, priceHistory, currentPrice, dailyPctChange, cumulativeMoves, config) {
  const c = config.overcorrection;
  const triggers = [];

  if (Math.abs(dailyPctChange) >= c.single_day_threshold_pct) {
    triggers.push(`Single-day move of ${dailyPctChange.toFixed(1)}%`);
  }

  if (cumulativeMoves.fiveDay &&
      Math.abs(cumulativeMoves.fiveDay.pctChange) >= c.five_day_cumulative_threshold_pct) {
    triggers.push(`5-day cumulative move of ${cumulativeMoves.fiveDay.pctChange.toFixed(1)}%`);
  }

  if (triggers.length === 0) return null;

  const now = new Date();
  return {
    triggered: true,
    triggers: triggers,
    trigger_price: currentPrice,
    trigger_date: now.toISOString(),
    direction: dailyPctChange < 0 ? 'down' : 'up',
    resolution_date: addTradingDays(now, c.resolution_days).toISOString(),
    status: 'monitoring',
    fair_value_estimate: (stock.freshness && stock.freshness.priceAtReview)
      ? stock.freshness.priceAtReview : null
  };
}

/**
 * Resolve an existing overcorrection after the monitoring period.
 *
 * @param {Object} stock        Stock JSON data (must have stock.overcorrection)
 * @param {number} currentPrice Current price
 * @param {Object} config       ta-config.json
 * @returns {Object|null} Resolution result or null if not yet due
 */
function resolveOvercorrection(stock, currentPrice, config) {
  const oc = stock.overcorrection;
  if (!oc || oc.status !== 'monitoring') return null;

  const now = new Date();
  const resDate = new Date(oc.resolution_date);
  if (now < resDate) return null;

  const c = config.overcorrection;
  const triggerPrice = oc.trigger_price;

  // Calculate how much of the move has reversed
  // If the move was DOWN: reversal = price recovery above trigger
  // If the move was UP: reversal = price decline from trigger
  let reversalPct = 0;
  if (oc.direction === 'down') {
    reversalPct = triggerPrice > 0
      ? Math.max(0, ((currentPrice - triggerPrice) / triggerPrice) * 100)
      : 0;
  } else {
    reversalPct = triggerPrice > 0
      ? Math.max(0, ((triggerPrice - currentPrice) / triggerPrice) * 100)
      : 0;
  }

  let resolution;
  if (reversalPct >= c.confirmed_reversal_pct) {
    resolution = { status: 'confirmed_overcorrection', points: 0 };
  } else if (reversalPct >= c.extend_reversal_pct) {
    // Extend monitoring for another review period
    resolution = {
      status: 'monitoring',
      resolution_date: addTradingDays(now, c.resolution_days).toISOString(),
      points: 0,
      extended: true
    };
  } else {
    resolution = { status: 'fundamental_move', points: c.fundamental_move_points };
  }

  return {
    ...resolution,
    reversalPct: Math.round(reversalPct * 10) / 10,
    resolved_date: now.toISOString(),
    resolved_price: currentPrice
  };
}

// ══════════════════════════════════════════════════════════════════════
// LAYER 8: EARNINGS EVENT AMPLIFIER
// ══════════════════════════════════════════════════════════════════════

/**
 * Check if a stock is near an earnings event.
 *
 * Uses freshness.nearestCatalyst (e.g. "1H FY26 Results") and
 * freshness.nearestCatalystDays.
 *
 * @param {Object} stock  Stock JSON data
 * @returns {boolean}
 */
function isNearEarningsEvent(stock) {
  if (!stock.freshness) return false;
  const catalyst = (stock.freshness.nearestCatalyst || '').toLowerCase();
  const daysUntil = stock.freshness.nearestCatalystDays;

  const isEarnings = catalyst.includes('result') || catalyst.includes('earning') ||
                     catalyst.includes('half year') || catalyst.includes('full year') ||
                     catalyst.includes('quarterly');

  return isEarnings && daysUntil !== null && daysUntil !== undefined && Math.abs(daysUntil) <= 3;
}

/**
 * Apply earnings event amplifier to adjustments.
 *
 * @param {Object} baseScores    Per-hypothesis scores on 0-100 scale (mutated)
 * @param {number} pctChange     Today's percentage change
 * @param {Object} directionMap  { T1: "upside", ... }
 * @param {Object} config        ta-config.json
 */
function applyEarningsAmplifier(baseScores, pctChange, directionMap, config) {
  const c = config.earnings_event;
  const abs = Math.abs(pctChange);

  if (abs < c.moderate_threshold_pct) {
    // In-line result: no score change
    return;
  }

  const isPositive = pctChange > 0;

  if (abs >= c.drop_threshold_pct || abs >= c.rise_threshold_pct) {
    // Strong move on earnings
    for (const [tier, direction] of Object.entries(directionMap)) {
      if (direction === 'upside') {
        baseScores[tier] += isPositive ? c.strong_boost : -c.strong_penalise;
      } else if (direction === 'downside') {
        baseScores[tier] += isPositive ? -c.strong_penalise : c.strong_boost;
      }
    }
  }
  // Moderate move (2-5%): standard classification rules already applied, no extra amplification
}

// ══════════════════════════════════════════════════════════════════════
// LAYER 9: SCORE NORMALISATION
// ══════════════════════════════════════════════════════════════════════

/**
 * Normalise scores: enforce floor (5%), ceiling (80%), sum to 1.0.
 *
 * @param {Object} rawScores  Per-hypothesis scores on 0-100 scale
 * @param {Object} config     ta-config.json
 * @returns {Object} Normalised scores on 0.0-1.0 scale, summing to 1.0
 */
function normaliseScores(rawScores, config) {
  const c = config.normalisation;
  const floor = c.floor * 100;   // 5
  const ceiling = c.ceiling * 100; // 80

  // Step 1: Clamp to floor/ceiling
  const clamped = {};
  for (const [key, score] of Object.entries(rawScores)) {
    clamped[key] = Math.max(floor, Math.min(ceiling, score));
  }

  // Step 2: Normalise to sum to 100
  let total = 0;
  for (const score of Object.values(clamped)) total += score;

  const normalised = {};
  if (total > 0) {
    for (const [key, score] of Object.entries(clamped)) {
      normalised[key] = (score / total) * 100;
    }
  } else {
    // All zeros — distribute equally
    const count = Object.keys(clamped).length;
    for (const key of Object.keys(clamped)) {
      normalised[key] = 100 / count;
    }
  }

  // Step 3: Re-enforce floor/ceiling after normalisation
  let needsPass = true;
  let passes = 0;
  const result = { ...normalised };

  while (needsPass && passes < 5) {
    needsPass = false;
    passes++;

    for (const key of Object.keys(result)) {
      if (result[key] < floor) {
        result[key] = floor;
        needsPass = true;
      }
      if (result[key] > ceiling) {
        result[key] = ceiling;
        needsPass = true;
      }
    }

    // Re-normalise
    let total2 = 0;
    for (const score of Object.values(result)) total2 += score;
    if (total2 > 0 && Math.abs(total2 - 100) > 0.1) {
      for (const key of Object.keys(result)) {
        result[key] = (result[key] / total2) * 100;
      }
    }
  }

  // Step 4: Convert to 0.0-1.0 and round to 2 decimal places
  const output = {};
  for (const [key, score] of Object.entries(result)) {
    output[key] = Math.round(score) / 100; // e.g. 47 -> 0.47
  }

  return output;
}

/**
 * Determine status label from survival score (0.0-1.0 scale).
 *
 * @param {number} score  Normalised score
 * @returns {string} 'HIGH' | 'MODERATE' | 'LOW' | 'VERY_LOW'
 */
function scoreToStatus(score) {
  if (score >= 0.6) return 'HIGH';
  if (score >= 0.4) return 'MODERATE';
  if (score >= 0.2) return 'LOW';
  return 'VERY_LOW';
}

// ══════════════════════════════════════════════════════════════════════
// MAIN ORCHESTRATOR
// ══════════════════════════════════════════════════════════════════════

/**
 * Process a single stock through all engine layers.
 *
 * @param {Object} stock     Stock JSON data (mutated: overcorrection field updated)
 * @param {Object} priceData Normalised price data { price, previousClose, changePercent, volume, ... }
 * @param {Object} taConfig  Parsed ta-config.json
 * @returns {Object} { scores, classification, cumulativeMoves, volumeMultiplier, flags, overcorrection, techSignals, evidenceItems }
 */
function processStock(stock, priceData, taConfig) {
  if (!stock.hypotheses || Object.keys(stock.hypotheses).length === 0) {
    return { scores: {}, classification: null, cumulativeMoves: {}, volumeMultiplier: 1, flags: [], overcorrection: null, techSignals: [], evidenceItems: [] };
  }

  const directionMap = buildDirectionMap(stock);
  const currentPrice = priceData ? priceData.price : stock.current_price;
  const previousPrice = priceData ? (priceData.previousClose || stock.current_price) : stock.current_price;
  const pctChange = priceData ? (priceData.changePercent || 0) : 0;
  const priceHistory = stock.priceHistory || [];
  const ta = stock.presentation ? stock.presentation.technicalAnalysis : null;
  const newEvidenceItems = [];

  // ── Base scores (existing survival_score × 100) ────────────────
  const baseScores = {};
  for (const [key, hyp] of Object.entries(stock.hypotheses)) {
    baseScores[key] = (hyp.survival_score || 0.25) * 100;
  }

  // ── Layer 1: Evidence decay ────────────────────────────────────
  const evidenceAdj = computeEvidenceDecay(stock);
  for (const key of Object.keys(baseScores)) {
    baseScores[key] += (evidenceAdj[key] || 0);
  }

  // ── Layer 2: Price classification + directional adjustment ─────
  const classification = classifyDailyMove(pctChange, taConfig);
  const priceAdj = applyDirectionalAdjustment(directionMap, pctChange, classification);

  // ── Layer 3: Volume confirmation ───────────────────────────────
  let volumeMultiplier = 1.0;
  if (taConfig.feature_flags.volume_confirmation) {
    const volumeRatio = getVolumeRatio(stock, priceData);
    volumeMultiplier = getVolumeMultiplier(volumeRatio, taConfig);
  }

  // Apply volume-weighted price adjustments
  for (const [key, adj] of Object.entries(priceAdj)) {
    baseScores[key] += adj * volumeMultiplier;
  }

  // Create price signal evidence item if move is notable or above
  if (classification.category !== 'NOISE') {
    const today = new Date().toISOString().split('T')[0];
    newEvidenceItems.push({
      type: 'price_signal',
      date: today,
      description: `${Math.abs(pctChange).toFixed(1)}% ${pctChange >= 0 ? 'gain' : 'decline'} (${classification.category})` +
                   (volumeMultiplier !== 1.0 ? ` on ${volumeMultiplier.toFixed(1)}x volume` : ''),
      classification: classification.category,
      sentiment: pctChange >= 0 ? 'BULLISH' : 'BEARISH',
      score_impact: { ...priceAdj },
      volume_multiplier: volumeMultiplier
    });
  }

  // ── Layer 4: Cumulative move amplifier ─────────────────────────
  const cumulativeMoves = detectCumulativeMoves(priceHistory, taConfig);
  if (cumulativeMoves.fiveDay && cumulativeMoves.fiveDay.triggered) {
    const extra = cumulativeMoves.fiveDay.amplifier - 1; // 0.5x extra
    for (const key of Object.keys(baseScores)) {
      const delta = priceAdj[key] || 0;
      baseScores[key] += delta * extra;
    }
  }

  // ── Layer 5: Technical level integration ───────────────────────
  let techSignals = [];
  if (taConfig.feature_flags.technical_level_integration && ta) {
    techSignals = evaluateTechnicalLevels(currentPrice, previousPrice, ta, taConfig);
    const techAdj = techSignalToScoreAdjustments(techSignals, directionMap, taConfig);
    for (const [key, adj] of Object.entries(techAdj)) {
      baseScores[key] += adj * volumeMultiplier;
    }

    // Create evidence items for technical signals
    for (const signal of techSignals) {
      const today = new Date().toISOString().split('T')[0];
      newEvidenceItems.push({
        type: 'technical_signal',
        date: today,
        description: signal.description,
        classification: 'NOTABLE',
        sentiment: signal.direction === 'bullish' ? 'BULLISH' : 'BEARISH'
      });
    }
  }

  // ── Layer 6: TA Agent signals (feature-flagged) ────────────────
  if (taConfig.feature_flags.ta_agent_signals) {
    const ticker = stock.tickerShort || stock.ticker || '';
    const agentSignals = loadTAAgentSignals(ticker.replace('.AX', ''));
    if (agentSignals) {
      applyTAAgentSignals(baseScores, agentSignals, directionMap, taConfig);
    }
  }

  // ── Layer 7: Overcorrection detection/resolution ───────────────
  let overcorrection = stock.overcorrection || null;
  if (taConfig.feature_flags.overcorrection_detection) {
    // Resolve existing
    if (overcorrection && overcorrection.status === 'monitoring') {
      const resolution = resolveOvercorrection(stock, currentPrice, taConfig);
      if (resolution) {
        overcorrection = { ...overcorrection, ...resolution };
        if (resolution.points) {
          const moveDir = overcorrection.direction === 'down' ? 'downside' : 'upside';
          for (const [key, dir] of Object.entries(directionMap)) {
            if (dir === moveDir) baseScores[key] += resolution.points;
          }
        }
      }
    }

    // Detect new
    const newOC = detectOvercorrection(stock, priceHistory, currentPrice, pctChange, cumulativeMoves, taConfig);
    if (newOC && (!overcorrection || overcorrection.status !== 'monitoring')) {
      overcorrection = newOC;
      newEvidenceItems.push({
        type: 'overcorrection_signal',
        date: new Date().toISOString().split('T')[0],
        description: `Potential overcorrection: ${newOC.triggers.join('; ')}`,
        classification: 'NOTABLE',
        sentiment: 'NEUTRAL',
        monitoring: {
          trigger_price: newOC.trigger_price,
          fair_value_estimate: newOC.fair_value_estimate,
          review_date: newOC.resolution_date
        }
      });
    }
  }

  // ── Layer 8: Earnings event amplifier ──────────────────────────
  if (isNearEarningsEvent(stock)) {
    applyEarningsAmplifier(baseScores, pctChange, directionMap, taConfig);
  }

  // ── Layer 9: Normalisation ─────────────────────────────────────
  const normalisedScores = normaliseScores(baseScores, taConfig);

  // ── Flags ──────────────────────────────────────────────────────
  const flags = [];
  if (cumulativeMoves.twentyDay && cumulativeMoves.twentyDay.triggered) {
    flags.push(cumulativeMoves.twentyDay.flag);
  }
  if (cumulativeMoves.sixtyDay && cumulativeMoves.sixtyDay.triggered) {
    flags.push(cumulativeMoves.sixtyDay.flag);
  }
  if (classification.mandatoryReview) {
    flags.push('mandatory_review');
  }

  // Update stock.overcorrection for persistence
  stock.overcorrection = overcorrection;

  return {
    scores: normalisedScores,
    classification,
    cumulativeMoves,
    volumeMultiplier,
    flags,
    overcorrection,
    techSignals,
    evidenceItems: newEvidenceItems
  };
}

// ══════════════════════════════════════════════════════════════════════
// STANDALONE CLI
// ══════════════════════════════════════════════════════════════════════

function main() {
  const args = process.argv.slice(2);
  const DRY_RUN = args.includes('--dry-run');
  const TICKER_FILTER = args.includes('--ticker') ? args[args.indexOf('--ticker') + 1] : null;

  console.log('=== Continuum Intelligence — V2 Price Evidence Engine ===\n');
  if (DRY_RUN) console.log('  DRY RUN — no files will be written\n');

  // Load config
  if (!fs.existsSync(TA_CONFIG_PATH)) {
    console.error(`  Error: ${TA_CONFIG_PATH} not found.`);
    process.exit(1);
  }
  const taConfig = JSON.parse(fs.readFileSync(TA_CONFIG_PATH, 'utf8'));
  console.log(`  Config: v${taConfig.version}`);
  console.log(`  Features: ${Object.entries(taConfig.feature_flags).filter(([, v]) => v).map(([k]) => k).join(', ')}\n`);

  // Load prices
  const { findLatestPrices } = require('./find-latest-prices');
  const priceResult = findLatestPrices('newest');
  if (priceResult) {
    console.log(`  Prices: ${priceResult.source} (${priceResult.file}), updated ${priceResult.updated}`);
  } else {
    console.log('  Warning: No price data available — using existing prices');
  }

  // Load stock JSONs
  if (!fs.existsSync(STOCKS_DIR)) {
    console.error(`  Error: ${STOCKS_DIR} does not exist.`);
    process.exit(1);
  }

  const jsonFiles = fs.readdirSync(STOCKS_DIR).filter(f => f.endsWith('.json'));
  console.log(`  Stocks: ${jsonFiles.length}\n`);

  const now = new Date();
  let processed = 0;
  let flagged = 0;

  for (const file of jsonFiles) {
    const ticker = file.replace('.json', '');
    if (TICKER_FILTER && ticker !== TICKER_FILTER) continue;

    const filePath = path.join(STOCKS_DIR, file);
    let stock;
    try {
      stock = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.error(`  Error: ${ticker}: failed to read — ${err.message}`);
      continue;
    }

    // Get price data
    const priceData = priceResult && priceResult.prices[ticker]
      ? priceResult.prices[ticker]
      : { price: stock.current_price, previousClose: stock.current_price, changePercent: 0 };

    // Run engine
    const result = processStock(stock, priceData, taConfig);

    if (!result.scores || Object.keys(result.scores).length === 0) {
      console.log(`  - ${ticker}: no hypotheses, skipped`);
      continue;
    }

    // Update stock JSON
    for (const [key, score] of Object.entries(result.scores)) {
      if (stock.hypotheses[key]) {
        stock.hypotheses[key].survival_score = score;
        stock.hypotheses[key].status = scoreToStatus(score);
        stock.hypotheses[key].last_updated = now.toISOString();
      }
    }

    // Store engine metadata
    stock.price_evidence = {
      last_run: now.toISOString(),
      classification: result.classification,
      volume_multiplier: result.volumeMultiplier,
      flags: result.flags,
      cumulative_moves: result.cumulativeMoves,
      overcorrection: result.overcorrection
    };

    // Write
    if (!DRY_RUN) {
      fs.writeFileSync(filePath, JSON.stringify(stock, null, 2));
    }

    // Log
    const scoresStr = Object.entries(result.scores)
      .map(([k, v]) => `${k}:${Math.round(v * 100)}%`)
      .join(' ');
    const classStr = result.classification ? ` [${result.classification.category}]` : '';
    const volStr = result.volumeMultiplier !== 1.0 ? ` vol:${result.volumeMultiplier}x` : '';
    const flagStr = result.flags.length > 0 ? ` FLAGS:${result.flags.join(',')}` : '';
    const ocStr = result.overcorrection && result.overcorrection.status === 'monitoring' ? ' OVERCORRECTION' : '';
    const techStr = result.techSignals.length > 0 ? ` tech:${result.techSignals.length}` : '';

    console.log(`  ${ticker}: ${scoresStr}${classStr}${volStr}${techStr}${flagStr}${ocStr}`);

    processed++;
    if (result.flags.length > 0) flagged++;
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Processed: ${processed}`);
  console.log(`  Flagged: ${flagged}`);
  if (DRY_RUN) console.log(`  (Dry run — no files written)`);
  console.log('');
}

// ── Exports ──────────────────────────────────────────────────────────

module.exports = {
  buildDirectionMap,
  computeEvidenceDecay,
  classifyDailyMove,
  applyDirectionalAdjustment,
  getVolumeRatio,
  getVolumeMultiplier,
  detectCumulativeMoves,
  evaluateTechnicalLevels,
  techSignalToScoreAdjustments,
  loadTAAgentSignals,
  applyTAAgentSignals,
  addTradingDays,
  detectOvercorrection,
  resolveOvercorrection,
  isNearEarningsEvent,
  applyEarningsAmplifier,
  normaliseScores,
  scoreToStatus,
  processStock
};

if (require.main === module) {
  main();
}
