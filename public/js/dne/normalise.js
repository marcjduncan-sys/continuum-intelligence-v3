/**
 * normalise.js – Shared normalisation module
 *
 * Extracts normaliseScores() and computeSkewScore() so that both the
 * front-end (index.html) and backend scripts produce identical numbers.
 *
 * Front-end: loaded via <script> tag (functions attach to window)
 * Backend:   require('./js/dne/normalise') – CommonJS exports
 *
 * v3 framework: floor 5, ceiling 80, scale to 100%, iterative clamping.
 */

(function (exports) {
  'use strict';

  const FLOOR = 5;
  const CEILING = 80;

  /**
   * Normalise raw ACH survival scores to sum to 100%.
   *
   * @param {Array} items – each item must have a `.score` property
   *                        (string or number, e.g. "45" or 45 or "45%").
   * @returns {number[]}  – array of integers summing to 100.
   */
  function normaliseScores(items) {
    const raw = [];
    for (var i = 0; i < items.length; i++) {
      const val = parseInt(items[i].score) || 0;
      raw.push(val);
    }
    if (raw.length === 0) return raw;

    // Step 1: Clamp each score to floor/ceiling
    const clamped = [];
    for (var i = 0; i < raw.length; i++) {
      clamped.push(Math.max(FLOOR, Math.min(CEILING, raw[i])));
    }

    // Step 2: Sum clamped values and proportionally scale to 100
    let sum = 0;
    for (var i = 0; i < clamped.length; i++) sum += clamped[i];
    if (sum === 0) {
      const eq = Math.round(100 / clamped.length);
      const eqResult = [];
      for (var i = 0; i < clamped.length; i++) eqResult.push(eq);
      return eqResult;
    }

    const result = [];
    for (var i = 0; i < clamped.length; i++) {
      result.push(Math.round((clamped[i] / sum) * 100));
    }

    // Step 3: Iterative post-normalisation clamp.
    // Re-normalisation can push values outside [FLOOR, CEILING].
    // Iteratively clamp and redistribute until stable.
    for (let iter = 0; iter < 20; iter++) {
      let overflow = 0;
      let underflow = 0;
      const freeIndices = [];
      for (var i = 0; i < result.length; i++) {
        if (result[i] > CEILING) { overflow += result[i] - CEILING; result[i] = CEILING; }
        else if (result[i] < FLOOR) { underflow += FLOOR - result[i]; result[i] = FLOOR; }
        else { freeIndices.push(i); }
      }
      if (overflow === 0 && underflow === 0) break;

      const net = overflow - underflow;
      if (net === 0) break;
      if (freeIndices.length === 0) break;

      if (net > 0) {
        freeIndices.sort(function(a,b) { return result[a] - result[b]; });
        var remaining = net;
        for (var fi = 0; fi < freeIndices.length && remaining > 0; fi++) {
          var idx = freeIndices[fi];
          var room = CEILING - result[idx];
          const give = Math.min(remaining, room);
          result[idx] += give;
          remaining -= give;
        }
      } else {
        freeIndices.sort(function(a,b) { return result[b] - result[a]; });
        var remaining = -net;
        for (var fi = 0; fi < freeIndices.length && remaining > 0; fi++) {
          var idx = freeIndices[fi];
          var room = result[idx] - FLOOR;
          const take = Math.min(remaining, room);
          result[idx] -= take;
          remaining -= take;
        }
      }
    }

    // Step 4: Fix rounding residual
    let roundedSum = 0;
    for (var i = 0; i < result.length; i++) roundedSum += result[i];
    if (roundedSum !== 100) {
      const diff = 100 - roundedSum;
      let bestIdx = -1;
      for (var i = 0; i < result.length; i++) {
        const candidate = result[i] + diff;
        if (candidate >= FLOOR && candidate <= CEILING) {
          if (bestIdx === -1 || result[i] > result[bestIdx]) bestIdx = i;
        }
      }
      if (bestIdx === -1) {
        bestIdx = 0;
        for (var i = 1; i < result.length; i++) {
          if (result[i] > result[bestIdx]) bestIdx = i;
        }
      }
      result[bestIdx] += diff;
    }

    return result;
  }

  /**
   * Compute skew score from hypothesis data.
   *
   * Net = sum(upside normalised weights) - sum(downside normalised weights).
   * Neutral hypotheses contribute zero.
   *
   * @param {Object} data – must have `.hypotheses` array where each item has
   *                        `.score` (string/number) and `.direction` ('upside'|'downside'|'neutral').
   * @returns {{ bull: number, bear: number, score: number, direction: string, hypotheses: Array }}
   */
  function computeSkewScore(data) {
    if (!data || !data.hypotheses || data.hypotheses.length === 0) {
      return { bull: 50, bear: 50, score: 0, direction: 'balanced', hypotheses: [] };
    }
    const hyps = data.hypotheses;
    const norm = normaliseScores(hyps);
    let bull = 0, bear = 0;
    const breakdown = [];
    for (let i = 0; i < hyps.length; i++) {
      const w = norm[i] || 0;
      const dir = hyps[i].direction || 'downside';
      if (dir === 'upside') {
        bull += w;
      } else if (dir === 'downside') {
        bear += w;
      }
      // neutral: contributes zero to both bull and bear
      breakdown.push({ title: hyps[i].title || hyps[i].tier, direction: dir, weight: w });
    }
    bull = Math.round(bull);
    bear = Math.round(bear);
    const score = bull - bear;
    const direction = score > 5 ? 'upside' : score < -5 ? 'downside' : 'balanced';
    return { bull: bull, bear: bear, score: score, direction: direction, hypotheses: breakdown };
  }

  /**
   * Derive sentiment label from a numeric score.
   * Aligned thresholds: >5 = UPSIDE, <-5 = DOWNSIDE, else BALANCED.
   *
   * @param {number} score
   * @returns {string}
   */
  function sentimentLabel(score) {
    if (score > 5) return 'UPSIDE';
    if (score < -5) return 'DOWNSIDE';
    return 'BALANCED';
  }

  // ── Exports ─────────────────────────────────────────────────────────
  exports.normaliseScores = normaliseScores;
  exports.computeSkewScore = computeSkewScore;
  exports.sentimentLabel = sentimentLabel;
  exports.FLOOR = FLOOR;
  exports.CEILING = CEILING;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.ContinuumNormalise = {}));
