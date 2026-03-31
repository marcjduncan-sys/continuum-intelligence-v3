/**
 * thesis-capture.js -- Implicit thesis capture from user actions
 *
 * Captures user thesis positions from three sources:
 * - Thesis comparator (explicit, high confidence)
 * - Analyst chat questions (inferred, low/high confidence via signal promotion)
 * - Portfolio weights (inferred, low confidence)
 *
 * Overwrite precedence: explicit > inferred-high > inferred-low
 */

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const KEY_PREFIX = 'ci_thesis_';
const SIGNAL_PREFIX = 'ci_thesis_signals_';
const MAX_SIGNALS = 10;

function _lsGet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_e) {
    return null;
  }
}

function _lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_e) {
    // localStorage full or disabled
  }
}

// ---------------------------------------------------------------------------
// Precedence helpers
// ---------------------------------------------------------------------------

/**
 * Numeric rank for overwrite precedence.
 * Higher rank wins: explicit(3) > inferred-high(2) > inferred-low(1) > missing(0)
 */
function _rank(thesis) {
  if (!thesis) return 0;
  if (thesis.source === 'explicit') return 3;
  if (thesis.source === 'inferred' && thesis.confidence === 'high') return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// Core CRUD
// ---------------------------------------------------------------------------

/**
 * Save a thesis to localStorage, respecting overwrite precedence.
 *
 * Rules:
 * - explicit always overwrites anything
 * - inferred-high overwrites inferred-low but not explicit
 * - inferred-low never overwrites existing
 *
 * @param {Object} thesis - Thesis object with ticker, source, confidence, etc.
 * @returns {boolean} true if saved, false if blocked by precedence
 */
export function saveThesis(thesis) {
  if (!thesis || !thesis.ticker) return false;

  const key = KEY_PREFIX + thesis.ticker.toUpperCase();
  const existing = _lsGet(key);

  if (existing && _rank(thesis) < _rank(existing)) {
    return false;
  }

  // Ensure capturedAt is set
  if (!thesis.capturedAt) {
    thesis.capturedAt = new Date().toISOString();
  }

  _lsSet(key, thesis);

  // Notify the monitor that a thesis changed (avoids circular import)
  try {
    document.dispatchEvent(new CustomEvent('ci:thesis:saved', { detail: { ticker: thesis.ticker } }));
  } catch (_e2) {
    // DOM not available (test environment)
  }

  return true;
}

/**
 * Read a thesis from localStorage.
 * @param {string} ticker
 * @returns {Object|null}
 */
export function getThesis(ticker) {
  if (!ticker) return null;
  return _lsGet(KEY_PREFIX + ticker.toUpperCase());
}

/**
 * Scan localStorage for all saved theses.
 * @returns {Array} Array of thesis objects
 */
export function getAllTheses() {
  const theses = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.indexOf(KEY_PREFIX) === 0 && key.indexOf('ci_thesis_alerts') !== 0 && key.indexOf('ci_thesis_signals') !== 0 && key.indexOf('ci_thesis_evidence') !== 0) {
        const thesis = _lsGet(key);
        if (thesis && thesis.ticker) {
          theses.push(thesis);
        }
      }
    }
  } catch (_e) {
    // localStorage disabled
  }
  return theses;
}

// ---------------------------------------------------------------------------
// Bias inference from chat questions
// ---------------------------------------------------------------------------

const BULLISH_PATTERNS = [
  /\bbuy\b/i, /\bbull case\b/i, /\bupside\b/i, /\blong\b/i,
  /\baccumulate\b/i, /\badd to position\b/i,
  /\bwhat'?s the bull\b/i, /\bwhy would I buy\b/i, /\bcase for buying\b/i
];

const BEARISH_PATTERNS = [
  /\bsell\b/i, /\bbear case\b/i, /\bdownside\b/i, /\bshort\b/i,
  /\breduce\b/i, /\bexit\b/i,
  /\bwhat'?s the bear\b/i, /\bwhy would I sell\b/i,
  /\bcase for selling\b/i, /\brisk of holding\b/i
];

const NEUTRAL_PATTERNS = [
  /\bfair value\b/i, /\bworth\b/i, /\bvaluation\b/i,
  /\bcompare\b/i, /\bversus\b/i
];

/**
 * Infer bias direction from a user's chat question using keyword matching.
 * Returns null if no clear signal or if both bullish and bearish signals present.
 *
 * @param {string} question
 * @returns {string|null} 'bullish' | 'bearish' | 'neutral' | null
 */
export function inferBiasFromQuestion(question) {
  if (!question || typeof question !== 'string') return null;

  const hasBullish = BULLISH_PATTERNS.some(function (p) { return p.test(question); });
  const hasBearish = BEARISH_PATTERNS.some(function (p) { return p.test(question); });
  const hasNeutral = NEUTRAL_PATTERNS.some(function (p) { return p.test(question); });

  // Ambiguous: both bullish and bearish signals
  if (hasBullish && hasBearish) return null;

  if (hasBullish) return 'bullish';
  if (hasBearish) return 'bearish';
  if (hasNeutral) return 'neutral';

  return null;
}

// ---------------------------------------------------------------------------
// Comparator helpers
// ---------------------------------------------------------------------------

/**
 * Find the dominant hypothesis from a probability split array.
 * Returns 'N1', 'N2', 'N3', or 'N4'. First index wins ties.
 *
 * @param {number[]} split - Probability assignments [N1%, N2%, N3%, N4%]
 * @returns {string}
 */
export function getDominantFromSplit(split) {
  if (!split || split.length === 0) return 'N1';
  let maxIdx = 0;
  let maxVal = split[0] || 0;
  for (let i = 1; i < split.length; i++) {
    if ((split[i] || 0) > maxVal) {
      maxVal = split[i] || 0;
      maxIdx = i;
    }
  }
  return 'N' + (maxIdx + 1);
}

/**
 * Infer bias direction from the user's probability split and stock data.
 *
 * Logic: check the direction of the user's dominant hypothesis.
 * If it's an upside hypothesis, user is bullish. If downside, bearish.
 *
 * @param {number[]} split - User's probability assignments
 * @param {Object} stockData - STOCK_DATA[ticker]
 * @returns {string} 'bullish' | 'bearish' | 'neutral'
 */
export function inferBiasFromSplit(split, stockData) {
  if (!stockData || !stockData.hypotheses || !split) return 'neutral';

  const dominantTier = getDominantFromSplit(split);
  const idx = parseInt(dominantTier.replace('N', ''), 10) - 1;
  const hypothesis = stockData.hypotheses[idx];

  if (!hypothesis) return 'neutral';

  const direction = hypothesis.direction || '';
  if (direction === 'upside') return 'bullish';
  if (direction === 'downside') return 'bearish';
  return 'neutral';
}

// ---------------------------------------------------------------------------
// Signal tracking for confidence promotion
// ---------------------------------------------------------------------------

/**
 * Record a bias signal for a ticker. Keeps last MAX_SIGNALS entries (FIFO).
 *
 * @param {string} ticker
 * @param {string} bias - 'bullish' | 'bearish' | 'neutral'
 */
export function recordSignal(ticker, bias) {
  if (!ticker || !bias) return;
  const key = SIGNAL_PREFIX + ticker.toUpperCase();
  let signals = _lsGet(key) || [];
  signals.push({ bias: bias, timestamp: new Date().toISOString() });
  if (signals.length > MAX_SIGNALS) {
    signals = signals.slice(signals.length - MAX_SIGNALS);
  }
  _lsSet(key, signals);
}

/**
 * Count how many of the last MAX_SIGNALS signals match the given bias.
 *
 * @param {string} ticker
 * @param {string} bias
 * @returns {number}
 */
export function getConsistentSignalCount(ticker, bias) {
  if (!ticker || !bias) return 0;
  const key = SIGNAL_PREFIX + ticker.toUpperCase();
  const signals = _lsGet(key) || [];
  let count = 0;
  for (let i = 0; i < signals.length; i++) {
    if (signals[i].bias === bias) count++;
  }
  return count;
}
