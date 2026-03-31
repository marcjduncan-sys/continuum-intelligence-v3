// ============================================================
// DOM.JS -- DOM utilities extracted from index.html
// Includes HTML escaping, accessibility announcer,
// score normalisation, and skew computation.
// ============================================================

/**
 * Escape HTML entities to prevent XSS
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (typeof document === 'undefined') {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/**
 * A11y announcer -- announces page changes to screen readers
 * @param {string} text
 */
export function announcePageChange(text) {
  const announcer = document.getElementById('a11y-announcer');
  if (announcer) {
    announcer.textContent = '';
    requestAnimationFrame(function() { announcer.textContent = text; });
  }
}

/**
 * @typedef {{ score: string|number, [key: string]: any }} HypothesisInput
 */

/**
 * Normalise raw ACH survival scores to sum to 100%
 * v3 framework: enforce floor(5) and ceiling(80) per NARRATIVE_FRAMEWORK_V3.md
 * "No hypothesis can show <5% or >80%. After clamping, re-normalise to sum to 100."
 * @param {HypothesisInput[]} items
 * @returns {number[]} Normalised scores summing to 100, each in range [5, 80]
 */
export function normaliseScores(items) {
  const FLOOR = 5;
  const CEILING = 80;
  const raw = [];
  for (var i = 0; i < items.length; i++) {
    const val = parseInt(String(items[i].score)) || 0;
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
  // We iteratively clamp and redistribute until stable.
  for (let iter = 0; iter < 20; iter++) {
    let overflow = 0;   // total amount over ceiling
    let underflow = 0;  // total amount under floor
    const freeIndices = [];
    for (var i = 0; i < result.length; i++) {
      if (result[i] > CEILING) { overflow += result[i] - CEILING; result[i] = CEILING; }
      else if (result[i] < FLOOR) { underflow += FLOOR - result[i]; result[i] = FLOOR; }
      else { freeIndices.push(i); }
    }
    if (overflow === 0 && underflow === 0) break;

    // Net excess: positive means we need to grow other items, negative means shrink
    const net = overflow - underflow;
    if (net === 0) break;
    if (freeIndices.length === 0) break; // All items are pinned; accept best-effort

    // Distribute net across free items (those not pinned at floor/ceiling)
    if (net > 0) {
      // Overflow: distribute excess to items below ceiling, smallest first
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
      // Underflow: take from items above floor, largest first
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

  // Step 4: Fix rounding residual -- adjust the largest non-ceiling value
  let roundedSum = 0;
  for (var i = 0; i < result.length; i++) roundedSum += result[i];
  if (roundedSum !== 100) {
    const diff = 100 - roundedSum;
    // Find best candidate: largest value that won't breach bounds after adjustment
    let bestIdx = -1;
    for (var i = 0; i < result.length; i++) {
      const candidate = result[i] + diff;
      if (candidate >= FLOOR && candidate <= CEILING) {
        if (bestIdx === -1 || result[i] > result[bestIdx]) bestIdx = i;
      }
    }
    if (bestIdx === -1) {
      // Fallback: just adjust the largest
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
 * @typedef {{ title: string, direction: string, weight: number }} HypothesisBreakdown
 * @typedef {{ bull: number, bear: number, score: number, direction: 'upside'|'downside'|'balanced', hypotheses: HypothesisBreakdown[] }} SkewResult
 */

/**
 * Compute skew score from hypothesis weights (v3 framework)
 * Principle 5: Thesis Skew is derived mechanically from hypothesis scores and sentiment tags.
 * NEUTRAL hypotheses contribute zero directional weight.
 * Direction thresholds: >+5 = upside, <-5 = downside, else balanced.
 * @param {{ hypotheses?: Array<{ score: string|number, direction: string, title?: string, tier?: string }> }} data
 * @returns {SkewResult}
 */
export function computeSkewScore(data) {
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
    } else {
      // Neutral hypotheses contribute zero directional weight.
      // Bull+bear represents genuine directional conviction only.
      // Convention adopted 2026-03-07 -- see docs/decisions/
    }
    breakdown.push({ title: hyps[i].title || hyps[i].tier, direction: dir, weight: w });
  }
  // Round to avoid floating point display issues
  bull = Math.round(bull);
  bear = Math.round(bear);
  const score = bull - bear;
  // Derive direction mechanically from score -- never from static data
  /** @type {'upside'|'downside'|'balanced'} */
  const direction = score > 5 ? 'upside' : score < -5 ? 'downside' : 'balanced';
  return { bull: bull, bear: bear, score: score, direction: direction, hypotheses: breakdown };
}
