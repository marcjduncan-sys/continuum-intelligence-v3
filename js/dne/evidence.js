/**
 * DYNAMIC NARRATIVE ENGINE — Evidence Management
 *
 * Shared constants, decay calculations, and evidence item utilities
 * used by the scoring engine and price signal generator.
 */

const DIAGNOSTICITY_WEIGHTS = {
  CRITICAL: 3.0,
  HIGH: 2.0,
  MEDIUM: 1.0,
  LOW: 0.5
};

const SURVIVAL_THRESHOLDS = {
  HIGH: 0.7,
  MODERATE: 0.4,
  LOW: 0.2,
  VERY_LOW: 0.0
};

const HYPOTHESIS_IDS = ['T1', 'T2', 'T3', 'T4'];

/**
 * Calculate the time-decay factor for an evidence item.
 *
 * Evidence maintains full weight for `full_weight_days` after its date,
 * then decays with an exponential half-life.
 *
 * @param {string} evidenceDate  ISO date string of when evidence was recorded
 * @param {Date}   now           Current date for comparison
 * @param {Object} decayParams   { full_weight_days, half_life_days }
 * @returns {number} Decay factor in [0, 1]
 */
function calculateDecayFactor(evidenceDate, now, decayParams) {
  const daysSince = (now - new Date(evidenceDate)) / (1000 * 60 * 60 * 24);

  if (daysSince <= decayParams.full_weight_days) {
    return 1.0;
  }

  const daysIntoDecay = daysSince - decayParams.full_weight_days;
  const halfLife = decayParams.half_life_days;

  // No decay configured — evidence persists at full weight while condition holds
  if (halfLife <= 0) return 1.0;

  return Math.pow(0.5, daysIntoDecay / halfLife);
}

/**
 * Map a numeric survival score to a categorical status.
 *
 * @param {number} score  Survival score in [0, 1]
 * @returns {string} 'HIGH' | 'MODERATE' | 'LOW' | 'VERY_LOW'
 */
function categoriseSurvival(score) {
  if (score >= SURVIVAL_THRESHOLDS.HIGH) return 'HIGH';
  if (score >= SURVIVAL_THRESHOLDS.MODERATE) return 'MODERATE';
  if (score >= SURVIVAL_THRESHOLDS.LOW) return 'LOW';
  return 'VERY_LOW';
}

/**
 * Count business (trading) days between two dates.
 * Excludes weekends (Saturday & Sunday). Does not account for public holidays.
 *
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {number}
 */
function countTradingDays(startDate, endDate) {
  let count = 0;
  const current = new Date(startDate);
  while (current < endDate) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

/**
 * Gather all active evidence for a stock — editorial items + price signals.
 *
 * @param {Object} stock  Stock evidence data object
 * @returns {Array} Combined evidence items
 */
function gatherActiveEvidence(stock) {
  const editorial = stock.evidence_items || [];
  const priceSignals = (stock.price_signals || []).filter(ps => ps.active !== false);
  return [...editorial, ...priceSignals];
}

// Export for both browser (global) and module environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DIAGNOSTICITY_WEIGHTS,
    SURVIVAL_THRESHOLDS,
    HYPOTHESIS_IDS,
    calculateDecayFactor,
    categoriseSurvival,
    countTradingDays,
    gatherActiveEvidence
  };
}
