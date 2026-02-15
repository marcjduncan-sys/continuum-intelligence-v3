/**
 * DYNAMIC NARRATIVE ENGINE — Editorial Override
 *
 * Allows an analyst to lock the narrative for up to 48 hours.
 * Used during known noisy periods: index rebalance, ex-dividend, options expiry.
 * The override is logged and VISIBLE TO USERS (transparency is non-negotiable).
 *
 * Depends on: engine.js (recalculateSurvival)
 */

/* global recalculateSurvival */

var MAX_OVERRIDE_HOURS = 48;

/**
 * Set an editorial override that locks the current dominant narrative.
 *
 * @param {Object} stock          Stock evidence data object (mutated in place)
 * @param {string} reason         Human-readable rationale shown to users
 * @param {number} durationHours  Lock duration (capped at 48 hours)
 */
function setEditorialOverride(stock, reason, durationHours) {
  var actualDuration = Math.min(durationHours || MAX_OVERRIDE_HOURS, MAX_OVERRIDE_HOURS);

  var until = new Date();
  until.setHours(until.getHours() + actualDuration);

  stock.editorial_override = {
    set_at: new Date().toISOString(),
    until: until.toISOString(),
    reason: reason,
    locked_narrative: stock.dominant
  };

  console.log('[DNE] Override: ' + stock.ticker + ' locked to ' + stock.dominant +
              ' until ' + until.toISOString() + ' — ' + reason);
}

/**
 * Clear an editorial override and immediately recalculate scores.
 *
 * @param {Object} stock  Stock evidence data object (mutated in place)
 */
function clearEditorialOverride(stock) {
  stock.editorial_override = null;
  recalculateSurvival(stock);
}

/**
 * Check whether a stock currently has an active editorial override.
 *
 * @param {Object} stock  Stock evidence data object
 * @returns {boolean}
 */
function hasActiveOverride(stock) {
  if (!stock.editorial_override) return false;
  return new Date() < new Date(stock.editorial_override.until);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MAX_OVERRIDE_HOURS: MAX_OVERRIDE_HOURS,
    setEditorialOverride: setEditorialOverride,
    clearEditorialOverride: clearEditorialOverride,
    hasActiveOverride: hasActiveOverride
  };
}
